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

export interface PluralForms {
  /** 1 (np. „1 głos”). */
  readonly one: string;
  /** 2–4, 22–24, … bez 12–14 (np. „3 głosy”). */
  readonly few: string;
  /** 0, 5–21, 25–31, … (np. „5 głosów”). */
  readonly many: string;
}

const pluralRules = new Intl.PluralRules('pl-PL');

/** Wybiera polską formę liczby mnogiej i podstawia `{n}` oraz pozostałe parametry. */
export function plural(n: number, forms: PluralForms, params: FormatParams = {}): string {
  const rule = Number.isInteger(n) ? pluralRules.select(n) : 'other';
  const template = rule === 'one' ? forms.one : rule === 'few' ? forms.few : forms.many;
  return format(template, { ...params, n });
}
