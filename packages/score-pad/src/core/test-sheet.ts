// Kartka testowa kreatora: fikcyjni gracze, losowe wpisy zgodne z zakresami kategorii
// i wynik liczony tymi samymi regułami co oderwanie karteczki w partii. Logika bez DOM i sceny.

import type { ScorePadSheet } from '../index';
import type { PadConfig } from './settings';
import { unpackSheet } from './settings';
import type { LineDef, PadTemplate } from './templates';
import {
  bounds,
  computePlayer,
  hasRange,
  isAllowed,
  padRanking,
  playerActive,
  playerCount,
  rankSheet,
  spots,
  valuesOf,
} from './templates';

export type PackedSheet = NonNullable<PadConfig['sheet']>;

/** Losowanie: liczba z [0, 1), jak `Math.random` (w testach deterministyczna). */
export type Random = () => number;

/** Fikcyjne imię gracza na miejscu `p` (0…n−1). */
export const testPlayerName = (p: number): string => `Gracz ${p + 1}`;

/** Zakres losowania kategorii o dowolnej liczbie: typowe punkty w grach planszowych. */
const FREE_PICK = { min: 0, max: 30 };

/** Ile prób losowania na wymuszenie remisu, zanim gracz dostanie kopię wpisów lidera. */
const TIE_TRIES = 4000;

const pick = <T>(list: readonly T[], random: Random): T =>
  list[Math.min(list.length - 1, Math.floor(random() * list.length))] as T;

/** Losowa wartość dozwolona w kategorii (lista wartości, zakres min–max–krok albo dowolna). */
export function randomValue(line: LineDef, random: Random = Math.random): number {
  const b = bounds(line);
  if (!line.free && !hasRange(line) && line.values?.length) return pick(line.values, random);
  const min = line.free ? Math.max(b.min, FREE_PICK.min) : b.min;
  const max = line.free ? Math.min(b.max, FREE_PICK.max) : b.max;
  const steps = Math.floor((max - min) / b.step);
  const value = min + Math.floor(random() * (steps + 1)) * b.step;
  return isAllowed(line, value) ? value : b.min;
}

/** Pole do wpisania kategorii gracza: pole siatki albo pierwsze pole dowolne tej kategorii. */
interface Target {
  readonly line: string;
  readonly field?: string | undefined;
}

function targetsOf(t: PadTemplate, p: number): Target[] {
  const out = new Map<string, Target>();
  for (const s of spots(t)) {
    const line = t.lines[s.li];
    if (s.p !== p || !line || line.kind !== 'input' || out.has(line.id)) continue;
    out.set(line.id, { line: line.id, field: s.field });
  }
  return [...out.values()];
}

type Values = Record<string, number>;

/** Kartka z imionami „Gracz 1…n” i wpisami graczy (`values[p]`: kategoria → wartość). */
function pack(t: PadTemplate, values: readonly Values[]): PackedSheet {
  const n = playerCount(t);
  const cells: Record<string, (number | null)[]> = {};
  const free: Record<string, number | null> = {};
  for (let p = 0; p < n; p++) {
    for (const target of targetsOf(t, p)) {
      const v = values[p]?.[target.line];
      if (v === undefined) continue;
      if (target.field) free[target.field] = v;
      else (cells[target.line] ??= Array<number | null>(n).fill(null))[p] = v;
    }
  }
  return {
    game: 1,
    started: null,
    names: Array.from({ length: n }, (_, p) => testPlayerName(p)),
    cells,
    ...(Object.keys(free).length ? { free } : {}),
  };
}

function randomPlayer(t: PadTemplate, p: number, random: Random): Values {
  const lines = new Map(t.lines.map((l) => [l.id, l]));
  const out: Values = {};
  for (const target of targetsOf(t, p)) {
    const line = lines.get(target.line);
    if (line) out[target.line] = randomValue(line, random);
  }
  return out;
}

/** Wartość kategorii (punktacji, sumy albo wyniku końcowego) dla wpisów gracza. */
function lineValue(t: PadTemplate, values: Values, line: string): number | null {
  const kind = t.lines.find((l) => l.id === line)?.kind;
  const v = kind === 'input' ? values[line] : computePlayer(t, values)[line];
  return typeof v === 'number' && Number.isFinite(v) ? v : null;
}

export interface TestSheetOptions {
  /** Losowe wpisy zgodne z zakresami; bez tego kartka ma tylko imiona. */
  readonly fill?: boolean | undefined;
  /**
   * Wymuś remis: drugi gracz ma tę samą wartość kategorii decydującej co prowadzący, więc o jego
   * miejscu decydują reguły remisów (a gdy żadna nie rozstrzyga, wspólne miejsce).
   */
  readonly tie?: boolean | undefined;
  readonly random?: Random | undefined;
}

/**
 * Kartka testowa w formacie pliku notesu (`sheet`): imiona „Gracz 1…n” i opcjonalnie losowe wpisy
 * w każdej kategorii punktowej każdego miejsca.
 */
