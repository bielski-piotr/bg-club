import { action, createOptimistic, createSignal, Show, useContext } from 'solid-js';
import { format, t } from '../i18n';
import { AuthContext } from '../auth/authContext';
import { PopupsContext } from '../popups/popupContext';
import { QueryClientContext } from '../lib/queryClient';
import { ToastContext } from '../ui/toastContext';
import { InvalidPopup } from '../popups/InvalidPopup';
import { createMounted } from '../popups/leaveGuard';
import { PopupDialog } from '../popups/PopupDialog';
import { QueryBoundary } from '../popups/QueryStatus';
import { Banner, Button } from '../ui';
import { createGame } from './gameData';
import { deleteGame, GameSaveError, gamesKey } from './games';

/**
 * Potwierdzenie „Usuń grę”. Usunięcie
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
  // Okno zależy od danych w cache (bez czekania), treść czeka pod `<QueryBoundary>`.
  const game = () => query.current() ?? undefined;
  const expansion = () => (game()?.base_game_id ?? null) !== null;
  const text = () => (expansion() ? t.games.removeExpansion : t.games.remove);

  const [removing, setRemoving] = createOptimistic(false);
  const [removed, setRemoved] = createSignal(false);
  const [failure, setFailure] = createSignal<'forbidden' | 'save' | null>(null);

  const remove = action(function* () {
    setRemoving(true);
    setFailure(null);
    const toasts = expansion() ? t.games.toasts.expansion : t.games.toasts;
    const target = game();
    try {
      yield deleteGame(auth.client, props.id);
    } catch (error) {
      setFailure(
        error instanceof GameSaveError && error.reason === 'forbidden' ? 'forbidden' : 'save',
      );
      return;
    }
    setRemoved(true);
    if (target) toast.show(format(toasts.deleted, { title: target.title }), 'success');
    if (mounted()) popups.back();
    void queryClient.invalidateQueries({ queryKey: gamesKey });
  });

  // Po sukcesie dialog zostaje do zamknięcia (Wstecz jest asynchroniczne), choć gry już nie ma
  // w kolekcji. Wcześniej: z linku nie usuniemy gry nieistniejącej ani już usuniętej.
  const unavailable = () => !removed() && query.current() === null;

  return (
    <Show when={!unavailable()} fallback={<InvalidPopup />}>
      <PopupDialog
        title={text().title}
        icon="trash"
        tone="danger"
        description={
          <QueryBoundary>
            <Show when={query()}>
              {(shown) => <p>{format(text().description, { title: shown().title })}</p>}
            </Show>
          </QueryBoundary>
        }
        footer={
          <>
            <Button variant="secondary" disabled={removing()} onClick={() => popups.back()}>
              {text().cancel}
            </Button>
            <Button
              variant="destructive"
              loading={removing()}
              disabled={!game() || removed()}
              onClick={() => void remove()}
            >
              {text().submit}
            </Button>
          </>
        }
      >
        <Show when={failure()}>
          {(reason) => <Banner variant="error">{text().errors[reason()]}</Banner>}
        </Show>
      </PopupDialog>
    </Show>
  );
}
