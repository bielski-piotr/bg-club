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
