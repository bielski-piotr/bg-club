import { App } from './App';
import type { ConfigResult } from './config/env';
import type { AppView } from './lib/path';
import { t } from './i18n';

interface RootProps {
  readonly config: ConfigResult;
  /** Widok według ścieżki adresu (`viewForPath`). */
  readonly view: AppView;
}

/** Wybór widoku według ścieżki. Popupy huba są w parametrze `?p=…` (src/popups). */
export function Root({ config, view }: RootProps) {
  switch (view) {
    case 'notFound':
      return <NotFound />;
    case 'app':
      return <App config={config} />;
  }
}

/** Nieznana ścieżka (hosting statyczny serwuje aplikację pod każdym adresem). */
function NotFound() {
  return (
    <main className="shell">
      <section className="start-card" aria-labelledby="page-title">
        <p className="eyebrow">{t.app.name}</p>
        <h1 id="page-title" className="title">
          {t.notFound.title}
        </h1>
        <p className="body">{t.notFound.body}</p>
        <p className="not-found__action">
          <a className="btn btn--primary btn--md" href="/">
            <span className="btn__label">{t.notFound.home}</span>
          </a>
        </p>
      </section>
    </main>
  );
}
