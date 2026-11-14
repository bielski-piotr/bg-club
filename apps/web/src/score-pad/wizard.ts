import type { ScorePadEditorStatus } from '@bg-club/score-pad';

/**
 * Kroki kreatora edytora notesu (PRD §5.5.2, DS §18): 1 Zdjęcie, 2 Obszar kartki,
 * 3 Mapowanie pól, 4 Kategorie, 5 Test i zapis.
 *
 * Kreator przechodzi do przodu tylko przez poprawne kroki, a do odwiedzonych kroków można
 * wracać bez utraty danych (stan trzyma edytor). Edycja istniejącego notesu i import pliku
 * `.json` otwierają kreator z wszystkimi krokami wykonanymi (`reached = 5`).
 */
export type WizardStep = 1 | 2 | 3 | 4 | 5;

export const WIZARD_STEPS: readonly WizardStep[] = [1, 2, 3, 4, 5];
export const LAST_STEP: WizardStep = 5;

/** Krok `<score-pad-editor>` pokazywany w kroku kreatora (kroki 4 i 5 potrzebują kartki z kroku 3). */
export function editorStepFor(step: WizardStep): 1 | 2 | 3 {
  return step === 1 ? 1 : step === 2 ? 2 : 3;
}

/** Czy krok jest poprawny, czyli czy można z niego przejść dalej. */
export function isStepValid(step: WizardStep, status: ScorePadEditorStatus | null): boolean {
  if (!status || status.busy) return false;
  switch (step) {
    case 1:
      return status.photo;
    case 2:
      // EDT-10: obszar kartki i nazwa notesu (ustawiana w tym kroku).
      return status.photo && status.area && status.settings.name.trim() !== '';
    case 3:
      return status.photo && status.area && status.seats > 0 && status.lines.length > 0;
    case 4:
    case 5:
      return status.photo && status.area && status.fields === null;
  }
}

/**
 * Czy z kroku `current` można otworzyć krok `target`: wstecz zawsze, do przodu najwyżej o jeden
 * krok za najdalszym odwiedzonym (`reached`) i tylko przez poprawne kroki.
 */
export function canOpenStep(
  target: WizardStep,
  current: WizardStep,
  reached: WizardStep,
  status: ScorePadEditorStatus | null,
): boolean {
  if (target <= current) return true;
  if (target > reached + 1) return false;
  for (let step = 1; step < target; step++) {
    if (!isStepValid(step as WizardStep, status)) return false;
  }
  return true;
}

export type StepState = 'current' | 'done' | 'upcoming';

/** Wygląd pigułki kroku (DS §15): bieżący, wykonany (odwiedzony i poprawny) albo kolejny. */
export function stepState(
  step: WizardStep,
  current: WizardStep,
  reached: WizardStep,
  status: ScorePadEditorStatus | null,
): StepState {
  if (step === current) return 'current';
  // Ostatni krok kończy zapis, więc nie bywa „wykonany”.
  if (step < LAST_STEP && step <= reached && isStepValid(step, status)) return 'done';
  return 'upcoming';
}

/** Kolejny krok (do przodu) albo poprzedni. */
export function nextStep(step: WizardStep): WizardStep {
  return Math.min(LAST_STEP, step + 1) as WizardStep;
}

export function previousStep(step: WizardStep): WizardStep {
  return Math.max(1, step - 1) as WizardStep;
}

/** Plik notesu `.json` (import w kroku 1) zamiast zdjęcia. */
export function isJsonFile(file: File | Blob): boolean {
  return file.type === 'application/json' || ('name' in file && /\.json$/i.test(String(file.name)));
}

/** Plik, który nie jest obrazem (typ znany i inny niż `image/*`). */
export function isNotImage(file: File | Blob): boolean {
  return file.type !== '' && !file.type.startsWith('image/');
}

/** Pierwszy obraz ze schowka (wklejenie Ctrl+V, EDT-9). */
export function imageFromClipboard(data: DataTransfer | null): File | null {
  for (const item of Array.from(data?.items ?? [])) {
    if (item.kind === 'file' && item.type.startsWith('image/')) return item.getAsFile();
  }
  return null;
}
