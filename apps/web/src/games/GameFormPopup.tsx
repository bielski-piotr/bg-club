import { useMutation, useQueryClient } from '@tanstack/react-query';
import { useEffect, useId, useRef, useState, type FormEvent } from 'react';
import { useAuth } from '../auth/authContext';
import { IMAGE_ACCEPT, ImageScaleError } from '../club/image';
import { format, t } from '../i18n';
import { AvatarCropper, CROP_VIEW } from '../profile/AvatarCropper';
import {
  clampCrop,
  fromStoredCrop,
  INITIAL_CROP,
  toStoredCrop,
  type CropState,
} from '../profile/crop';
import { usePopups } from '../popups/popupContext';
import { PopupModal } from '../popups/PopupModal';
import { QueryStatus } from '../popups/QueryStatus';
import { Banner, Button, Icon, Spinner, Stepper, TextField, useToast } from '../ui';
import {
  canReadClipboard,
  clipboardImage,
  ClipboardError,
  downloadCover,
  prepareCoverSource,
  readClipboardImage,
  renderCover,
  type CoverSource,
  type CroppedCover,
} from './cover';
import { GameCover } from './GameCover';
import {
  emptyGameForm,
  GAME_TITLE_MAX,
  gameFormFrom,
  hasErrors,
  pointsEdited,
  pointsIncrease,
  validateGameForm,
  withComplexity,
  withMaxPlayers,
  type ComplexityError,
  type GameFormValues,
  type PointsError,
} from './form';
import {
  GameSaveError,
  gamesKey,
  saveGame,
  useGame,
  type CoverChange,
  type Game,
  type GameSaveFailure,
} from './games';
import '../club/club.css';
import './games.css';

const form = t.games.form;

/**
 * „Edytuj grę” (GAME-3): formularz zapisanej gry. Gra usunięta albo nieistniejąca (np. stary
 * link) daje czytelny stan „Nie znaleziono gry”.
 */
export function EditGamePopup({ id }: { readonly id: string }) {
  const { client } = useAuth();
  const game = useGame(client, id);
  if (!game.isSuccess) {
    return (
      <PopupModal title={form.editTitle}>
        <QueryStatus isError={game.isError} onRetry={() => void game.refetch()} />
      </PopupModal>
    );
  }
  if (!game.data) {
    return (
      <PopupModal title={form.notFoundTitle}>
        <p className="games-not-found">{form.notFoundBody}</p>
      </PopupModal>
    );
  }
  return <GameForm game={game.data} base={null} />;
}

/** „Dodaj grę” (GAME-3). */
export function AddGamePopup() {
  return <GameForm game={null} base={null} />;
}

/**
 * „Dodaj dodatek” do gry podstawowej (z widoku gry i menu gry w kolekcji). Dodatek ma te same
 * pola co gra; nie trafia do kolekcji ani głosowania.
 */
export function AddExpansionPopup({ baseId }: { readonly baseId: string }) {
  const { client } = useAuth();
  const base = useGame(client, baseId);
  if (!base.isSuccess) {
    return (
      <PopupModal title={form.addExpansionTitle}>
        <QueryStatus isError={base.isError} onRetry={() => void base.refetch()} />
      </PopupModal>
    );
  }
  if (!base.data || base.data.base_game_id !== null) {
    return (
      <PopupModal title={form.notFoundTitle}>
        <p className="games-not-found">{form.notFoundBody}</p>
      </PopupModal>
    );
  }
  return <GameForm game={null} base={base.data} />;
}

type CoverState =
  | { readonly kind: 'keep' }
  | { readonly kind: 'remove' }
  | { readonly kind: 'processing' }
  | ({ readonly kind: 'new'; readonly preview: string } & CroppedCover);

/** Obraz w trakcie kadrowania: zdekodowany oryginał, adres podglądu i skąd pochodzi. */
interface Cropping {
  readonly bitmap: ImageBitmap;
  readonly url: string;
  readonly crop: CropState;
  readonly source: CoverSource;
}

const COVER_ERRORS: Readonly<Record<ImageScaleError['reason'], string>> = {
  type: form.errors.coverType,
  decode: form.errors.coverDecode,
  size: form.errors.coverSize,
};

