/** @jsxImportSource @solidjs/web */
import { createSignal, onSettled, Show, useContext } from 'solid-js';
import { createLeaveGuard } from '../popups/leaveGuard';
import { PopupLink } from '../popups/PopupLink';
import { PopupModal } from '../popups/PopupModal';
import { PopupLevelContext, PopupsContext } from '../context';
import { createQuery } from '../query';

/*
 * Komponenty Solid do testów mostka (`src/bridge/SolidIsland.test.tsx`): plik testu jest w React,
 * a JSX Solid kompiluje się tylko w katalogach z `solid-files.js`.
 */

/** Propsy z Reacta: tekst zmienia się bez ponownego montowania (licznik montowań stały). */
export function Echo(props: {
  readonly label: string;
  readonly count: number;
  readonly onMount?: () => void;
  readonly onDispose?: () => void;
}) {
  onSettled(() => {
    props.onMount?.();
    return () => props.onDispose?.();
  });
  return (
    <p data-testid="echo">
      {props.label}: {props.count}
    </p>
  );
}

/** Stan wewnątrz wyspy zostaje przy zmianie propsów z Reacta. */
export function LocalCounter(props: { readonly label: string }) {
  const [clicks, setClicks] = createSignal(0);
  return (
    <button type="button" onClick={() => setClicks((n) => n + 1)}>
      {props.label} {clicks()}
    </button>
  );
}

/** Wartość z cache zapytań współdzielonego z Reactem. */
export function CachedValue(props: { readonly queryKey: string }) {
  const query = createQuery(() => ({
    queryKey: [props.queryKey],
    queryFn: () => 'z sieci',
    staleTime: Infinity,
  }));
  return <p data-testid="solid-value">{query().data ?? 'brak'}</p>;
}

/** Popup na stosie z adresu: poziom, przykrycie i akcje stosu z kontekstów hosta React. */
export function StackPopup(props: { readonly title: string }) {
  const popups = useContext(PopupsContext);
  const level = useContext(PopupLevelContext);
  return (
    <div class={['popup-layer', { 'popup-layer--covered': level.covered }]} inert={level.covered}>
      <div
        role="dialog"
        aria-modal="true"
        aria-label={props.title}
        tabindex={-1}
        data-popup-level={level.level}
      >
        <p>Popupów: {popups.stack.length}</p>
        <button type="button" onClick={() => popups.open({ kind: 'settings' })}>
          Ustawienia
        </button>
        <button type="button" onClick={() => popups.back()}>
          Wróć
        </button>
      </div>
    </div>
  );
}

/** Popup na `PopupModal` z linkiem dalej i ochroną wyjścia przy niezapisanych zmianach. */
export function GuardedPopup(props: { readonly title: string }) {
  const [dirty, setDirty] = createSignal(false);
  const [pending, setPending] = createSignal<(() => void) | null>(null);
  createLeaveGuard(() => (dirty() ? (leave) => setPending(() => leave) : null));
  return (
    <PopupModal title={props.title}>
      <PopupLink to={{ kind: 'settings' }}>Ustawienia</PopupLink>
      <label>
        Zmiany{' '}
        <input
          type="checkbox"
          checked={dirty()}
          onChange={(e) => setDirty(e.currentTarget.checked)}
        />
      </label>
      <Show when={pending()}>
        {(leave) => (
          <button type="button" onClick={() => leave()()}>
            Odrzuć zmiany
          </button>
        )}
      </Show>
    </PopupModal>
  );
}
