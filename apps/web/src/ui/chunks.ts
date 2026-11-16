import { useEffect, useId, useRef, useState } from 'react';

/** Liczba pozycji długiej listy (kolekcja, członkowie) dorysowywanych naraz (NFR-2). */
const CHUNK_SIZE = 24;

/**
 * Długa lista rysowana porcjami (NFR-2): najpierw `size` pozycji, kolejne po „Pokaż więcej”.
 * Mniej elementów w DOM i mniej obrazów (okładki, awatary) pobieranych przy otwarciu popupu.
 * Zmiana `resetKey` (np. wyszukiwanej frazy) wraca do pierwszej porcji. Po dorysowaniu fokus
 * przechodzi na pierwszą nową pozycję (oznaczoną `data-chunk-start`), bo przycisk może zniknąć.
 */
export function useChunks<T>(items: readonly T[], resetKey: unknown, size = CHUNK_SIZE) {
  const [limit, setLimit] = useState(size);
  const [key, setKey] = useState(resetKey);
  const focusFrom = useRef<number | null>(null);
  // Wartość atrybutu jest unikalna dla listy: kilka list w stosie popupów się nie myli.
  const listId = useId();
  if (key !== resetKey) {
    setKey(resetKey);
    setLimit(size);
  }

  useEffect(() => {
    const from = focusFrom.current;
    focusFrom.current = null;
    if (from === null) return;
    document
      .querySelector<HTMLElement>(
        `[data-chunk-start="${listId}${from}"] :is(a[href], button:not([disabled]))`,
      )
      ?.focus();
  }, [limit, listId]);

  const visible = items.slice(0, limit);
  return {
    visible,
    hidden: items.length - visible.length,
    /** Wartość `data-chunk-start` pozycji: pierwsza z nowej porcji (cel fokusu) albo brak. */
    chunkStart: (index: number) =>
      index === limit - size && index > 0 ? `${listId}${index}` : undefined,
    showMore: () => {
      focusFrom.current = limit;
      setLimit(limit + size);
    },
  };
}
