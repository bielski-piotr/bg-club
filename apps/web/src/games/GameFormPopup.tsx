import {
  action,
  createEffect,
  createMemo,
  createOptimistic,
  createSignal,
  createUniqueId,
  flush,
  For,
  onSettled,
  Show,
  useContext,
} from 'solid-js';
import { format, t } from '../i18n';
import { AuthContext } from '../auth/authContext';
import { PopupsContext } from '../popups/popupContext';
import { QueryClientContext } from '../lib/queryClient';
import { ToastContext } from '../ui/toastContext';
import { PopupModal } from '../popups/PopupModal';
import { QueryBoundary } from '../popups/QueryStatus';
import { Banner, Button, Icon, Stepper, Switch as Toggle, TextField } from '../ui';
import { clipboardImage, downloadCover, type CroppedCover } from './cover';
import { CoverEditor, type CoverEditorResult, type CoverEditorStart } from './CoverEditor';
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
import { GameCover } from './GameCover';
import { createGame } from './gameData';
import {
  GameSaveError,
  gamesKey,
  saveGame,
  type CoverChange,
  type Game,
  type GameSaveFailure,
} from './games';
import '../club/club.css';
import './games.css';

const form = t.games.form;

/**
 * „Edytuj grę”: formularz zapisanej gry. Gra usunięta albo nieistniejąca (np. stary
 * link) daje czytelny stan „Nie znaleziono gry”.
 */
export function EditGamePopup(props: { readonly id: string }) {
  return <GameFormPopup mode="edit" id={props.id} />;
}

/** „Dodaj grę”. */
export function AddGamePopup() {
  return <GameFormPopup mode="add" id="" />;
}

/**
 * „Dodaj dodatek” do gry podstawowej (z widoku gry i menu gry w kolekcji). Dodatek ma te same
 * pola co gra; nie trafia do kolekcji ani głosowania.
 */
export function AddExpansionPopup(props: { readonly baseId: string }) {
  return <GameFormPopup mode="expansion" id={props.baseId} />;
}

type CoverState =
  | { readonly kind: 'keep' }
  | { readonly kind: 'remove' }
  | ({ readonly kind: 'new'; readonly preview: string } & CroppedCover);

/** Gra edytowana (`game`) albo gra podstawowa nowego dodatku (`base`). */
interface FormTarget {
  readonly game: Game | null;
  readonly base: Game | null;
}

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
 * Formularz gry: okładka, tytuł,
 * min. i max. liczba graczy (1 ≤ min ≤ max, bez górnego limitu) oraz punkty za każde miejsce
 * 1…max. Zmiana „max” dodaje lub usuwa pola punktów. Rosnąca punktacja daje ostrzeżenie, ale
 * nie blokuje zapisu. Jedno okno na wczytywanie gry, formularz i „Nie znaleziono gry”: fokus
 * ustawiony przez `PopupHost` zostaje na oknie po wczytaniu danych.
 */
