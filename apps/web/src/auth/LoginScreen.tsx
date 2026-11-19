import { isValidHook, normalizeHook } from '@bg-club/accounts';
import { useRef, useState, type FormEvent } from 'react';
import { t } from '../i18n';
import { Banner, Button, PasswordField, TextField, type BannerVariant } from '../ui';
import { useAuth, type AuthNotice } from './authContext';
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
  // Gracz sam usunął konto: to potwierdzenie, nie błąd.
  accountDeleted: 'info',
};

/**
 * Ekran logowania hookiem i hasłem. Techniczny e-mail konta nigdy nie pojawia
 * się w interfejsie. Brak samodzielnej rejestracji i resetu hasła: konto i hasło
 * daje administrator.
 */
export function LoginScreen({ notice }: { readonly notice: AuthNotice | null }) {
  const { signIn } = useAuth();
  const [hook, setHook] = useState('');
  const [password, setPassword] = useState('');
  const [fieldErrors, setFieldErrors] = useState<FieldErrors>({});
  const [serverError, setServerError] = useState<LoginErrorKind | null>(null);
  const [pending, setPending] = useState(false);
  const hookRef = useRef<HTMLInputElement>(null);
  const passwordRef = useRef<HTMLInputElement>(null);

  const onSubmit = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    if (pending) return;
    const normalized = normalizeHook(hook);
    const errors = validate(normalized, password);
    setFieldErrors(errors);
    setServerError(null);
    if (errors.hook) {
      hookRef.current?.focus();
      return;
    }
    if (errors.password) {
      passwordRef.current?.focus();
      return;
    }

    setHook(normalized);
    setPending(true);
    const result = await signIn(normalized, password).catch(
      () => ({ ok: false, error: 'unknown' }) as const,
    );
    // Po udanym logowaniu ekran znika (AuthProvider przełącza widok); tu tylko błędy.
    if (!result.ok) {
      setPending(false);
      setServerError(result.error);
      if (result.error === 'invalidCredentials') {
        setPassword('');
        passwordRef.current?.focus();
      }
    }
  };

  const message = serverError ? t.auth.errors[serverError] : null;
  const shownNotice = message === null ? notice : null;

  return (
    <main className="shell">
      <section className="start-card login" aria-labelledby="login-title">
        <p className="eyebrow">{t.app.name}</p>
        <h1 id="login-title" className="title">
          {t.auth.title}
        </h1>
        <p className="body">{t.auth.intro}</p>

        {shownNotice ? (
          <Banner variant={NOTICE_VARIANT[shownNotice]} className="login__banner">
            {NOTICE_TEXT[shownNotice]}
          </Banner>
        ) : null}

        <form className="login__form" noValidate onSubmit={onSubmit}>
          <TextField
            ref={hookRef}
            label={t.auth.hookLabel}
            name="username"
            mono
            value={hook}
            onChange={(event) => {
              setHook(event.target.value);
              setFieldErrors((errors) => ({ ...errors, hook: undefined }));
            }}
            placeholder={t.auth.hookPlaceholder}
            autoComplete="username"
            autoCapitalize="none"
            autoCorrect="off"
            spellCheck={false}
            enterKeyHint="next"
            required
            error={fieldErrors.hook}
          />
          <PasswordField
            ref={passwordRef}
            label={t.auth.passwordLabel}
            name="password"
            value={password}
            onChange={(event) => {
              setPassword(event.target.value);
              setFieldErrors((errors) => ({ ...errors, password: undefined }));
            }}
            autoComplete="current-password"
            enterKeyHint="go"
            required
            error={fieldErrors.password}
          />
          {message ? <Banner variant="error">{message}</Banner> : null}
          <Button type="submit" fullWidth loading={pending} className="login__submit">
            {t.auth.submit}
          </Button>
        </form>
      </section>
    </main>
  );
}