const SAVE_ERRORS: Readonly<Record<GameSaveFailure, string>> = {
  forbidden: form.errors.forbidden,
  upload: form.errors.upload,
  save: form.errors.save,
  gone: form.errors.gone,
};

const COMPLEXITY_ERRORS: Readonly<Record<ComplexityError, string>> = {
  required: form.errors.complexityRequired,
  invalid: form.errors.complexityInvalid,
  range: form.errors.complexityRange,
};

const POINTS_ERRORS: Readonly<Record<PointsError, string>> = {
  required: form.errors.pointsRequired,
  invalid: form.errors.pointsInvalid,
  tooLarge: form.errors.pointsTooLarge,
};

/**
 * Formularz gry (GAME-3…GAME-6, DS „Kolekcja / Edytuj grę”, „Dodaj grę”): okładka, tytuł,
 * min. i max. liczba graczy (1 ≤ min ≤ max, bez górnego limitu) oraz punkty za każde miejsce
 * 1…max. Zmiana „max” dodaje lub usuwa pola punktów. Rosnąca punktacja daje ostrzeżenie, ale
 * nie blokuje zapisu.
 */
function GameForm({ game, base }: { readonly game: Game | null; readonly base: Game | null }) {
  const { client } = useAuth();
  const queryClient = useQueryClient();
  const toast = useToast();
  const { back } = usePopups();
  const formId = useId();
  const fileRef = useRef<HTMLInputElement>(null);
  const creating = game === null;
  const expansion = base !== null || (game?.base_game_id ?? null) !== null;
  // Id nowej gry od razu: kolor monogramu w podglądzie jest ten sam co po zapisie.
  const [id] = useState(() => game?.id ?? crypto.randomUUID());
  const [values, setValues] = useState<GameFormValues>(() =>
    game ? gameFormFrom(game) : emptyGameForm(),
  );
  const [cover, setCover] = useState<CoverState>({ kind: 'keep' });
  const [cropping, setCropping] = useState<Cropping | null>(null);
  const [applying, setApplying] = useState(false);
  const [coverError, setCoverError] = useState<string | undefined>(undefined);
  /** Błędy wszystkich pól po pierwszej próbie zapisu; tytułu także po opuszczeniu pola. */
  const [showErrors, setShowErrors] = useState(false);
  const [titleTouched, setTitleTouched] = useState(false);
  const [saveError, setSaveError] = useState<string | undefined>(undefined);

  // Adres podglądu i obraz kadru zwalniamy przy podmianie i przy zamknięciu popupu (jak w
  // formularzu klubu: ref, bo StrictMode od razu uruchamia sprzątanie efektu).
  const previewUrl = useRef<string | null>(null);
  const croppingRef = useRef<Cropping | null>(null);
  useEffect(
    () => () => {
      if (previewUrl.current) URL.revokeObjectURL(previewUrl.current);
      const open = croppingRef.current;
      if (open) {
        URL.revokeObjectURL(open.url);
        open.bitmap.close();
      }
    },
    [],
  );

  const releaseCropping = () => {
    const open = croppingRef.current;
    if (open) {
      URL.revokeObjectURL(open.url);
      open.bitmap.close();
    }
    croppingRef.current = null;
    setCropping(null);
  };

  const errors = validateGameForm(values);
  const invalid = hasErrors(errors);

  const save = useMutation({
    mutationFn: (coverChange: CoverChange) =>
      saveGame(client, game, { id, values, cover: coverChange, baseGameId: base?.id }),
    onSuccess: () => {
      void queryClient.invalidateQueries({ queryKey: gamesKey });
      const title = values.title.trim();
      const toasts = expansion ? t.games.toasts.expansion : t.games.toasts;
      toast.show(format(creating ? toasts.created : toasts.updated, { title }), 'success');
      back();
    },
    onError: (error) => {
      const reason = error instanceof GameSaveError ? error.reason : 'save';
      if (reason === 'gone') void queryClient.invalidateQueries({ queryKey: gamesKey });
      setSaveError(SAVE_ERRORS[reason]);
    },
  });

  /** Otwiera kadrowanie obrazu (oryginał w pamięci albo z Storage) z podanym kadrem. */
  const startCropping = async (
    blob: Blob,
    source: CoverSource,
    crop: (bitmap: ImageBitmap) => CropState,
  ) => {
    const bitmap = await createImageBitmap(blob);
    const next: Cropping = { bitmap, url: URL.createObjectURL(blob), crop: crop(bitmap), source };
    releaseCropping();
    croppingRef.current = next;
    setCropping(next);
  };

  /** Nowy obraz (plik albo schowek): oryginał 1600 px, potem kadr od środka. */
  const pickImage = async (file: Blob | undefined) => {
    if (!file || cover.kind === 'processing') return;
    setCoverError(undefined);
    const before = cover;
    setCover({ kind: 'processing' });
    try {
      const image = await prepareCoverSource(file);
      await startCropping(image.blob, { kind: 'upload', image }, (bitmap) =>
        clampCrop(INITIAL_CROP, bitmap, CROP_VIEW),
      );
      setCover(before);
    } catch (error) {
      setCover(before);
      setCoverError(
        error instanceof ImageScaleError ? COVER_ERRORS[error.reason] : form.errors.coverDecode,
      );
    }
  };

  /** Zmiana kadru okładki: nowej (jej oryginał) albo zapisanej (oryginał z Storage). */
  const recrop = async () => {
    if (cover.kind === 'processing') return;
    setCoverError(undefined);
    const before = cover;
    try {
      if (cover.kind === 'new') {
        const blob =
          cover.source.kind === 'upload'
            ? cover.source.image.blob
            : await downloadCover(client, cover.source.path);
        await startCropping(blob, cover.source, (bitmap) =>
          fromStoredCrop(cover.crop, bitmap, CROP_VIEW),
        );
        return;
      }
      if (cover.kind !== 'keep' || !game?.cover_path) return;
      setCover({ kind: 'processing' });
      // Okładka sprzed kadrowania nie ma oryginału: kadruje się sama okładka.
      const path = game.cover_source_path ?? game.cover_path;
      const stored = game.cover_source_path ? game.cover_crop : null;
      const blob = await downloadCover(client, path);
      await startCropping(blob, { kind: 'existing', path }, (bitmap) =>
        fromStoredCrop(stored, bitmap, CROP_VIEW),
      );
      setCover(before);
    } catch {
      setCover(before);
      setCoverError(form.errors.coverLoad);
    }
  };

  const applyCrop = async () => {
    if (!cropping || applying) return;
    setApplying(true);
    try {
      const image = await renderCover(cropping.bitmap, cropping.crop, CROP_VIEW);
      const preview = URL.createObjectURL(image.blob);
      if (previewUrl.current) URL.revokeObjectURL(previewUrl.current);
      previewUrl.current = preview;
      setCover({
        kind: 'new',
        image,
        preview,
        crop: toStoredCrop(cropping.crop, CROP_VIEW),
        source: cropping.source,
      });
      setCoverError(undefined);
      releaseCropping();
    } catch (error) {
      setCoverError(
        error instanceof ImageScaleError ? COVER_ERRORS[error.reason] : form.errors.coverDecode,
      );
      releaseCropping();
    } finally {
      setApplying(false);
    }
  };

  // Wklejenie obrazu (Ctrl+V / ⌘V) w dowolnym miejscu formularza: pola tekstowe nie przyjmują
  // obrazów, więc obraz ze schowka zawsze trafia do okładki.
  const pickRef = useRef(pickImage);
  useEffect(() => {
    pickRef.current = pickImage;
  });
  useEffect(() => {
    if (cropping) return;
    const onPaste = (event: ClipboardEvent) => {
      const file = clipboardImage(event.clipboardData);
      if (!file) return;
      event.preventDefault();
      void pickRef.current(file);
    };
    document.addEventListener('paste', onPaste);
    return () => document.removeEventListener('paste', onPaste);
  }, [cropping]);

  const pasteFromClipboard = async () => {
    setCoverError(undefined);
    try {
      await pickImage(await readClipboardImage());
    } catch (error) {
      setCoverError(
        error instanceof ClipboardError && error.reason === 'empty'
          ? form.errors.clipboardEmpty
          : form.errors.clipboardDenied,
      );
    }
  };

  const setMax = (maxPlayers: number) =>
    setValues((current) => withMaxPlayers(current, maxPlayers));
  const complexityError = errors.complexity && (showErrors || values.complexity !== '');
  const setPoint = (index: number, text: string) =>
    setValues((current) => ({
      ...current,
      points: current.points.map((value, i) => (i === index ? text : value)),
    }));

  const hasCover =
    cover.kind === 'new' ||
    cover.kind === 'processing' ||
    (cover.kind === 'keep' && game?.cover_path != null);
  const coverPath = cover.kind === 'keep' ? (game?.cover_path ?? null) : null;
  const coverSrc = cover.kind === 'new' ? cover.preview : undefined;

  const titleMessage =
    (showErrors || titleTouched) && errors.title
      ? errors.title === 'required'
        ? form.errors.titleRequired
        : format(form.errors.titleTooLong, { max: GAME_TITLE_MAX })
      : undefined;

  const submit = (event: FormEvent) => {
    event.preventDefault();
    setShowErrors(true);
    setSaveError(undefined);
    if (invalid || cover.kind === 'processing' || save.isPending) return;
    const change: CoverChange =
      cover.kind === 'new'
        ? { kind: 'new', image: cover.image, crop: cover.crop, source: cover.source }
        : cover.kind === 'remove'
          ? cover
          : { kind: 'keep' };
    save.mutate(change);
  };

  if (cropping) {
    return (
      <PopupModal
        title={t.crop.coverTitle}
        footer={
          <>
            <Button variant="secondary" disabled={applying} onClick={releaseCropping}>
              {form.cancel}
            </Button>
            <Button loading={applying} onClick={() => void applyCrop()}>
              {t.crop.apply}
            </Button>
          </>
        }
      >
        <p className="game-form__hint game-form__crop-intro">{t.crop.coverIntro}</p>
        <AvatarCropper
          src={cropping.url}
          image={cropping.bitmap}
          crop={cropping.crop}
          shape="cover"
          onCropChange={(crop) =>
            setCropping((open) => {
              if (!open) return open;
              const next = { ...open, crop };
              croppingRef.current = next;
              return next;
            })
          }
        />
      </PopupModal>
    );
  }

  const title = expansion
    ? creating
      ? form.addExpansionTitle
      : form.editExpansionTitle
    : creating
      ? form.addTitle
      : form.editTitle;

  return (
    <PopupModal
      title={title}
      footer={
        <>
          <Button variant="secondary" onClick={back}>
            {form.cancel}
          </Button>
          <Button
            type="submit"
            form={formId}
            loading={save.isPending || cover.kind === 'processing'}
          >
            {form.save}
          </Button>
        </>
      }
    >
      <form id={formId} className="game-form" noValidate onSubmit={submit}>
        {base ? (
          <p className="game-form__hint">{format(form.expansionOf, { title: base.title })}</p>
        ) : null}
        {saveError ? <Banner variant="error">{saveError}</Banner> : null}
        {showErrors && invalid && !saveError ? (
          <Banner variant="error">{form.errors.invalid}</Banner>
        ) : null}

        <fieldset className="club-form__logo">
          <legend className="sr-only">{form.coverLabel}</legend>
          <div className="club-form__tile">
            <GameCover
              id={id}
              title={values.title}
              coverPath={coverPath}
              src={coverSrc}
              size="form"
            />
            <span className="club-form__badge" aria-hidden="true">
              {cover.kind === 'processing' ? <Spinner size={16} /> : <Icon name="upload" />}
            </span>
          </div>
          <div className="club-form__logo-text">
            <div className="club-form__logo-actions">
              <button
                type="button"
                className="club-form__link"
                disabled={cover.kind === 'processing'}
                onClick={() => fileRef.current?.click()}
              >
                {hasCover ? form.changeCover : form.addCover}
              </button>
              {canReadClipboard() ? (
                <button
                  type="button"
                  className="club-form__link"
                  disabled={cover.kind === 'processing'}
                  onClick={() => void pasteFromClipboard()}
                >
                  {form.pasteCover}
                </button>
              ) : null}
              {hasCover && cover.kind !== 'processing' ? (
                <button type="button" className="club-form__link" onClick={() => void recrop()}>
                  {form.recropCover}
                </button>
              ) : null}
              {hasCover && cover.kind !== 'processing' ? (
                <button
                  type="button"
                  className="club-form__link club-form__link--muted"
                  onClick={() => {
                    setCover({ kind: 'remove' });
                    setCoverError(undefined);
                  }}
                >
                  {form.removeCover}
                </button>
              ) : null}
            </div>
            <p className="club-form__helper" role={coverError ? 'alert' : undefined}>
              {coverError ? (
                <span className="club-form__helper--error">{coverError}</span>
              ) : cover.kind === 'processing' ? (
                form.coverProcessing
              ) : (
                <>
                  {form.coverHelper}
                  <br />
                  {form.coverFallback}
                </>
              )}
            </p>
            <input
              ref={fileRef}
              type="file"
              accept={IMAGE_ACCEPT}
              className="sr-only"
              tabIndex={-1}
              aria-label={form.coverLabel}
              onChange={(event) => {
                void pickImage(event.target.files?.[0]);
                event.target.value = '';
              }}
            />
          </div>
        </fieldset>

        <TextField
          label={form.titleLabel}
          placeholder={form.titlePlaceholder}
          value={values.title}
          autoComplete="off"
          required
          error={titleMessage}
          onChange={(event) => {
            const title = event.target.value;
            setValues((current) => ({ ...current, title }));
          }}
          onBlur={() => values.title !== '' && setTitleTouched(true)}
        />

        <fieldset className="game-form__group">
          <legend className="game-form__legend">{form.playersLegend}</legend>
          <div className="game-form__players">
            <Stepper
              label={form.minLabel}
              value={values.minPlayers}
              min={1}
              onChange={(minPlayers) => setValues((current) => ({ ...current, minPlayers }))}
            />
            <Stepper
              label={form.maxLabel}
              value={values.maxPlayers}
              min={1}
              onChange={setMax}
              error={errors.maxPlayers ? form.errors.range : undefined}
            />
          </div>
          <p className="game-form__hint">{form.playersHint}</p>
        </fieldset>

        <div className="game-form__group">
          {game && game.complexity === null && values.complexity === '' ? (
            <Banner variant="warning">{form.complexityMissing}</Banner>
          ) : null}
          <TextField
            label={form.complexityLabel}
            placeholder={form.complexityPlaceholder}
            value={values.complexity}
            inputMode="decimal"
            autoComplete="off"
            numeric
            required
            hint={form.complexityHint}
            error={
              complexityError && errors.complexity
                ? COMPLEXITY_ERRORS[errors.complexity]
                : undefined
            }
            onChange={(event) => {
              const complexity = event.target.value;
              setValues((current) => withComplexity(current, complexity));
            }}
          />
        </div>

        <fieldset className="game-form__group">
          <legend className="game-form__legend">{form.pointsLegend}</legend>
          <p className="game-form__hint">
            {form.pointsHint}
            {creating ? null : (
              <>
                <br />
                {form.historyNote}
              </>
            )}
          </p>
          <div className="game-form__points">
            {values.points.map((text, index) => {
              const error = errors.points[index];
              return (
                <TextField
                  // Pola są pozycjami (miejsce 1…max), więc indeks jest stabilnym kluczem.
                  key={index}
                  label={format(form.placeLabel, { n: index + 1 })}
                  value={text}
                  inputMode="decimal"
                  autoComplete="off"
                  numeric
                  required
                  trailing={form.pointsUnit}
                  error={showErrors && error ? POINTS_ERRORS[error] : undefined}
                  onChange={(event) => setPoint(index, event.target.value)}
                />
              );
            })}
          </div>
          {pointsEdited(values) ? (
            <p className="game-form__hint">
              {form.pointsEdited}{' '}
              <button
                type="button"
                className="club-form__link"
                onClick={() => setValues((current) => withComplexity(current, current.complexity))}
              >
                {form.pointsReset}
              </button>
            </p>
          ) : null}
          {pointsIncrease(values.points) ? (
            <Banner variant="warning" className="game-form__warning">
              {form.pointsWarning}
            </Banner>
          ) : null}
        </fieldset>
      </form>
    </PopupModal>
  );
}
