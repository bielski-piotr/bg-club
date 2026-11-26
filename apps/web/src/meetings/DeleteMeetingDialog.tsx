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
import { createMeeting } from './meetingData';
import { deleteMeeting, MeetingError, meetingsKey } from './meetings';

const text = t.meetings.remove;

/**
 * Potwierdzenie „Usuń spotkanie”. Usunięcie kasuje
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
  const [removing, setRemoving] = createOptimistic(false);
  const [removed, setRemoved] = createSignal(false);
  const [failure, setFailure] = createSignal<string | null>(null);

  const remove = action(function* () {
    setRemoving(true);
    setFailure(null);
    const target = query.current() ?? undefined;
    try {
      yield deleteMeeting(auth.client, props.id);
    } catch (error) {
      setFailure(
        error instanceof MeetingError ? t.meetings.errors[error.reason] : t.meetings.errors.save,
      );
      void queryClient.invalidateQueries({ queryKey: meetingsKey });
      return;
    }
    setRemoved(true);
    if (target) toast.show(format(t.meetings.toasts.deleted, { title: target.title }), 'success');
    if (mounted()) popups.back();
    void queryClient.invalidateQueries({ queryKey: meetingsKey });
  });

  // Po sukcesie dialog zostaje do zamknięcia (Wstecz jest asynchroniczne). Wcześniej: z linku
  // nie usuniemy spotkania, którego nie ma. Okno zależy od danych w cache (bez czekania), treść
  // czeka pod `<QueryBoundary>`.
  const unavailable = () => !removed() && query.current() === null;
  const running = () => query.current()?.status === 'in_progress';

  return (
    <Show when={!unavailable()} fallback={<InvalidPopup />}>
      <PopupDialog
        title={text.title}
        icon="trash"
        tone="danger"
        description={
          <QueryBoundary>
            <Show when={query()}>
              {(shown) => <p>{format(text.description, { title: shown().title })}</p>}
            </Show>
          </QueryBoundary>
        }
        footer={
          <>
            <Button variant="secondary" disabled={removing()} onClick={() => popups.back()}>
              {text.cancel}
            </Button>
            <Button
              variant="destructive"
              loading={removing()}
              disabled={!query.current() || running() || removed()}
              onClick={() => void remove()}
            >
              {text.submit}
            </Button>
          </>
        }
      >
        <Show when={running()}>
          <Banner variant="warning">{text.inProgress}</Banner>
        </Show>
        <Show when={failure()}>{(message) => <Banner variant="error">{message()}</Banner>}</Show>
      </PopupDialog>
    </Show>
  );
}
