import { Show, useContext } from 'solid-js';
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
import { QueryStatus } from '../popups/QueryStatus';
import { createProfile } from '../profile/profiles';
import { createMutation } from '../lib/query';
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
 * Potwierdzenie „Usuń członka” (PRD MEM-4, DS „Członkowie / Usuń członka – potwierdzenie”):
 * mały dialog z ikoną kosza i przyciskiem destrukcyjnym. Otwiera go administrator z profilu
 * aktywnego gracza. Po usunięciu profil pod spodem pokazuje stan tylko do odczytu (MEM-5),
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
  const member = () => profile().data ?? undefined;

  const remove = createMutation({
    mutationFn: () => deleteMember(auth.client, props.id),
    onSuccess: () => {
      const removed = member();
      if (removed) toast.show(format(text.toast, { name: fullName(removed) }), 'success');
      if (mounted()) popups.back();
      void queryClient.invalidateQueries({ queryKey: gameVoteTotalsKey });
      // Profil (stan „usunięty”), lista i widżet członków odświeżają się z bazy.
      void queryClient.invalidateQueries({
        queryKey: ['profiles'],
        predicate: (query) => query.queryKey[1] !== 'own',
      });
    },
  });

  // Po sukcesie dialog zostaje do zamknięcia (Wstecz jest asynchroniczne), choć profil jest
  // już usunięty. Wcześniej: z linku nie usuniemy admina, usuniętego ani nieistniejącego.
  const unavailable = () => {
    const current = profile();
    const target = current.data;
    return (
      !remove.state().isSuccess &&
      current.isSuccess &&
      (!target || target.role === 'admin' || target.deleted_at !== null)
    );
  };
  const failure = () => {
    const error = remove.state().error;
    return error instanceof DeletionError ? error.reason : 'unknown';
  };

  return (
    <Show when={!unavailable()} fallback={<InvalidPopup />}>
      <PopupDialog
        title={text.title}
        icon="trash"
        tone="danger"
        description={
          <Show
            when={member()}
            fallback={
              <QueryStatus isError={profile().isError} onRetry={() => void profile().refetch()} />
            }
          >
            {(target) => <p>{format(text.description, { name: fullName(target()) })}</p>}
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
              disabled={!member() || remove.state().isSuccess}
              onClick={() => remove.mutate()}
            >
              {text.submit}
            </Button>
          </>
        }
      >
        <Show when={remove.state().isError}>
          <Banner variant="error">{ERRORS[failure()]}</Banner>
        </Show>
      </PopupDialog>
    </Show>
  );
}
