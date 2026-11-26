import {
  action,
  createMemo,
  createOptimistic,
  createSignal,
  createUniqueId,
  flush,
  onFlush,
  Show,
  useContext,
} from 'solid-js';
import { createGameSearch } from '../games/gameData';
import { allExpansionsQuery } from '../games/games';
import { format, t } from '../i18n';
import { AuthContext } from '../auth/authContext';
import { PopupsContext } from '../popups/popupContext';
import { QueryClientContext } from '../lib/queryClient';
import { ToastContext } from '../ui/toastContext';
import { InvalidPopup } from '../popups/InvalidPopup';
import { createMounted } from '../popups/leaveGuard';
import { PopupDialog } from '../popups/PopupDialog';
import { QueryBoundary } from '../popups/QueryStatus';
import { createQuery } from '../lib/query';
import { Banner, Button, Select, TextField, type SelectOption } from '../ui';
import { scorepadErrorMessage } from './messages';
import { createScorepad } from './scorepadData';
import {
  deleteScorepad,
  moveScorepad,
  renameScorepad,
  ScorepadError,
  SCOREPAD_NAME_MAX,
  scorepadName,
  scorepadsKey,
  type Scorepad,
} from './scorepads';

/**
 * „Zmień nazwę” notesu: bez nowej wersji, partie zachowują swój szablon. Jedno okno
 * na wczytywanie i formularz.
 */
export function RenameScorepadDialog(props: { readonly id: string }) {
  const text = t.scorepads.rename;
  const auth = useContext(AuthContext);
  const queryClient = useContext(QueryClientContext);
  const toast = useContext(ToastContext);
  const popups = useContext(PopupsContext);
  const mounted = createMounted();
  const formId = createUniqueId();
  const query = createScorepad(() => props.id);
  // Formularz startuje z pierwszego wczytanego notesu: odświeżenie w tle nie nadpisuje wpisu.
  let first: Scorepad | undefined;
  const pad = createMemo(() => (first ??= query.current() ?? undefined));
  /** Notes pod `<QueryBoundary>`: czeka na pierwsze wczytanie. */
  const loaded = () => {
    query();
    return pad();
  };
  const [name, setName] = createSignal(() => pad()?.name ?? '');
  const [touched, setTouched] = createSignal(false);
  const trimmed = () => name().trim();
  const problem = () =>
    trimmed() === ''
      ? text.required
      : trimmed().length > SCOREPAD_NAME_MAX
        ? format(text.tooLong, { max: SCOREPAD_NAME_MAX })
        : undefined;

  const [saving, setSaving] = createOptimistic(false);
  const [error, setError] = createSignal<string | undefined>(undefined);
  const rename = action(function* (next: string) {
    setSaving(true);
    try {
      yield renameScorepad(auth.client, props.id, next);
    } catch (failure) {
      setError(scorepadErrorMessage(failure));
      return;
    }
    toast.show(format(t.scorepads.toasts.renamed, { name: scorepadName(next) }), 'success');
    void queryClient.invalidateQueries({ queryKey: scorepadsKey });
    if (mounted()) popups.back();
  });

  const submit = (event: SubmitEvent) => {
    event.preventDefault();
    // Wpis z tego samego zadania (autouzupełnianie + Enter) widać dopiero po flushu.
    flush();
    setTouched(true);
    const current = pad();
    if (!current || problem() || saving()) return;
    if (trimmed() === current.name) {
      popups.back();
      return;
    }
    // Poprzedni błąd znika od razu, nie dopiero po zapisie.
    onFlush(() => setError(undefined));
    void rename(trimmed());
  };

  return (
    <Show when={!(query.current() === null && !pad())} fallback={<InvalidPopup />}>
      <PopupDialog
        title={text.title}
        icon="pad"
        description={
          <QueryBoundary>
            <Show when={loaded()}>
              <p>{text.helper}</p>
            </Show>
          </QueryBoundary>
        }
        footer={
          <>
            <Button variant="secondary" disabled={saving()} onClick={() => popups.back()}>
              {text.cancel}
            </Button>
            <Show when={pad()}>
              <Button type="submit" form={formId} loading={saving()}>
                {text.submit}
              </Button>
            </Show>
          </>
        }
      >
        <Show when={pad()}>
          <form id={formId} novalidate onSubmit={submit} class="scorepads">
            <Show when={error()}>{(message) => <Banner variant="error">{message()}</Banner>}</Show>
            <TextField
              label={text.label}
              value={name()}
              autocomplete="off"
              required
              maxlength={SCOREPAD_NAME_MAX}
              error={touched() ? problem() : undefined}
              onInput={(event) => setName(event.currentTarget.value)}
              onBlur={() => setTouched(true)}
            />
          </form>
        </Show>
      </PopupDialog>
    </Show>
  );
}

/**
 * „Przenieś do…”: notes trafia do innej gry albo dodatku (np. notes dodatku dodany najpierw
 * przy grze podstawowej). Historia się nie zmienia: rozegrane partie zachowują swoją grę
 * i wersję notesu.
 */
