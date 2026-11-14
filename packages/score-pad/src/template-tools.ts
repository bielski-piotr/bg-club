// Leniwie ładowany moduł z narzędziami szablonu (import i zapis notesu w aplikacji, zadanie [015]).
// Ładuje kod modelu notesu bez web componentów; typy dla aplikacji są w `template.d.ts`.
import { parseRanking, validateScoring } from '@bg-club/scoring';
import type { PadTemplate } from './core/templates';
import { playerCount, validateTemplate } from './core/templates';
import type { ReadTemplateResult } from './template';

const isObject = (v: unknown): v is Record<string, unknown> =>
  typeof v === 'object' && v !== null && !Array.isArray(v);

/**
 * Sprawdza szablon z pliku `.json` albo z edytora (EDT-7, EDT-8, EDT-13): kształt notesu
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
