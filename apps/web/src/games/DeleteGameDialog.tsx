import { useMutation, useQueryClient } from '@tanstack/react-query';
import { useAuth } from '../auth/authContext';
import { format, t } from '../i18n';
import { InvalidPopup } from '../popups/InvalidPopup';
import { usePopups } from '../popups/popupContext';
import { useMounted } from '../popups/useMounted';
import { PopupDialog } from '../popups/PopupDialog';
import { QueryStatus } from '../popups/QueryStatus';
import { Banner, Button, useToast } from '../ui';
import { deleteGame, GameSaveError, gamesKey, useGame } from './games';

/**
 * Potwierdzenie „Usuń grę” (PRD GAME-8, DS „Kolekcja / Usuń grę – potwierdzenie”). Usunięcie
 * jest miękkie: gra znika z kolekcji, wyszukiwania i głosowań zaplanowanych spotkań, a jej
 * partie, karteczki i punkty zostają w historii. Jest idempotentne, więc po błędzie można je
 * bezpiecznie ponowić.
 */
export function DeleteGameDialog({ id }: { readonly id: string }) {
  const { client } = useAuth();
  const queryClient = useQueryClient();
  const toast = useToast();
  const { back } = usePopups();
  const mounted = useMounted();
  const query = useGame(client, id);
  const game = query.data;

  const expansion = (game?.base_game_id ?? null) !== null;
  const text = expansion ? t.games.removeExpansion : t.games.remove;
  const remove = useMutation({
    mutationFn: () => deleteGame(client, id),
    onSuccess: () => {
      const toasts = expansion ? t.games.toasts.expansion : t.games.toasts;
      if (game) toast.show(format(toasts.deleted, { title: game.title }), 'success');
      if (mounted.current) back();
      void queryClient.invalidateQueries({ queryKey: gamesKey });
    },
  });

  // Po sukcesie dialog zostaje do zamknięcia (Wstecz jest asynchroniczne), choć gry już nie ma
  // w kolekcji. Wcześniej: z linku nie usuniemy gry nieistniejącej ani już usuniętej.
  if (!remove.isSuccess && query.isSuccess && !game) return <InvalidPopup />;

  const failure =
    remove.error instanceof GameSaveError && remove.error.reason === 'forbidden'
      ? text.errors.forbidden
      : text.errors.save;
  return (
    <PopupDialog
      title={text.title}
      icon="trash"
      tone="danger"
      description={
        game ? (
          <p>{format(text.description, { title: game.title })}</p>
        ) : (
          <QueryStatus isError={query.isError} onRetry={() => void query.refetch()} />
        )
      }
      footer={
        <>
          <Button variant="secondary" disabled={remove.isPending} onClick={back}>
            {text.cancel}
          </Button>
          <Button
            variant="destructive"
            loading={remove.isPending}
            disabled={!game || remove.isSuccess}
            onClick={() => remove.mutate()}
          >
            {text.submit}
          </Button>
        </>
      }
    >
      {remove.isError ? <Banner variant="error">{failure}</Banner> : null}
    </PopupDialog>
  );
}
