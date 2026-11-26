import { createEffect, createMemo, createSignal, createUniqueId, type Accessor } from 'solid-js';

/** Liczba pozycji długiej listy (kolekcja, członkowie) dorysowywanych naraz. */
const CHUNK_SIZE = 24;

/**
 * Długa lista rysowana porcjami: najpierw `size` pozycji,
 * kolejne po „Pokaż więcej”. Zmiana `resetKey` (np. wyszukiwanej frazy) wraca do pierwszej
 * porcji. Po dorysowaniu fokus przechodzi na pierwszą nową pozycję (`data-chunk-start`).
 */
export function createChunks<T>(
  items: Accessor<readonly T[]>,
  resetKey: Accessor<unknown>,
  size = CHUNK_SIZE,
) {
  // Sygnał pochodny: zmiana `resetKey` przywraca pierwszą porcję.
  const [limit, setLimit] = createSignal(() => {
    resetKey();
    return size;
  });
  // Wartość atrybutu jest unikalna dla listy: kilka list w stosie popupów się nie myli.
  const listId = createUniqueId();
  let focusFrom: number | null = null;

  createEffect(
    () => limit(),
    () => {
      const from = focusFrom;
      focusFrom = null;
      if (from === null) return;
      document
        .querySelector<HTMLElement>(
          `[data-chunk-start="${listId}${from}"] :is(a[href], button:not([disabled]))`,
        )
        ?.focus();
    },
  );

  const visible = createMemo(() => items().slice(0, limit()));
  return {
    visible,
    hidden: () => items().length - visible().length,
    /** Wartość `data-chunk-start` pozycji: pierwsza z nowej porcji (cel fokusu) albo brak. */
    chunkStart: (index: number) =>
      index === limit() - size && index > 0 ? `${listId}${index}` : undefined,
    showMore: () => {
      focusFrom = limit();
      setLimit(limit() + size);
    },
  };
}
