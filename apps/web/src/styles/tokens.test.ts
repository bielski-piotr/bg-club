import { describe, expect, it } from 'vitest';
import { contrastRatio } from './contrast';
import css from './tokens.css?raw';

type Tokens = Readonly<Record<string, string>>;

/** Zmienne `--c-*` z pierwszego bloku pasującego do selektora. */
function block(selectorStart: string): Tokens {
  const start = css.indexOf(selectorStart);
  if (start < 0) throw new Error(`Brak bloku ${selectorStart}`);
  const open = css.indexOf('{', start);
  const close = css.indexOf('}', open);
  const body = css.slice(open + 1, close);
  return Object.fromEntries(
    [...body.matchAll(/--(c-[\w-]+):\s*(#[0-9a-fA-F]{6,8})\s*;/g)].map((m) => [
      m[1] as string,
      (m[2] as string).toLowerCase(),
    ]),
  );
}

const light = block(':root {');
const darkMedia = block(":root:not([data-theme='light'])");
const darkAttr = block(":root[data-theme='dark']");
const themes = { light, dark: { ...light, ...darkAttr } } as const;

function color(tokens: Tokens, name: string): string {
  const value = tokens[name];
  if (!value) throw new Error(`Brak tokenu --${name}`);
  return value;
}

/** Pary tekst/tło używane w komponentach; tekst wymaga 4,5:1 (WCAG AA, NFR-6). */
const textPairs: ReadonlyArray<readonly [string, string]> = [
  ['c-ink', 'c-page'],
  ['c-ink', 'c-surface'],
  ['c-ink', 'c-tint'],
  ['c-ink', 'c-accent-tint'],
  ['c-ink', 'c-danger-tint'],
  ['c-muted', 'c-page'],
  ['c-muted', 'c-surface'],
  ['c-muted', 'c-tint'],
  ['c-accent-text', 'c-page'],
  ['c-accent-text', 'c-surface'],
  ['c-accent-text', 'c-accent-tint'],
  ['c-accent-text', 'c-accent-tint-strong'],
  ['c-on-accent', 'c-accent'],
  ['c-on-accent', 'c-accent-hover'],
  ['c-on-accent', 'c-danger'],
  ['c-on-accent', 'c-danger-hover'],
  ['c-danger-text', 'c-surface'],
  ['c-danger-strong', 'c-danger-tint'],
  ['c-warning-text', 'c-warning-bg'],
  ['c-success-text', 'c-success-bg'],
  ['c-on-inverse', 'c-inverse'],
  ['c-on-inverse', 'c-inverse-hover'],
  ['c-toast-success', 'c-toast'],
  ['c-toast-error', 'c-toast'],
  ['c-on-avatar-removed', 'c-avatar-removed'],
  ['c-on-achievement', 'c-achievement'],
  ...Array.from({ length: 10 }, (_, i) => ['c-on-avatar', `c-avatar-${i}`] as const),
];

/** Elementy interfejsu (wypełniony checkbox, switch, obrys fokusu): 3:1 (WCAG 1.4.11). */
const uiPairs: ReadonlyArray<readonly [string, string]> = [
  ['c-accent', 'c-surface'],
  ['c-accent-text', 'c-surface'],
  ['c-accent-text', 'c-page'],
  ['c-danger-text', 'c-surface'],
  ['c-warning-icon', 'c-warning-bg'],
  // Kółko odblokowanej odznaki na karcie i pasek postępu na tle wyszarzonej odznaki.
  ['c-achievement', 'c-surface'],
  ['c-accent', 'c-tint'],
];

describe('tokeny motywów', () => {
  it('ciemny motyw systemowy i wymuszony mają te same wartości', () => {
    expect(darkMedia).toEqual(darkAttr);
  });

  it('ciemny motyw nadpisuje każdą powierzchnię i kolor tekstu', () => {
    for (const name of ['c-page', 'c-surface', 'c-border', 'c-tint', 'c-ink', 'c-muted']) {
      expect(darkAttr[name], name).toBeDefined();
      expect(darkAttr[name], name).not.toBe(light[name]);
    }
  });

  it('jasny motyw zachowuje kluczowe wartości hex z DS §3', () => {
    expect(light['c-page']).toBe('#f3f4f8');
    expect(light['c-surface']).toBe('#ffffff');
    expect(light['c-border']).toBe('#e4e7f0');
    expect(light['c-tint']).toBe('#f1f3f9');
    expect(light['c-ink']).toBe('#161a2b');
    expect(light['c-accent']).toBe('#2f54eb');
    expect(light['c-danger']).toBe('#d63a3a');
    expect(light['c-success-text']).toBe('#1f7a4d');
  });

  for (const [theme, tokens] of Object.entries(themes)) {
    describe(`motyw ${theme}`, () => {
      it.each(textPairs)('tekst %s na %s ma kontrast co najmniej 4,5:1', (fg, bg) => {
        expect(contrastRatio(color(tokens, fg), color(tokens, bg))).toBeGreaterThanOrEqual(4.5);
      });

      it.each(uiPairs)('element %s na %s ma kontrast co najmniej 3:1', (fg, bg) => {
        expect(contrastRatio(color(tokens, fg), color(tokens, bg))).toBeGreaterThanOrEqual(3);
      });
    });
  }
});

describe('contrastRatio', () => {
  it('liczy kontrast jak WCAG', () => {
    expect(contrastRatio('#000000', '#ffffff')).toBeCloseTo(21, 5);
    expect(contrastRatio('#2f54eb', '#ffffff')).toBeCloseTo(5.85, 2);
  });
});
