import type { JSX } from '@solidjs/web';
import { children, type Accessor } from 'solid-js';

/*
 * Pomocnicze typy i funkcje komponentów Solid (`src/solid/ui`): odpowiedniki tego, co w React
 * dawał sam renderer (liczby w `style` jako px, ref-obiekty, wywołanie handlera z propsów).
 */

/** Wartość `class` w Solid: tekst, tablica albo obiekt przełączników. */
export type ClassValue = JSX.HTMLAttributes<HTMLElement>['class'];

/**
 * Opcjonalny element z propsów (`action`, `footer`…) rozwiązany raz. Każdy odczyt
 * `props.action` tworzy węzły od nowa, więc `<Show when={props.action}>{props.action}</Show>`
 * zbudowałby je dwa razy; tu `<Show when={action()}>{action()}</Show>`. Pusty = `undefined`.
 */
export function createSlot(read: () => JSX.Element): Accessor<JSX.Element | undefined> {
  const resolved = children(read);
  return () => {
    const value = resolved();
    if (value === null || value === false || value === '') return undefined;
    return Array.isArray(value) && value.length === 0 ? undefined : value;
  };
}

/** Liczba jako px, jak w `style` Reacta (`width: 36` → `36px`). */
export function px(value: number | string | undefined): string | undefined {
  return typeof value === 'number' ? `${value}px` : value;
}

/** Wywołuje handler zdarzenia z propsów (funkcja albo para `[handler, dane]`). */
export function callHandler(handler: unknown, event: Event): void {
  if (typeof handler === 'function') (handler as (event: Event) => void)(event);
  else if (Array.isArray(handler) && typeof handler[0] === 'function') {
    (handler[0] as (data: unknown, event: Event) => void)(handler[1], event);
  }
}

/** Przekazuje element do refa z propsów (funkcja albo tablica funkcji). */
export function setRef(ref: unknown, element: Element): void {
  if (typeof ref === 'function') (ref as (element: Element) => void)(element);
  else if (Array.isArray(ref)) for (const each of ref) setRef(each, element);
}

/**
 * `focusable="false"` na `<svg>` (stare przeglądarki wpuszczały ikony do kolejności Tab). Typy
 * JSX Solid nie znają tego atrybutu, więc trafia przez spread.
 */
export const notFocusable: Record<string, string> = { focusable: 'false' };

/** Atrybut ARIA z wartością logiczną: Solid usuwa atrybut dla `false`, ARIA potrzebuje tekstu. */
export function ariaBool(value: boolean): 'true' | 'false' {
  return value ? 'true' : 'false';
}

/** `true` jako `"true"`, inaczej brak atrybutu (React: `aria-busy={loading || undefined}`). */
export function ariaTrue(value: boolean | undefined): 'true' | undefined {
  return value ? 'true' : undefined;
}
