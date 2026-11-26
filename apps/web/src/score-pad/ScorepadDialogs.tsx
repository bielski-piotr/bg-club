import { createMemo, createSignal, createUniqueId, flush, Show, useContext } from 'solid-js';
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
import { QueryStatus } from '../popups/QueryStatus';
import { createMutation, createQuery } from '../lib/query';
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
 * „Zmień nazwę” notesu (GAME-7): bez nowej wersji, partie zachowują swój szablon. Jedno okno
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
  const pad = createMemo(() => (first ??= query().data ?? undefined));
  const [name, setName] = createSignal(() => pad()?.name ?? '');
  const [touched, setTouched] = createSignal(false);
  const trimmed = () => name().trim();
  const problem = () =>
    trimmed() === ''
      ? text.required
      : trimmed().length > SCOREPAD_NAME_MAX
        ? format(text.tooLong, { max: SCOREPAD_NAME_MAX })
        : undefined;

  const rename = createMutation({
    mutationFn: (next: string) => renameScorepad(auth.client, props.id, next),
    onSuccess: (_, next) => {
      toast.show(format(t.scorepads.toasts.renamed, { name: scorepadName(next) }), 'success');
      void queryClient.invalidateQueries({ queryKey: scorepadsKey });
      if (mounted()) popups.back();
    },
  });

  const submit = (event: SubmitEvent) => {
    event.preventDefault();
    // Wpis z tego samego zadania (autouzupełnianie + Enter) widać dopiero po flushu.
    flush();
    setTouched(true);
    const current = pad();
    if (!current || problem() || rename.state().isPending) return;
    if (trimmed() === current.name) {
      popups.back();
      return;
    }
    rename.mutate(trimmed());
  };

  return (
    <Show when={!(query().isSuccess && !query().data && !pad())} fallback={<InvalidPopup />}>
      <PopupDialog
        title={text.title}
        icon="pad"
        description={
          <Show
            when={pad()}
            fallback={
              <QueryStatus isError={query().isError} onRetry={() => void query().refetch()} />
            }
          >
            <p>{text.helper}</p>
          </Show>
        }
        footer={
          <>
            <Button
              variant="secondary"
              disabled={rename.state().isPending}
              onClick={() => popups.back()}
            >
              {text.cancel}
            </Button>
            <Show when={pad()}>
              <Button type="submit" form={formId} loading={rename.state().isPending}>
                {text.submit}
              </Button>
            </Show>
          </>
        }
      >
        <Show when={pad()}>
          <form id={formId} novalidate onSubmit={submit} class="scorepads">
            <Show when={rename.state().isError}>
              <Banner variant="error">{scorepadErrorMessage(rename.state().error)}</Banner>
            </Show>
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
  const pad = () => query().data ?? undefined;

  const options = createMemo(() => {
    const list: SelectOption<string>[] = [];
    const allGames = games().data;
    const allExpansions = expansions().data;
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

  const move = createMutation({
    mutationFn: (to: { readonly id: string; readonly label: string }) =>
      moveScorepad(auth.client, props.id, to.id),
    onSuccess: (_, to) => {
      const moved = pad();
      if (moved) {
        toast.show(
          format(t.scorepads.toasts.moved, { name: moved.name, title: to.label }),
          'success',
        );
      }
      void queryClient.invalidateQueries({ queryKey: scorepadsKey });
      if (mounted()) popups.back();
    },
  });

  const submit = () => {
    const id = target();
    // Bez wybranej gry przycisk jest wyłączony.
    if (!id) return;
    const label = options().find((option) => option.value === id)?.label ?? '';
    move.mutate({ id, label });
  };

  const loading = () => !pad() || !games().data || !expansions().data;
  const failed = () => query().isError || games().isError || expansions().isError;

  return (
    <Show
      when={!(!move.state().isSuccess && query().isSuccess && !pad())}
      fallback={<InvalidPopup />}
    >
      <PopupDialog
        title={text.title}
        icon="pad"
        description={
          <Show
            when={!loading() && pad()}
            fallback={
              <QueryStatus
                isError={failed()}
                onRetry={() => {
                  void query().refetch();
                  void games().refetch();
                  void expansions().refetch();
                }}
              />
            }
          >
            {(shown) => <p>{format(text.description, { name: shown().name })}</p>}
          </Show>
        }
        footer={
          <>
            <Button
              variant="secondary"
              disabled={move.state().isPending}
              onClick={() => popups.back()}
            >
              {text.cancel}
            </Button>
            <Button
              loading={move.state().isPending}
              disabled={loading() || target() === null || move.state().isSuccess}
              onClick={submit}
            >
              {text.submit}
            </Button>
          </>
        }
      >
        <Show when={move.state().isError}>
          <Banner variant="error">{scorepadErrorMessage(move.state().error)}</Banner>
        </Show>
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
 * Potwierdzenie „Usuń notes” (GAME-7). Usunięcie jest miękkie: notes znika z listy i z wyboru
 * przy nowej partii, a wersje, obrazy kartek i rozegrane partie zostają w historii (GAME-9).
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
  const pad = () => query().data ?? undefined;

  const remove = createMutation({
    mutationFn: () => deleteScorepad(auth.client, props.id),
    onSuccess: () => {
      const removed = pad();
      if (removed)
        toast.show(format(t.scorepads.toasts.deleted, { name: removed.name }), 'success');
      if (mounted()) popups.back();
      void queryClient.invalidateQueries({ queryKey: scorepadsKey });
    },
  });

  const forbidden = () => {
    const error = remove.state().error;
    return error instanceof ScorepadError && error.reason === 'forbidden';
  };

  return (
    <Show
      when={!(!remove.state().isSuccess && query().isSuccess && !pad())}
      fallback={<InvalidPopup />}
    >
      <PopupDialog
        title={text.title}
        icon="trash"
        tone="danger"
        description={
          <Show
            when={pad()}
            fallback={
              <QueryStatus isError={query().isError} onRetry={() => void query().refetch()} />
            }
          >
            {(shown) => <p>{format(text.description, { name: shown().name })}</p>}
          </Show>
        }
        footer={
          <>
            <Button
              variant="secondary"
              disabled={remove.state().isPending}
              onClick={() => popups.back()}
            >
              {text.cancel}
            </Button>
            <Button
              variant="destructive"
              loading={remove.state().isPending}
              disabled={!pad() || remove.state().isSuccess}
              onClick={() => remove.mutate()}
            >
              {text.submit}
            </Button>
          </>
        }
      >
        <Show when={remove.state().isError}>
          <Banner variant="error">
            {forbidden() ? t.scorepads.errors.forbidden : t.scorepads.errors.remove}
          </Banner>
        </Show>
      </PopupDialog>
    </Show>
  );
}
