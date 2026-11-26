import { action, createOptimistic, createSignal, Show, useContext } from 'solid-js';
import { gameVoteTotalsKey } from '../games/gameVoteTotal';
import { format, t } from '../i18n';
import { fullName } from '../profile/profileQueries';
import { AuthContext } from '../auth/authContext';
import { PopupsContext } from '../popups/popupContext';
import { QueryClientContext } from '../lib/queryClient';
import { ToastContext } from '../ui/toastContext';
import { InvalidPopup } from '../popups/InvalidPopup';
import { createMounted } from '../popups/leaveGuard';
import { PopupDialog } from '../popups/PopupDialog';
import { QueryBoundary } from '../popups/QueryStatus';
import { createProfile } from '../profile/profiles';
import { Banner, Button } from '../ui';
import { deleteMember, DeletionError, type DeletionFailure } from './deletion';

const text = t.deleteMember;

const ERRORS: Readonly<Record<DeletionFailure, string>> = {
  adminProtected: text.errors.adminProtected,
  forbidden: text.errors.forbidden,
  notFound: text.errors.notFound,
  network: text.errors.network,
  // Nieważna sesja kończy się wylogowaniem przez supabase-js; do tego czasu ogólny komunikat.
  session: text.errors.unknown,
  wrongPassword: text.errors.unknown,
  rateLimited: text.errors.unknown,
  unknown: text.errors.unknown,
};

/**
 * Potwierdzenie „Usuń członka”:
 * mały dialog z ikoną kosza i przyciskiem destrukcyjnym. Otwiera go administrator z profilu
 * aktywnego gracza. Po usunięciu profil pod spodem pokazuje stan tylko do odczytu,
 * a członek znika z listy i widżetu.
 *
 * Usunięcie jest idempotentne, więc po błędzie można je bezpiecznie ponowić.
 */
export function DeleteMemberDialog(props: { readonly id: string }) {
  const auth = useContext(AuthContext);
  const queryClient = useContext(QueryClientContext);
  const toast = useContext(ToastContext);
  const popups = useContext(PopupsContext);
  const mounted = createMounted();
  const profile = createProfile(() => props.id);
  const [removing, setRemoving] = createOptimistic(false);
  const [removed, setRemoved] = createSignal(false);
  const [failure, setFailure] = createSignal<DeletionFailure | null>(null);

  const remove = action(function* () {
    setRemoving(true);
    setFailure(null);
    const target = profile.current() ?? undefined;
    try {
      yield deleteMember(auth.client, props.id);
    } catch (error) {
      setFailure(error instanceof DeletionError ? error.reason : 'unknown');
      return;
    }
    setRemoved(true);
    if (target) toast.show(format(text.toast, { name: fullName(target) }), 'success');
    if (mounted()) popups.back();
    void queryClient.invalidateQueries({ queryKey: gameVoteTotalsKey });
    // Profil (stan „usunięty”), lista i widżet członków odświeżają się z bazy.
    void queryClient.invalidateQueries({
      queryKey: ['profiles'],
      predicate: (query) => query.queryKey[1] !== 'own',
    });
  });

  // Po sukcesie dialog zostaje do zamknięcia (Wstecz jest asynchroniczne), choć profil jest
  // już usunięty. Wcześniej: z linku nie usuniemy admina, usuniętego ani nieistniejącego.
  // Okno zależy od danych w cache (bez czekania), treść czeka pod `<QueryBoundary>`.
  const unavailable = () => {
    const target = profile.current();
    return (
      !removed() &&
      target !== undefined &&
      (!target || target.role === 'admin' || target.deleted_at !== null)
    );
  };

  return (
    <Show when={!unavailable()} fallback={<InvalidPopup />}>
      <PopupDialog
        title={text.title}
        icon="trash"
        tone="danger"
        description={
          <QueryBoundary>
            <Show when={profile()}>
              {(target) => <p>{format(text.description, { name: fullName(target()) })}</p>}
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
              disabled={!profile.current() || removed()}
              onClick={() => void remove()}
            >
              {text.submit}
            </Button>
          </>
        }
      >
        <Show when={failure()}>
          {(reason) => <Banner variant="error">{ERRORS[reason()]}</Banner>}
        </Show>
      </PopupDialog>
    </Show>
  );
}
