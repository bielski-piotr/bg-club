// Leniwie ładowany moduł z narzędziami szablonu (import i zapis notesu w aplikacji).
// Ładuje kod modelu notesu bez web componentów; typy dla aplikacji są w `template.d.ts`.
import { parseRanking, validateScoring } from '@bg-club/scoring';
import type { PadTemplate } from './core/templates';
import { padRanking, playerCount, validateTemplate } from './core/templates';
import type { PackedSheet, SheetResult, TestSheetOptions } from './core/test-sheet';
import { sheetResults as resultsOf, testSheet as sheetOf } from './core/test-sheet';
import type { ScorePadSheet } from './index';
import type { ReadTemplateResult } from './template';

const isObject = (v: unknown): v is Record<string, unknown> =>
  typeof v === 'object' && v !== null && !Array.isArray(v);

/**
 * Sprawdza szablon z pliku `.json` albo z edytora: kształt notesu
 * (`validateTemplate`), kategorie i regułę miejsc (`validateScoring`) oraz liczbę miejsc dla
 * graczy. Szablon z błędną regułą miejsc jest odrzucany, a nie naprawiany: zapis w bazie ma
 * zachowywać się dokładnie tak, jak zaprojektował go admin.
 */
export function readTemplate(raw: unknown): ReadTemplateResult {
  if (!isObject(raw) || raw.v !== 2) return { ok: false, reason: 'format' };
  const template: PadTemplate | null = validateTemplate(raw);
  if (!template) return { ok: false, reason: 'shape' };
  const issues = validateScoring({ lines: raw.lines as unknown[], ranking: raw.ranking }).filter(
    (issue) => issue.code !== 'unreachable-rule',
  );
  if (issues.length > 0) return { ok: false, reason: 'scoring', issues };
  // Martwe reguły (po „wspólnym miejscu”) nie wpływają na wynik; zapisujemy regułę bez nich.
  const ranking = parseRanking(raw.ranking, template.lines).ranking;
  return {
    ok: true,
    template: ranking ? { ...template, ranking } : template,
    playerSlots: playerCount(template),
  };
}

/**
 * Szablon z pliku notesu v2 (`format: "score-pad"`, `version: 2`): `template` albo aktywny
 * z listy `templates`. Inny plik (np. pliki ustawień albo format v1) daje `format`.
 */
export function readScorePadFile(raw: unknown): ReadTemplateResult {
  if (!isObject(raw) || raw.format !== 'score-pad' || raw.version !== 2) {
    return { ok: false, reason: 'format' };
  }
  const list = Array.isArray(raw.templates) ? raw.templates : [];
  const chosen =
    raw.template ??
    list.find((t: unknown) => isObject(t) && t.id === raw.active) ??
    (list.length === 1 ? list[0] : undefined);
  if (chosen === undefined) return { ok: false, reason: list.length > 1 ? 'many' : 'format' };
  return readTemplate(chosen);
}

/**
 * Kartka testowa kreatora: imiona „Gracz 1…n” i opcjonalnie losowe wpisy zgodne
 * z zakresami kategorii, z wymuszonym remisem na kategorii decydującej. `null` dla złego szablonu.
 */
export function testSheet(raw: unknown, opt?: TestSheetOptions): PackedSheet | null {
  const template = validateTemplate(raw);
  return template ? sheetOf(template, opt) : null;
}

/**
 * Miejsca graczy kartki według reguły notesu, jak przy oderwaniu karteczki w partii,
 * oraz kategoria reguły remisu, która rozstrzygnęła remis. Pusta lista dla złego szablonu.
 */
export function sheetResults(raw: unknown, sheet: ScorePadSheet): SheetResult[] {
  const template = validateTemplate(raw);
  return template ? resultsOf(template, sheet) : [];
}

/** Kategoria decydująca o miejscu według notesu (jawna reguła albo domyślna suma końcowa). */
export function rankingLine(raw: unknown): string {
  const template = validateTemplate(raw);
  return template ? padRanking(template).line : '';
}
