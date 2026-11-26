/** @jsxImportSource @solidjs/web */
import { Show, useContext } from 'solid-js';
import { format, t } from '../i18n';
import { allowOrphanSweep } from '../sheets/sheetImages';
import { AuthContext, PopupsContext, QueryClientContext, ToastContext } from '../solid/context';
import { InvalidPopup } from '../solid/popups/InvalidPopup';
import { createMounted } from '../solid/popups/leaveGuard';
import { PopupDialog } from '../solid/popups/PopupDialog';
import { QueryStatus } from '../solid/popups/QueryStatus';
import { createMutation } from '../solid/query';
import { Banner, Button } from '../solid/ui';
import { createPlay } from './meetingData';
import {
  deletePlay,
  invalidatePlayData,
  PlayDeleteError,
  removeDeletedPlayImage,
} from './playDelete';

const text = t.meetings.plays.deleteDialog;

interface DeleteOutcome {
  /** Obraz karteczki, którego nie udało się usunąć (błąd Storage); `null` = sprzątnięte. */
  readonly leftImage: string | null;
}

/** Dane partii z chwili potwierdzenia: po usunięciu zapytanie o partię zwraca `null`. */
interface DeleteTarget {
  readonly title: string;
  readonly meetingId: string;
}

/**
 * Potwierdzenie „Usuń partię” (VIEW-6, §5.6.5, DS §15 „Dialog variants”): tylko admin trwale
 * usuwa zapisaną partię z karteczką i wynikami; baza w tej samej transakcji przelicza zależne
 * dane, a aplikacja odświeża zależne widoki. Potem dialog usuwa obraz karteczki ze Storage.
 * Błąd Storage nie przywraca partii: dialog zostaje otwarty z ponowieniem, a obraz bez partii
 * posprząta też kolejne otwarcie spotkania przez admina (`orphan_sheet_images`).
 * Otwarty nad karteczką tej partii zamyka też karteczkę. Rolę sprawdza `HubPopup`.
 */
export function DeletePlayDialog(props: { readonly id: string }) {
  const auth = useContext(AuthContext);
  const queryClient = useContext(QueryClientContext);
  const toast = useContext(ToastContext);
  const popups = useContext(PopupsContext);
  const mounted = createMounted();
  const play = createPlay(() => props.id);
  const close = () => {
    // Pod dialogiem może być karteczka tej partii: po usunięciu nie ma już czego pokazywać.
    const below = popups.stack.at(-2);
    const overSheet = below?.kind === 'sheet' && below.id === props.id;
    if (mounted()) popups.backBy(overSheet ? 2 : 1);
  };
  const closeWithLeftImage = (meetingId: string) => {
    // Obraz został w Storage: kolejne otwarcie spotkania w tej karcie znów posprząta.
    allowOrphanSweep(meetingId);
    close();
  };

  const remove = createMutation({
    mutationFn: async (_target: DeleteTarget): Promise<DeleteOutcome> => {
      const { imagePath } = await deletePlay(auth.client, props.id);
      if (!imagePath) return { leftImage: null };
      return {
        leftImage: (await removeDeletedPlayImage(auth.client, imagePath)) ? null : imagePath,
      };
    },
    onSuccess: ({ leftImage }, { title }) => {
      toast.show(format(t.meetings.toasts.playDeleted, { title }), 'success');
      void invalidatePlayData(queryClient);
      if (!leftImage) close();
    },
    onError: () => void invalidatePlayData(queryClient),
  });

  const leftImage = () => remove.state().data?.leftImage ?? null;
  const retryImage = createMutation({
    mutationFn: async () => {
      const path = leftImage();
      if (path && !(await removeDeletedPlayImage(auth.client, path))) {
        throw new Error('sheet image not removed');
      }
    },
    onSuccess: close,
  });

  // Przed potwierdzeniem (np. z linku): tylko zapisana partia, która istnieje. Po próbie
  // usunięcia dialog zostaje, nawet gdy odświeżona partia już nie pasuje (błąd, sukces).
  const unavailable = () => {
    const current = play();
    return (
      remove.state().isIdle &&
      current.isSuccess &&
      (!current.data || current.data.status !== 'saved')
    );
  };
  const failure = () => {
    const error = remove.state().error;
    return error instanceof PlayDeleteError
      ? error.reason === 'forbidden'
        ? text.errors.forbidden
        : error.reason === 'draft'
          ? text.errors.draft
          : text.errors.save
      : text.errors.save;
  };
  const title = () => play().data?.game.title ?? remove.state().variables?.title ?? '';
  const imagePending = () => leftImage() !== null && !retryImage.state().isSuccess;

  return (
    <Show when={!unavailable()} fallback={<InvalidPopup />}>
      <PopupDialog
        title={text.title}
        icon="trash"
        tone="danger"
        description={
          <Show
            when={play().data || remove.state().isSuccess}
            fallback={
              <QueryStatus isError={play().isError} onRetry={() => void play().refetch()} />
            }
          >
            <p>{format(text.description, { title: title() })}</p>
          </Show>
        }
        footer={
          <Show
            when={imagePending()}
            fallback={
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
                  disabled={!play().data || remove.state().isSuccess}
                  onClick={() => {
                    const current = play().data;
                    if (current) remove.mutate({ title: title(), meetingId: current.meeting_id });
                  }}
                >
                  {text.submit}
                </Button>
              </>
            }
          >
            <Button
              variant="secondary"
              disabled={retryImage.state().isPending}
              onClick={() => closeWithLeftImage(remove.state().variables?.meetingId ?? '')}
            >
              {text.close}
            </Button>
            <Button loading={retryImage.state().isPending} onClick={() => retryImage.mutate()}>
              {text.retryImage}
            </Button>
          </Show>
        }
      >
        <Show when={remove.state().isError}>
          <Banner variant="error">{failure()}</Banner>
        </Show>
        <Show when={imagePending()}>
          <Banner variant="warning">{text.imageFailed}</Banner>
        </Show>
      </PopupDialog>
    </Show>
  );
}
