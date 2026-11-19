import { useMutation, useQueryClient } from '@tanstack/react-query';
import { useAuth } from '../auth/authContext';
import { format, t } from '../i18n';
import { InvalidPopup } from '../popups/InvalidPopup';
import { usePopups } from '../popups/popupContext';
import { PopupDialog } from '../popups/PopupDialog';
import { QueryStatus } from '../popups/QueryStatus';
import { useMounted } from '../popups/useMounted';
import { Banner, Button, useToast } from '../ui';
import { deleteMeeting, MeetingError, meetingsKey, useMeeting } from './meetings';

const text = t.meetings.remove;

/**
 * Potwierdzenie „Usuń spotkanie”. Usunięcie kasuje
 * głosy i uczestników. Trwającego spotkania nie usuwamy (najpierw trzeba je zakończyć),
 * a zakończonego z partiami nie usunie baza.
 */
export function DeleteMeetingDialog({ id }: { readonly id: string }) {
  const { client } = useAuth();
  const queryClient = useQueryClient();
  const toast = useToast();
  const { back } = usePopups();
  const mounted = useMounted();
  const query = useMeeting(client, id);
  const meeting = query.data;

  const remove = useMutation({
    mutationFn: () => deleteMeeting(client, id),
    onSuccess: () => {
      if (meeting)
        toast.show(format(t.meetings.toasts.deleted, { title: meeting.title }), 'success');
      if (mounted.current) back();
      void queryClient.invalidateQueries({ queryKey: meetingsKey });
    },
    onError: () => void queryClient.invalidateQueries({ queryKey: meetingsKey }),
  });

  // Po sukcesie dialog zostaje do zamknięcia (Wstecz jest asynchroniczne). Wcześniej: z linku
  // nie usuniemy spotkania, którego nie ma.
  if (!remove.isSuccess && query.isSuccess && !meeting) return <InvalidPopup />;

  const running = meeting?.status === 'in_progress';
  const failure =
    remove.error instanceof MeetingError
      ? t.meetings.errors[remove.error.reason]
      : t.meetings.errors.save;
  return (
    <PopupDialog
      title={text.title}
      icon="trash"
      tone="danger"
      description={
        meeting ? (
          <p>{format(text.description, { title: meeting.title })}</p>
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
            disabled={!meeting || running || remove.isSuccess}
            onClick={() => remove.mutate()}
          >
            {text.submit}
          </Button>
        </>
      }
    >
      {running ? <Banner variant="warning">{text.inProgress}</Banner> : null}
      {remove.isError ? <Banner variant="error">{failure}</Banner> : null}
    </PopupDialog>
  );
}
