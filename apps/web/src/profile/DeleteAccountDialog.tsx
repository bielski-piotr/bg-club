import { createSignal, createUniqueId, flush, Show, useContext } from 'solid-js';
import type { OwnProfile } from '../auth/ownProfile';
import { t } from '../i18n';
import { deleteOwnAccount, DeletionError, type DeletionFailure } from '../members/deletion';
import { AuthContext } from '../auth/authContext';
import { PopupsContext } from '../popups/popupContext';
import { PopupDialog } from '../popups/PopupDialog';
import { createMutation } from '../lib/query';
import { Banner, Button, PasswordField } from '../ui';
import './profile.css';

const text = t.deleteAccount;

/** Błędy pokazywane nad polem (złe hasło jest przy polu). */
const ERRORS: Readonly<Record<Exclude<DeletionFailure, 'wrongPassword'>, string>> = {
  rateLimited: text.errors.rateLimited,
  adminProtected: text.errors.adminProtected,
  network: text.errors.network,
  session: text.errors.unknown,
  forbidden: text.errors.unknown,
  notFound: text.errors.unknown,
  unknown: text.errors.unknown,
};

/**
 * Usunięcie własnego konta (PRD USR-6, DS „Profil / Usuń konto – potwierdzenie hasłem”): mały
 * dialog z ikoną kosza, opisem skutków i polem obecnego hasła. Hasło sprawdza Edge Function
 * (`delete-own-account`); jest tylko w stanie formularza. Po usunięciu sesja na tym urządzeniu
 * się kończy i aplikacja wraca do logowania z komunikatem. Administrator nie ma tej opcji.
 */
export function DeleteAccountDialog(props: { readonly me: OwnProfile }) {
  const auth = useContext(AuthContext);
  const popups = useContext(PopupsContext);
  const formId = createUniqueId();
  const [password, setPassword] = createSignal('');
  const [showErrors, setShowErrors] = createSignal(false);
  const [wrongPassword, setWrongPassword] = createSignal(false);

  const remove = createMutation({
    mutationFn: () => deleteOwnAccount(auth.client, password()),
    // Hasło jest w domknięciu mutacji: nie trzymamy go w cache'u po zamknięciu dialogu.
    gcTime: 0,
    onSuccess: () => {
      // Serwer już unieważnił sesje; lokalne wylogowanie czyści cache i popupy z adresu.
      void auth.signOut('accountDeleted');
    },
    onError: (error) => {
      if (error instanceof DeletionError && error.reason === 'wrongPassword') {
        setWrongPassword(true);
      }
    },
  });

  const submit = (event: SubmitEvent) => {
    event.preventDefault();
    flush();
    setShowErrors(true);
    const state = remove.state();
    if (password() === '' || state.isPending || state.isSuccess) return;
    remove.mutate();
  };

  const failure = () => {
    const error = remove.state().error;
    return error instanceof DeletionError ? error.reason : 'unknown';
  };
  const fieldError = () =>
    wrongPassword()
      ? text.errors.wrongPassword
      : showErrors() && password() === ''
        ? text.errors.passwordRequired
        : undefined;
  const bannerFailure = () => {
    const reason = failure();
    return remove.state().isError && reason !== 'wrongPassword' ? reason : undefined;
  };

  return (
    <PopupDialog
      title={text.title}
      icon="trash"
      tone="danger"
      description={<p>{text.description}</p>}
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
            type="submit"
            form={formId}
            variant="destructive"
            loading={remove.state().isPending || remove.state().isSuccess}
          >
            {text.submit}
          </Button>
        </>
      }
    >
      <form id={formId} class="delete-account" novalidate onSubmit={submit}>
        <Show when={bannerFailure()}>
          {(reason) => <Banner variant="error">{ERRORS[reason()]}</Banner>}
        </Show>
        {/* Ukryty login: menedżer haseł podpowie hasło właściwego konta. */}
        <input
          type="text"
          name="username"
          autocomplete="username"
          value={props.me.hook}
          readonly
          hidden
        />
        <PasswordField
          label={text.passwordLabel}
          value={password()}
          autocomplete="current-password"
          required
          hint={text.passwordHint}
          error={fieldError()}
          onInput={(event) => {
            setPassword(event.currentTarget.value);
            setWrongPassword(false);
          }}
        />
      </form>
    </PopupDialog>
  );
}
