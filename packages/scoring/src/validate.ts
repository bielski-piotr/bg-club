/**
 * Walidacja kategorii i reguły miejsc notesu (PRD EDT-2…EDT-4, EDT-7, EDT-13).
 *
 * Zwraca listę problemów z kodem i ścieżką w szablonie (np. `ranking.tiebreak[1].line`),
 * bez tekstów interfejsu: komunikaty dobiera aplikacja. Pusta lista = szablon poprawny.
 */
import type { Direction, LineKind, Ranking, ScoringLine, TiebreakRule } from './template';
import { isComputed, isNumeric } from './template';
import { cyclicLines } from './totals';

export type ScoringIssueCode =
  /** Dwie kategorie o tym samym identyfikatorze. */
  | 'duplicate-line'
  /** Odwołanie do kategorii, której nie ma w notesie. */
  | 'unknown-line'
  /** Odwołanie do kategorii bez wartości liczbowej (imiona, puste pole). */
  | 'not-numeric'
  /** Suma zależy (pośrednio) od siebie. */
  | 'cycle'
  /** Zakres punktacji: min/max/krok niepełne, niecałkowite albo odwrócone. */
  | 'invalid-range'
  /** Lista dozwolonych wartości zawiera coś innego niż liczby całkowite. */
  | 'invalid-values'
  /** Notes musi mieć dokładnie jedną kategorię imion. */
  | 'names-count'
  /** Notes musi mieć co najmniej jedną punktację. */
  | 'no-input'
  /** `ranking` albo reguła remisu nie ma wymaganej postaci. */
  | 'invalid-ranking'
  /** Kierunek inny niż `desc` i `asc`. */
  | 'invalid-dir'
  /** Reguła po „wspólnym miejscu” albo „rozstrzyga prowadzący” nigdy nie zadziała. */
  | 'unreachable-rule';

export interface ScoringIssue {
  readonly code: ScoringIssueCode;
  /** Ścieżka w szablonie, np. `lines[2].of[0]`, `ranking.line`. */
  readonly path: string;
}

const isObject = (v: unknown): v is Record<string, unknown> =>
  typeof v === 'object' && v !== null && !Array.isArray(v);
const isInt = (v: unknown): v is number => typeof v === 'number' && Number.isInteger(v);
const isDir = (v: unknown): v is Direction => v === 'desc' || v === 'asc';

function lineIssues(lines: readonly ScoringLine[]): ScoringIssue[] {
  const issues: ScoringIssue[] = [];
  const byId = new Map<string, ScoringLine>();
  lines.forEach((l, i) => {
    if (byId.has(l.id)) issues.push({ code: 'duplicate-line', path: `lines[${i}].id` });
    else byId.set(l.id, l);
  });

  lines.forEach((l, i) => {
    const at = `lines[${i}]`;
    if (isComputed(l.kind))
      l.of?.forEach((id, k) => {
        const ref = byId.get(id);
        if (!ref) issues.push({ code: 'unknown-line', path: `${at}.of[${k}]` });
        else if (!isNumeric(ref.kind)) issues.push({ code: 'not-numeric', path: `${at}.of[${k}]` });
      });
    if (l.kind === 'input' && !l.free) {
      const hasMin = l.min !== undefined;
      const hasMax = l.max !== undefined;
      if (
        hasMin !== hasMax ||
        (hasMin && !isInt(l.min)) ||
        (hasMax && !isInt(l.max)) ||
        (isInt(l.min) && isInt(l.max) && l.min > l.max) ||
        (l.step !== undefined && !(isInt(l.step) && l.step >= 1))
      )
        issues.push({ code: 'invalid-range', path: at });
      if (l.values && !l.values.every(isInt)) issues.push({ code: 'invalid-values', path: at });
    }
  });

  const cyclic = new Set(cyclicLines({ lines }));
  lines.forEach((l, i) => {
    if (cyclic.has(l.id)) issues.push({ code: 'cycle', path: `lines[${i}]` });
  });

  const count = (kind: LineKind): number => lines.filter((l) => l.kind === kind).length;
  if (count('names') !== 1) issues.push({ code: 'names-count', path: 'lines' });
  if (count('input') < 1) issues.push({ code: 'no-input', path: 'lines' });
  return issues;
}

/** Wynik sprawdzenia `template.ranking`: reguła (gdy jest poprawna) i problemy. */
export interface ParsedRanking {
  /** `undefined`, gdy reguły nie ma (starszy plik) albo ma błędy. */
  readonly ranking: Ranking | undefined;
  readonly issues: readonly ScoringIssue[];
}

/**
 * Sprawdza `template.ranking` wczytane z pliku albo z bazy (EDT-7). Brak reguły jest poprawny
 * (starszy format). Zwraca kopię reguły bez nadmiarowych pól.
 */
export function parseRanking(raw: unknown, lines: readonly ScoringLine[]): ParsedRanking {
  if (raw === undefined) return { ranking: undefined, issues: [] };
  if (!isObject(raw))
    return { ranking: undefined, issues: [{ code: 'invalid-ranking', path: 'ranking' }] };
  const issues: ScoringIssue[] = [];
  const byId = new Map(lines.map((l) => [l.id, l]));
  const checkLine = (v: unknown, path: string): v is string => {
    if (typeof v !== 'string' || !v) {
      issues.push({ code: 'invalid-ranking', path });
      return false;
    }
    const ln = byId.get(v);
    if (!ln) issues.push({ code: 'unknown-line', path });
    else if (!isNumeric(ln.kind)) issues.push({ code: 'not-numeric', path });
    return !!ln && isNumeric(ln.kind);
  };
  const checkDir = (v: unknown, path: string): v is Direction => {
    if (!isDir(v)) issues.push({ code: 'invalid-dir', path });
    return isDir(v);
  };

  const okLine = checkLine(raw.line, 'ranking.line');
  const okDir = checkDir(raw.dir, 'ranking.dir');
  const tiebreak: TiebreakRule[] = [];
  if (!Array.isArray(raw.tiebreak))
    issues.push({ code: 'invalid-ranking', path: 'ranking.tiebreak' });
  else {
    let finalRule = false;
    raw.tiebreak.forEach((rule: unknown, k) => {
      const at = `ranking.tiebreak[${k}]`;
      if (finalRule) issues.push({ code: 'unreachable-rule', path: at });
      if (!isObject(rule)) {
        issues.push({ code: 'invalid-ranking', path: at });
        return;
      }
      if (rule.type === 'shared' || rule.type === 'manual') {
        finalRule = true;
        tiebreak.push({ type: rule.type });
      } else if (rule.type === 'line') {
        const okLine = checkLine(rule.line, `${at}.line`);
        const okDir = checkDir(rule.dir, `${at}.dir`);
        if (okLine && okDir)
          tiebreak.push({ type: 'line', line: rule.line as string, dir: rule.dir as Direction });
      } else issues.push({ code: 'invalid-ranking', path: `${at}.type` });
    });
  }
  if (issues.length || !okLine || !okDir) return { ranking: undefined, issues };
  return { ranking: { line: raw.line as string, dir: raw.dir as Direction, tiebreak }, issues };
}

/**
 * Pełna walidacja notesu pod kątem wyników: kategorie, sumy, zakresy i reguła miejsc.
 * `ranking` jest `unknown`, bo zwykle pochodzi z pliku albo z JSON-a w bazie.
 */
export function validateScoring(t: {
  readonly lines: readonly ScoringLine[];
  readonly ranking?: unknown;
}): ScoringIssue[] {
  return [...lineIssues(t.lines), ...parseRanking(t.ranking, t.lines).issues];
}
