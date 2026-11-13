import type { ConfigIssue, ConfigResult } from './config/env';
import { format, t } from './i18n';

interface AppProps {
  readonly config: ConfigResult;
}

export function App({ config }: AppProps) {
  return (
    <main className="shell">
      <section className="card" aria-labelledby="page-title">
        <p className="eyebrow">{t.app.tagline}</p>
        {config.ok ? (
          <StartScreen supabaseUrl={config.config.supabaseUrl} />
        ) : (
          <ConfigError issues={config.issues} />
        )}
      </section>
    </main>
  );
}

function StartScreen({ supabaseUrl }: { readonly supabaseUrl: string }) {
  return (
    <>
      <h1 id="page-title" className="title">
        {t.app.name}
      </h1>
      <p className="lead">{t.start.title}</p>
      <p className="body">{t.start.body}</p>
      <dl className="meta">
        <dt>{t.start.backendLabel}</dt>
        <dd>{new URL(supabaseUrl).host}</dd>
      </dl>
    </>
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

function ConfigError({ issues }: { readonly issues: readonly ConfigIssue[] }) {
  return (
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
  );
}
