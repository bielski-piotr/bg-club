import { AuthProvider } from './auth/AuthProvider';
import { useAuth } from './auth/authContext';
import { LoginScreen } from './auth/LoginScreen';
import { LoadingScreen } from './auth/LoadingScreen';
import { SignedInScreen } from './auth/SignedInScreen';
import type { ConfigIssue, ConfigResult } from './config/env';
import { format, t } from './i18n';
import { getSupabase } from './lib/supabase';

interface AppProps {
  readonly config: ConfigResult;
}

export function App({ config }: AppProps) {
  if (!config.ok) return <ConfigError issues={config.issues} />;
  return (
    <AuthProvider client={getSupabase(config.config)}>
      <AuthGate />
    </AuthProvider>
  );
}

/** Widok według stanu sesji: wczytywanie, logowanie albo aplikacja (AUTH-1, AUTH-5). */
export function AuthGate() {
  const { state } = useAuth();
  switch (state.status) {
    case 'loading':
      return <LoadingScreen />;
    case 'signedOut':
      return <LoginScreen notice={state.notice} />;
    case 'signedIn':
      return <SignedInScreen key={state.session.user.id} userId={state.session.user.id} />;
  }
}

function issueText(issue: ConfigIssue): string {
  switch (issue.kind) {
    case 'missing':
      return format(t.config.missing, { names: issue.names.join(', ') });
    case 'invalidUrl':
      return format(t.config.invalidUrl, { name: issue.name });
    case 'secretKey':
      return format(t.config.secretKey, { name: issue.name });
  }
}

function ConfigError({ issues }: { readonly issues: readonly ConfigIssue[] }) {
  return (
    <main className="shell">
      <section className="start-card" aria-labelledby="page-title">
        <p className="eyebrow">{t.app.tagline}</p>
        <div role="alert">
          <h1 id="page-title" className="title">
            {t.config.errorTitle}
          </h1>
          <p className="body">{t.config.errorBody}</p>
          <ul className="issues">
            {issues.map((issue) => (
              <li key={issue.kind}>{issueText(issue)}</li>
            ))}
          </ul>
          <p className="hint">{t.config.hint}</p>
        </div>
      </section>
    </main>
  );
}