function GameFormPopup(props: {
  readonly mode: 'add' | 'edit' | 'expansion';
  /** `edit`: id gry, `expansion`: id gry podstawowej, `add`: pusty. */
  readonly id: string;
}) {
  const auth = useContext(AuthContext);
  const queryClient = useContext(QueryClientContext);
  const toast = useContext(ToastContext);
  const popups = useContext(PopupsContext);
  const formId = createUniqueId();
  // Id nowej gry od razu: kolor monogramu w podglądzie jest ten sam co po zapisie.
  const newId = crypto.randomUUID();

  const source = createGame(() => (props.mode === 'add' ? '' : props.id));
  // Okno (tytuł, stopka, „nie znaleziono”) i start formularza zależą od danych w cache bez
  // czekania; treść czeka na grę pod `<QueryBoundary>`.
  const notFound = () => {
    if (props.mode === 'add') return false;
    const data = source.current();
    if (data === undefined) return false;
    return !data || (props.mode === 'expansion' && data.base_game_id !== null);
  };
  /** Czyta grę z czekaniem (pod `<QueryBoundary>`); nowa gra nie czeka. */
  const loaded = () => props.mode === 'add' || source() !== undefined;
  const target = (): FormTarget | undefined => {
    if (props.mode === 'add') return { game: null, base: null };
    const data = source.current();
    if (!data || notFound()) return undefined;
    return props.mode === 'edit' ? { game: data, base: null } : { game: null, base: data };
  };
  // Formularz startuje z pierwszych wczytanych danych (raz, przy montowaniu): odświeżenie
  // gry w cache nie nadpisuje tego, co wpisano.
  let first: FormTarget | undefined;
  const ctx = createMemo(() => (first ??= target()));
  const game = () => ctx()?.game ?? null;
  const base = () => ctx()?.base ?? null;
  const id = () => game()?.id ?? newId;
  const creating = () => game() === null;
  const expansion = () => base() !== null || (game()?.base_game_id ?? null) !== null;

  const [values, setValues] = createSignal<GameFormValues>(() => {
    const current = ctx();
    // Nowy dodatek niedostępnej gry jest niedostępny (tak samo ustawia go baza).
    return current?.game
      ? gameFormFrom(current.game)
      : { ...emptyGameForm(), available: current?.base?.available ?? true };
  });
  // Gra podstawowa dodatku (nowego albo edytowanego): uwaga, gdy jest niedostępna.
  const baseGame = createGame(() => base()?.id ?? game()?.base_game_id ?? '');
  const unavailableBase = () => {
    const data = baseGame.current();
    return expansion() && data != null && !data.available ? data : undefined;
  };
  const [cover, setCover] = createSignal<CoverState>({ kind: 'keep' });
  /** Otwarty edytor okładki i z czym się otworzył. */
  const [editor, setEditor] = createSignal<CoverEditorStart | null>(null);
  /** Błędy wszystkich pól po pierwszej próbie zapisu; tytułu także po opuszczeniu pola. */
  const [showErrors, setShowErrors] = createSignal(false);
  const [titleTouched, setTitleTouched] = createSignal(false);
  const [saveError, setSaveError] = createSignal<string | undefined>(undefined);

  // Adres podglądu zwalniamy przy podmianie i przy zamknięciu popupu.
  let previewUrl: string | null = null;
  onSettled(() => () => {
    if (previewUrl) URL.revokeObjectURL(previewUrl);
  });

  const errors = createMemo(() => validateGameForm(values()));
  const invalid = () => hasErrors(errors());

  const [saving, setSaving] = createOptimistic(false);
  const save = action(function* (coverChange: CoverChange) {
    setSaving(true);
    try {
      yield saveGame(auth.client, game(), {
        id: id(),
        values: values(),
        cover: coverChange,
        baseGameId: base()?.id,
      });
    } catch (error) {
      const reason = error instanceof GameSaveError ? error.reason : 'save';
      if (reason === 'gone') void queryClient.invalidateQueries({ queryKey: gamesKey });
      setSaveError(SAVE_ERRORS[reason]);
      return;
    }
    void queryClient.invalidateQueries({ queryKey: gamesKey });
    const title = values().title.trim();
    const toasts = expansion() ? t.games.toasts.expansion : t.games.toasts;
    toast.show(format(creating() ? toasts.created : toasts.updated, { title }), 'success');
    popups.back();
  });

  const hasCover = () => {
    const current = cover();
    return current.kind === 'new' || (current.kind === 'keep' && game()?.cover_path != null);
  };

  /** Edytor z obecną okładką: nowa (jej oryginał) albo zapisana (oryginał z Storage). */
  const openEditor = () => {
    const current = cover();
    if (current.kind === 'new') {
      const { source: original, crop } = current;
      setEditor({
        kind: 'current',
        load: async () => ({
          blob:
            original.kind === 'upload'
              ? original.image.blob
              : await downloadCover(auth.client, original.path),
          source: original,
          crop,
        }),
      });
      return;
    }
    const saved = game();
    const path = current.kind === 'keep' ? (saved?.cover_path ?? null) : null;
    if (!saved || !path) {
      setEditor({ kind: 'empty' });
      return;
    }
    // Okładka sprzed kadrowania nie ma oryginału: kadruje się sama okładka.
    const sourcePath = saved.cover_source_path ?? path;
    const crop = saved.cover_source_path ? saved.cover_crop : null;
    setEditor({
      kind: 'current',
      load: async () => ({
        blob: await downloadCover(auth.client, sourcePath),
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
      setCover(game()?.cover_path ? { kind: 'remove' } : { kind: 'keep' });
      return;
    }
    const preview = URL.createObjectURL(result.image.blob);
    if (previewUrl) URL.revokeObjectURL(previewUrl);
    previewUrl = preview;
    setCover({ ...result, preview });
  };

  // Wklejenie obrazu (Ctrl+V / ⌘V) w dowolnym miejscu formularza otwiera edytor okładki z tym
  // obrazem: pola tekstowe nie przyjmują obrazów.
  const pasting = createMemo(() => !!ctx() && editor() === null);
  createEffect(pasting, (active) => {
    if (!active) return;
    const onPaste = (event: ClipboardEvent) => {
      const file = clipboardImage(event.clipboardData);
      if (!file) return;
      event.preventDefault();
      setEditor({ kind: 'file', file });
    };
    document.addEventListener('paste', onPaste);
    return () => document.removeEventListener('paste', onPaste);
  });

  const update = (change: (current: GameFormValues) => GameFormValues) =>
    setValues((current) => change(current));
  const setPoint = (index: number, text: string) =>
    update((current) => ({
      ...current,
      points: current.points.map((value, i) => (i === index ? text : value)),
    }));

  const coverPath = () => (cover().kind === 'keep' ? (game()?.cover_path ?? null) : null);
  const coverSrc = () => {
    const current = cover();
    return current.kind === 'new' ? current.preview : undefined;
  };

  const titleMessage = () => {
    const error = errors().title;
    if (!(showErrors() || titleTouched()) || !error) return undefined;
    return error === 'required'
      ? form.errors.titleRequired
      : format(form.errors.titleTooLong, { max: GAME_TITLE_MAX });
  };
  const complexityMessage = () => {
    const error = errors().complexity;
    return error && (showErrors() || values().complexity !== '')
      ? COMPLEXITY_ERRORS[error]
      : undefined;
  };

  const submit = (event: SubmitEvent) => {
    event.preventDefault();
    setShowErrors(true);
    setSaveError(undefined);
    // Wpis z tego samego zadania (autouzupełnianie + Enter) widać dopiero po flushu; flush
    // pokazuje też od razu powyższe zapisy (przed akcją czekałyby na jej koniec).
    flush();
    if (invalid() || saving()) return;
    const current = cover();
    const change: CoverChange =
      current.kind === 'new'
        ? { kind: 'new', image: current.image, crop: current.crop, source: current.source }
        : current.kind === 'remove'
          ? current
          : { kind: 'keep' };
    void save(change);
  };

  const title = () => {
    if (notFound()) return form.notFoundTitle;
    if (props.mode === 'expansion') return form.addExpansionTitle;
    if (props.mode === 'add') return form.addTitle;
    return expansion() ? form.editExpansionTitle : form.editTitle;
  };

  return (
    <Show
      when={editor()}
      keyed
      fallback={
        <PopupModal
          title={title()}
          footer={
            <Show when={ctx() && !notFound()}>
              <Button variant="secondary" onClick={() => popups.back()}>
                {form.cancel}
              </Button>
              <Button type="submit" form={formId} loading={saving()}>
                {form.save}
              </Button>
            </Show>
          }
        >
          <Show when={!notFound()} fallback={<p class="games-not-found">{form.notFoundBody}</p>}>
            <QueryBoundary>
              <Show when={loaded() && ctx()}>
                <form id={formId} class="game-form" novalidate onSubmit={submit}>
                  <Show when={base()}>
                    {(shown) => (
                      <p class="game-form__hint">
                        {format(form.expansionOf, { title: shown().title })}
                      </p>
                    )}
                  </Show>
                  <Show when={saveError()}>
                    {(message) => <Banner variant="error">{message()}</Banner>}
                  </Show>
                  <Show when={showErrors() && invalid() && !saveError()}>
                    <Banner variant="error">{form.errors.invalid}</Banner>
                  </Show>

                  <fieldset class="club-form__logo">
                    <legend class="sr-only">{form.coverLabel}</legend>
                    <button
                      type="button"
                      class="club-form__tile game-form__cover"
                      aria-label={hasCover() ? form.editCover : form.addCover}
                      onClick={openEditor}
                    >
                      <GameCover
                        id={id()}
                        title={values().title}
                        coverPath={coverPath()}
                        src={coverSrc()}
                        size="form"
                      />
                      <span class="club-form__badge" aria-hidden="true">
                        <Icon name="pencil" />
                      </span>
                    </button>
                    <div class="club-form__logo-text">
                      <p class="club-form__helper">
                        {form.coverHelper}
                        <br />
                        {cover().kind === 'new'
                          ? form.coverChanged
                          : cover().kind === 'remove'
                            ? form.coverRemoved
                            : form.coverFallback}
                      </p>
                    </div>
                  </fieldset>

                  <TextField
                    label={form.titleLabel}
                    placeholder={form.titlePlaceholder}
                    value={values().title}
                    autocomplete="off"
                    required
                    error={titleMessage()}
                    onInput={(event) => {
                      const text = event.currentTarget.value;
                      update((current) => ({ ...current, title: text }));
                    }}
                    onBlur={(event) => {
                      // Wartość z pola: wpis z tego samego zadania sygnał pokaże dopiero po flushu.
                      if (event.currentTarget.value !== '') setTitleTouched(true);
                    }}
                  />

                  <div class="game-form__group">
                    <Toggle
                      label={form.availableLabel}
                      checked={values().available}
                      onCheckedChange={(available) =>
                        update((current) => ({ ...current, available }))
                      }
                      description={expansion() ? form.availableHintExpansion : form.availableHint}
                    />
                    <Show when={unavailableBase()}>
                      {(shown) => (
                        <p class="game-form__hint">
                          {format(form.availableBaseOff, { title: shown().title })}
                        </p>
                      )}
                    </Show>
                  </div>

                  <fieldset class="game-form__group">
                    <legend class="game-form__legend">{form.playersLegend}</legend>
                    <div class="game-form__players">
                      <Stepper
                        label={form.minLabel}
                        value={values().minPlayers}
                        min={1}
                        onChange={(minPlayers) => update((current) => ({ ...current, minPlayers }))}
                      />
                      <Stepper
                        label={form.maxLabel}
                        value={values().maxPlayers}
                        min={1}
                        onChange={(maxPlayers) =>
                          update((current) => withMaxPlayers(current, maxPlayers))
                        }
                        error={errors().maxPlayers ? form.errors.range : undefined}
                      />
                    </div>
                    <p class="game-form__hint">{form.playersHint}</p>
                  </fieldset>

                  <div class="game-form__group">
                    <Show when={game()?.complexity === null && values().complexity === ''}>
                      <Banner variant="warning">{form.complexityMissing}</Banner>
                    </Show>
                    <TextField
                      label={form.complexityLabel}
                      placeholder={form.complexityPlaceholder}
                      value={values().complexity}
                      inputmode="decimal"
                      autocomplete="off"
                      numeric
                      required
                      hint={form.complexityHint}
                      error={complexityMessage()}
                      onInput={(event) => {
                        const complexity = event.currentTarget.value;
                        update((current) => withComplexity(current, complexity));
                      }}
                    />
                  </div>

                  <fieldset class="game-form__group">
                    <legend class="game-form__legend">{form.pointsLegend}</legend>
                    <p class="game-form__hint">
                      {form.pointsHint}
                      <Show when={!creating()}>
                        <br />
                        {form.historyNote}
                      </Show>
                    </p>
                    <div class="game-form__points">
                      {/* Pola są pozycjami (miejsce 1…max), więc lista jest po indeksie. */}
                      <For each={values().points} keyed={false}>
                        {(text, index) => (
                          <TextField
                            label={format(form.placeLabel, { n: index + 1 })}
                            value={text()}
                            inputmode="decimal"
                            autocomplete="off"
                            numeric
                            required
                            trailing={form.pointsUnit}
                            error={(() => {
                              const error = errors().points[index];
                              return showErrors() && error ? POINTS_ERRORS[error] : undefined;
                            })()}
                            onInput={(event) => setPoint(index, event.currentTarget.value)}
                          />
                        )}
                      </For>
                    </div>
                    <Show when={pointsEdited(values())}>
                      <p class="game-form__hint">
                        {form.pointsEdited}{' '}
                        <button
                          type="button"
                          class="club-form__link"
                          onClick={() =>
                            update((current) => withComplexity(current, current.complexity))
                          }
                        >
                          {form.pointsReset}
                        </button>
                      </p>
                    </Show>
                    <Show when={pointsIncrease(values().points)}>
                      <Banner variant="warning" class="game-form__warning">
                        {form.pointsWarning}
                      </Banner>
                    </Show>
                  </fieldset>
                </form>
              </Show>
            </QueryBoundary>
          </Show>
        </PopupModal>
      }
    >
      {(start) => (
        <CoverEditor start={start} onCancel={() => setEditor(null)} onDone={closeEditor} />
      )}
    </Show>
  );
}
