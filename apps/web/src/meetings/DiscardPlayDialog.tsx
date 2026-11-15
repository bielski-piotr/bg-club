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
import { meetingsKey, useMeeting } from './meetings';
import { discardPlay, DraftError, draftStorage, removeLocalDrafts } from './playDraft';
import { isMeetingRunner, usePlay } from './plays';

const text = t.meetings.play.discardDialog;

/**
 * Potwierdzenie „Porzuć partię” (PAD-8, DS §15 „Dialog variants”): usuwa szkic w bazie i kopię
 * na tym urządzeniu. Szkice nie liczą się do statystyk, więc nic więcej się nie zmienia.
 * Otwarte nad notesem partii zamyka też notes.
 */
export function DiscardPlayDialog({ id, me }: { readonly id: string; readonly me: OwnProfile }) {
  const { client } = useAuth();
  const queryClient = useQueryClient();
  const toast = useToast();
  const { back, backBy, stack } = usePopups();
  const mounted = useMounted();
  const play = usePlay(client, id);
  const meeting = useMeeting(client, play.data?.meeting_id ?? '');
  // Pod dialogiem może być notes tej partii: po porzuceniu nie ma już czego pokazywać.
  const below = stack.at(-2);
  const overPad = below?.kind === 'play' && below.id === id;

  const discard = useMutation({
    mutationFn: () => discardPlay(client, id),
    onSuccess: () => {
      removeLocalDrafts(draftStorage(), id);
      toast.show(
        format(t.meetings.toasts.playDiscarded, { title: play.data?.game.title ?? '' }),
        'success',
      );
      if (mounted.current) backBy(overPad ? 2 : 1);
      void queryClient.invalidateQueries({ queryKey: meetingsKey });
    },
    onError: () => void queryClient.invalidateQueries({ queryKey: meetingsKey }),
  });

  // Po sukcesie dialog zostaje do zamknięcia (Wstecz jest asynchroniczne).
  if (!discard.isSuccess && play.isSuccess && (!play.data || play.data.status !== 'draft')) {
    return <InvalidPopup />;
  }
  if (!discard.isSuccess && meeting.data && !isMeetingRunner(meeting.data, me)) {
    return <InvalidPopup />;
  }

  const failure =
    discard.error instanceof DraftError
      ? discard.error.reason === 'forbidden'
        ? text.errors.forbidden
        : discard.error.reason === 'gone'
          ? text.errors.gone
          : text.errors.save
      : text.errors.save;
  return (
    <PopupDialog
      title={text.title}
      icon="trash"
      tone="danger"
      description={
        play.data ? (
          <p>{format(text.description, { title: play.data.game.title })}</p>
        ) : (
          <QueryStatus isError={play.isError} onRetry={() => void play.refetch()} />
        )
      }
      footer={
        <>
          <Button variant="secondary" disabled={discard.isPending} onClick={back}>
            {text.cancel}
          </Button>
          <Button
            variant="destructive"
            loading={discard.isPending}
            disabled={!play.data || discard.isSuccess}
            onClick={() => discard.mutate()}
          >
            {text.submit}
          </Button>
        </>
      }
    >
      {discard.isError ? <Banner variant="error">{failure}</Banner> : null}
    </PopupDialog>
  );
}
