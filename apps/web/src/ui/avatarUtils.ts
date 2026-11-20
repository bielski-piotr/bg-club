/** Liczba kolorów palety awatarów i okładek (tokeny `--c-avatar-0…9`). */
export const AVATAR_PALETTE_SIZE = 10;

/**
 * Monogram: pierwsza litera pierwszego i ostatniego słowa, np. „Łukasz Żak” → „ŁŻ”.
 * Jedno słowo daje jedną literę.
 */
export function monogram(name: string): string {
  const words = name
    .trim()
    .split(/\s+/)
    .filter((w) => w !== '');
  const first = words[0];
  if (!first) return '?';
  const initial = (word: string) => Array.from(word)[0] ?? '';
  const last = words.length > 1 ? words[words.length - 1] : undefined;
  return (initial(first) + (last ? initial(last) : '')).toLocaleUpperCase('pl-PL');
}

/** Stały indeks koloru palety dla klucza (np. hooka profilu). */
export function paletteIndex(seed: string): number {
  let hash = 5381;
  for (let i = 0; i < seed.length; i += 1) {
    hash = (Math.imul(hash, 33) + seed.charCodeAt(i)) | 0;
  }
  return Math.abs(hash) % AVATAR_PALETTE_SIZE;
}

/** Wartość CSS koloru palety. */
export function paletteColor(index: number): string {
  const safe = ((index % AVATAR_PALETTE_SIZE) + AVATAR_PALETTE_SIZE) % AVATAR_PALETTE_SIZE;
  return `var(--c-avatar-${safe})`;
}
