import type {
  ScorePadEditorAreaPatch,
  ScorePadEditorCategoriesAction,
  ScorePadEditorMappingAction,
  ScorePadEditorEventMap,
  ScorePadEditorStatus,
  ScorePadFile,
  ScorePadTemplate,
} from '@bg-club/score-pad';
import { useEffect, useImperativeHandle, useRef, type Ref } from 'react';
import { t } from '../i18n';
import { cx } from '../ui/cx';
import { useTheme } from '../theme/useTheme';
import { ScorePadStatus } from './ScorePadStatus';
import { useScorePadElement, type ScorePadLoadState } from './useScorePadElement';
import './scorePad.css';

export interface ScorePadEditorViewProps {
  /** Notes do poprawienia; bez niego edytor zaczyna od zdjęcia. */
  readonly template?: ScorePadTemplate | undefined;
  /** Plik notesu po „Zapisz do pliku” lub „Kopiuj do schowka” (zapis w bazie osobno). */
  readonly onExport?: ((config: ScorePadFile, via: 'file' | 'clipboard') => void) | undefined;
  readonly className?: string | undefined;
  /**
   * Tryb kreatora: bez własnych kroków i wczytywania zdjęcia; kroki prowadzi aplikacja
   * przez uchwyt (`goStep`, `loadPhoto`, `loadTemplate`). Zmiana nie tworzy edytora od nowa.
   */
  readonly wizard?: boolean | undefined;
  /** Zmiana stanu edytora (kreator). */
  readonly onStatus?: ((status: ScorePadEditorStatus) => void) | undefined;
  /** Stan ładowania modułu edytora z ponowieniem (kreator pokazuje błąd w kroku zdjęcia). */
  readonly onLoadState?: ((state: ScorePadLoadState, retry: () => void) => void) | undefined;
  /** Uchwyt do bieżącego notesu z edytora (zapis w bazie). */
  readonly ref?: Ref<ScorePadEditorHandle> | undefined;
}

export interface ScorePadEditorHandle {
  /** Plik notesu z edytora albo `null`, gdy notes nie jest gotowy (brak zdjęcia lub pól). */
  exportConfig(): ScorePadFile | null;
  /** Stan edytora albo `null`, gdy edytor jeszcze się ładuje. */
  status(): ScorePadEditorStatus | null;
  /** Wczytuje zdjęcie kartki; odrzuca, gdy edytor się nie załadował albo obraz jest zły. */
  loadPhoto(file: Blob): Promise<void>;
  /** Wczytuje notes z pliku `.json`. */
  loadTemplate(template: ScorePadTemplate): Promise<void>;
  /** Krok edytora: 1 zdjęcie, 2 obszar kartki, 3 pola, 4 kategorie na kartce. */
  goStep(step: 1 | 2 | 3 | 4): void;
  /** Ustawienia kroku 2: nazwa, kolor grzbietu, obszar, wygładzanie, rozmiar, grzbiet. */
  setArea(patch: ScorePadEditorAreaPatch): void;
  /** Obrót zdjęcia o 90° (1 w prawo, -1 w lewo). */
  rotatePhoto(dir: 1 | -1): void;
  /** Cofa ostatnią zmianę obszaru. */
  undoArea(): void;
  /** Zmienia mapowanie pól w kroku 3. */
  editMapping(action: ScorePadEditorMappingAction): void;
  /** Zmienia kategorie i regułę miejsc w kroku 4. */
  editCategories(action: ScorePadEditorCategoriesAction): void;
}

/** Edytor `<score-pad-editor>` z motywem aplikacji. */
export function ScorePadEditorView({
  template,
  onExport,
  className,
  wizard = false,
  onStatus,
  onLoadState,
  ref,
}: ScorePadEditorViewProps) {
  const { resolved } = useTheme();
  const onExportRef = useRef(onExport);
  const onStatusRef = useRef(onStatus);
  const onLoadStateRef = useRef(onLoadState);
  const wizardRef = useRef(wizard);

  useEffect(() => {
    onExportRef.current = onExport;
    onStatusRef.current = onStatus;
    onLoadStateRef.current = onLoadState;
  });

  const { hostRef, elementRef, state, retry } = useScorePadElement(
    'editor',
    resolved,
    () => {
      const element = document.createElement('score-pad-editor');
      element.template = template;
      element.wizard = wizardRef.current;
      element.addEventListener(
        'scorepad-editor:change',
        (event: ScorePadEditorEventMap['scorepad-editor:change']) =>
          onStatusRef.current?.(event.detail),
      );
      element.addEventListener(
        'scorepad-editor:export',
        (event: ScorePadEditorEventMap['scorepad-editor:export']) =>
          onExportRef.current?.(event.detail.config, event.detail.via),
      );
      return element;
    },
    [template],
  );

  useEffect(() => {
    onLoadStateRef.current?.(state, retry);
    // `retry` zmienia się przy każdym renderze; ważna jest tylko zmiana stanu.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [state]);

  useImperativeHandle(ref, () => {
    const ready = () => {
      const element = elementRef.current;
      if (!element) throw new Error('score-pad-editor: not ready');
      return element;
    };
    return {
      exportConfig: () => elementRef.current?.exportConfig() ?? null,
      status: () => elementRef.current?.status() ?? null,
      loadPhoto: async (file) => ready().loadPhoto(file),
      loadTemplate: async (value) => ready().loadTemplate(value),
      goStep: (step) => elementRef.current?.goStep(step),
      setArea: (patch) => elementRef.current?.setArea(patch),
      rotatePhoto: (dir) => elementRef.current?.rotatePhoto(dir),
      undoArea: () => elementRef.current?.undoArea(),
      editMapping: (action) => elementRef.current?.editMapping(action),
      editCategories: (action) => elementRef.current?.editCategories(action),
    };
  }, [elementRef]);

  return (
    <div
      className={cx('score-pad-view', 'score-pad-view--editor', className)}
      role="region"
      aria-label={t.scorePad.editorLabel}
      aria-busy={state === 'loading'}
    >
      <div ref={hostRef} className="score-pad-view__host" />
      <ScorePadStatus state={state} loadingLabel={t.scorePad.loadingEditor} onRetry={retry} />
    </div>
  );
}
