import { action, createOptimistic, createSignal, flush, Show, useContext } from 'solid-js';
import type { OwnProfile } from '../auth/ownProfile';
import { t } from '../i18n';
import { deleteOwnAccount, DeletionError, type DeletionFailure } from '../members/deletion';
import { AuthContext } from '../auth/authContext';
import { Banner, Button, PasswordField } from '../ui';

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
 * Deleting the own account on the settings page: the consequences and the current password.
 * The password is checked by the Edge Function (`delete-own-account`) and lives only in the form
 * state. After the deletion the session on this device ends and the app returns to the sign-in
 * screen with a notice. The administrator doesn't have this option.
 */
export function DeleteAccountForm(props: { readonly me: OwnProfile; readonly labelledBy: string }) {
  const auth = useContext(AuthContext);
  const [password, setPassword] = createSignal('');
  const [showErrors, setShowErrors] = createSignal(false);
  const [wrongPassword, setWrongPassword] = createSignal(false);

  const [removing, setRemoving] = createOptimistic(false);
  const [removed, setRemoved] = createSignal(false);
  const [failure, setFailure] = createSignal<DeletionFailure | null>(null);

  // Hasło jest tylko w sygnale formularza: nie trafia do cache'u zapytań.
  const remove = action(function* () {
    setRemoving(true);
    setFailure(null);
    try {
      yield deleteOwnAccount(auth.client, password());
    } catch (error) {
      const reason = error instanceof DeletionError ? error.reason : 'unknown';
      setFailure(reason);
      if (reason === 'wrongPassword') setWrongPassword(true);
      return;
    }
    setRemoved(true);
    // Serwer już unieważnił sesje; lokalne wylogowanie czyści cache i popupy z adresu.
    void auth.signOut('accountDeleted');
  });

  const submit = (event: SubmitEvent) => {
    event.preventDefault();
    flush();
    setShowErrors(true);
    if (password() === '' || removing() || removed()) return;
    void remove();
  };

  const fieldError = () =>
    wrongPassword()
      ? text.errors.wrongPassword
      : showErrors() && password() === ''
        ? text.errors.passwordRequired
        : undefined;
  const bannerFailure = () => {
    const reason = failure();
    return reason !== null && reason !== 'wrongPassword' ? reason : undefined;
  };

  return (
    <form class="delete-account" novalidate onSubmit={submit} aria-labelledby={props.labelledBy}>
      <p class="settings__helper">{text.description}</p>
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
      <div class="settings__actions">
        <Button type="submit" variant="destructive" icon="trash" loading={removing() || removed()}>
          {text.submit}
        </Button>
      </div>
    </form>
  );
}
