/** @jsxImportSource @solidjs/web */
import { Show, useContext } from 'solid-js';
import type { OwnProfile } from '../auth/useOwnProfile';
import { format, t } from '../i18n';
import { AuthContext, PopupsContext, QueryClientContext, ToastContext } from '../solid/context';
import { InvalidPopup } from '../solid/popups/InvalidPopup';
import { createMounted } from '../solid/popups/leaveGuard';
import { PopupDialog } from '../solid/popups/PopupDialog';
import { QueryStatus } from '../solid/popups/QueryStatus';
import { createMutation } from '../solid/query';
import { Banner, Button } from '../solid/ui';
import { createMeeting, createPlay } from './meetingData';
import { meetingsKey } from './meetings';
import { discardPlay, DraftError, draftStorage, removeLocalDrafts } from './playDraft';
import { isMeetingRunner } from './plays';

const text = t.meetings.play.discardDialog;

/**
 * Potwierdzenie „Porzuć partię” (PAD-8, DS §15 „Dialog variants”): usuwa szkic w bazie i kopię
 * na tym urządzeniu. Szkice nie liczą się do statystyk, więc nic więcej się nie zmienia.
 * Otwarte nad notesem partii zamyka też notes.
 */
export function DiscardPlayDialog(props: { readonly id: string; readonly me: OwnProfile }) {
  const auth = useContext(AuthContext);
  const queryClient = useContext(QueryClientContext);
  const toast = useContext(ToastContext);
  const popups = useContext(PopupsContext);
  const mounted = createMounted();
  const play = createPlay(() => props.id);
  const meeting = createMeeting(() => play().data?.meeting_id ?? '');

  const discard = createMutation({
    mutationFn: () => discardPlay(auth.client, props.id),
    onSuccess: () => {
      removeLocalDrafts(draftStorage(), props.id);
      toast.show(
        format(t.meetings.toasts.playDiscarded, { title: play().data?.game.title ?? '' }),
        'success',
      );
      // Pod dialogiem może być notes tej partii: po porzuceniu nie ma już czego pokazywać.
      const below = popups.stack.at(-2);
      const overPad = below?.kind === 'play' && below.id === props.id;
      if (mounted()) popups.backBy(overPad ? 2 : 1);
      void queryClient.invalidateQueries({ queryKey: meetingsKey });
    },
    onError: () => void queryClient.invalidateQueries({ queryKey: meetingsKey }),
  });

  // Po sukcesie dialog zostaje do zamknięcia (Wstecz jest asynchroniczne).
  const unavailable = () => {
    if (discard.state().isSuccess) return false;
    const current = play();
    if (current.isSuccess && (!current.data || current.data.status !== 'draft')) return true;
    const found = meeting().data;
    return !!found && !isMeetingRunner(found, props.me);
  };
  const failure = () => {
    const error = discard.state().error;
    return error instanceof DraftError
      ? error.reason === 'forbidden'
        ? text.errors.forbidden
        : error.reason === 'gone'
          ? text.errors.gone
          : text.errors.save
      : text.errors.save;
  };

  return (
    <Show when={!unavailable()} fallback={<InvalidPopup />}>
      <PopupDialog
        title={text.title}
        icon="trash"
        tone="danger"
        description={
          <Show
            when={play().data}
            fallback={
              <QueryStatus isError={play().isError} onRetry={() => void play().refetch()} />
            }
          >
            {(current) => <p>{format(text.description, { title: current().game.title })}</p>}
          </Show>
        }
        footer={
          <>
            <Button
              variant="secondary"
              disabled={discard.state().isPending}
              onClick={() => popups.back()}
            >
              {text.cancel}
            </Button>
            <Button
              variant="destructive"
              loading={discard.state().isPending}
              disabled={!play().data || discard.state().isSuccess}
              onClick={() => discard.mutate()}
            >
              {text.submit}
            </Button>
          </>
        }
      >
        <Show when={discard.state().isError}>
          <Banner variant="error">{failure()}</Banner>
        </Show>
      </PopupDialog>
    </Show>
  );
}
