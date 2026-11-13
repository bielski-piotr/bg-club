import { useMutation, useQueryClient } from '@tanstack/react-query';
import { useEffect, useId, useRef, useState, type FormEvent } from 'react';
import { useAuth } from '../auth/authContext';
import { IMAGE_ACCEPT, ImageScaleError, scaleImage, type ScaledImage } from '../club/image';
import { format, t } from '../i18n';
import { usePopups } from '../popups/popupContext';
import { PopupModal } from '../popups/PopupModal';
import { QueryStatus } from '../popups/QueryStatus';
import { Banner, Button, Icon, Spinner, Stepper, TextField, useToast } from '../ui';
import { GameCover } from './GameCover';
import {
  emptyGameForm,
  GAME_TITLE_MAX,
  gameFormFrom,
  hasErrors,
  pointsIncrease,
  resizePoints,
  validateGameForm,
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
  return <GameForm game={game.data} />;
}

/** „Dodaj grę” (GAME-3). */
export function AddGamePopup() {
  return <GameForm game={null} />;
}

type CoverState =
  | { readonly kind: 'keep' }
  | { readonly kind: 'remove' }
  | { readonly kind: 'processing' }
  | { readonly kind: 'new'; readonly image: ScaledImage; readonly preview: string };

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
function GameForm({ game }: { readonly game: Game | null }) {
  const { client } = useAuth();
  const queryClient = useQueryClient();
  const toast = useToast();
  const { back } = usePopups();
  const formId = useId();
  const fileRef = useRef<HTMLInputElement>(null);
  const creating = game === null;
  // Id nowej gry od razu: kolor monogramu w podglądzie jest ten sam co po zapisie.
  const [id] = useState(() => game?.id ?? crypto.randomUUID());
  const [values, setValues] = useState<GameFormValues>(() =>
    game ? gameFormFrom(game) : emptyGameForm(),
  );
  const [cover, setCover] = useState<CoverState>({ kind: 'keep' });
  const [coverError, setCoverError] = useState<string | undefined>(undefined);
  /** Błędy wszystkich pól po pierwszej próbie zapisu; tytułu także po opuszczeniu pola. */
  const [showErrors, setShowErrors] = useState(false);
  const [titleTouched, setTitleTouched] = useState(false);
  const [saveError, setSaveError] = useState<string | undefined>(undefined);

  // Adres podglądu zwalniamy przy wyborze kolejnego pliku i przy zamknięciu popupu (jak w
  // formularzu klubu: ref, bo StrictMode od razu uruchamia sprzątanie efektu).
  const previewUrl = useRef<string | null>(null);
  useEffect(
    () => () => {
      if (previewUrl.current) URL.revokeObjectURL(previewUrl.current);
    },
    [],
  );

  const errors = validateGameForm(values);
  const invalid = hasErrors(errors);

  const save = useMutation({
    mutationFn: (coverChange: CoverChange) =>
      saveGame(client, game, { id, values, cover: coverChange }),
    onSuccess: () => {
      void queryClient.invalidateQueries({ queryKey: gamesKey });
      const title = values.title.trim();
      toast.show(
        format(creating ? t.games.toasts.created : t.games.toasts.updated, { title }),
        'success',
      );
      back();
    },
    onError: (error) => {
      const reason = error instanceof GameSaveError ? error.reason : 'save';
      if (reason === 'gone') void queryClient.invalidateQueries({ queryKey: gamesKey });
      setSaveError(SAVE_ERRORS[reason]);
    },
  });

  const pickFile = async (file: File | undefined) => {
    if (!file) return;
    setCoverError(undefined);
    const before = cover;
    setCover({ kind: 'processing' });
    try {
      const image = await scaleImage(file);
      const preview = URL.createObjectURL(image.blob);
      if (previewUrl.current) URL.revokeObjectURL(previewUrl.current);
      previewUrl.current = preview;
      setCover({ kind: 'new', image, preview });
    } catch (error) {
      setCover(before);
      setCoverError(
        error instanceof ImageScaleError ? COVER_ERRORS[error.reason] : form.errors.coverDecode,
      );
    }
  };

  const setMax = (maxPlayers: number) =>
    setValues((current) => ({
      ...current,
      maxPlayers,
      points: resizePoints(current.points, maxPlayers),
    }));
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
        ? { kind: 'new', image: cover.image }
        : cover.kind === 'remove'
          ? cover
          : { kind: 'keep' };
    save.mutate(change);
  };

  return (
    <PopupModal
      title={creating ? form.addTitle : form.editTitle}
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
                void pickFile(event.target.files?.[0]);
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
                  inputMode="numeric"
                  pattern="[0-9]*"
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
