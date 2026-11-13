import { pl, type Messages } from './pl';

export type { Messages };

/** Aktywny słownik tekstów. Aplikacja jest po polsku (PRD §1.1, D16). */
export const t: Messages = pl;

export type FormatParams = Readonly<Record<string, string | number>>;

/**
 * Podstawia parametry `{nazwa}` w tekście. Nieznany parametr zostaje bez zmian,
 * żeby brak wartości był widoczny, a nie cichy.
 */
export function format(template: string, params: FormatParams): string {
  return template.replace(/\{(\w+)\}/g, (match, key: string) => {
    const value = params[key];
    return value === undefined ? match : String(value);
  });
}