export function MoveScorepadPopup(props: { readonly id: string }) {
  const text = t.scorepads.move;
  const auth = useContext(AuthContext);
  const queryClient = useContext(QueryClientContext);
  const toast = useContext(ToastContext);
  const popups = useContext(PopupsContext);
  const mounted = createMounted();
  const query = createScorepad(() => props.id);
  const games = createGameSearch(() => '');
  const expansions = createQuery(() => allExpansionsQuery(auth.client));
  const [target, setTarget] = createSignal<string | null>(null);
  const pad = () => query.current() ?? undefined;

  const options = createMemo(() => {
    const list: SelectOption<string>[] = [];
    const allGames = games.current();
    const allExpansions = expansions.current();
    if (!allGames || !allExpansions) return list;
    const current = pad()?.game_id;
    const titles = new Map(allGames.map((game) => [game.id, game.title]));
    for (const game of allGames) {
      list.push({ value: game.id, label: game.title, disabled: game.id === current });
      for (const expansion of allExpansions) {
        if (expansion.base_game_id !== game.id) continue;
        list.push({
          value: expansion.id,
          label: format(text.expansionOption, {
            game: titles.get(game.id) ?? '',
            title: expansion.title,
          }),
          disabled: expansion.id === current,
        });
      }
    }
    return list;
  });

  const [moving, setMoving] = createOptimistic(false);
  const [moved, setMoved] = createSignal(false);
  const [error, setError] = createSignal<string | undefined>(undefined);
  const move = action(function* (to: { readonly id: string; readonly label: string }) {
    setMoving(true);
    const current = pad();
    try {
      yield moveScorepad(auth.client, props.id, to.id);
    } catch (failure) {
      setError(scorepadErrorMessage(failure));
      return;
    }
    setMoved(true);
    if (current) {
      toast.show(
        format(t.scorepads.toasts.moved, { name: current.name, title: to.label }),
        'success',
      );
    }
    void queryClient.invalidateQueries({ queryKey: scorepadsKey });
    if (mounted()) popups.back();
  });

  const submit = () => {
    const id = target();
    // Bez wybranej gry przycisk jest wyłączony.
    if (!id) return;
    const label = options().find((option) => option.value === id)?.label ?? '';
    onFlush(() => setError(undefined));
    void move({ id, label });
  };

  // Okno i przyciski zależą od danych w cache (bez czekania), opis czeka pod `<QueryBoundary>`.
  const loading = () => !pad() || !games.current() || !expansions.current();
  const loaded = () => {
    games();
    expansions();
    query();
    return pad();
  };

  return (
    <Show when={!(!moved() && query.current() === null)} fallback={<InvalidPopup />}>
      <PopupDialog
        title={text.title}
        icon="pad"
        description={
          <QueryBoundary>
            <Show when={loaded()}>
              {(shown) => <p>{format(text.description, { name: shown().name })}</p>}
            </Show>
          </QueryBoundary>
        }
        footer={
          <>
            <Button variant="secondary" disabled={moving()} onClick={() => popups.back()}>
              {text.cancel}
            </Button>
            <Button
              loading={moving()}
              disabled={loading() || target() === null || moved()}
              onClick={submit}
            >
              {text.submit}
            </Button>
          </>
        }
      >
        <Show when={error()}>{(message) => <Banner variant="error">{message()}</Banner>}</Show>
        <Show when={!loading()}>
          <Select
            label={text.label}
            options={options()}
            value={target()}
            onChange={setTarget}
            searchLabel={text.search}
            hint={text.hint}
          />
        </Show>
      </PopupDialog>
    </Show>
  );
}

/**
 * Potwierdzenie „Usuń notes”. Usunięcie jest miękkie: notes znika z listy i z wyboru
 * przy nowej partii, a wersje, obrazy kartek i rozegrane partie zostają w historii.
 * Jest idempotentne, więc po błędzie można je bezpiecznie ponowić.
 */
export function DeleteScorepadDialog(props: { readonly id: string }) {
  const text = t.scorepads.remove;
  const auth = useContext(AuthContext);
  const queryClient = useContext(QueryClientContext);
  const toast = useContext(ToastContext);
  const popups = useContext(PopupsContext);
  const mounted = createMounted();
  const query = createScorepad(() => props.id);
  const pad = () => query.current() ?? undefined;
  const [removing, setRemoving] = createOptimistic(false);
  const [removed, setRemoved] = createSignal(false);
  /** Błąd usunięcia: `true` = brak uprawnień. */
  const [forbidden, setForbidden] = createSignal<boolean | null>(null);

  const remove = action(function* () {
    setRemoving(true);
    const target = pad();
    try {
      yield deleteScorepad(auth.client, props.id);
    } catch (error) {
      setForbidden(error instanceof ScorepadError && error.reason === 'forbidden');
      return;
    }
    setRemoved(true);
    if (target) toast.show(format(t.scorepads.toasts.deleted, { name: target.name }), 'success');
    if (mounted()) popups.back();
    void queryClient.invalidateQueries({ queryKey: scorepadsKey });
  });

  return (
    <Show when={!(!removed() && query.current() === null)} fallback={<InvalidPopup />}>
      <PopupDialog
        title={text.title}
        icon="trash"
        tone="danger"
        description={
          <QueryBoundary>
            <Show when={query()}>
              {(shown) => <p>{format(text.description, { name: shown().name })}</p>}
            </Show>
          </QueryBoundary>
        }
        footer={
          <>
            <Button variant="secondary" disabled={removing()} onClick={() => popups.back()}>
              {text.cancel}
            </Button>
            <Button
              variant="destructive"
              loading={removing()}
              disabled={!pad() || removed()}
              onClick={() => {
                onFlush(() => setForbidden(null));
                void remove();
              }}
            >
              {text.submit}
            </Button>
          </>
        }
      >
        <Show when={forbidden() !== null}>
          <Banner variant="error">
            {forbidden() ? t.scorepads.errors.forbidden : t.scorepads.errors.remove}
          </Banner>
        </Show>
      </PopupDialog>
    </Show>
  );
}
