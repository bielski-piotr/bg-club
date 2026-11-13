// Punkt wejścia pakietu notesu (score-pad.js): element <score-pad> i globalne ScorePad.

import { ScorePad, ensureThree } from './viewer';
import type { PadTheme, ScorePadOptions } from './viewer';
import type { ScorePadPlugin } from './plugins';
import { registerPlugin } from './plugins';
import type { PadTemplate } from './templates';
import { BUILTINS, computePlayer } from './templates';
import { DEFAULTS, SECTIONS } from './settings';

function bool(v: string | null, def: boolean): boolean {
  if (v === null) return def;
  return !(v === 'false' || v === '0' || v === 'off' || v === 'no');
}

function parseJson<T>(v: string | null): T | undefined {
  if (!v) return undefined;
  try {
    return JSON.parse(v) as T;
  } catch {
    console.warn('score-pad: atrybut settings nie jest poprawnym JSON-em.');
    return undefined;
  }
}

function parseTemplates(v: string | null): ScorePadOptions['templates'] {
  if (!v || !v.trim()) return undefined;
  const raw = v.trim();
  if (raw.startsWith('[') || raw.startsWith('{')) return raw;
  return raw
    .split(',')
    .map((s) => s.trim())
    .filter(Boolean);
}

const theme = (v: string | null): PadTheme | undefined =>
  v === 'light' || v === 'dark' ? v : undefined;

export class ScorePadElement extends HTMLElement {
  static observedAttributes = ['template', 'theme'];
  pad: ScorePad | null = null;
  /**
   * Opcje ustawione z JavaScriptu przed dołączeniem elementu do strony (adapter aplikacji).
   * Mają pierwszeństwo przed atrybutami; pozwalają podać szablony i plik notesu jako obiekty.
   */
  options: ScorePadOptions | undefined = undefined;

  connectedCallback(): void {
    if (this.pad) return;
    const tpls = this.getAttribute('templates');
    const flag = (name: string): boolean | undefined =>
      this.hasAttribute(name) ? bool(this.getAttribute(name), true) : undefined;
    const opts: ScorePadOptions = {
      templates: parseTemplates(tpls),
      template: this.getAttribute('template') ?? undefined,
      editor: this.hasAttribute('editor')
        ? bool(this.getAttribute('editor') || 'true', true)
        : undefined,
      // brak atrybutu = wartość domyślna notesu (w trybie klubowym bez notesów wbudowanych)
      controls: flag('controls'),
      help: flag('help'),
      sound: flag('sound'),
      builtins: flag('builtins'),
      tilt: this.hasAttribute('tilt') ? Number(this.getAttribute('tilt')) : undefined,
      storageKey: this.getAttribute('storage-key') ?? undefined,
      config: this.getAttribute('config') ?? undefined,
      settings: parseJson(this.getAttribute('settings')),
      debug: this.hasAttribute('debug')
        ? this.getAttribute('debug') === 'open'
          ? 'open'
          : bool(this.getAttribute('debug') || 'true', true)
        : false,
      club: this.hasAttribute('club') ? bool(this.getAttribute('club') || 'true', true) : undefined,
      theme: theme(this.getAttribute('theme')),
    };
    // atrybuty bez wartości nie nadpisują opcji podanych obiektem
    const fromAttrs = Object.fromEntries(Object.entries(opts).filter(([, v]) => v !== undefined));
    this.pad = new ScorePad(this, { ...fromAttrs, ...this.options });
  }

  disconnectedCallback(): void {
    this.pad?.destroy();
    this.pad = null;
  }

  attributeChangedCallback(name: string, _old: string | null, val: string | null): void {
    if (name === 'template' && val && this.pad) void this.pad.setTemplate(val);
    if (name === 'theme' && this.pad) this.pad.setTheme(theme(val));
  }
}

if (!customElements.get('score-pad')) customElements.define('score-pad', ScorePadElement);

const api = {
  version: '2.4.0',
  /** Montuje notes w dowolnym elemencie strony. */
  mount(el: HTMLElement, options?: ScorePadOptions): ScorePad {
    return new ScorePad(el, options);
  },
  builtins: BUILTINS as readonly PadTemplate[],
  /** Domyślne ustawienia i ich opis (zakresy, etykiety). */
  defaults: DEFAULTS,
  settingsSchema: SECTIONS,
  ensureThree,
  /** Narzędzia do diagnostyki wykrywania tabeli. */
  tools: { computePlayer },
  /** Dołącza wtyczkę (np. edytor z score-pad-editor.js) do wszystkich notesów na stronie. */
  registerPlugin,
};

const w = window as unknown as { ScorePad: typeof api; __scorePadPlugins?: ScorePadPlugin[] };
w.ScorePad = api;
// wtyczki wczytane przed notesem czekają w kolejce
for (const p of w.__scorePadPlugins ?? []) registerPlugin(p);
w.__scorePadPlugins = [];
