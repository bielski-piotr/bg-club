import { useMutation, useQueryClient } from '@tanstack/react-query';
import { useEffect, useId, useRef, useState, type FormEvent } from 'react';
import { useAuth } from '../auth/authContext';
import { format, t } from '../i18n';
import { usePopups } from '../popups/popupContext';
import { PopupModal } from '../popups/PopupModal';
import { QueryStatus } from '../popups/QueryStatus';
import { Banner, Button, Icon, Stepper, TextField, useToast } from '../ui';
import { clipboardImage, downloadCover, type CroppedCover } from './cover';
import { CoverEditor, type CoverEditorResult, type CoverEditorStart } from './CoverEditor';
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
  | ({ readonly kind: 'new'; readonly preview: string } & CroppedCover);

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
  const creating = game === null;
  const expansion = base !== null || (game?.base_game_id ?? null) !== null;
  // Id nowej gry od razu: kolor monogramu w podglądzie jest ten sam co po zapisie.
  const [id] = useState(() => game?.id ?? crypto.randomUUID());
  const [values, setValues] = useState<GameFormValues>(() =>
    game ? gameFormFrom(game) : emptyGameForm(),
  );
  const [cover, setCover] = useState<CoverState>({ kind: 'keep' });
  /** Otwarty edytor okładki i z czym się otworzył. */
  const [editor, setEditor] = useState<CoverEditorStart | null>(null);
  /** Błędy wszystkich pól po pierwszej próbie zapisu; tytułu także po opuszczeniu pola. */
  const [showErrors, setShowErrors] = useState(false);
  const [titleTouched, setTitleTouched] = useState(false);
  const [saveError, setSaveError] = useState<string | undefined>(undefined);

  // Adres podglądu zwalniamy przy podmianie i przy zamknięciu popupu (jak w formularzu klubu:
  // ref, bo StrictMode od razu uruchamia sprzątanie efektu).
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

  const hasCover = cover.kind === 'new' || (cover.kind === 'keep' && game?.cover_path != null);

  /** Edytor z obecną okładką: nowa (jej oryginał) albo zapisana (oryginał z Storage). */
  const openEditor = () => {
    if (cover.kind === 'new') {
      const { source, crop } = cover;
      setEditor({
        kind: 'current',
        load: async () => ({
          blob:
            source.kind === 'upload' ? source.image.blob : await downloadCover(client, source.path),
          source,
          crop,
        }),
      });
      return;
    }
    const path = cover.kind === 'keep' ? (game?.cover_path ?? null) : null;
    if (!game || !path) {
      setEditor({ kind: 'empty' });
      return;
    }
    // Okładka sprzed kadrowania nie ma oryginału: kadruje się sama okładka.
    const sourcePath = game.cover_source_path ?? path;
    const crop = game.cover_source_path ? game.cover_crop : null;
    setEditor({
      kind: 'current',
      load: async () => ({
        blob: await downloadCover(client, sourcePath),
        source: { kind: 'existing', path: sourcePath },
        crop,
      }),
    });
  };

  const closeEditor = (result: CoverEditorResult) => {
    setEditor(null);
    if (result.kind === 'unchanged') return;
    if (result.kind === 'remove') {
      // Gra bez zapisanej okładki: wystarczy porzucić nową.
      setCover(game?.cover_path ? { kind: 'remove' } : { kind: 'keep' });
      return;
    }
    const preview = URL.createObjectURL(result.image.blob);
    if (previewUrl.current) URL.revokeObjectURL(previewUrl.current);
    previewUrl.current = preview;
    setCover({ ...result, preview });
  };

  // Wklejenie obrazu (Ctrl+V / ⌘V) w dowolnym miejscu formularza otwiera edytor okładki z tym
  // obrazem: pola tekstowe nie przyjmują obrazów.
  useEffect(() => {
    if (editor) return;
    const onPaste = (event: ClipboardEvent) => {
      const file = clipboardImage(event.clipboardData);
      if (!file) return;
      event.preventDefault();
      setEditor({ kind: 'file', file });
    };
    document.addEventListener('paste', onPaste);
    return () => document.removeEventListener('paste', onPaste);
  }, [editor]);

  const setMax = (maxPlayers: number) =>
    setValues((current) => withMaxPlayers(current, maxPlayers));
  const complexityError = errors.complexity && (showErrors || values.complexity !== '');
  const setPoint = (index: number, text: string) =>
    setValues((current) => ({
      ...current,
      points: current.points.map((value, i) => (i === index ? text : value)),
    }));

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
    if (invalid || save.isPending) return;
    const change: CoverChange =
      cover.kind === 'new'
        ? { kind: 'new', image: cover.image, crop: cover.crop, source: cover.source }
        : cover.kind === 'remove'
          ? cover
          : { kind: 'keep' };
    save.mutate(change);
  };

  if (editor) {
    return <CoverEditor start={editor} onCancel={() => setEditor(null)} onDone={closeEditor} />;
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
          <Button type="submit" form={formId} loading={save.isPending}>
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
          <button
            type="button"
            className="club-form__tile game-form__cover"
            aria-label={hasCover ? form.editCover : form.addCover}
            onClick={openEditor}
          >
            <GameCover
              id={id}
              title={values.title}
              coverPath={coverPath}
              src={coverSrc}
              size="form"
            />
            <span className="club-form__badge" aria-hidden="true">
              <Icon name="pencil" />
            </span>
          </button>
          <div className="club-form__logo-text">
            <p className="club-form__helper">
              {form.coverHelper}
              <br />
              {cover.kind === 'new'
                ? form.coverChanged
                : cover.kind === 'remove'
                  ? form.coverRemoved
                  : form.coverFallback}
            </p>
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
