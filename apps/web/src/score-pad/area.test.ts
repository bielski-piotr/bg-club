import { describe, expect, it } from 'vitest';
import { SPINE_COLORS, areaHint, parseCm } from './area';

/** Pomocnicze kroku 2 „Obszar kartki” (EDT-10, DS §18). */
describe('obszar kartki w kreatorze', () => {
  it('kolory grzbietu: paleta awatarów DS §3 i granat, dosłowne wartości #rrggbb', () => {
    expect(SPINE_COLORS).toHaveLength(11);
    expect(SPINE_COLORS.at(-1)).toBe('#161a2b');
    for (const color of SPINE_COLORS) expect(color).toMatch(/^#[0-9a-f]{6}$/);
  });

  it('rozmiar w centymetrach z przecinkiem albo kropką', () => {
    expect(parseCm('10,5')).toBe(10.5);
    expect(parseCm(' 14.8 ')).toBe(14.8);
    expect(parseCm('')).toBeNull();
    expect(parseCm('abc')).toBeNull();
    expect(parseCm('-2')).toBeNull();
  });

  it('podpowiedź zależy od trybu i wyniku wykrywania', () => {
    expect(areaHint({ mode: 'full', detected: 'shape' })).toMatch(/całe zdjęcie/);
    expect(areaHint({ mode: 'manual', detected: null })).toMatch(/dwuklik/);
    expect(areaHint({ mode: 'auto', detected: 'shape' })).toMatch(/kształt kartki: \{points\}/);
    expect(areaHint({ mode: 'auto', detected: 'missing' })).toMatch(/Nie udało się/);
    expect(areaHint({ mode: 'auto', detected: 'sheet' })).toMatch(/Wykryto kartkę/);
  });
});
