// Samodzielny edytor: element <score-pad-editor> i ScorePadEditor.mount — bez połączenia z notesem.
// Wynik to plik notesu (JSON) — do zapisania na dysku albo skopiowania i podania w atrybucie `config` notesu.

import type { PadConfig } from '../core/settings';
import type { PadTemplate } from '../core/templates';
import {
  Editor,
  type EditorAreaPatch,
  type EditorMappingAction,
  type EditorStatus,
  type Step,
} from './editor';
import { EDITOR_CSS } from './styles';

export interface MountOptions {
  /** Notes do poprawienia (szablon ze zdjęciem). */
  template?: PadTemplate;
  /** Wywoływane po „Zapisz do pliku” i „Kopiuj do schowka”. */
  onExport?(config: PadConfig, via: 'file' | 'clipboard'): void;
  /** Tryb kreatora aplikacji (EDT-9): kroki i wczytywanie zdjęcia prowadzi aplikacja. */
  wizard?: boolean;
}

/** Montuje edytor w elemencie (w jego shadow DOM). */
export function mountEditor(host: HTMLElement, opts: MountOptions = {}): Editor {
  const shadow = host.shadowRoot ?? host.attachShadow({ mode: 'open' });
  shadow.innerHTML = `<style>:host{display:block;position:relative;min-height:520px;contain:layout}${EDITOR_CSS}</style>`;
  const ed = new Editor(shadow, {
    existing: opts.template,
    wizard: opts.wizard ?? false,
    onChange: (status) =>
      host.dispatchEvent(
        new CustomEvent('scorepad-editor:change', {
          detail: status,
          bubbles: true,
          composed: true,
        }),
      ),
    onExport: (config, via) => {
      opts.onExport?.(config, via);
      host.dispatchEvent(
        new CustomEvent('scorepad-editor:export', {
          detail: { config, via },
          bubbles: true,
          composed: true,
        }),
      );
    },
  });
  // motyw: domyślnie jak w systemie; atrybut theme="light" albo "dark" go wymusza
  const theme = host.getAttribute('theme');
  if (theme === 'light' || theme === 'dark') ed.root.classList.add(theme);
  return ed;
}

export class ScorePadEditorElement extends HTMLElement {
  static observedAttributes = ['theme'];
  editor: Editor | null = null;
  /** Notes do poprawienia, ustawiony z JavaScriptu przed dołączeniem elementu do strony. */
  template: PadTemplate | undefined = undefined;
  /** Tryb kreatora aplikacji, ustawiany przed dołączeniem elementu do strony. */
  wizard = false;

  attributeChangedCallback(name: string, _old: string | null, val: string | null): void {
    if (name !== 'theme' || !this.editor) return;
    this.editor.root.classList.toggle('light', val === 'light');
    this.editor.root.classList.toggle('dark', val === 'dark');
  }

  connectedCallback(): void {
    if (this.editor) return;
    this.editor = mountEditor(this, {
      ...(this.template ? { template: this.template } : {}),
      wizard: this.wizard,
    });
  }

  disconnectedCallback(): void {
    this.editor?.destroy();
    this.editor = null;
  }

  /** Bieżący plik notesu (null, gdy notes nie jest jeszcze gotowy). */
  exportConfig(): PadConfig | null {
    return this.editor?.exportConfig() ?? null;
  }

  /** Stan edytora (kreator), null przed dołączeniem do strony. */
  status(): EditorStatus | null {
    return this.editor?.status() ?? null;
  }

  /** Wczytuje zdjęcie kartki (kreator: krok 1). */
  async loadPhoto(file: Blob): Promise<void> {
    if (!this.editor) throw new Error('score-pad-editor: not connected');
    await this.editor.loadFile(file);
  }

  /** Wczytuje notes z pliku `.json` (kreator: import w kroku 1); liczy się jako zmiana. */
  async loadTemplate(template: PadTemplate): Promise<void> {
    if (!this.editor) throw new Error('score-pad-editor: not connected');
    await this.editor.loadTemplate(template, true);
  }

  /** Przechodzi do kroku edytora (1 zdjęcie, 2 obszar kartki, 3 pola), jeśli jest dostępny. */
  goStep(step: Step): void {
    this.editor?.goStep(step);
  }

  /** Ustawienia kroku 2 (EDT-10): nazwa, kolor grzbietu, tryb obszaru, wygładzanie, rozmiar, grzbiet. */
  setArea(patch: EditorAreaPatch): void {
    this.editor?.setArea(patch);
  }

  /** Obraca zdjęcie o 90° (1 w prawo, -1 w lewo) razem z obszarem. */
  rotatePhoto(dir: 1 | -1): void {
    this.editor?.rotatePhoto(dir);
  }

  /** Cofa ostatnią zmianę obszaru (jak Ctrl+Z na scenie). */
  undoArea(): void {
    this.editor?.undoArea();
  }

  /**
   * Zmiana kroku 3 „Mapowanie pól” (EDT-11): sposób mapowania, gracze w kolumnach lub wierszach,
   * miejsca, kategorie, powielenie pól dla następnego miejsca, cofnięcie i dopasowanie widoku.
   * Zmiana sposobu mapowania kasuje pola i kategorie bez pytania (pyta aplikacja).
   */
  editMapping(action: EditorMappingAction): void {
    this.editor?.editMapping(action);
  }
}