export function testSheet(t: PadTemplate, opt: TestSheetOptions = {}): PackedSheet {
  const n = playerCount(t);
  const random = opt.random ?? Math.random;
  if (!opt.fill) return pack(t, []);
  const values = Array.from({ length: n }, (_, p) => randomPlayer(t, p, random));
  if (opt.tie && n >= 2) forceTie(t, values, random);
  return pack(t, values);
}

/**
 * Remis o 1. miejsce na kategorii decydującej: wybrany gracz dostaje nowe losowe wpisy z tą samą
 * wartością co lider. Gdy notes ma reguły remisu, najpierw szukamy wpisów, które pierwsza z nich
 * rozstrzyga (żeby było widać jej działanie); w ostateczności gracz dostaje kopię wpisów lidera.
 */
function forceTie(t: PadTemplate, values: Values[], random: Random): void {
  const ranking = padRanking(t);
  const ranked = rankSheet(
    t,
    values.map((v, seat) => ({ seat, values: v })),
  );
  const leader = ranked[0]?.seat ?? 0;
  const others = values.map((_, p) => p).filter((p) => p !== leader);
  const chosen = pick(others, random);
  const target = lineValue(t, values[leader] as Values, ranking.line);
  const rule = ranking.tiebreak[0];
  const breaker = rule?.type === 'line' ? rule.line : null;
  const leaderBreak = breaker ? lineValue(t, values[leader] as Values, breaker) : null;
  let equal: Values | null = null;
  for (let i = 0; i < TIE_TRIES; i++) {
    const candidate = randomPlayer(t, chosen, random);
    if (lineValue(t, candidate, ranking.line) !== target) continue;
    if (!breaker || lineValue(t, candidate, breaker) !== leaderBreak) {
      values[chosen] = candidate;
      return;
    }
    equal ??= candidate;
  }
  values[chosen] = equal ?? copyPlayer(t, values[leader] as Values, chosen);
}

/** Wpisy lidera przeniesione na miejsce `p` (kategorie, które to miejsce ma na kartce). */
function copyPlayer(t: PadTemplate, from: Values, p: number): Values {
  const out: Values = {};
  for (const target of targetsOf(t, p)) {
    const v = from[target.line];
    if (v !== undefined) out[target.line] = v;
  }
  return out;
}

/** Wynik gracza kartki testowej (podsumowanie w kroku „Test i zapis”). */
export interface SheetResult {
  readonly seat: number;
  readonly name: string;
  readonly place: number;
  /** Wspólne miejsce z innymi graczami. */
  readonly tied: boolean;
  /** Wartość kategorii decydującej (pusta, gdy gracz jej nie ma). */
  readonly value: number | null;
  /** Kategoria z reguł remisów, która rozstrzygnęła remis tego gracza na kategorii decydującej. */
  readonly decidedBy: string | null;
}

/**
 * Miejsca graczy kartki według reguły notesu, tak jak przy oderwaniu karteczki w partii:
 * liczą się gracze z imieniem albo dowolnym wpisem, wynik jest w kolejności miejsc.
 */
export function sheetResults(t: PadTemplate, sheet: ScorePadSheet): SheetResult[] {
  // `unpackSheet` tylko czyta wpisy.
  const data = unpackSheet(sheet as PackedSheet, t);
  const n = playerCount(t);
  const players: { seat: number; values: Record<string, number | null> }[] = [];
  for (let p = 0; p < n; p++)
    if (playerActive(t, data, p)) players.push({ seat: p, values: valuesOf(t, data, p) });
  const ranked = rankSheet(t, players);
  const ranking = padRanking(t);
  // Reguły po pierwszym „wspólnym miejscu” (albo „rozstrzyga prowadzący”) nie działają.
  const stop = ranking.tiebreak.findIndex((r) => r.type !== 'line');
  const rules = (stop < 0 ? ranking.tiebreak : ranking.tiebreak.slice(0, stop)).flatMap((r) =>
    r.type === 'line' ? [r.line] : [],
  );
  const valueOf = (r: (typeof ranked)[number], line: string): number | null => {
    const kind = t.lines.find((l) => l.id === line)?.kind;
    const v = kind === 'input' ? r.values[line] : r.totals[line];
    return typeof v === 'number' && Number.isFinite(v) ? v : null;
  };
  return ranked.map((r) => {
    // Remis na kategorii decydującej rozdzielony regułami: dla każdego innego gracza z tą samą
    // wartością, ale innym miejscem, pierwsza reguła, na której się różnią, to ta, która ich
    // rozdzieliła. Najgłębsza z nich dokończyła rozstrzyganie remisu tego gracza.
    let deepest = -1;
    if (!r.tied) {
      for (const o of ranked) {
        if (o === r || o.rankingValue !== r.rankingValue || o.place === r.place) continue;
        const k = rules.findIndex((line) => valueOf(o, line) !== valueOf(r, line));
        if (k > deepest) deepest = k;
      }
    }
    // Gracz na wspólnym miejscu ma remis nierozstrzygnięty, więc nie podajemy reguły.
    const decidedBy = deepest >= 0 ? (rules[deepest] ?? null) : null;
    return {
      seat: r.seat,
      name: data.names[r.seat]?.text || testPlayerName(r.seat),
      place: r.place,
      tied: r.tied,
      value: r.rankingValue,
      decidedBy,
    };
  });
}
