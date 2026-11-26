import { action, createOptimistic, createSignal, Show, useContext } from 'solid-js';
import { format, t } from '../i18n';
import { allowOrphanSweep } from '../sheets/sheetImages';
import { AuthContext } from '../auth/authContext';
import { PopupsContext } from '../popups/popupContext';
import { QueryClientContext } from '../lib/queryClient';
import { ToastContext } from '../ui/toastContext';
import { InvalidPopup } from '../popups/InvalidPopup';
import { createMounted } from '../popups/leaveGuard';
import { PopupDialog } from '../popups/PopupDialog';
import { QueryBoundary } from '../popups/QueryStatus';
import { Banner, Button } from '../ui';
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
 * Potwierdzenie „Usuń partię”: tylko admin trwale
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

  const [removing, setRemoving] = createOptimistic(false);
  /** Dane z ostatniej próby usunięcia; `null` = jeszcze nie próbowano. */
  const [attempt, setAttempt] = createSignal<DeleteTarget | null>(null);
  const [outcome, setOutcome] = createSignal<DeleteOutcome | null>(null);
  const [failure, setFailure] = createSignal<string | null>(null);
  const deleteWithImage = async (): Promise<DeleteOutcome> => {
    const { imagePath } = await deletePlay(auth.client, props.id);
    if (!imagePath) return { leftImage: null };
    return {
      leftImage: (await removeDeletedPlayImage(auth.client, imagePath)) ? null : imagePath,
    };
  };

  const remove = action(function* (target: DeleteTarget) {
    setRemoving(true);
    setAttempt(target);
    setFailure(null);
    let result: DeleteOutcome;
    try {
      result = (yield deleteWithImage()) as DeleteOutcome;
    } catch (error) {
      setFailure(
        error instanceof PlayDeleteError
          ? error.reason === 'forbidden'
            ? text.errors.forbidden
            : error.reason === 'draft'
              ? text.errors.draft
              : text.errors.save
          : text.errors.save,
      );
      void invalidatePlayData(queryClient);
      return;
    }
    setOutcome(result);
    toast.show(format(t.meetings.toasts.playDeleted, { title: target.title }), 'success');
    void invalidatePlayData(queryClient);
    if (!result.leftImage) close();
  });

  const leftImage = () => outcome()?.leftImage ?? null;
  const [retrying, setRetrying] = createOptimistic(false);
  const [imageRemoved, setImageRemoved] = createSignal(false);
  const retryImage = action(function* () {
    setRetrying(true);
    const path = leftImage();
    try {
      if (path && !((yield removeDeletedPlayImage(auth.client, path)) as boolean)) return;
    } catch {
      return;
    }
    setImageRemoved(true);
    close();
  });

  // Przed potwierdzeniem (np. z linku): tylko zapisana partia, która istnieje. Po próbie
  // usunięcia dialog zostaje, nawet gdy odświeżona partia już nie pasuje (błąd, sukces).
  // Okno zależy od danych w cache (bez czekania), treść czeka pod `<QueryBoundary>`.
  const unavailable = () => {
    const current = play.current();
    return (
      attempt() === null &&
      !removing() &&
      current !== undefined &&
      (!current || current.status !== 'saved')
    );
  };
  const title = () => play.current()?.game.title ?? attempt()?.title ?? '';
  const imagePending = () => leftImage() !== null && !imageRemoved();

  return (
    <Show when={!unavailable()} fallback={<InvalidPopup />}>
      <PopupDialog
        title={text.title}
        icon="trash"
        tone="danger"
        description={
          <QueryBoundary>
            <Show when={play() || outcome()}>
              <p>{format(text.description, { title: title() })}</p>
            </Show>
          </QueryBoundary>
        }
        footer={
          <Show
            when={imagePending()}
            fallback={
              <>
                <Button variant="secondary" disabled={removing()} onClick={() => popups.back()}>
                  {text.cancel}
                </Button>
                <Button
                  variant="destructive"
                  loading={removing()}
                  disabled={!play.current() || outcome() !== null}
                  onClick={() => {
                    const current = play.current();
                    if (current) void remove({ title: title(), meetingId: current.meeting_id });
                  }}
                >
                  {text.submit}
                </Button>
              </>
            }
          >
            <Button
              variant="secondary"
              disabled={retrying()}
              onClick={() => closeWithLeftImage(attempt()?.meetingId ?? '')}
            >
              {text.close}
            </Button>
            <Button loading={retrying()} onClick={() => void retryImage()}>
              {text.retryImage}
            </Button>
          </Show>
        }
      >
        <Show when={failure()}>{(message) => <Banner variant="error">{message()}</Banner>}</Show>
        <Show when={imagePending()}>
          <Banner variant="warning">{text.imageFailed}</Banner>
        </Show>
      </PopupDialog>
    </Show>
  );
}
