import type { ScorePadEditorCategory, ScoringIssue } from '@bg-club/score-pad';
import { format, t } from '../i18n';

const text = t.scorepads.wizard.categories;

/** Nazwa kategorii do pokazania (pusta nazwa: „Kategoria 3”). */
export function lineLabel(line: Pick<ScorePadEditorCategory, 'label'>, index: number): string {
  return line.label.trim() || format(text.unnamed, { n: index + 1 });
}

/** Liczba całkowita z pola (spacje dookoła i „−” jako minus są dozwolone) albo null. */
export function parseInteger(raw: string): number | null {
  const value = raw.trim().replace(/^[−–]/, '-');
  if (!/^-?\d{1,6}$/.test(value)) return null;
  return Number(value);
}

/** Lista liczb całkowitych oddzielonych przecinkami, średnikami lub spacjami albo null. */
export function parseIntegers(raw: string): number[] | null {
  const parts = raw
    .split(/[,;\s]+/)
    .map((part) => part.trim())
    .filter((part) => part !== '');
  const values = parts.map(parseInteger);
  return values.every((value) => value !== null) ? (values as number[]) : null;
}

/** Indeks kategorii, której dotyczy problem (`lines[3]…`), albo null. */
export function issueLine(issue: ScoringIssue): number | null {
  const match = /^lines\[(\d+)\]/.exec(issue.path);
  return match ? Number(match[1]) : null;
}

/** Komunikat problemu walidatora po polsku. */
export function issueMessage(
  issue: ScoringIssue,
  lines: readonly Pick<ScorePadEditorCategory, 'label'>[],
): string {
  const index = issueLine(issue);
  const line = index === null ? undefined : lines[index];
  const name = line && index !== null ? lineLabel(line, index) : '';
  if (issue.code === 'not-numeric' && issue.path.startsWith('ranking'))
    return text.issues['not-numeric-ranking'];
  return format(text.issues[issue.code], { name });
}

/** Komunikaty wszystkich problemów, bez powtórzeń. */
export function issueMessages(
  issues: readonly ScoringIssue[],
  lines: readonly Pick<ScorePadEditorCategory, 'label'>[],
): string[] {
  return [...new Set(issues.map((issue) => issueMessage(issue, lines)))];
}

/** Komunikaty problemów jednej kategorii (pokazywane przy jej polach). */
export function categoryIssueMessages(
  issues: readonly ScoringIssue[],
  lines: readonly Pick<ScorePadEditorCategory, 'label'>[],
  index: number,
): string[] {
  return issueMessages(
    issues.filter((issue) => issueLine(issue) === index),
    lines,
  );
}
