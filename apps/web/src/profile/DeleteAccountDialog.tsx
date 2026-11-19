import { useMutation } from '@tanstack/react-query';
import { useId, useState, type FormEvent } from 'react';
import { useAuth } from '../auth/authContext';
import type { OwnProfile } from '../auth/useOwnProfile';
import { t } from '../i18n';
import { deleteOwnAccount, DeletionError, type DeletionFailure } from '../members/deletion';
import { usePopups } from '../popups/popupContext';
import { PopupDialog } from '../popups/PopupDialog';
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
 * Usunięcie własnego konta: mały
 * dialog z ikoną kosza, opisem skutków i polem obecnego hasła. Hasło sprawdza Edge Function
 * (`delete-own-account`); jest tylko w stanie formularza. Po usunięciu sesja na tym urządzeniu
 * się kończy i aplikacja wraca do logowania z komunikatem. Administrator nie ma tej opcji.
 */
export function DeleteAccountDialog({ me }: { readonly me: OwnProfile }) {
  const { client, signOut } = useAuth();
  const { back } = usePopups();
  const formId = useId();
  const [password, setPassword] = useState('');
  const [showErrors, setShowErrors] = useState(false);
  const [wrongPassword, setWrongPassword] = useState(false);

  const remove = useMutation({
    mutationFn: () => deleteOwnAccount(client, password),
    // Hasło jest w domknięciu mutacji: nie trzymamy go w cache'u po zamknięciu dialogu.
    gcTime: 0,
    onSuccess: () => {
      // Serwer już unieważnił sesje; lokalne wylogowanie czyści cache i popupy z adresu.
      void signOut('accountDeleted');
    },
    onError: (error) => {
      if (error instanceof DeletionError && error.reason === 'wrongPassword') {
        setWrongPassword(true);
      }
    },
  });

  const submit = (event: FormEvent) => {
    event.preventDefault();
    setShowErrors(true);
    if (password === '' || remove.isPending || remove.isSuccess) return;
    remove.mutate();
  };

  const failure = remove.error instanceof DeletionError ? remove.error.reason : 'unknown';
  const fieldError = wrongPassword
    ? text.errors.wrongPassword
    : showErrors && password === ''
      ? text.errors.passwordRequired
      : undefined;

  return (
    <PopupDialog
      title={text.title}
      icon="trash"
      tone="danger"
      description={<p>{text.description}</p>}
      footer={
        <>
          <Button variant="secondary" disabled={remove.isPending} onClick={back}>
            {text.cancel}
          </Button>
          <Button
            type="submit"
            form={formId}
            variant="destructive"
            loading={remove.isPending || remove.isSuccess}
          >
            {text.submit}
          </Button>
        </>
      }
    >
      <form id={formId} className="delete-account" noValidate onSubmit={submit}>
        {remove.isError && failure !== 'wrongPassword' ? (
          <Banner variant="error">{ERRORS[failure]}</Banner>
        ) : null}
        {/* Ukryty login: menedżer haseł podpowie hasło właściwego konta. */}
        <input
          type="text"
          name="username"
          autoComplete="username"
          value={me.hook}
          readOnly
          hidden
        />
        <PasswordField
          label={text.passwordLabel}
          value={password}
          autoComplete="current-password"
          required
          hint={text.passwordHint}
          error={fieldError}
          onChange={(event) => {
            setPassword(event.target.value);
            setWrongPassword(false);
          }}
        />
      </form>
    </PopupDialog>
  );
}
