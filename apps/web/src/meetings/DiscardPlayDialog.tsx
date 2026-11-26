import { action, createOptimistic, createSignal, Show, useContext } from 'solid-js';
import type { OwnProfile } from '../auth/ownProfile';
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
  const meeting = createMeeting(() => play.current()?.meeting_id ?? '');
  const [discarding, setDiscarding] = createOptimistic(false);
  const [discarded, setDiscarded] = createSignal(false);
  const [failure, setFailure] = createSignal<string | null>(null);

  const discard = action(function* () {
    setDiscarding(true);
    setFailure(null);
    try {
      yield discardPlay(auth.client, props.id);
    } catch (error) {
      setFailure(
        error instanceof DraftError
          ? error.reason === 'forbidden'
            ? text.errors.forbidden
            : error.reason === 'gone'
              ? text.errors.gone
              : text.errors.save
          : text.errors.save,
      );
      void queryClient.invalidateQueries({ queryKey: meetingsKey });
      return;
    }
    setDiscarded(true);
    removeLocalDrafts(draftStorage(), props.id);
    toast.show(
      format(t.meetings.toasts.playDiscarded, { title: play.current()?.game.title ?? '' }),
      'success',
    );
    // Pod dialogiem może być notes tej partii: po porzuceniu nie ma już czego pokazywać.
    const below = popups.stack.at(-2);
    const overPad = below?.kind === 'play' && below.id === props.id;
    if (mounted()) popups.backBy(overPad ? 2 : 1);
    void queryClient.invalidateQueries({ queryKey: meetingsKey });
  });

  // Po sukcesie dialog zostaje do zamknięcia (Wstecz jest asynchroniczne). Okno zależy od
  // danych w cache (bez czekania), treść czeka pod `<QueryBoundary>`.
  const unavailable = () => {
    if (discarded()) return false;
    const current = play.current();
    if (current !== undefined && (!current || current.status !== 'draft')) return true;
    const found = meeting.current();
    return !!found && !isMeetingRunner(found, props.me);
  };

  return (
    <Show when={!unavailable()} fallback={<InvalidPopup />}>
      <PopupDialog
        title={text.title}
        icon="trash"
        tone="danger"
        description={
          <QueryBoundary>
            <Show when={play()}>
              {(current) => <p>{format(text.description, { title: current().game.title })}</p>}
            </Show>
          </QueryBoundary>
        }
        footer={
          <>
            <Button variant="secondary" disabled={discarding()} onClick={() => popups.back()}>
              {text.cancel}
            </Button>
            <Button
              variant="destructive"
              loading={discarding()}
              disabled={!play.current() || discarded()}
              onClick={() => void discard()}
            >
              {text.submit}
            </Button>
          </>
        }
      >
        <Show when={failure()}>{(message) => <Banner variant="error">{message()}</Banner>}</Show>
      </PopupDialog>
    </Show>
  );
}
