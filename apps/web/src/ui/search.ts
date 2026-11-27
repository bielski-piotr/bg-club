import { createEffect, createSignal, type Accessor } from 'solid-js';

/** Tekst do porównań w wyszukiwarce: małe litery, bez polskich znaków, `_` i `/` jak spacja. */
export function normalizeSearch(text: string): string {
  return text
    .toLocaleLowerCase('pl-PL')
    .replace(/ł/g, 'l')
    .normalize('NFD')
    .replace(/\p{M}/gu, '')
    .replace(/[_/]+/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();
}

/** Przerwa w pisaniu, po której idzie zapytanie do bazy (bez przeliczania na każdy znak). */
export const SEARCH_DELAY_MS = 200;

/** Wartość po `delay` ms bez zmian; pusta (wyczyszczenie pola) od razu. */
export function createDebounced(value: Accessor<string>, delay: number): Accessor<string> {
  // Pole startuje puste; pierwsza wartość przychodzi z efektu (pusta: od razu).
  const [debounced, setDebounced] = createSignal('');
  createEffect(value, (next) => {
    const timer = window.setTimeout(() => setDebounced(next), next === '' ? 0 : delay);
    return () => window.clearTimeout(timer);
  });
  return debounced;
}
