/** @jsxImportSource @solidjs/web */
import { Show, useContext } from 'solid-js';
import { format, t } from '../i18n';
import { AuthContext, PopupsContext, QueryClientContext, ToastContext } from '../solid/context';
import { InvalidPopup } from '../solid/popups/InvalidPopup';
import { createMounted } from '../solid/popups/leaveGuard';
import { PopupDialog } from '../solid/popups/PopupDialog';
import { QueryStatus } from '../solid/popups/QueryStatus';
import { createMutation } from '../solid/query';
import { Banner, Button } from '../solid/ui';
import { createGame } from './gameData';
import { deleteGame, GameSaveError, gamesKey } from './games';

/**
 * Potwierdzenie „Usuń grę” (PRD GAME-8, DS „Kolekcja / Usuń grę – potwierdzenie”). Usunięcie
 * jest miękkie: gra znika z kolekcji, wyszukiwania i głosowań zaplanowanych spotkań, a jej
 * partie, karteczki i punkty zostają w historii. Jest idempotentne, więc po błędzie można je
 * bezpiecznie ponowić.
 */
export function DeleteGameDialog(props: { readonly id: string }) {
  const auth = useContext(AuthContext);
  const queryClient = useContext(QueryClientContext);
  const toast = useContext(ToastContext);
  const popups = useContext(PopupsContext);
  const mounted = createMounted();
  const query = createGame(() => props.id);
  const game = () => query().data ?? undefined;
  const expansion = () => (game()?.base_game_id ?? null) !== null;
  const text = () => (expansion() ? t.games.removeExpansion : t.games.remove);

  const remove = createMutation({
    mutationFn: () => deleteGame(auth.client, props.id),
    onSuccess: () => {
      const toasts = expansion() ? t.games.toasts.expansion : t.games.toasts;
      const removed = game();
      if (removed) toast.show(format(toasts.deleted, { title: removed.title }), 'success');
      if (mounted()) popups.back();
      void queryClient.invalidateQueries({ queryKey: gamesKey });
    },
  });

  // Po sukcesie dialog zostaje do zamknięcia (Wstecz jest asynchroniczne), choć gry już nie ma
  // w kolekcji. Wcześniej: z linku nie usuniemy gry nieistniejącej ani już usuniętej.
  const unavailable = () => !remove.state().isSuccess && query().isSuccess && !game();
  const failure = () => {
    const error = remove.state().error;
    return error instanceof GameSaveError && error.reason === 'forbidden'
      ? text().errors.forbidden
      : text().errors.save;
  };

  return (
    <Show when={!unavailable()} fallback={<InvalidPopup />}>
      <PopupDialog
        title={text().title}
        icon="trash"
        tone="danger"
        description={
          <Show
            when={game()}
            fallback={
              <QueryStatus isError={query().isError} onRetry={() => void query().refetch()} />
            }
          >
            {(shown) => <p>{format(text().description, { title: shown().title })}</p>}
          </Show>
        }
        footer={
          <>
            <Button
              variant="secondary"
              disabled={remove.state().isPending}
              onClick={() => popups.back()}
            >
              {text().cancel}
            </Button>
            <Button
              variant="destructive"
              loading={remove.state().isPending}
              disabled={!game() || remove.state().isSuccess}
              onClick={() => remove.mutate()}
            >
              {text().submit}
            </Button>
          </>
        }
      >
        <Show when={remove.state().isError}>
          <Banner variant="error">{failure()}</Banner>
        </Show>
      </PopupDialog>
    </Show>
  );
}
