// Wpisywanie punktów bezpośrednio w pole kartki (PAD-13…PAD-15): logika bez DOM i sceny.

import type { LineDef, PadTemplate, Spot } from './templates';
import { describeValues, isAllowed, playerCount, spots, stepValue } from './templates';

/** Najwięcej cyfr w polu (bez znaku). */
export const MAX_DIGITS = 5;

/**
 * Zostawia w tekście tylko cyfry i ewentualny minus na początku. Nieparzysta liczba minusów
 * oznacza liczbę ujemną (minus wpisany w dowolnym miejscu zmienia znak), ale tylko wtedy,
 * gdy kategoria dopuszcza wartości ujemne (`neg`).
 */
export function cleanNumber(raw: string, neg: boolean): string {
  const t = raw.replace(/[−‒–—﹣－]/g, '-');
  const minus = neg && (t.match(/-/g)?.length ?? 0) % 2 === 1;
  const digits = t
    .replace(/\D+/g, '')
    .replace(/^0+(?=\d)/, '')
    .slice(0, MAX_DIGITS);
  return (minus ? '-' : '') + digits;
}

/** Tekst ze zmienionym znakiem (minus na początku dodany albo usunięty). */
export function flipSign(text: string, force?: boolean): string {
  const isNeg = text.startsWith('-');
  const want = force ?? !isNeg;
  return (want ? '-' : '') + text.replace(/^-/, '');
}

export interface Typed {
  /** Wpisana liczba, gdy pasuje do kategorii; `null` dla pustego pola albo błędu. */
  value: number | null;
  /** Komunikat błędu przy polu (pusty, gdy wpis jest poprawny albo pusty). */
  error: string;
}

/** Sprawdza tekst wpisany w pole kategorii (zakres min/max/krok albo lista wartości). */
export function checkTyped(line: LineDef, text: string): Typed {
  if (!text || text === '-') return { value: null, error: '' };
  const n = parseInt(text, 10);
  if (isAllowed(line, n)) return { value: n, error: '' };
  return { value: null, error: `Ta kategoria przyjmuje: ${describeValues(line)}.` };
}

/** Strzałka góra (`dir` = 1) albo dół: następna dozwolona wartość jako tekst pola. */
export function stepTyped(line: LineDef, text: string, dir: 1 | -1): string {
  const cur = parseInt(text, 10);
  return String(stepValue(line, Number.isFinite(cur) ? cur : null, dir));
}

/**
 * Następne (`dir` = 1) albo poprzednie pole kategorii punktowej tego samego gracza; po ostatnim
 * fokus przechodzi do pierwszego pola następnego gracza (Shift+Tab: do ostatniego poprzedniego).
 * Pomija pola imion, sumy, premie i pola bez wpisu (PAD-15).
 */
export function nextInput(t: PadTemplate, sp: Spot, dir: 1 | -1): Spot | null {
  const n = playerCount(t);
  const ins = spots(t).filter((x) => t.lines[x.li].kind === 'input');
  if (!ins.length || !n) return null;
  const by = (p: number): Spot[] => ins.filter((x) => x.p === p);
  let p = sp.p;
  let list = by(p);
  let k = list.findIndex((x) => x.key === sp.key) + dir;
  for (let guard = 0; guard <= n && (k < 0 || k >= list.length); guard++) {
    p = (p + dir + n) % n;
    list = by(p);
    k = dir > 0 ? 0 : list.length - 1;
  }
  return list[k] ?? null;
}

export interface Box {
  x: number;
  y: number;
  w: number;
  h: number;
}

/**
 * O ile przesunąć widok (w pikselach ekranu), żeby pole `cell` znalazło się w widocznym obszarze
 * `view` z marginesem `pad` (PAD-15: widok przewija się do zaznaczonego pola). Zero, gdy pole
 * jest widoczne; pole większe niż obszar jest wyśrodkowane.
 */
export function revealShift(cell: Box, view: Box, pad: number): { dx: number; dy: number } {
  const axis = (a: number, len: number, v: number, vlen: number): number => {
    const lo = v + pad;
    const hi = v + vlen - pad;
    if (len > hi - lo) return a + len / 2 - (v + vlen / 2);
    if (a < lo) return a - lo;
    if (a + len > hi) return a + len - hi;
    return 0;
  };
  return { dx: axis(cell.x, cell.w, view.x, view.w), dy: axis(cell.y, cell.h, view.y, view.h) };
}
