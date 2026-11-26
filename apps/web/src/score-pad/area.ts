import type { ScorePadEditorArea } from '@bg-club/score-pad';
import { t } from '../i18n';

/**
 * Kolory grzbietu notesu: paleta awatarów (wartości źródłowe)
 * i granat #161A2B. Wartość trafia do szablonu notesu (`tape`), więc to dosłowne kolory, nie tokeny.
 */
export const SPINE_COLORS: readonly string[] = [
  '#e09f1f',
  '#e4572e',
  '#c8553d',
  '#6c8e3b',
  '#2e86ab',
  '#8e5bd6',
  '#3a9d6e',
  '#d9479a',
  '#4b6bdb',
  '#2a9d8f',
  '#161a2b',
];

/** Rozmiar kartki z pola (przecinek albo kropka); null dla pustej albo niepoprawnej wartości. */
export function parseCm(raw: string): number | null {
  const value = Number(raw.trim().replace(',', '.'));
  if (raw.trim() === '' || !Number.isFinite(value) || value <= 0) return null;
  return value;
}

/** Zakres rozmiaru kartki w edytorze (3–60 cm, co 0,1 cm). */
export function clampCm(value: number): number {
  return Math.round(Math.min(60, Math.max(3, value)) * 10) / 10;
}

/** Rozmiar w polu: polski przecinek dziesiętny. */
export function formatCm(value: number): string {
  return String(value).replace('.', ',');
}

/** Podpowiedź pod wyborem sposobu wyznaczenia obszaru (szablon z `{points}`). */
export function areaHint(settings: Pick<ScorePadEditorArea, 'mode'>): string {
  const hints = t.scorepads.wizard.area.hints;
  return settings.mode === 'full' ? hints.full : hints.manual;
}
