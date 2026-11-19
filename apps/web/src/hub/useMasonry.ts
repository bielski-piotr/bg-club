import { useLayoutEffect, type RefObject } from 'react';

/** Szerokość, od której hub ma dwie kolumny po 520 px (1064 + marginesy). */
export const TWO_COLUMNS_QUERY = '(min-width: 1112px)';

/** Odstęp między kartami w kolumnie (gap 24). */
const GAP = 24;

/**
 * Dwie kolumny o niezależnych wysokościach przy zachowanej kolejności dokumentu (czytnik
 * ekranu i Tab idą 1 Spotkanie, 2 Ranking, 3 Timeline, 4 Kolekcja, 5 Członkowie).
 *
 * Z klasą `hub__grid--masonry` siatka ma wiersze po 1 px (`grid-auto-rows: 1px`), a kolumnę każdej
 * karty ustala CSS. Hook
 * mierzy karty i ustawia im `grid-row-end: span <wysokość + odstęp>`; siatka układa wtedy karty
 * jednej kolumny jedna pod drugą, niezależnie od drugiej kolumny. Poniżej progu (telefon,
 * wąskie okno) style są zdejmowane i karty tworzą jedną kolumnę. Bez ResizeObserver zostają
 * zwykłe dwie kolumny ze wspólnymi wierszami.
 */
export function useMasonry(container: RefObject<HTMLElement | null>) {
  useLayoutEffect(() => {
    const root = container.current;
    if (!root || typeof ResizeObserver === 'undefined' || !window.matchMedia) return;
    const query = window.matchMedia(TWO_COLUMNS_QUERY);
    const items = () => Array.from(root.children) as HTMLElement[];

    const layout = () => {
      root.classList.toggle('hub__grid--masonry', query.matches);
      for (const item of items()) {
        if (query.matches) {
          const height = item.firstElementChild?.getBoundingClientRect().height ?? 0;
          item.style.gridRowEnd = `span ${Math.ceil(height) + GAP}`;
        } else {
          item.style.removeProperty('grid-row-end');
        }
      }
    };

    const observer = new ResizeObserver(layout);
    for (const item of items()) {
      if (item.firstElementChild) observer.observe(item.firstElementChild);
    }
    query.addEventListener('change', layout);
    layout();
    return () => {
      observer.disconnect();
      query.removeEventListener('change', layout);
      root.classList.remove('hub__grid--masonry');
      for (const item of items()) item.style.removeProperty('grid-row-end');
    };
  }, [container]);
}
