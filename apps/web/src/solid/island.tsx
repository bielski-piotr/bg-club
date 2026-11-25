/** @jsxImportSource @solidjs/web */
import { render } from '@solidjs/web';
import { createStore, flush, markRaw, type Component } from 'solid-js';
import { Bridge } from './Bridge';
import type { IslandHost } from './context';

/** Wyspa Solid zamontowana w elemencie hosta React (`SolidIsland`). */
export interface Island<P extends object> {
  /** Nowe propsy i wartości kontekstów z renderu Reacta; DOM wyspy jest aktualny po powrocie. */
  readonly update: (props: P, host: IslandHost) => void;
  readonly dispose: () => void;
}

type Plain = Record<string, unknown>;

interface IslandState {
  props: Plain;
  host: Record<keyof IslandHost, unknown>;
}

function isPlain(value: unknown): value is Plain {
  return (
    value !== null && typeof value === 'object' && Object.getPrototypeOf(value) === Object.prototype
  );
}

/**
 * Wartość do store: instancje klas (`QueryClient`, `SupabaseClient`, `Date`…) zostają poza
 * opakowaniem w proxy, bo ich prywatne pola (`#x`) nie działają przez proxy.
 */
function raw(value: unknown): unknown {
  return value !== null && typeof value === 'object' && !Array.isArray(value) && !isPlain(value)
    ? markRaw(value)
    : value;
}

/** Kopia, żeby zapisy w store nie zmieniały obiektów należących do Reacta. */
function copy(value: unknown): unknown {
  if (!isPlain(value)) return raw(value);
  return Object.fromEntries(Object.entries(value).map(([key, field]) => [key, raw(field)]));
}

/** Zapis tylko zmienionych pól: odczyty niezmienionych wartości nie uruchamiają się ponownie. */
function assign(target: Plain, next: Readonly<Plain>, deep: boolean) {
  for (const key of Object.keys(target)) {
    if (!(key in next)) Reflect.deleteProperty(target, key);
  }
  for (const [key, value] of Object.entries(next)) {
    const current = target[key];
    if (current === value) continue;
    if (deep && isPlain(current) && isPlain(value)) assign(current, value, false);
    else target[key] = deep ? copy(value) : raw(value);
  }
}

function hostState(host: IslandHost): IslandState['host'] {
  return {
    queryClient: raw(host.queryClient),
    auth: copy(host.auth),
    popups: copy(host.popups),
    popupLevel: copy(host.popupLevel),
    toast: copy(host.toast),
  };
}

/**
 * Stały obiekt, którego pola czytają bieżącą wartość z store (`read`): odczyt `popups.stack`
 * w JSX wyspy jest śledzony, a dostawca kontekstu dostaje jedną, niezmienną referencję.
 */
function live<T extends object>(read: () => unknown): T {
  return new Proxy({} as T, {
    get: (_target, key) => {
      const value = read();
      return value !== null && typeof value === 'object' ? Reflect.get(value, key) : undefined;
    },
  });
}

/**
 * Konteksty wyspy. Zestaw dostawców ustala host przy montowaniu (popup ma poziom na stosie,
 * widżet nie) i nie zmienia się później, więc decyduje o nim wartość początkowa; `QueryClient`
 * jest jeden na aplikację.
 */
function providersFor(initial: IslandHost, state: IslandState): IslandHost {
  const field = <K extends Exclude<keyof IslandHost, 'queryClient'>>(key: K) =>
    initial[key] ? live<NonNullable<IslandHost[K]>>(() => state.host[key]) : undefined;
  return {
    queryClient: initial.queryClient,
    auth: field('auth'),
    popups: field('popups'),
    popupLevel: field('popupLevel'),
    toast: field('toast'),
  };
}

/**
 * Montuje komponent Solid w `element`. Propsy i konteksty żyją w store, który `update` zmienia
 * przez draft i od razu stosuje (`flush`): host React woła go w `useLayoutEffect`, więc fokus
 * i pomiary po renderze Reacta widzą już nowy DOM wyspy.
 */
export function mountIsland<P extends object>(
  element: HTMLElement,
  component: Component<P>,
  props: P,
  host: IslandHost,
): Island<P> {
  let setState: ((fn: (draft: IslandState) => void) => void) | undefined;
  const Content = component as unknown as Component<Plain>;
  const dispose = render(() => {
    const [state, set] = createStore<IslandState>({
      props: copy(props) as Plain,
      host: hostState(host),
    });
    setState = set;
    const providers = providersFor(host, state);
    return (
      <Bridge providers={providers}>
        <Content {...state.props} />
      </Bridge>
    );
  }, element);
  return {
    update(nextProps, nextHost) {
      setState?.((draft) => {
        assign(draft.props, nextProps as Plain, false);
        assign(draft.host, hostState(nextHost), true);
      });
      flush();
    },
    dispose,
  };
}
