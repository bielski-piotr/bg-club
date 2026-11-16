import { describe, expect, it } from 'vitest';
import { AVATAR_PALETTE_SIZE, monogram, paletteColor, paletteIndex } from './avatarUtils';

describe('monogram', () => {
  it('bierze pierwszą literę imienia i nazwiska', () => {
    expect(monogram('Bartek Wójcik')).toBe('BW');
    expect(monogram('łukasz żak')).toBe('ŁŻ');
  });

  it('przy kilku słowach bierze pierwsze i ostatnie', () => {
    expect(monogram('  Anna Maria  Wiśniewska ')).toBe('AW');
  });

  it('jedno słowo daje jedną literę, pusty tekst znak zapytania', () => {
    expect(monogram('Ania')).toBe('A');
    expect(monogram('   ')).toBe('?');
  });
});

describe('paletteIndex', () => {
  it('jest stały i mieści się w palecie', () => {
    for (const seed of ['a', 'member-1', '5f1c0a1e-2b6c-4d7e-9f00-123456789abc', '']) {
      const index = paletteIndex(seed);
      expect(index).toBe(paletteIndex(seed));
      expect(index).toBeGreaterThanOrEqual(0);
      expect(index).toBeLessThan(AVATAR_PALETTE_SIZE);
    }
  });

  it('rozkłada różne identyfikatory na wiele kolorów', () => {
    const used = new Set(Array.from({ length: 100 }, (_, i) => paletteIndex(`profil-${i}`)));
    expect(used.size).toBe(AVATAR_PALETTE_SIZE);
  });
});

describe('paletteColor', () => {
  it('zawija indeks do palety', () => {
    expect(paletteColor(3)).toBe('var(--c-avatar-3)');
    expect(paletteColor(13)).toBe('var(--c-avatar-3)');
    expect(paletteColor(-1)).toBe('var(--c-avatar-9)');
  });
});
