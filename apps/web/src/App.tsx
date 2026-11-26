import { For, Match, Show, Switch, useContext } from 'solid-js';
import { AuthContext } from './auth/authContext';
import { AuthProvider } from './auth/AuthProvider';
import { LoadingScreen } from './auth/LoadingScreen';
import { LoginScreen } from './auth/LoginScreen';
import { SignedInScreen } from './auth/SignedInScreen';
import type { ConfigIssue, ConfigResult } from './config/env';
import { format, t } from './i18n';
import { getSupabase } from './lib/supabase';

interface AppProps {
  readonly config: ConfigResult;
}

export function App(props: AppProps) {
  return (
    <Show
      when={props.config.ok ? props.config.config : undefined}
      fallback={<ConfigError issues={props.config.ok ? [] : props.config.issues} />}
    >
      {(config) => (
        <AuthProvider client={getSupabase(config())}>
          <AuthGate />
        </AuthProvider>
      )}
    </Show>
  );
}

/** Widok według stanu sesji: wczytywanie, logowanie albo aplikacja (AUTH-1, AUTH-5). */
export function AuthGate() {
  const auth = useContext(AuthContext);
  const signedOut = () => (auth.state.status === 'signedOut' ? auth.state : undefined);
  const userId = () => (auth.state.status === 'signedIn' ? auth.state.session.user.id : undefined);
  return (
    <Switch fallback={<LoadingScreen />}>
      <Match when={signedOut()}>{(state) => <LoginScreen notice={state().notice} />}</Match>
      {/* Każdy użytkownik dostaje własny widok: stan poprzedniej sesji nie przechodzi dalej. */}
      <Match when={userId()} keyed>
        {(id) => <SignedInScreen userId={id} />}
      </Match>
    </Switch>
  );
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

function ConfigError(props: { readonly issues: readonly ConfigIssue[] }) {
  return (
    <main class="shell">
      <section class="start-card" aria-labelledby="page-title">
        <p class="eyebrow">{t.app.tagline}</p>
        <div role="alert">
          <h1 id="page-title" class="title">
            {t.config.errorTitle}
          </h1>
          <p class="body">{t.config.errorBody}</p>
          <ul class="issues">
            <For each={props.issues}>{(issue) => <li>{issueText(issue)}</li>}</For>
          </ul>
          <p class="hint">{t.config.hint}</p>
        </div>
      </section>
    </main>
  );
}
