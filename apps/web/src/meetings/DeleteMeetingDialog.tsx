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
import { createMeeting } from './meetingData';
import { deleteMeeting, MeetingError, meetingsKey } from './meetings';

const text = t.meetings.remove;

/**
 * Potwierdzenie „Usuń spotkanie” (PLAN-3, PLAN-5, DS §15 „Dialog variants”). Usunięcie kasuje
 * głosy i uczestników. Trwającego spotkania nie usuwamy (najpierw trzeba je zakończyć),
 * a zakończonego z partiami nie usunie baza.
 */
export function DeleteMeetingDialog(props: { readonly id: string }) {
  const auth = useContext(AuthContext);
  const queryClient = useContext(QueryClientContext);
  const toast = useContext(ToastContext);
  const popups = useContext(PopupsContext);
  const mounted = createMounted();
  const query = createMeeting(() => props.id);
  const meeting = () => query().data ?? undefined;

  const remove = createMutation({
    mutationFn: () => deleteMeeting(auth.client, props.id),
    onSuccess: () => {
      const removed = meeting();
      if (removed)
        toast.show(format(t.meetings.toasts.deleted, { title: removed.title }), 'success');
      if (mounted()) popups.back();
      void queryClient.invalidateQueries({ queryKey: meetingsKey });
    },
    onError: () => void queryClient.invalidateQueries({ queryKey: meetingsKey }),
  });

  // Po sukcesie dialog zostaje do zamknięcia (Wstecz jest asynchroniczne). Wcześniej: z linku
  // nie usuniemy spotkania, którego nie ma.
  const unavailable = () => !remove.state().isSuccess && query().isSuccess && !meeting();
  const running = () => meeting()?.status === 'in_progress';
  const failure = () => {
    const error = remove.state().error;
    return error instanceof MeetingError ? t.meetings.errors[error.reason] : t.meetings.errors.save;
  };

  return (
    <Show when={!unavailable()} fallback={<InvalidPopup />}>
      <PopupDialog
        title={text.title}
        icon="trash"
        tone="danger"
        description={
          <Show
            when={meeting()}
            fallback={
              <QueryStatus isError={query().isError} onRetry={() => void query().refetch()} />
            }
          >
            {(shown) => <p>{format(text.description, { title: shown().title })}</p>}
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
              disabled={!meeting() || running() || remove.state().isSuccess}
              onClick={() => remove.mutate()}
            >
              {text.submit}
            </Button>
          </>
        }
      >
        <Show when={running()}>
          <Banner variant="warning">{text.inProgress}</Banner>
        </Show>
        <Show when={remove.state().isError}>
          <Banner variant="error">{failure()}</Banner>
        </Show>
      </PopupDialog>
    </Show>
  );
}
