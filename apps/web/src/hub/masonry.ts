/** Width from which the hub has two equal columns. */
export const TWO_COLUMNS_QUERY = '(min-width: 1112px)';

/** Odstęp między kartami w kolumnie (gap 24). */
const GAP = 24;

/**
 * Dwie kolumny o niezależnych wysokościach przy zachowanej kolejności dokumentu (czytnik
 * ekranu i Tab idą 1 Spotkanie, 2 Ranking, 3 Timeline, 4 Kolekcja, 5 Członkowie).
 *
 * Z klasą `hub__grid--masonry` siatka ma wiersze po 1 px (`grid-auto-rows: 1px`), a kolumnę
 * każdej karty ustala CSS. Funkcja mierzy karty (pierwsze dziecko każdego slotu) i ustawia
 * slotom `grid-row-end: span <wysokość + odstęp>`; siatka układa wtedy karty jednej kolumny
 * jedna pod drugą, niezależnie od drugiej kolumny. Poniżej progu (telefon, wąskie okno) style
 * są zdejmowane i karty tworzą jedną kolumnę. Bez ResizeObserver zostają zwykłe dwie kolumny
 * wspólnymi wierszami. Widżet może podmienić swój element (np. szkielet → karta): nowy element
 * jest mierzony od razu. Zwraca sprzątanie.
 */
export function masonry(root: HTMLElement): () => void {
  if (typeof ResizeObserver === 'undefined' || !window.matchMedia) return () => undefined;
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

  const resizes = new ResizeObserver(layout);
  const observed = new Set<Element>();
  const watch = () => {
    for (const element of observed) {
      if (element.isConnected) continue;
      resizes.unobserve(element);
      observed.delete(element);
    }
    for (const item of items()) {
      const card = item.firstElementChild;
      if (card && !observed.has(card)) {
        resizes.observe(card);
        observed.add(card);
      }
    }
  };
  const swaps = new MutationObserver(() => {
    watch();
    layout();
  });
  for (const item of items()) swaps.observe(item, { childList: true });
  watch();
  query.addEventListener('change', layout);
  layout();
  return () => {
    swaps.disconnect();
    resizes.disconnect();
    query.removeEventListener('change', layout);
    root.classList.remove('hub__grid--masonry');
    for (const item of items()) item.style.removeProperty('grid-row-end');
  };
}
