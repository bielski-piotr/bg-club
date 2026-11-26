/** @jsxImportSource @solidjs/web */
import type {
  ScorePadEditorAreaPatch,
  ScorePadEditorCategoriesAction,
  ScorePadEditorMappingAction,
  ScorePadEditorEventMap,
  ScorePadEditorStatus,
  ScorePadFile,
  ScorePadTemplate,
  ScorePadZoomAction,
} from '@bg-club/score-pad';
import { createEffect } from 'solid-js';
import { t } from '../i18n';
import { createTheme } from '../solid/theme';
import { ariaBool, type ClassValue } from '../solid/ui/dom';
import { createScorePadElement, type ScorePadLoadState } from './createScorePadElement';
import { ScorePadStatus } from './ScorePadStatus';
import './scorePad.css';

export interface ScorePadEditorViewProps {
  /** Notes do poprawienia; bez niego edytor zaczyna od zdjęcia. */
  readonly template?: ScorePadTemplate | undefined;
  /** Plik notesu po „Zapisz do pliku” lub „Kopiuj do schowka” (zapis w bazie: EDT-1). */
  readonly onExport?: ((config: ScorePadFile, via: 'file' | 'clipboard') => void) | undefined;
  readonly class?: ClassValue;
  /**
   * Tryb kreatora (EDT-9): bez własnych kroków i wczytywania zdjęcia; kroki prowadzi aplikacja
   * przez uchwyt (`goStep`, `loadPhoto`, `loadTemplate`). Zmiana nie tworzy edytora od nowa.
   */
  readonly wizard?: boolean | undefined;
  /** Zmiana stanu edytora (kreator). */
  readonly onStatus?: ((status: ScorePadEditorStatus) => void) | undefined;
  /** Stan ładowania modułu edytora z ponowieniem (kreator pokazuje błąd w kroku zdjęcia). */
  readonly onLoadState?: ((state: ScorePadLoadState, retry: () => void) => void) | undefined;
  /** Uchwyt do bieżącego notesu z edytora (zapis w bazie, EDT-1). */
  readonly ref?: ScorePadEditorHandle | ((handle: ScorePadEditorHandle) => void) | undefined;
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
  /** Ustawienia kroku 2 (EDT-10): nazwa, kolor grzbietu, obszar, wygładzanie, rozmiar, grzbiet. */
  setArea(patch: ScorePadEditorAreaPatch): void;
  /** Obrót zdjęcia o 90° (1 w prawo, -1 w lewo). */
  rotatePhoto(dir: 1 | -1): void;
  /** Cofa ostatnią zmianę obszaru. */
  undoArea(): void;
  /** Powiększenie podglądu w krokach 2–4. */
  zoom(by: ScorePadZoomAction): void;
  /** Zmienia mapowanie pól w kroku 3 (EDT-11). */
  editMapping(action: ScorePadEditorMappingAction): void;
  /** Zmienia kategorie i regułę miejsc w kroku 4 (EDT-13, EDT-2…EDT-4). */
  editCategories(action: ScorePadEditorCategoriesAction): void;
}

/**
 * Edytor `<score-pad-editor>` z motywem aplikacji (PRD §8.5). Wersja React dla strony design
 * systemu: `react-shared/ScorePadEditorView.tsx` (ten sam DOM).
 */
export function ScorePadEditorView(props: ScorePadEditorViewProps) {
  const theme = createTheme();
  const editor = createScorePadElement(
    'editor',
    theme.resolved,
    () => {
      const element = document.createElement('score-pad-editor');
      element.template = props.template;
      // Tryb kreatora ustala się przy tworzeniu: jego zmiana nie tworzy edytora od nowa.
      element.wizard = props.wizard ?? false;
      element.addEventListener(
        'scorepad-editor:change',
        (event: ScorePadEditorEventMap['scorepad-editor:change']) => props.onStatus?.(event.detail),
      );
      element.addEventListener(
        'scorepad-editor:export',
        (event: ScorePadEditorEventMap['scorepad-editor:export']) =>
          props.onExport?.(event.detail.config, event.detail.via),
      );
      return element;
    },
    () => props.template,
  );

  createEffect(editor.state, (state) => {
    props.onLoadState?.(state, editor.retry);
  });

  const ready = () => {
    const element = editor.element();
    if (!element) throw new Error('score-pad-editor: not ready');
    return element;
  };
  const handle: ScorePadEditorHandle = {
    exportConfig: () => editor.element()?.exportConfig() ?? null,
    status: () => editor.element()?.status() ?? null,
    loadPhoto: async (file) => ready().loadPhoto(file),
    loadTemplate: async (value) => ready().loadTemplate(value),
    goStep: (step) => editor.element()?.goStep(step),
    setArea: (patch) => editor.element()?.setArea(patch),
    rotatePhoto: (dir) => editor.element()?.rotatePhoto(dir),
    undoArea: () => editor.element()?.undoArea(),
    zoom: (by) => editor.element()?.zoom(by),
    editMapping: (action) => editor.element()?.editMapping(action),
    editCategories: (action) => editor.element()?.editCategories(action),
  };

  return (
    <div
      class={['score-pad-view', 'score-pad-view--editor', props.class]}
      role="region"
      aria-label={t.scorePad.editorLabel}
      aria-busy={ariaBool(editor.state() === 'loading')}
    >
      <div
        ref={(el) => {
          editor.hostRef(el);
          // Uchwyt dla rodzica (`ref` komponentu) razem z kontenerem elementu.
          const ref = props.ref;
          if (typeof ref === 'function') ref(handle);
        }}
        class="score-pad-view__host"
      />
      <ScorePadStatus
        state={editor.state()}
        loadingLabel={t.scorePad.loadingEditor}
        onRetry={editor.retry}
      />
    </div>
  );
}
