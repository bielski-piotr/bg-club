import { describe, expect, it } from 'vitest';
import { SPINE_COLORS, areaHint, clampCm, formatCm, parseCm } from './area';

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

  it('rozmiar jak w edytorze: 3–60 cm, co 0,1 cm, z przecinkiem', () => {
    expect(clampCm(100)).toBe(60);
    expect(clampCm(0.5)).toBe(3);
    expect(clampCm(14.84)).toBe(14.8);
    expect(formatCm(10.5)).toBe('10,5');
  });

  it('podpowiedź zależy od trybu (bez automatycznego wykrywania kartki)', () => {
    expect(areaHint({ mode: 'full' })).toMatch(/całe zdjęcie/);
    expect(areaHint({ mode: 'full' })).toMatch(/Przeciągnij narożnik/);
    expect(areaHint({ mode: 'manual' })).toMatch(/dwuklik/);
    expect(areaHint({ mode: 'manual' })).toMatch(/\{points\}/);
  });
});
