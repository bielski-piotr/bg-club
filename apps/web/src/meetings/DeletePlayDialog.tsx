import { useMutation, useQueryClient } from '@tanstack/react-query';
import { useAuth } from '../auth/authContext';
import type { OwnProfile } from '../auth/useOwnProfile';
import { format, t } from '../i18n';
import { InvalidPopup } from '../popups/InvalidPopup';
import { usePopups } from '../popups/popupContext';
import { PopupDialog } from '../popups/PopupDialog';
import { QueryStatus } from '../popups/QueryStatus';
import { useMounted } from '../popups/useMounted';
import { Banner, Button, useToast } from '../ui';
import {
  deletePlay,
  invalidatePlayData,
  PlayDeleteError,
  removeDeletedPlayImage,
} from './playDelete';
import { usePlay } from './plays';

const text = t.meetings.plays.deleteDialog;

interface DeleteOutcome {
  /** Obraz karteczki, którego nie udało się usunąć (błąd Storage); `null` = sprzątnięte. */
  readonly leftImage: string | null;
}

/**
 * Potwierdzenie „Usuń partię” (VIEW-6, §5.6.5, DS §15 „Dialog variants”): tylko admin trwale
 * usuwa zapisaną partię z karteczką i wynikami; baza w tej samej transakcji przelicza zależne
 * dane, a aplikacja odświeża zależne widoki. Potem dialog usuwa obraz karteczki ze Storage.
 * Błąd Storage nie przywraca partii: dialog zostaje otwarty z ponowieniem, a obraz bez partii
 * posprząta też otwarcie spotkania przez admina (`orphan_sheet_images`).
 * Otwarty nad karteczką tej partii zamyka też karteczkę.
 */
export function DeletePlayDialog({ id, me }: { readonly id: string; readonly me: OwnProfile }) {
  const { client } = useAuth();
  const queryClient = useQueryClient();
  const toast = useToast();
  const { back, backBy, stack } = usePopups();
  const mounted = useMounted();
  const play = usePlay(client, id);
  // Pod dialogiem może być karteczka tej partii: po usunięciu nie ma już czego pokazywać.
  const below = stack.at(-2);
  const overSheet = below?.kind === 'sheet' && below.id === id;
  const close = () => {
    if (mounted.current) backBy(overSheet ? 2 : 1);
  };

  const remove = useMutation({
    // Tytuł gry z chwili potwierdzenia: po usunięciu zapytanie o partię zwraca `null`.
    mutationFn: async (_title: string): Promise<DeleteOutcome> => {
      const { imagePath } = await deletePlay(client, id);
      if (!imagePath) return { leftImage: null };
      return { leftImage: (await removeDeletedPlayImage(client, imagePath)) ? null : imagePath };
    },
    onSuccess: ({ leftImage }, title) => {
      toast.show(format(t.meetings.toasts.playDeleted, { title }), 'success');
      void invalidatePlayData(queryClient);
      if (!leftImage) close();
    },
    onError: () => void invalidatePlayData(queryClient),
  });

  const leftImage = remove.data?.leftImage ?? null;
  const retryImage = useMutation({
    mutationFn: async () => {
      if (leftImage && !(await removeDeletedPlayImage(client, leftImage))) {
        throw new Error('sheet image not removed');
      }
    },
    onSuccess: close,
  });

  // Przed usunięciem (z linku): tylko admin i tylko zapisana partia, która istnieje.
  if (!remove.isSuccess) {
    if (me.role !== 'admin') return <InvalidPopup />;
    if (play.isSuccess && (!play.data || play.data.status !== 'saved')) return <InvalidPopup />;
  }

  const failure =
    remove.error instanceof PlayDeleteError
      ? remove.error.reason === 'forbidden'
        ? text.errors.forbidden
        : remove.error.reason === 'draft'
          ? text.errors.draft
          : text.errors.save
      : text.errors.save;
  const title = play.data?.game.title ?? remove.variables ?? '';
  const imagePending = leftImage !== null && !retryImage.isSuccess;
  return (
    <PopupDialog
      title={text.title}
      icon="trash"
      tone="danger"
      description={
        play.data || remove.isSuccess ? (
          <p>{format(text.description, { title })}</p>
        ) : (
          <QueryStatus isError={play.isError} onRetry={() => void play.refetch()} />
        )
      }
      footer={
        imagePending ? (
          <>
            <Button variant="secondary" disabled={retryImage.isPending} onClick={close}>
              {text.close}
            </Button>
            <Button loading={retryImage.isPending} onClick={() => retryImage.mutate()}>
              {text.retryImage}
            </Button>
          </>
        ) : (
          <>
            <Button variant="secondary" disabled={remove.isPending} onClick={back}>
              {text.cancel}
            </Button>
            <Button
              variant="destructive"
              loading={remove.isPending}
              disabled={!play.data || remove.isSuccess}
              onClick={() => remove.mutate(title)}
            >
              {text.submit}
            </Button>
          </>
        )
      }
    >
      {remove.isError ? <Banner variant="error">{failure}</Banner> : null}
      {imagePending ? <Banner variant="warning">{text.imageFailed}</Banner> : null}
    </PopupDialog>
  );
}
