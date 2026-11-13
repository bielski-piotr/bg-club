import { useMutation, useQueryClient } from '@tanstack/react-query';
import { useAuth } from '../auth/authContext';
import { format, t } from '../i18n';
import { InvalidPopup } from '../popups/InvalidPopup';
import { usePopups } from '../popups/popupContext';
import { PopupDialog } from '../popups/PopupDialog';
import { QueryStatus } from '../popups/QueryStatus';
import { fullName, useProfile } from '../profile/profiles';
import { Banner, Button, useToast } from '../ui';
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
export function DeleteMemberDialog({ id }: { readonly id: string }) {
  const { client } = useAuth();
  const queryClient = useQueryClient();
  const toast = useToast();
  const { back } = usePopups();
  const profile = useProfile(client, id);
  const member = profile.data;

  const remove = useMutation({
    mutationFn: () => deleteMember(client, id),
    onSuccess: () => {
      if (member) toast.show(format(text.toast, { name: fullName(member) }), 'success');
      back();
      // Profil (stan „usunięty”), lista i widżet członków odświeżają się z bazy.
      void queryClient.invalidateQueries({
        queryKey: ['profiles'],
        predicate: (query) => query.queryKey[1] !== 'own',
      });
    },
  });

  // Po sukcesie dialog zostaje do zamknięcia (Wstecz jest asynchroniczne), choć profil jest
  // już usunięty. Wcześniej: z linku nie usuniemy admina, usuniętego ani nieistniejącego.
  if (
    !remove.isSuccess &&
    profile.isSuccess &&
    (!member || member.role === 'admin' || member.deleted_at !== null)
  ) {
    return <InvalidPopup />;
  }

  const failure = remove.error instanceof DeletionError ? remove.error.reason : 'unknown';
  return (
    <PopupDialog
      title={text.title}
      icon="trash"
      tone="danger"
      description={
        member ? (
          <p>{format(text.description, { name: fullName(member) })}</p>
        ) : (
          <QueryStatus isError={profile.isError} onRetry={() => void profile.refetch()} />
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
            disabled={!member || remove.isSuccess}
            onClick={() => remove.mutate()}
          >
            {text.submit}
          </Button>
        </>
      }
    >
      {remove.isError ? <Banner variant="error">{ERRORS[failure]}</Banner> : null}
    </PopupDialog>
  );
}
