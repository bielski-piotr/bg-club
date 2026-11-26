import { isValidHook, normalizeHook } from '@bg-club/accounts';
import { createSignal, flush, Show, useContext } from 'solid-js';
import { t } from '../i18n';
import { Banner, Button, PasswordField, TextField, type BannerVariant } from '../ui';
import { AuthContext, type AuthNotice } from './authContext';
import type { LoginErrorKind } from './errors';
import './LoginScreen.css';

interface FieldErrors {
  readonly hook?: string | undefined;
  readonly password?: string | undefined;
}

function validate(hook: string, password: string): FieldErrors {
  return {
    hook:
      hook === ''
        ? t.auth.errors.hookRequired
        : isValidHook(hook)
          ? undefined
          : t.auth.errors.hookFormat,
    password: password === '' ? t.auth.errors.passwordRequired : undefined,
  };
}

const NOTICE_TEXT: Readonly<Record<AuthNotice, string>> = {
  sessionExpired: t.auth.notices.sessionExpired,
  accountInactive: t.auth.errors.accountInactive,
  accountDeleted: t.auth.notices.accountDeleted,
};

const NOTICE_VARIANT: Readonly<Record<AuthNotice, BannerVariant>> = {
  sessionExpired: 'warning',
  accountInactive: 'error',
  // Gracz sam usunął konto (USR-6): to potwierdzenie, nie błąd.
  accountDeleted: 'info',
};

/**
 * Ekran logowania hookiem i hasłem (PRD §4, AUTH-1). Techniczny e-mail konta nigdy nie pojawia
 * się w interfejsie. Brak samodzielnej rejestracji i resetu hasła (PRD §1.2): konto i hasło
 * daje administrator.
 */
export function LoginScreen(props: { readonly notice: AuthNotice | null }) {
  const auth = useContext(AuthContext);
  const [hook, setHook] = createSignal('');
  const [password, setPassword] = createSignal('');
  const [fieldErrors, setFieldErrors] = createSignal<FieldErrors>({});
  const [serverError, setServerError] = createSignal<LoginErrorKind | null>(null);
  const [pending, setPending] = createSignal(false);
  let hookInput: HTMLInputElement | undefined;
  let passwordInput: HTMLInputElement | undefined;

  const onSubmit = async (event: SubmitEvent) => {
    event.preventDefault();
    // Wpis z tego samego zadania (autouzupełnianie + Enter) jest w sygnałach dopiero po flushu.
    flush();
    if (pending()) return;
    const normalized = normalizeHook(hook());
    const errors = validate(normalized, password());
    setFieldErrors(errors);
    setServerError(null);
    if (errors.hook) {
      hookInput?.focus();
      return;
    }
    if (errors.password) {
      passwordInput?.focus();
      return;
    }

    setHook(normalized);
    setPending(true);
    const result = await auth
      .signIn(normalized, password())
      .catch(() => ({ ok: false, error: 'unknown' }) as const);
    // Po udanym logowaniu ekran znika (AuthProvider przełącza widok); tu tylko błędy.
    if (!result.ok) {
      setPending(false);
      setServerError(result.error);
      if (result.error === 'invalidCredentials') {
        setPassword('');
        passwordInput?.focus();
      }
    }
  };

  const message = () => {
    const error = serverError();
    return error ? t.auth.errors[error] : null;
  };
  const shownNotice = () => (message() === null ? props.notice : null);

  return (
    <main class="shell">
      <section class="start-card login" aria-labelledby="login-title">
        <p class="eyebrow">{t.app.name}</p>
        <h1 id="login-title" class="title">
          {t.auth.title}
        </h1>
        <p class="body">{t.auth.intro}</p>

        <Show when={shownNotice()}>
          {(notice) => (
            <Banner variant={NOTICE_VARIANT[notice()]} class="login__banner">
              {NOTICE_TEXT[notice()]}
            </Banner>
          )}
        </Show>

        <form class="login__form" novalidate onSubmit={(event) => void onSubmit(event)}>
          <TextField
            ref={(el) => (hookInput = el)}
            label={t.auth.hookLabel}
            name="username"
            mono
            value={hook()}
            onInput={(event) => {
              setHook(event.currentTarget.value);
              setFieldErrors((errors) => ({ ...errors, hook: undefined }));
            }}
            placeholder={t.auth.hookPlaceholder}
            autocomplete="username"
            autocapitalize="none"
            autocorrect="off"
            spellcheck="false"
            enterkeyhint="next"
            required
            error={fieldErrors().hook}
          />
          <PasswordField
            ref={(el) => (passwordInput = el)}
            label={t.auth.passwordLabel}
            name="password"
            value={password()}
            onInput={(event) => {
              setPassword(event.currentTarget.value);
              setFieldErrors((errors) => ({ ...errors, password: undefined }));
            }}
            autocomplete="current-password"
            enterkeyhint="go"
            required
            error={fieldErrors().password}
          />
          <Show when={message()}>{(text) => <Banner variant="error">{text()}</Banner>}</Show>
          <Button type="submit" fullWidth loading={pending()} class="login__submit">
            {t.auth.submit}
          </Button>
        </form>
      </section>
    </main>
  );
}
