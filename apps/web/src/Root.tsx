import { lazy, Loading, Match, Switch } from 'solid-js';
import { App } from './App';
import type { ConfigResult } from './config/env';
import type { AppView } from './design-system/path';
import { t } from './i18n';

// Galeria komponentów jest ładowana leniwie, więc nie powiększa głównego pakietu.
const DesignSystemPage = lazy(() => import('./design-system/DesignSystemPage'));

interface RootProps {
  readonly config: ConfigResult;
  /** Widok według ścieżki adresu (`viewForPath`). */
  readonly view: AppView;
}

/** Wybór widoku według ścieżki. Popupy huba są w parametrze `?p=…` (src/popups). */
export function Root(props: RootProps) {
  return (
    <Switch>
      <Match when={props.view === 'designSystem'}>
        <Loading>
          <DesignSystemPage />
        </Loading>
      </Match>
      <Match when={props.view === 'notFound'}>
        <NotFound />
      </Match>
      <Match when={props.view === 'app'}>
        <App config={props.config} />
      </Match>
    </Switch>
  );
}

/** Nieznana ścieżka (hosting statyczny serwuje aplikację pod każdym adresem). */
function NotFound() {
  return (
    <main class="shell">
      <section class="start-card" aria-labelledby="page-title">
        <p class="eyebrow">{t.app.name}</p>
        <h1 id="page-title" class="title">
          {t.notFound.title}
        </h1>
        <p class="body">{t.notFound.body}</p>
        <p class="not-found__action">
          <a class="btn btn--primary btn--md" href="/">
            <span class="btn__label">{t.notFound.home}</span>
          </a>
        </p>
      </section>
    </main>
  );
}
