// Komponent <score-pad>: scena, interakcja, wybór liczby, odrywanie, historia, notesy własne.

import * as THREE from 'three';
import type { Spec } from './cloth';
import { makeSpec } from './cloth';
import type { PrintSet } from './print';
import { dropPrint, preparePrint, refreshBuiltinPrints } from './print';
import { DebugViz } from './viz';
import type { HostEvent, MenuItem, PadHost } from './plugins';
import { hostGone, hostReady } from './plugins';
import type { OrbitPose } from './orbit';
import {
  HOME_MS,
  MAX_ZOOM,
  MIN_ZOOM,
  applyPose,
  clonePose,
  easeInOut,
  lerpPose,
  poseLookingAt,
  rotatePose,
  seesTop,
  twoFinger,
  zoomPose,
} from './orbit';
import { Pad, Sfx, woodTexture } from './scene';
import type { TransLight } from './sheet';
import { PaperSheet } from './sheet';
import type { DeepPartial, PadConfig, Settings } from './settings';
import {
  DEFAULTS,
  cloneSettings,
  diffSettings,
  getPath,
  isConfig,
  mergeSettings,
  packSheet,
  setPath,
  unpackSheet,
} from './settings';
import type { PadState, Saved } from './storage';
import { TemplateStore, loadState, saveState } from './storage';
import { CSS } from './styles';
import type { HistoryEntry, PadTemplate, SheetData, Spot } from './templates';
import {
  BUILTINS,
  anyValue,
  blankSheet,
  canBeNegative,
  computePlayer,
  describeValues,
  cellOf,
  exampleGeneral,
  hitSpot,
  normalizeSheet,
  playerActive,
  playerCount,
  rankSheet,
  spots,
  validateTemplate,
  valuesOf,
} from './templates';
import type { Ink } from './util';
import { clamp, el, esc, fmtDate, fmtTime, inkDone, inkNow, lerp, plural, uid } from './util';
import type { ScorePadSheet } from '../index';
import type { Box, Typed } from './entry';
import { FrameBudget } from './frameBudget';
import { checkTyped, cleanNumber, flipSign, nextInput, revealShift, stepTyped } from './entry';

export interface ScorePadOptions {
  /** Szablony: obiekty, adres pliku JSON (tablica szablonów) albo identyfikatory wbudowanych ("general", "kolonie"). */
  templates?: (PadTemplate | string)[] | string;
  /** Notes pokazany na start. */
  template?: string;
  /** Edytor notesów ze zdjęć (domyślnie włączony). */
  editor?: boolean;
  /** Pasek z wyborem notesu i dźwiękiem (domyślnie widoczny). */
  controls?: boolean;
  /** Karta wskazówek (domyślnie widoczna na większych ekranach). */
  help?: boolean;
  /** Odchylenie kamery od pionu w stopniach (0 = dokładnie z góry). */
  tilt?: number;
  /** Przestrzeń nazw zapisu w przeglądarce (osobna dla każdego osadzenia). */
  storageKey?: string;
  sound?: boolean;
  /** Czy dołączyć wbudowane notesy Generał i Kolonie. */
  builtins?: boolean;
  /** Plik notesu (zapisany przyciskiem „Zapisz notes do pliku”): obiekt, JSON albo adres pliku. */
  config?: PadConfig | string;
  /** Ustawienia zachowania (fizyka, kamera, światło, pismo…), nakładane na domyślne. */
  settings?: DeepPartial<Settings>;
  /** Tryb debugowania: true pokazuje przycisk panelu, "open" otwiera panel od razu. */
  debug?: boolean | 'open';
  /**
   * Tryb klubowy BG Club (PAD-1): notesy przychodzą tylko z `templates` i `config` (z bazy aplikacji).
   * Notes nie czyta i nie zapisuje lokalnej biblioteki szablonów (IndexedDB) ani stanu i historii
   * (`localStorage`), nie pokazuje historii partii i domyślnie nie dołącza notesów wbudowanych.
   * Pliki notesu w formacie v2 nadal można wczytać, ale tylko do pamięci tego osadzenia.
   */
  club?: boolean;
  /**
   * Notes testowy kreatora (EDT-14): podsumowanie po oderwaniu mówi, że karteczki testowej nie
   * zapisano. Zapisów i historii i tak nie prowadzi aplikacja dla zdarzeń z testu.
   */
  test?: boolean;
  /**
   * `false`: kartki nie da się oderwać (ani gestem, ani `tear()`); krawędź nie daje się chwycić.
   * Domyślnie można.
   */
  tear?: boolean;
  /**
   * `false`: po oderwaniu notes nie pokazuje własnej karteczki z wynikiem, bo podsumowanie
   * z potwierdzeniem pokazuje aplikacja (partia, PAD-5). Domyślnie pokazuje.
   */
  summary?: boolean;
  /**
   * Podgląd zapisanej karteczki (PAD-6): kartki nie da się oderwać ani zmienić (pola nie
   * przyjmują wpisów, notes nie wysyła `scorepad:change`); obrót, zoom i widok z góry działają.
   */
  readOnly?: boolean;
  /** Motyw otoczenia notesu (stół i winieta); domyślnie ciemny. Nakładki notesu są zawsze ciemne. */
  theme?: PadTheme;
}

export type PadTheme = 'light' | 'dark';

/** Szczegóły zdarzenia `scorepad:change` (tryb klubowy): bieżące wpisy wierzchniej kartki. */
export interface PadChangeDetail {
  sheet: NonNullable<PadConfig['sheet']>;
}

/**
 * Pełny wynik gracza z oderwanej kartki (PAD-7): miejsce na kartce (od 0), wartości punktacji,
 * sumy i miejsce według reguły notesu. Identyfikator gracza dopisuje aplikacja (miejsce → gracz).
 */
export interface PadSaveResult {
  seat: number;
  values: Record<string, number | null>;
  totals: Record<string, number | null>;
  /** Wartość kategorii decydującej (pusta, gdy gracz jej nie ma). */
  rankingValue: number | null;
  place: number;
  tied: boolean;
  /** Pozostali gracze na tym samym miejscu (miejsca na kartce). */
  tiedWith: number[];
}

/** Szczegóły zdarzenia `scorepad:save`: wpis partii, pełne wpisy kartki i wyniki (PAD-7). */
export interface PadSaveDetail extends HistoryEntry {
  sheet: NonNullable<PadConfig['sheet']>;
  /** Wyniki graczy w kolejności miejsc. */
  results: PadSaveResult[];
  /**
   * Obraz oderwanej kartki z pismem (PAD-6), zrobiony w chwili oderwania: WebP (PNG, gdy
   * przeglądarka nie koduje WebP), dłuższy bok najwyżej `maxSide` px (domyślnie 1200),
   * jakość obniżana, aż plik zmieści się w `maxBytes` (domyślnie 150 KB). `null`, gdy
   * przeglądarka nie potrafi zakodować obrazu.
   */
  image(options?: { maxSide?: number; maxBytes?: number }): Promise<Blob | null>;
}

/** Dłuższy bok obrazu karteczki zrobionego przy oderwaniu (PAD-6). */
const SHEET_IMAGE_MAX_SIDE = 1600;

function canvasBlob(c: HTMLCanvasElement, type: string, quality?: number): Promise<Blob | null> {
  return new Promise((resolve) => {
    try {
      c.toBlob((b) => resolve(b), type, quality);
    } catch {
      resolve(null);
    }
  });
}

/**
 * Obraz karteczki do historii (PAD-6, NFR-7 ≈ 150 KB): WebP o malejącej jakości, a gdy nadal
 * za duży, mniejszy wymiar. Przeglądarka bez WebP daje PNG (bez limitu rozmiaru, z wymiarem).
 */
export async function encodeSheetImage(
  src: HTMLCanvasElement,
  options: { maxSide?: number; maxBytes?: number } = {},
): Promise<Blob | null> {
  const maxBytes = options.maxBytes ?? 150 * 1024;
  let side = Math.min(options.maxSide ?? 1200, Math.max(src.width, src.height));
  let last: Blob | null = null;
  for (let round = 0; round < 6; round++) {
    const k = side / Math.max(src.width, src.height);
    const c = document.createElement('canvas');
    c.width = Math.max(1, Math.round(src.width * k));
    c.height = Math.max(1, Math.round(src.height * k));
    const g = c.getContext('2d');
    if (!g) return last;
    g.imageSmoothingEnabled = true;
    g.imageSmoothingQuality = 'high';
    g.drawImage(src, 0, 0, c.width, c.height);
    for (const q of [0.86, 0.78, 0.68, 0.56]) {
      const b = await canvasBlob(c, 'image/webp', q);
      if (!b) return last;
      last = b;
      if (b.size <= maxBytes) return b;
      // bez kodera WebP przeglądarka daje PNG: jakość nic nie zmienia, zostaje mniejszy wymiar
      if (b.type !== 'image/webp') break;
    }
    side = Math.round(side * 0.8);
  }
  return last;
}

/** Kolor stołu (tło sceny i mgła) w motywie jasnym i ciemnym. */
const ROOM: Record<PadTheme, number> = { dark: 0x120d0a, light: 0xd6cec2 };

/**
 * Three.js pochodzi z zależności npm (PRD §8.5) i trafia do tego samego leniwego chunka co notes,
 * więc nie trzeba go doczytywać z CDN. Funkcja zostaje dla zgodności z API POC (`ScorePad.ensureThree`).
 */
export function ensureThree(): Promise<void> {
  return Promise.resolve();
}

let fontsReady: Promise<void> | null = null;
function ensureFonts(): Promise<void> {
  if (fontsReady) return fontsReady;
  // fonty notesu są dołączone z npm (`../fonts.ts`), bez Google Fonts
  const specs = [
    '600 48px Caveat',
    '700 48px Caveat',
    "700 80px 'Alegreya SC'",
    "600 27px 'Archivo Narrow'",
    "400 16px 'Archivo Narrow'",
    "700 16px 'Archivo Narrow'",
  ];
  fontsReady = Promise.race([
    Promise.all(specs.map((s) => document.fonts.load(s, 'Generał Ąę łóś 0123456789'))).then(
      () => undefined,
    ),
    new Promise<void>((r) => setTimeout(r, 3500)),
  ]).catch(() => undefined);
  return fontsReady;
}

const ICON_SOUND = `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M4 9.5h3.5L12 5.5v13l-4.5-4H4z"/><path class="waves" d="M15.5 9a4 4 0 0 1 0 6M18 6.5a7.5 7.5 0 0 1 0 11"/><path class="mute" d="M16 9.5l5 5M21 9.5l-5 5"/></svg>`;
const ICON_TOP = `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" aria-hidden="true"><circle cx="12" cy="12" r="7.5"/><circle cx="12" cy="12" r="2.5"/><path d="M12 2v3M12 19v3M2 12h3M19 12h3"/></svg>`;
const ICON_CHEV = `<svg viewBox="0 0 16 16" fill="none" stroke="currentColor" stroke-width="1.6" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M4 6l4 4 4-4"/></svg>`;
const RING =
  '<svg class="ring" viewBox="0 0 96 52" aria-hidden="true"><path pathLength="1" d="M70 9C55 2 18 4 8 20c-8 13 8 27 36 28 26 1 47-8 46-22C89 12 70 5 46 6"/></svg>';

interface Hit {
  kind: 'edge' | 'cell' | 'name' | 'none';
  uv: THREE.Vector2;
  point: THREE.Vector3;
  spot?: Spot;
}

interface Drag {
  idx: number;
  pointerId: number;
  R: number;
  s0: number;
  z0: number;
  offX: number;
  raw: THREE.Vector3;
  clamped: THREE.Vector3;
  excess: number;
  loads: Float32Array;
  x: number;
  y: number;
  tearing: boolean;
}

export class ScorePad {
  readonly host: HTMLElement;
  readonly root: ShadowRoot;
  private opts: ScorePadOptions & { storageKey: string; builtins: boolean; club: boolean };
  /** Ustawienia bieżące (obiekt jest stały — symulacja trzyma do niego odwołania). */
  readonly cfg: Settings;
  /** Ustawienia bez zmian z trybu debugowania (domyślne + opcje + plik notesu). */
  private baseCfg: Settings;
  private debugAvail = false;
  private hostApi: PadHost | null = null;
  private menuProviders: (() => MenuItem[])[] = [];
  private actions = new Map<string, (arg?: unknown) => void>();
  private listeners = new Map<HostEvent, ((...a: unknown[]) => void)[]>();
  private inset = 0;
  private suspended = false;
  private viz: DebugViz | null = null;
  private hemi!: THREE.HemisphereLight;
  private configActive: string | null = null;
  private frames = 0;
  private statT = 0;
  private stepsLast = 0;
  private fps = 0;
  private wrap!: HTMLDivElement;
  private renderer!: THREE.WebGLRenderer;
  private scene!: THREE.Scene;
  private camera!: THREE.PerspectiveCamera;
  private key!: THREE.SpotLight;
  private back!: THREE.DirectionalLight;
  private trans: TransLight[] = [];
  private pad: Pad | null = null;
  private spec: Spec | null = null;
  private ps: PrintSet | null = null;
  private backTex = new Map<string, THREE.CanvasTexture>();
  private t: PadTemplate | null = null;
  private active: PaperSheet | null = null;
  private flyers: PaperSheet[] = [];
  private templates: PadTemplate[] = [];
  private custom = new Set<string>();
  private store: TemplateStore;
  private saved: Saved;
  private sfx = new Sfx();
  private aniso = 8;
  private autoZoom = 1;
  private dragCam: THREE.PerspectiveCamera | null = null;
  /** Widok zmieniony obrotem lub zoomem (PAD-10, PAD-11); `null` to widok domyślny z góry. */
  private free: OrbitPose | null = null;
  /** Płynny powrót do widoku z góry (PAD-12). */
  private homeAnim: { from: OrbitPose; t0: number } | null = null;
  /** Obrót myszą (prawy przycisk albo lewy poza notesem). */
  private orbitDrag: { pointerId: number; x: number; y: number } | null = null;
  /** Palce na ekranie i gest dwoma palcami (obrót, zoom, skręt). */
  private touches = new Map<number, { x: number; y: number }>();
  private gesture: { a: number; b: number } | null = null;
  /** Palce, które brały udział w geście: do podniesienia nie piszą i nie odrywają. */
  private gestureIds = new Set<number>();
  private under!: THREE.DirectionalLight;
  private maxSide = 4096;
  /** Obniża gęstość renderu na słabym GPU (NFR-2); tekstura zostaje w pełnej rozdzielczości. */
  private budget: FrameBudget | null = null;
  /**
   * Pole punktów, w które się wpisuje (PAD-13…PAD-15): kategoria, czy przyjmuje wartości
   * ujemne i tekst pola przed zmianą (Esc do niego wraca).
   */
  private entry: { spot: Spot; neg: boolean; orig: string } | null = null;
  /** Ostatnio ustawione położenie pola i paska wpisywania (bez zbędnych zapisów stylu). */
  private entryPos = '';
  /** Rozmiar paska przy polu wpisywania (mierzony po zmianie zawartości). */
  private barDims: { w: number; h: number } | null = null;
  private raycaster!: THREE.Raycaster;
  private ndc!: THREE.Vector2;
  private drag: Drag | null = null;
  private press: { x: number; y: number; hit: Hit; held?: boolean } | null = null;
  /** Chmurka z opisem kategorii: pole, nad którym jest pokazana (albo zaplanowana). */
  private tipKey: string | null = null;
  private tipTimer = 0;
  private tipHiddenAt = -1e9;
  private holdTimer = 0;
  private pointerSpeed = 0;
  private lastMove = { x: 0, y: 0, t: 0 };
  private hoverQueued: { x: number; y: number } | null = null;
  private pickerOpen = false;
  private pickerShownAt = 0;
  private annotTimer = 0;
  /** Stan sprzed ostatniego oderwania (liczba kartek), dla `restoreSheet` (anulowanie, PAD-5). */
  private lastTear: { tpl: string; left: number } | null = null;
  private rafId = 0;
  private last = 0;
  private acc = 0;
  private visible = true;
  private destroyed = false;
  private switching = false;
  private observers: { disconnect(): void }[] = [];
  /** Nasłuch poza elementem (np. visualViewport), odpinany w destroy(). */
  private cleanups: (() => void)[] = [];
  private ui: Record<string, HTMLElement> = {};
  private syncSound: () => void = () => undefined;
  private uiSound: boolean | null = null;

  constructor(host: HTMLElement, options: ScorePadOptions = {}) {
    this.host = host;
    const club = !!options.club;
    this.opts = {
      ...options,
      club,
      storageKey: options.storageKey || 'score-pad',
      builtins: options.builtins ?? !club,
    };
    this.debugAvail = !!options.debug;
    // domyślne ← opcje osadzenia ← jawne ustawienia (← plik notesu, gdy się wczyta)
    const fromOpts: DeepPartial<Settings> = {
      view: options.tilt != null ? { tilt: options.tilt } : {},
      ui: {
        ...(options.controls != null ? { controls: options.controls } : {}),
        ...(options.help != null ? { help: options.help } : {}),
        ...(options.editor != null ? { editor: options.editor } : {}),
        ...(options.sound != null ? { sound: options.sound } : {}),
      },
    };
    this.baseCfg = mergeSettings(mergeSettings(DEFAULTS, fromOpts), options.settings);
    this.cfg = cloneSettings(this.baseCfg);
    this.root = host.shadowRoot ?? host.attachShadow({ mode: 'open' });
    // tryb klubowy: szablony tylko w pamięci, bez odczytu stanu i historii z przeglądarki (PAD-1)
    this.store = new TemplateStore(this.opts.storageKey, !club);
    const st = club ? {} : (loadState(this.opts.storageKey) ?? {});
    this.saved = {
      v: 2,
      tpl: typeof st.tpl === 'string' ? st.tpl : '',
      sheets: st.sheets && typeof st.sheets === 'object' ? st.sheets : {},
      history: Array.isArray(st.history) ? st.history.slice(0, 40) : [],
      sound: st.sound !== undefined ? !!st.sound : this.cfg.ui.sound,
      help: st.help !== undefined ? !!st.help : true,
      recentNames: [],
      settings:
        this.debugAvail && st.settings && typeof st.settings === 'object' ? st.settings : undefined,
      debugOpen: !!st.debugOpen,
      prefs: st.prefs && typeof st.prefs === 'object' ? st.prefs : {},
    };
    if (this.saved.settings) this.replaceSettings(mergeSettings(this.baseCfg, this.saved.settings));
    this.sfx.on = this.saved.sound;
    this.buildDom();
    this.applyTheme();
    void this.init();
  }

  // ═════════════════════════════════════════════════════ API

  /** Lista dostępnych notesów. */
  getTemplates(): PadTemplate[] {
    return [...this.templates];
  }

  /** Przełącza notes. */
  async setTemplate(id: string): Promise<void> {
    if (this.t?.id === id) return;
    await this.useTemplate(id);
  }

  /** Dodaje notes (np. wczytany z JSON-a); `persist` zapisuje go w przeglądarce. */
  async addTemplate(raw: unknown, persist = false): Promise<PadTemplate> {
    const t = validateTemplate(raw);
    if (!t) throw new Error('Niepoprawna konfiguracja notesu.');
    this.upsert(t);
    if (persist) {
      await this.store.put(t);
      this.custom.add(t.id);
    }
    this.renderMenu();
    return t;
  }

  /** JSON notesu do osadzenia na innej stronie. */
  exportTemplate(id = this.t?.id ?? ''): string {
    const t = this.templates.find((x) => x.id === id);
    return t ? JSON.stringify(t) : '';
  }

  /** Otwiera edytor (wymaga pakietu score-pad-editor.js). */
  openEditor(id?: string): void {
    const fn = this.actions.get('editor');
    if (!fn) {
      console.warn('score-pad: edytor nie jest wczytany — dołącz score-pad-editor.js.');
      return;
    }
    this.closeMenu();
    this.closePicker();
    fn(id);
  }

  /** Plik notesu: bieżący notes, ustawienia (tylko różnice od domyślnych) i opcjonalnie wpisy z kartki. */
  exportConfig(opt: { sheet?: boolean } = {}): PadConfig {
    const t = this.t;
    const out: PadConfig = { format: 'score-pad', version: 2 };
    if (t) {
      out.template = JSON.parse(JSON.stringify(t));
      out.active = t.id;
    }
    const diff = diffSettings(this.cfg);
    if (Object.keys(diff).length) out.settings = diff;
    if (opt.sheet && this.active) out.sheet = packSheet(this.active.data);
    return out;
  }

  /** Wczytuje plik notesu (albo sam szablon). `persist` zapisuje notes w przeglądarce. */
  async importConfig(raw: unknown, persist = true): Promise<string> {
    const data = typeof raw === 'string' ? JSON.parse(raw) : raw;
    const cfg: PadConfig | null = isConfig(data)
      ? data
      : validateTemplate(data)
        ? { format: 'score-pad', version: 2, template: data as PadTemplate }
        : null;
    if (!cfg) throw new Error('To nie jest plik notesu.');
    const list = [cfg.template, ...(cfg.templates ?? [])]
      .filter(Boolean)
      .map((x) => validateTemplate(x))
      .filter((x): x is PadTemplate => !!x);
    if (!list.length && !cfg.settings) throw new Error('Plik nie zawiera notesu ani ustawień.');
    for (const t of list) {
      dropPrint(t);
      this.upsert(t);
      if (persist) {
        await this.store.put(t);
        this.custom.add(t.id);
      }
    }
    if (cfg.settings) {
      this.replaceSettings(mergeSettings(this.baseCfg, cfg.settings));
      this.saveDebugSettings();
      this.applySettings();
    }
    const active = list.find((t) => t.id === cfg.active) ?? list[0];
    if (active) {
      if (cfg.sheet)
        this.saved.sheets[active.id] = {
          data: unpackSheet(cfg.sheet, active),
          left: this.saved.sheets[active.id]?.left ?? this.cfg.view.sheets,
        };
      await this.useTemplate(active.id);
    }
    this.renderMenu();
    this.emit('settings');
    this.persist();
    return active?.name ?? '';
  }

  /** Zmienia jedno ustawienie, np. `setSetting("physics.gravity", 90)`. */
  setSetting(key: string, value: unknown): boolean {
    const ok = setPath(this.cfg, key, value);
    if (ok) {
      this.saveDebugSettings();
      this.applySettings();
      this.emit('settings');
    }
    return ok;
  }

  getSettings(): Settings {
    return cloneSettings(this.cfg);
  }

  /** Otwiera albo zamyka panel trybu debugowania (wymaga atrybutu debug i pakietu score-pad-editor.js). */
  toggleDebug(on?: boolean): void {
    const fn = this.actions.get('debug');
    if (fn) fn(on);
    else if (this.debugAvail)
      console.warn('score-pad: panel debugowania jest w pakiecie score-pad-editor.js.');
  }

  /** Historia zapisanych partii. */
  getHistory(): HistoryEntry[] {
    return [...this.saved.history];
  }

  /** Motyw otoczenia notesu (atrybut `theme`). */
  setTheme(theme: PadTheme | undefined): void {
    this.opts.theme = theme;
    this.applyTheme();
  }

  destroy(): void {
    if (this.destroyed) return;
    this.destroyed = true;
    cancelAnimationFrame(this.rafId);
    for (const o of this.observers) o.disconnect();
    for (const f of this.cleanups) f();
    document.fonts?.removeEventListener?.('loadingdone', this.onFontsLoaded);
    if (this.hostApi) hostGone(this.hostApi);
    this.sfx.close();
    // dispose() nie zwalnia kontekstu WebGL; przeglądarka trzyma ich ograniczoną liczbę (~16)
    this.renderer?.dispose();
    this.renderer?.forceContextLoss();
    this.root.innerHTML = '';
  }

  // ═════════════════════════════════════════════════════ budowa

  private buildDom(): void {
    this.root.innerHTML = `<style>${CSS}</style>
      <div class="sp" part="frame">
        <div class="stage"></div>
        <div class="vignette" aria-hidden="true"></div>
        <header class="bar" ${this.cfg.ui.controls ? '' : 'hidden'}>
          <button type="button" class="tpl-btn" aria-haspopup="true" aria-expanded="false">
            <span class="tpl-name">Notes</span><span class="tpl-sub"></span>${ICON_CHEV}
          </button>
          <button type="button" class="icon-btn" data-ui="home" aria-label="Widok z góry" title="Widok z góry (0)" disabled>${ICON_TOP}</button>
          <button type="button" class="icon-btn" data-ui="sound" aria-pressed="true" aria-label="Dźwięki">${ICON_SOUND}</button>
          <div class="menu" hidden></div>
        </header>
        <section class="help" aria-label="Jak używać notesu" hidden>
          <ol>
            <li><span><b>Kliknij pole</b> i wpisz punkty z klawiatury. Enter albo Tab przechodzi do następnej kategorii, Shift+Tab cofa. Sumy liczą się same.</span></li>
            <li data-tear><span><b>Chwyć <span data-edge>dolną</span> krawędź</b> i przeciągnij w stronę grzbietu — kartka uniesie się i przewróci pod światło lampy.</span></li>
            <li data-tear><span><b>Szarpnij mocno</b> <span data-pull>w dół albo w bok</span>, a kartka oderwie się i wynik zostanie zapisany.</span></li>
            <li><span><b>Obróć notes</b> dwoma palcami albo prawym przyciskiem myszy, <b>przybliż</b> szczypaniem albo kółkiem. Klawisz 0 wraca do widoku z góry.</span></li>
          </ol>
          <button type="button" class="help-close" aria-label="Ukryj wskazówki">×</button>
        </section>
        <button type="button" class="help-btn" aria-label="Pokaż wskazówki" hidden>?</button>
        <div class="tip" role="tooltip" hidden><b class="tip-t"></b><span class="tip-x"></span></div>
        <div class="picker" role="dialog" aria-label="Wybór punktów" hidden>
          <div class="pk-head"><span class="pk-title"></span><span class="pk-who"></span></div>
          <button type="button" class="pk-close" aria-label="Zamknij">×</button>
          <p class="pk-hint"></p>
          <form class="pk-name">
            <input maxlength="14" autocomplete="off" spellcheck="false" placeholder="Imię" aria-label="Imię gracza">
            <button type="submit">Wpisz</button>
          </form>
          <div class="pk-actions"></div>
        </div>
        <div class="entry" hidden>
          <input class="en-in" type="text" inputmode="numeric" pattern="-?[0-9]*" enterkeyhint="next" autocomplete="off" autocorrect="off" spellcheck="false" maxlength="6" aria-label="Punkty" aria-describedby="en-hint en-err">
          <div class="en-bar">
            <button type="button" class="en-btn en-sign" aria-label="Zmień znak na przeciwny" title="Zmień znak">±</button>
            <button type="button" class="en-btn en-scratch">Skreśl</button>
            <button type="button" class="en-btn en-next" aria-label="Następne pole">Dalej</button>
            <span class="en-hint" id="en-hint"></span>
            <p class="en-err" id="en-err" aria-live="assertive"></p>
          </div>
        </div>
        <div class="tension" hidden aria-hidden="true">
          <svg viewBox="0 0 40 40"><circle class="t-trk" cx="20" cy="20" r="16"/><circle class="t-val" cx="20" cy="20" r="16" pathLength="100"/></svg>
          <span>Ciągnij mocniej</span>
        </div>
        <div class="annot" aria-live="polite" hidden></div>
        <button type="button" class="chip" hidden></button>
        <div class="tools"></div>
        <input type="file" class="file-in" accept=".json,application/json" hidden>
        <div class="dlg" role="dialog" aria-modal="true" aria-labelledby="dlg-t" hidden>
          <div class="dlg-card">
            <h2 id="dlg-t">Plik notesu</h2>
            <p class="dlg-msg"></p>
            <textarea readonly spellcheck="false" aria-label="Zawartość pliku notesu"></textarea>
            <div class="dlg-acts"><button type="button" data-d="copy">Kopiuj</button><button type="button" data-d="close">Zamknij</button></div>
          </div>
        </div>
        <div class="loading">Rozkładam notes…</div>
      </div>`;
    // bez odrywania wskazówki o chwytaniu i szarpaniu kartki wprowadzałyby w błąd
    if (this.opts.tear === false || this.opts.readOnly) {
      this.root.querySelectorAll('[data-tear]').forEach((node) => node.remove());
    }
    const q = <T extends HTMLElement>(s: string): T => this.root.querySelector(s) as T;
    this.wrap = q('.sp');
    this.ui = {
      stage: q('.stage'),
      tplBtn: q('.tpl-btn'),
      tplName: q('.tpl-name'),
      tplSub: q('.tpl-sub'),
      menu: q('.menu'),
      sound: q('[data-ui="sound"]'),
      homeBtn: q('[data-ui="home"]'),
      help: q('.help'),
      helpBtn: q('.help-btn'),
      picker: q('.picker'),
      tip: q('.tip'),
      tipT: q('.tip-t'),
      tipX: q('.tip-x'),
      pkTitle: q('.pk-title'),
      pkWho: q('.pk-who'),
      pkHint: q('.pk-hint'),
      pkName: q('.pk-name'),
      pkInput: q('.pk-name input'),
      pkActions: q('.pk-actions'),
      entry: q('.entry'),
      enIn: q('.en-in'),
      enBar: q('.en-bar'),
      enSign: q('.en-sign'),
      enScratch: q('.en-scratch'),
      enNext: q('.en-next'),
      enErr: q('.en-err'),
      enHint: q('.en-hint'),
      tension: q('.tension'),
      tensionLabel: q('.tension span'),
      annot: q('.annot'),
      chip: q('.chip'),
      loading: q('.loading'),
      tools: q('.tools'),
      fileIn: q('.file-in'),
      dlg: q('.dlg'),
      vignette: q('.vignette'),
    };
  }

  private async init(): Promise<void> {
    try {
      await Promise.all([ensureThree(), ensureFonts()]);
    } catch (e) {
      this.ui.loading.textContent = (e as Error).message;
      return;
    }
    if (this.destroyed) return;
    // kolory w hex traktujemy jako sRGB
    (THREE.ColorManagement as unknown as { legacyMode: boolean }).legacyMode = false;
    const conf = await this.loadConfig();
    if (this.destroyed) return;
    if (conf?.settings) {
      this.baseCfg = mergeSettings(this.baseCfg, conf.settings);
      this.replaceSettings(
        this.saved.settings ? mergeSettings(this.baseCfg, this.saved.settings) : this.baseCfg,
      );
    }
    this.setupScene();
    this.bindUi();
    await this.loadTemplates(conf);
    if (this.destroyed) return;
    this.viz = new DebugViz();
    this.scene.add(this.viz.group);
    const want = [
      this.opts.template,
      this.configActive,
      this.saved.tpl,
      this.templates[0]?.id,
    ].find((id) => id && this.templates.some((t) => t.id === id)) as string | undefined;
    if (!want) {
      this.ui.loading.textContent =
        'Brak notesów do pokazania. Dodaj szablon albo włącz wbudowane notesy.';
      return;
    }
    await this.useTemplate(want);
    // notes zamknięty w trakcie wczytywania: bez rejestracji wtyczek, zdarzeń i nasłuchu fontów
    if (this.destroyed) return;
    this.applySettings();
    this.wrap.classList.add('ready');
    this.hostApi = this.makeHost();
    hostReady(this.hostApi);
    this.updateChip(false);
    this.host.dispatchEvent(new CustomEvent('scorepad:ready', { bubbles: true, composed: true }));
    document.fonts?.addEventListener?.('loadingdone', this.onFontsLoaded);
  }

  private onFontsLoaded = (): void => {
    refreshBuiltinPrints();
    if (this.pad) this.pad.topTex.needsUpdate = true;
    if (this.active) this.active.dirty = true;
  };

  /** Plik notesu podany w atrybucie `config` (adres, JSON albo obiekt). */
  private async loadConfig(): Promise<PadConfig | null> {
    const c = this.opts.config;
    if (!c) return null;
    try {
      const data =
        typeof c === 'string'
          ? /^\s*[[{]/.test(c)
            ? JSON.parse(c)
            : await (await fetch(c)).json()
          : c;
      if (isConfig(data)) return data;
      if (validateTemplate(data))
        return { format: 'score-pad', version: 2, template: data as PadTemplate };
    } catch {
      /* zły plik — notes działa na ustawieniach domyślnych */
    }
    console.warn('score-pad: nie udało się wczytać pliku notesu z atrybutu config.');
    return null;
  }

  private async loadTemplates(conf: PadConfig | null = null): Promise<void> {
    if (this.opts.builtins) for (const b of BUILTINS) this.upsert(b);
    const src = this.opts.templates;
    const items: (PadTemplate | string)[] =
      typeof src === 'string' ? [src] : Array.isArray(src) ? src : [];
    for (const it of items) {
      try {
        if (typeof it === 'string') {
          const b = BUILTINS.find((x) => x.id === it);
          if (b) {
            this.upsert(b);
            continue;
          }
          const trimmed = it.trim();
          const data =
            trimmed.startsWith('[') || trimmed.startsWith('{')
              ? JSON.parse(trimmed)
              : await (await fetch(it)).json();
          for (const raw of Array.isArray(data) ? data : [data]) {
            const t = validateTemplate(raw);
            if (t) this.upsert(t);
          }
        } else {
          const t = validateTemplate(it);
          if (t) this.upsert(t);
        }
      } catch {
        /* pominięty szablon — pozostałe działają */
      }
    }
    for (const t of await this.store.list()) {
      this.upsert(t);
      this.custom.add(t.id);
    }
    if (conf) {
      const list = [conf.template, ...(conf.templates ?? [])]
        .filter(Boolean)
        .map((x) => validateTemplate(x))
        .filter((x): x is PadTemplate => !!x);
      for (const t of list) this.upsert(t);
      const active = list.find((t) => t.id === conf.active) ?? list[0];
      if (active) {
        this.configActive = active.id;
        // wpisy z pliku trafiają na kartkę tylko wtedy, gdy nie ma jeszcze lokalnych
        if (conf.sheet && !this.saved.sheets[active.id])
          this.saved.sheets[active.id] = {
            data: unpackSheet(conf.sheet, active),
            left: this.cfg.view.sheets,
          };
      }
    }
  }

  private upsert(t: PadTemplate): void {
    const i = this.templates.findIndex((x) => x.id === t.id);
    if (i >= 0) this.templates[i] = t;
    else this.templates.push(t);
  }

  private setupScene(): void {
    const r = new THREE.WebGLRenderer({ antialias: true, powerPreference: 'high-performance' });
    // pełna gęstość ekranu, do 3 (PAD-16)
    r.setPixelRatio(Math.min(window.devicePixelRatio || 1, 3));
    this.budget = new FrameBudget(r.getPixelRatio());
    r.outputEncoding = THREE.sRGBEncoding;
    r.toneMapping = THREE.ACESFilmicToneMapping;
    r.toneMappingExposure = 1.02;
    r.shadowMap.enabled = true;
    r.shadowMap.type = THREE.PCFSoftShadowMap;
    r.domElement.tabIndex = 0;
    r.domElement.setAttribute(
      'aria-label',
      'Notes 3D. Kliknij pole i wpisz punkty z klawiatury, Enter albo Tab przechodzi do następnej kategorii; przeciągnij dolną krawędź, aby przewrócić kartkę; szarpnij, aby ją oderwać. Prawy przycisk albo dwa palce obracają notes, kółko albo szczypanie przybliża, klawisz 0 wraca do widoku z góry.',
    );
    this.ui.stage.appendChild(r.domElement);
    this.renderer = r;
    this.aniso = r.capabilities.getMaxAnisotropy();
    // tekstura kartki w rozdzielczości z edytora, do granicy urządzenia (PAD-16, EDT-12)
    this.maxSide = Math.min(4096, r.capabilities.maxTextureSize || 4096);
    this.raycaster = new THREE.Raycaster();
    this.ndc = new THREE.Vector2();

    const scene = new THREE.Scene();
    scene.background = new THREE.Color(ROOM.dark);
    scene.fog = new THREE.Fog(ROOM.dark, 18, 40);
    this.scene = scene;
    this.applyTheme();
    this.camera = new THREE.PerspectiveCamera(30, 1, 0.1, 80);

    // lampa stoi za notesem: przewracana kartka trafia między nią a oko patrzącego z góry
    const key = new THREE.SpotLight(0xffe0b5, 1.7, 0, 0.62, 0.75, 1);
    key.castShadow = true;
    key.shadow.mapSize.set(2048, 2048);
    key.shadow.bias = -0.00035;
    key.shadow.normalBias = 0.015;
    key.shadow.camera.near = 3;
    key.shadow.camera.far = 26;
    scene.add(key, key.target);
    this.key = key;
    const back = new THREE.DirectionalLight(0xffb878, 0.45);
    scene.add(back, back.target);
    this.back = back;
    this.hemi = new THREE.HemisphereLight(0xb9c3d6, 0x3a281b, 0.36);
    scene.add(this.hemi);
    const fill = new THREE.DirectionalLight(0xcdd8ff, 0.12);
    fill.position.set(0.5, 9, 6);
    scene.add(fill);
    // światło od spodu: włącza się tylko, gdy kamera ogląda tył notesu (tekturę)
    const under = new THREE.DirectionalLight(0xfff1e0, 0);
    under.position.set(0.6, -8, 2.5);
    scene.add(under);
    this.under = under;
    this.trans = [
      { dir: new THREE.Vector3(), color: new THREE.Color() },
      { dir: new THREE.Vector3(), color: new THREE.Color() },
    ];

    const table = new THREE.Mesh(
      new THREE.PlaneGeometry(60, 60),
      new THREE.MeshStandardMaterial({ map: woodTexture(this.aniso), roughness: 0.62 }),
    );
    table.rotation.x = -Math.PI / 2;
    table.receiveShadow = true;
    scene.add(table);

    const ro = new ResizeObserver(() => this.layoutCamera());
    ro.observe(this.host);
    this.observers.push(ro);
    const io = new IntersectionObserver((es) => {
      this.visible = es.some((e) => e.isIntersecting);
      if (this.visible) this.loop();
    });
    io.observe(this.host);
    this.observers.push(io);
  }

  private placeLights(): void {
    if (!this.spec) return;
    const { W, H } = this.spec;
    this.key.position.set(-W * 0.45 - 1.0, 8.6, -H / 2 - 5.4);
    this.key.target.position.set(0, 0, H * 0.12);
    this.back.position.set(1.4, 2.0, -12);
    this.back.target.position.set(0, 0, 0);
    this.key.updateMatrixWorld();
    this.trans[0].dir.copy(this.key.position).sub(this.key.target.position).normalize();
    this.trans[0].color.copy(this.key.color).multiplyScalar(this.key.intensity * 0.62);
    this.trans[1].dir.copy(this.back.position).sub(this.back.target.position).normalize();
    this.trans[1].color.copy(this.back.color).multiplyScalar(this.back.intensity * 1.6);
  }

  private layoutCamera(): void {
    if (!this.renderer) return;
    const w = Math.max(1, this.wrap.clientWidth);
    const h = Math.max(1, this.wrap.clientHeight);
    this.renderer.setSize(w, h);
    this.wrap.classList.toggle('narrow', w < 560);
    this.camera.aspect = w / h;
    this.poseCamera();
    if (this.pickerOpen) this.closeNamePicker();
    // klawiatura ekranowa może zmienić rozmiar notesu: wpisywanie zostaje, pole wraca do kadru
    if (this.entry) {
      this.entryPos = '';
      this.placeEntry();
      this.revealEntry();
    }
  }

  /**
   * Ustawia kamerę: widok domyślny nad notesem (PAD-12; `autoZoom` odsuwa kamerę, gdy podniesiona
   * kartka wychodzi poza kadr) albo widok zmieniony przez użytkownika (`free`).
   */
  private poseCamera(): void {
    const cam = this.camera;
    if (!this.spec || !this.pad) {
      cam.updateProjectionMatrix();
      return;
    }
    // otwarty panel debugowania zasłania prawą część — notes mieści się i centruje w pozostałej
    const fw = Math.max(1, this.wrap.clientWidth);
    const fh = Math.max(1, this.wrap.clientHeight);
    const pw = fw > 700 ? Math.min(this.inset, fw) : 0;
    if (pw) cam.setViewOffset(fw, fh, pw / 2, 0, fw, fh);
    else cam.clearViewOffset();
    this.wrap.style.setProperty('--inset', `${pw}px`);
    const pose = this.free ?? this.homePose(this.autoZoom);
    applyPose(pose, cam);
    cam.far = pose.dist * 3 + 20;
    cam.near = Math.min(0.1, pose.dist / 20);
    cam.updateProjectionMatrix();
    cam.updateMatrixWorld();
    this.syncView();
  }

  /** Widok domyślny: z góry (nachylenie `view.tilt`), cały notes w kadrze z niewielkim marginesem. */
  private homePose(autoZoom = 1): OrbitPose {
    const cam = this.camera;
    const { W, H, rot } = this.spec as Spec;
    const room = H * this.cfg.view.room;
    const mb = H * 0.07 + 0.08;
    const ms = Math.max(W * 0.08, 0.2);
    // notes klejony z lewej: kamera obrócona o 90° (taśma po lewej stronie kadru)
    const regionH = rot ? W + 2 * ms : H + room + mb;
    const regionW = rot ? H + room + mb : W + 2 * ms;
    const tanV = Math.tan(THREE.MathUtils.degToRad(cam.fov / 2));
    const fw = Math.max(1, this.wrap.clientWidth);
    const fh = Math.max(1, this.wrap.clientHeight);
    const pw = fw > 700 ? Math.min(this.inset, fw) : 0;
    const aspect = (fw - pw) / fh;
    const d = Math.max(regionH / 2 / tanV, regionW / 2 / (tanV * aspect)) * autoZoom;
    const cz = (mb - room) / 2 - (autoZoom - 1) * H * 0.35;
    const tilt = THREE.MathUtils.degToRad(this.cfg.view.tilt);
    const top = (this.pad as Pad).top;
    const eye = rot
      ? new THREE.Vector3(-d * Math.sin(tilt), top + d * Math.cos(tilt), cz)
      : new THREE.Vector3(0, top + d * Math.cos(tilt), cz + d * Math.sin(tilt));
    const up = rot ? new THREE.Vector3(1, 0, 0) : new THREE.Vector3(0, 0, -1);
    return poseLookingAt(eye, new THREE.Vector3(0, top, cz), up);
  }

  /** Czy widać wierzchnią kartkę; od tyłu wpisywanie i odrywanie są wyłączone (PAD-10). */
  private seesTop(): boolean {
    return !this.pad || seesTop(this.camera.position, this.pad.top);
  }

  /** Stan przycisku „Widok z góry” i światła od spodu po zmianie kamery. */
  private syncView(): void {
    const home = !this.free;
    const btn = this.ui.homeBtn as HTMLButtonElement | undefined;
    if (btn && btn.disabled !== home) btn.disabled = home;
    const front = this.seesTop();
    this.wrap.classList.toggle('from-below', !front);
    if (this.under) this.under.intensity = front ? 0 : 0.9;
    if (!front) {
      // od spodu notesu nie da się wpisywać (także w zaznaczone wcześniej pole)
      this.closePicker();
      if (this.drag) this.endDrag(true);
      if (this.active && this.active.cloth.hoverWant) this.active.cloth.hoverWant = 0;
    }
  }

  /** Przechodzi z widoku domyślnego do zmienianego przez użytkownika (zachowuje obecny kadr). */
  private freePose(): OrbitPose | null {
    if (!this.spec || !this.pad) return null;
    this.homeAnim = null;
    if (!this.free) {
      this.free = this.homePose(this.autoZoom);
      // autoZoom działa tylko w widoku domyślnym (PAD-12)
      this.autoZoom = 1;
    }
    // okno imienia i chmurka stoją przy polu, które po ruchu kamery jest gdzie indziej;
    // pole wpisywania punktów idzie za kartką (placeEntry w każdej klatce)
    if (this.pickerOpen) this.closeNamePicker();
    if (this.tipKey) this.hideTip();
    return this.free;
  }

  /** Obrót notesu o przesunięcie w pikselach ekranu i skręt w radianach (PAD-10). */
  private rotateView(dx: number, dy: number, twist = 0, apply = true): void {
    const p = this.freePose();
    if (!p) return;
    const k = Math.PI / Math.max(240, Math.min(this.wrap.clientWidth, this.wrap.clientHeight));
    rotatePose(p, dx * k, dy * k, twist);
    if (apply) this.poseCamera();
  }

  /** Zoom względem punktu ekranu (PAD-11); `k` < 1 przybliża. */
  private zoomView(cx: number, cy: number, k: number): void {
    const p = this.freePose();
    if (!p || !this.spec || !this.pad) return;
    // kamera musi stać tam, gdzie liczymy promień spod kursora
    this.poseCamera();
    const point = this.zoomPoint(cx, cy, p);
    const home = this.homePose(1).dist;
    // kamera odsunięta przez autoZoom dalej niż zwykły limit nie przeskakuje przy pierwszym ruchu
    zoomPose(p, point, k, home / MAX_ZOOM, Math.max(home / MIN_ZOOM, p.dist));
    this.clampTarget(p);
    this.poseCamera();
  }

  /** Punkt obrotu zostaje przy notesie, żeby obrót po oddaleniu nie wyrzucał go z kadru. */
  private clampTarget(p: OrbitPose): void {
    if (!this.spec || !this.pad) return;
    const { W, H } = this.spec;
    const lim = Math.max(W, H) * 0.75;
    p.target.x = clamp(p.target.x, -lim, lim);
    p.target.z = clamp(p.target.z, -lim, lim);
    p.target.y = clamp(p.target.y, -lim, this.pad.top + lim);
  }

  /** Punkt sceny pod kursorem: notes albo kartka, a poza nimi płaszczyzna punktu obrotu. */
  private zoomPoint(cx: number, cy: number, p: OrbitPose): THREE.Vector3 {
    this.setRay(cx, cy);
    const objs: THREE.Object3D[] = [];
    if (this.active) objs.push(this.active.mesh);
    if (this.pad) objs.push(this.pad.group);
    const hit = this.raycaster.intersectObjects(objs, true)[0];
    if (hit) return hit.point.clone();
    const fwd = new THREE.Vector3(0, 0, -1).applyQuaternion(p.quat);
    const plane = new THREE.Plane().setFromNormalAndCoplanarPoint(fwd, p.target);
    const out = new THREE.Vector3();
    return this.raycaster.ray.intersectPlane(plane, out) ?? p.target.clone();
  }

  /** Płynnie przywraca widok domyślny z góry (przycisk „Widok z góry”, klawisz 0; PAD-12). */
  resetView(): void {
    if (!this.free || !this.spec) return;
    this.homeAnim = { from: clonePose(this.free), t0: performance.now() };
  }

  private stepHome(now: number): void {
    const h = this.homeAnim;
    if (!h || !this.free) return;
    const t = Math.min(1, (now - h.t0) / HOME_MS);
    lerpPose(h.from, this.homePose(1), easeInOut(t), this.free);
    if (t >= 1) {
      this.homeAnim = null;
      this.free = null;
    }
    this.poseCamera();
  }

  /** Jak daleko (w kadrze) sięga kartka; > 1 znaczy, że wychodzi poza obraz. */
  private sheetExtent(a: PaperSheet): number {
    const P = a.cloth.pos;
    const v = new THREE.Vector3();
    let e = 0;
    for (let i = 0; i < a.cloth.n; i += 2) {
      v.set(P[i * 3], P[i * 3 + 1], P[i * 3 + 2]).project(this.camera);
      // podniesiona kartka przechodzi nad taśmą: u góry kadru (albo z lewej, gdy notes klejony z boku)
      e = this.spec?.rot
        ? Math.max(e, Math.abs(v.y) / 0.94, v.x < 0 ? -v.x / 0.8 : v.x / 0.94)
        : Math.max(e, Math.abs(v.x) / 0.94, v.y > 0 ? v.y / 0.8 : -v.y / 0.94);
    }
    return e;
  }

  // ═════════════════════════════════════════════════════ notesy

  private async useTemplate(id: string, fresh = false): Promise<void> {
    const t = this.templates.find((x) => x.id === id);
    if (!t || this.switching) return;
    this.switching = true;
    try {
      this.closePicker();
      this.endDrag(true);
      const spec = makeSpec(t);
      const ps = await preparePrint(t, spec.glue, this.maxSide);
      if (this.destroyed) return;
      if (this.active) {
        this.scene.remove(this.active.mesh);
        this.active.dispose();
        this.active = null;
      }
      if (this.pad) {
        this.scene.remove(this.pad.group);
        this.pad.dispose();
      }
      this.hideTip();
      this.t = t;
      this.spec = spec;
      this.ps = ps;
      // wskazówki zależne od tego, z której strony notes jest klejony
      this.wrap
        .querySelectorAll('[data-edge]')
        .forEach((x) => (x.textContent = spec.rot ? 'prawą' : 'dolną'));
      this.wrap
        .querySelectorAll('[data-pull]')
        .forEach((x) => (x.textContent = spec.rot ? 'w prawo albo w bok' : 'w dół albo w bok'));
      this.pad = new Pad(spec, ps, t, this.aniso);
      this.scene.add(this.pad.group);
      const st = this.stateFor(t, fresh);
      this.pad.setLeft(st.left);
      this.placeLights();
      this.active = this.makeSheet(st.data);
      this.scene.add(this.active.mesh);
      this.saved.tpl = t.id;
      this.wrap.style.setProperty('--accent', t.accent ?? t.tape);
      this.host.style.setProperty('--accent', t.accent ?? t.tape);
      // notes otwiera się zawsze w widoku z góry (PAD-12)
      this.free = null;
      this.homeAnim = null;
      this.autoZoom = 1;
      this.layoutCamera();
      this.updatePadInfo();
      this.renderMenu();
      this.persist();
      this.host.dispatchEvent(
        new CustomEvent('scorepad:template', {
          detail: { id: t.id, name: t.name },
          bubbles: true,
          composed: true,
        }),
      );
    } catch (e) {
      this.say((e as Error).message);
    } finally {
      this.switching = false;
    }
  }

  private stateFor(t: PadTemplate, fresh: boolean): PadState {
    const ex = this.saved.sheets[t.id];
    if (ex && !fresh) {
      const st = {
        data: normalizeSheet(ex.data, t),
        left: clamp(Number(ex.left) || this.cfg.view.sheets, 1, this.cfg.view.sheets),
      };
      this.saved.sheets[t.id] = st;
      return st;
    }
    const prevGame = ex?.data?.game ?? 0;
    const data =
      t.id === 'general' && !ex
        ? exampleGeneral(t)
        : blankSheet(t, fresh ? Math.max(1, prevGame) : 1);
    const st = { data, left: ex?.left ?? this.cfg.view.sheets };
    this.saved.sheets[t.id] = st;
    return st;
  }

  private makeSheet(data: SheetData): PaperSheet {
    const t = this.t as PadTemplate;
    const ps = this.ps as PrintSet;
    let bt = this.backTex.get(ps.key);
    if (!bt) {
      bt = new THREE.CanvasTexture(ps.back);
      bt.encoding = THREE.sRGBEncoding;
      bt.anisotropy = this.aniso;
      this.backTex.set(ps.key, bt);
    }
    const sheet = new PaperSheet(
      t,
      data,
      ps,
      this.spec as Spec,
      (this.pad as Pad).top,
      bt,
      this.trans,
      this.aniso,
      this.cfg,
    );
    this.viz?.setCloth(sheet.cloth);
    return sheet;
  }

  private persist(): void {
    if (this.opts.club) {
      this.emitSheetChange();
      return;
    }
    saveState(this.opts.storageKey, this.saved);
  }

  /**
   * Tryb klubowy: stan kartki zapisuje aplikacja (szkic partii, PAD-4), więc zamiast zapisu
   * w `localStorage` notes wysyła wpisy wierzchniej kartki w zdarzeniu `scorepad:change`.
   * Wysyłane przy każdej zmianie stanu notesu, także bez zmiany wpisów (aplikacja porównuje).
   */
  private emitSheetChange(): void {
    if (!this.t || !this.active || this.switching || this.opts.readOnly) return;
    const detail: PadChangeDetail = { sheet: packSheet(this.active.data) };
    this.host.dispatchEvent(
      new CustomEvent('scorepad:change', { detail, bubbles: true, composed: true }),
    );
  }

  private applyTheme(): void {
    const theme: PadTheme = this.opts.theme === 'light' ? 'light' : 'dark';
    this.wrap.dataset.theme = theme;
    if (!this.scene) return;
    (this.scene.background as THREE.Color).setHex(ROOM[theme]);
    this.scene.fog?.color.setHex(ROOM[theme]);
  }

  private updatePadInfo(): void {
    if (!this.t || !this.active) return;
    const left = this.saved.sheets[this.t.id]?.left ?? this.cfg.view.sheets;
    this.ui.tplName.textContent = this.t.name;
    this.ui.tplSub.textContent = `partia nr ${this.active.data.game} · ${left} ${plural(left, 'kartka', 'kartki', 'kartek')}`;
  }

  private say(msg: string): void {
    this.ui.loading.textContent = msg;
  }

  // ═════════════════════════════════════════════════════ menu notesów

  private renderMenu(): void {
    const m = this.ui.menu;
    const cur = this.t?.id;
    const items = this.templates
      .map((t) => {
        const thumb = t.image
          ? `style="--c:${t.tape};background-image:url('${t.image}')"`
          : `style="--c:${t.tape}"`;
        return `<li><button type="button" class="menu-item" role="menuitemradio" data-id="${esc(t.id)}" aria-checked="${t.id === cur}">
          <span class="sw" ${thumb}>${t.image ? '' : esc(t.name.slice(0, 1))}</span>
          <span><b>${esc(t.name)}</b><small>${fmtSize(t)} · ${playerCount(t)} ${plural(playerCount(t), 'gracz', 'graczy', 'graczy')}</small></span></button></li>`;
      })
      .join('');
    const canDel = !this.opts.club && !!this.t && this.custom.has(this.t.id);
    // pozycje wtyczek (edytor w notesie) tylko przy atrybucie `editor`; plik notesu działa zawsze
    const extra = this.cfg.ui.editor ? this.menuProviders.flatMap((f) => f()) : [];
    m.innerHTML = `<ul role="menu">${items}</ul>
      <div class="menu-acts">
        ${extra.map((it, i) => `<button type="button" class="menu-act${it.danger ? ' danger' : ''}" data-x="${i}">${esc(it.label)}</button>`).join('')}
        <button type="button" class="menu-act" data-m="save">Zapisz notes do pliku…</button>
        <button type="button" class="menu-act" data-m="load">Wczytaj notes z pliku…</button>
        ${canDel ? `<button type="button" class="menu-act danger" data-m="del">Usuń ten notes</button>` : ''}
      </div>`;
    m.querySelectorAll<HTMLButtonElement>('[data-x]').forEach((b) =>
      b.addEventListener('click', () => {
        this.closeMenu();
        extra[Number(b.dataset.x)]?.run();
      }),
    );
    m.querySelectorAll<HTMLButtonElement>('[data-id]').forEach((b) =>
      b.addEventListener('click', () => {
        this.closeMenu();
        void this.setTemplate(b.dataset.id as string);
      }),
    );
    m.querySelector('[data-m="save"]')?.addEventListener('click', () => {
      this.closeMenu();
      void this.saveConfigFile(false).then((msg) => msg && this.emit('status', msg, 'ok'));
    });
    m.querySelector('[data-m="load"]')?.addEventListener('click', () => {
      this.closeMenu();
      (this.ui.fileIn as HTMLInputElement).click();
    });
    m.querySelector('[data-m="del"]')?.addEventListener('click', () => {
      const acts = m.querySelector('.menu-acts') as HTMLElement;
      acts.innerHTML = `<div class="menu-confirm">Usunąć notes „${esc(this.t?.name ?? '')}” razem z bieżącą kartką?
        <div><button type="button" class="danger" data-c="yes">Usuń</button><button type="button" data-c="no">Zostaw</button></div></div>`;
      acts.querySelector('[data-c="no"]')?.addEventListener('click', () => this.renderMenu());
      acts
        .querySelector('[data-c="yes"]')
        ?.addEventListener('click', () => void this.deleteCurrent());
    });
  }

  private async deleteCurrent(): Promise<void> {
    const t = this.t;
    if (!t || !this.custom.has(t.id)) return;
    await this.store.remove(t.id);
    this.custom.delete(t.id);
    this.templates = this.templates.filter((x) => x.id !== t.id);
    delete this.saved.sheets[t.id];
    dropPrint(t);
    this.closeMenu();
    const next = this.templates[0];
    if (next) await this.useTemplate(next.id);
    this.renderMenu();
    this.persist();
  }

  private toggleMenu(): void {
    const open = this.ui.menu.hidden;
    if (open) this.renderMenu();
    this.ui.menu.hidden = !open;
    this.ui.tplBtn.setAttribute('aria-expanded', String(open));
    if (open) (this.ui.menu.querySelector('[aria-checked="true"]') as HTMLElement | null)?.focus();
  }

  private closeMenu(): void {
    this.ui.menu.hidden = true;
    this.ui.tplBtn.setAttribute('aria-expanded', 'false');
  }

  // ═════════════════════════════════════════════════════ zdarzenia

  private bindUi(): void {
    const c = this.renderer.domElement;
    c.addEventListener('pointerdown', (e) => this.onDown(e));
    c.addEventListener('pointermove', (e) => this.onMove(e));
    c.addEventListener('pointerup', (e) => this.onUp(e));
    c.addEventListener('pointercancel', (e) => this.onUp(e));
    // utracone przechwycenie (np. przełączenie okna w trakcie obrotu) kończy obrót
    c.addEventListener('lostpointercapture', (e) => {
      if (this.orbitDrag?.pointerId !== e.pointerId) return;
      this.orbitDrag = null;
      c.style.cursor = '';
    });
    // prawy przycisk obraca notes, a przytrzymanie pola na dotyku pokazuje opis: bez menu przeglądarki
    c.addEventListener('contextmenu', (e) => e.preventDefault());
    c.addEventListener('pointerleave', (e) => {
      if (e.pointerType === 'mouse') this.hideTip();
      if (!this.drag && this.active) {
        this.active.cloth.hoverWant = 0;
        c.style.cursor = '';
      }
    });
    c.addEventListener(
      'touchend',
      (e) => {
        if (e.cancelable) e.preventDefault();
      },
      { passive: false },
    );
    c.addEventListener(
      'wheel',
      (e) => {
        e.preventDefault();
        if (this.drag || !this.spec) return;
        // kółko myszy i przewijanie touchpada; szczypanie touchpada przychodzi z Ctrl (PAD-11)
        const unit = e.deltaMode === 1 ? 16 : e.deltaMode === 2 ? 400 : 1;
        const dy = clamp(e.deltaY * unit, -300, 300);
        this.zoomView(e.clientX, e.clientY, Math.exp(dy * (e.ctrlKey ? 0.01 : 0.0018)));
      },
      { passive: false },
    );

    this.ui.tplBtn.addEventListener('click', () => this.toggleMenu());
    this.wrap.addEventListener('keydown', (e) => {
      if (e.key === 'Escape') {
        this.closePicker();
        this.closeMenu();
        return;
      }
      // skróty widoku, gdy fokus nie jest w polu wpisywania (PAD-12)
      // (w oknie wpisywania, menu i dialogu klawisze należą do nich; w trakcie przewracania kartki
      // kamera stoi, bo przeciąganie liczy pozycję z jej kopii)
      const tgt = e.composedPath()[0] as HTMLElement | undefined;
      if (
        this.pickerOpen ||
        this.drag ||
        tgt?.closest?.('input, textarea, select, .picker, .menu, .dlg') ||
        e.ctrlKey ||
        e.metaKey ||
        e.altKey
      )
        return;
      const r = this.renderer.domElement.getBoundingClientRect();
      const mx = r.left + r.width / 2;
      const my = r.top + r.height / 2;
      if (e.key === '0') this.resetView();
      else if (e.key === '+' || e.key === '=') this.zoomView(mx, my, 1 / 1.4);
      else if (e.key === '-') this.zoomView(mx, my, 1.4);
      else return;
      e.preventDefault();
    });
    this.ui.homeBtn.addEventListener('click', () => this.resetView());
    this.wrap.addEventListener('pointerdown', (e) => {
      if (!this.ui.menu.hidden && !(e.target as HTMLElement).closest('.bar')) this.closeMenu();
    });

    const syncSound = (this.syncSound = (): void => {
      this.ui.sound.setAttribute('aria-pressed', String(this.sfx.on));
      this.ui.sound.title = this.sfx.on ? 'Wycisz dźwięki' : 'Włącz dźwięki';
    });
    syncSound();
    this.ui.sound.addEventListener('click', () => {
      this.sfx.on = !this.sfx.on;
      this.saved.sound = this.sfx.on;
      if (this.sfx.on) this.sfx.unlock();
      syncSound();
      this.persist();
    });

    this.syncHelp();
    const helpRo = new ResizeObserver(() => this.syncHelp());
    helpRo.observe(this.wrap);
    this.observers.push(helpRo);
    (this.root.querySelector('.help-close') as HTMLElement).addEventListener('click', () => {
      this.saved.help = false;
      this.syncHelp();
      this.persist();
    });
    this.ui.helpBtn.addEventListener('click', () => {
      this.saved.help = true;
      if (this.wrap.clientWidth < 720 || this.wrap.clientHeight < 520) {
        this.ui.help.hidden = !this.ui.help.hidden;
      } else this.syncHelp();
      this.persist();
    });
    const fileIn = this.ui.fileIn as HTMLInputElement;
    fileIn.addEventListener('change', () => {
      const f = fileIn.files?.[0];
      fileIn.value = '';
      if (f) void this.importFile(f);
    });
    this.ui.dlg.addEventListener('click', (e) => {
      const b = (e.target as HTMLElement).closest('[data-d]') as HTMLElement | null;
      if (!b && e.target !== this.ui.dlg) return;
      if (b?.dataset.d === 'copy') {
        const ta = this.ui.dlg.querySelector('textarea') as HTMLTextAreaElement;
        ta.select();
        navigator.clipboard?.writeText(ta.value).then(
          () =>
            ((this.ui.dlg.querySelector('.dlg-msg') as HTMLElement).textContent =
              'Skopiowano do schowka.'),
          () =>
            ((this.ui.dlg.querySelector('.dlg-msg') as HTMLElement).textContent =
              'Zaznaczyłem tekst — skopiuj go skrótem klawiszowym.'),
        );
        return;
      }
      this.ui.dlg.hidden = true;
    });

    (this.ui.pkName as HTMLFormElement).addEventListener('submit', (e) => {
      e.preventDefault();
      const inp = this.ui.pkInput as HTMLInputElement;
      this.setName(Number(inp.dataset.p), inp.value);
      this.closePicker();
    });
    (this.root.querySelector('.pk-close') as HTMLElement).addEventListener('click', () =>
      this.closePicker(),
    );
    this.wireEntry();
    this.ui.chip.addEventListener('click', () => this.showHistory());
  }

  private setRay(cx: number, cy: number, cam: THREE.Camera = this.camera): void {
    const r = this.renderer.domElement.getBoundingClientRect();
    this.ndc.set(((cx - r.left) / r.width) * 2 - 1, -((cy - r.top) / r.height) * 2 + 1);
    this.raycaster.setFromCamera(this.ndc, cam);
  }

  private hitTest(cx: number, cy: number): Hit | null {
    const a = this.active;
    const t = this.t;
    const s = this.spec;
    if (!a || !t || !s) return null;
    // od tyłu notesu nie da się pisać ani odrywać (PAD-10)
    if (!this.seesTop()) return null;
    this.setRay(cx, cy);
    const area = s.area;
    // przy kartce o niestandardowym kształcie liczy się tylko trafienie w papier (wycięcia przepuszczają)
    const h = this.raycaster
      .intersectObject(a.mesh, false)
      .find((x) => x.uv && (!area || area.inside(x.uv.x, 1 - x.uv.y)));
    if (!h) return null;
    const uv = (h.uv as THREE.Vector2).clone();
    const point = h.point.clone();
    const back = !!h.face && this.raycaster.ray.direction.dot(h.face.normal) > 0;
    // bez odrywania (`tear: false`) krawędź kartki nie daje się chwycić: dalej trafia w pola
    const tearable = this.opts.tear !== false && !this.opts.readOnly;
    if (!a.resting || back) return tearable ? { kind: 'edge', uv, point } : null;
    const sx = uv.x * s.W;
    const sy = (1 - uv.y) * s.H;
    const edge = area ? area.edgeDist(uv.x, 1 - uv.y) * s.W : Math.min(sx, s.W - sx, s.H - sy);
    if (tearable && edge < this.cfg.tear.edgeGrab) return { kind: 'edge', uv, point };
    // uv siatki to układ fizyczny; pola leżą we współrzędnych treści
    const c = s.rot ? { u: 1 - uv.y, v: 1 - uv.x } : { u: uv.x, v: 1 - uv.y };
    const sp = hitSpot(t, c.u, c.v);
    // podgląd zapisanej karteczki: pola nie przyjmują wpisów, lewy przycisk obraca
    if (this.opts.readOnly) return null;
    if (sp) {
      const kind = t.lines[sp.li].kind;
      if (kind === 'input') return { kind: 'cell', uv, point, spot: sp };
      if (kind === 'names') return { kind: 'name', uv, point, spot: sp };
    }
    return { kind: 'none', uv, point, spot: sp ?? undefined };
  }

  /** Najbliższy węzeł papieru (z pominięciem dwóch wierszy pod taśmą). */
  private nearestParticle(uv: THREE.Vector2): number {
    const s = this.spec as Spec;
    const real = this.active?.cloth.real;
    const x = uv.x * s.W;
    const z = (1 - uv.y) * s.H;
    let idx = 2 * s.NX + clamp(Math.round(uv.x * (s.NX - 1)), 0, s.NX - 1);
    let best = Infinity;
    for (let j = 2; j < s.NY; j++) {
      for (let i = 0; i < s.NX; i++) {
        const id = j * s.NX + i;
        if (real && !real[id]) continue;
        const d = (i * s.DX - x) ** 2 + (s.zr[j] - z) ** 2;
        if (d < best) {
          best = d;
          idx = id;
        }
      }
    }
    return idx;
  }

  private edgeParticle(uv: THREE.Vector2): number {
    const s = this.spec as Spec;
    const cl = this.active?.cloth;
    if (s.area && cl) {
      // węzeł papieru leżący na brzegu kształtu (obok węzła spoza kartki albo na skraju siatki)
      const x = uv.x * s.W;
      const z = (1 - uv.y) * s.H;
      let idx = this.nearestParticle(uv);
      let best = Infinity;
      for (let j = 3; j < s.NY; j++) {
        for (let i = 0; i < s.NX; i++) {
          const id = j * s.NX + i;
          if (!cl.real[id]) continue;
          const rim =
            i === 0 ||
            i === s.NX - 1 ||
            j === s.NY - 1 ||
            !cl.real[id - 1] ||
            !cl.real[id + 1] ||
            !cl.real[id + s.NX] ||
            !cl.real[id - s.NX];
          if (!rim) continue;
          const d = (i * s.DX - x) ** 2 + (s.zr[j] - z) ** 2;
          if (d < best) {
            best = d;
            idx = id;
          }
        }
      }
      return idx;
    }
    const fi = uv.x * (s.NX - 1);
    const z = (1 - uv.y) * s.H;
    const dl = uv.x * s.W;
    const dr = (1 - uv.x) * s.W;
    const db = s.H - z;
    if (db <= Math.min(dl, dr)) return (s.NY - 1) * s.NX + clamp(Math.round(fi), 0, s.NX - 1);
    const j = (this.nearestParticle(uv) / s.NX) | 0;
    return Math.max(3, j) * s.NX + (dl < dr ? 0 : s.NX - 1);
  }

  private onDown(e: PointerEvent): void {
    this.sfx.unlock();
    this.closeMenu();
    // pole wpisywania zachowuje fokus (klawiatura telefonu zostaje otwarta między polami)
    if (this.entry) e.preventDefault();
    if (e.pointerType === 'touch') {
      this.touches.set(e.pointerId, { x: e.clientX, y: e.clientY });
      if (this.touches.size >= 2) {
        this.beginGesture();
        return;
      }
    }
    if (this.gesture || this.orbitDrag || this.switching) return;
    // mysz: prawy przycisk obraca notes w każdym miejscu (PAD-10)
    if (e.pointerType === 'mouse' && e.button === 2) {
      this.beginOrbit(e);
      return;
    }
    if (!e.isPrimary || e.button > 0) return;
    if (this.pickerOpen) {
      this.closePicker();
      return;
    }
    this.hideTip();
    const hit = this.hitTest(e.clientX, e.clientY);
    // poza polami punktów wpisywanie się kończy (poprawny wpis zostaje zapisany)
    if (this.entry && hit?.kind !== 'cell') this.leaveEntry();
    if (!hit) {
      // lewy przycisk poza notesem (albo od tyłu notesu) też obraca
      if (e.pointerType !== 'touch') this.beginOrbit(e);
      return;
    }
    if (hit.kind === 'edge') {
      e.preventDefault();
      this.beginDrag(e, hit);
      return;
    }
    const sp = hit.spot;
    if (hit.kind === 'cell' || hit.kind === 'name' || (sp && this.hintOf(sp))) {
      const press = { x: e.clientX, y: e.clientY, hit, held: false };
      this.press = press;
      // dotyk: przytrzymanie pokazuje opis kategorii (i wtedy nie otwiera wpisywania)
      if (e.pointerType !== 'mouse' && sp && this.hintOf(sp)) {
        clearTimeout(this.holdTimer);
        this.holdTimer = window.setTimeout(() => {
          if (this.press !== press) return;
          press.held = true;
          this.showTip(sp, 4200);
          try {
            navigator.vibrate?.(8);
          } catch {
            /* bez wibracji */
          }
        }, 450);
      }
    }
  }

  private onMove(e: PointerEvent): void {
    const now = performance.now();
    if (this.lastMove.t) {
      const v =
        (Math.hypot(e.clientX - this.lastMove.x, e.clientY - this.lastMove.y) /
          Math.max(1, now - this.lastMove.t)) *
        1000;
      this.pointerSpeed = lerp(this.pointerSpeed, v, 0.35);
    }
    this.lastMove = { x: e.clientX, y: e.clientY, t: now };
    if (e.pointerType === 'touch' && this.touches.has(e.pointerId)) {
      if (this.gesture) {
        this.moveGesture(e);
        return;
      }
      this.touches.set(e.pointerId, { x: e.clientX, y: e.clientY });
      if (this.gestureIds.has(e.pointerId)) return;
    }
    const o = this.orbitDrag;
    if (o) {
      if (e.pointerId !== o.pointerId) return;
      const dx = e.clientX - o.x;
      const dy = e.clientY - o.y;
      o.x = e.clientX;
      o.y = e.clientY;
      // Shift: poziomy ruch skręca notes wokół osi patrzenia
      if (e.shiftKey) this.rotateView(0, 0, dx * 0.01);
      else this.rotateView(dx, dy);
      return;
    }
    if (this.drag) {
      if (e.pointerId === this.drag.pointerId) this.updateDragRaw(this.drag, e.clientX, e.clientY);
      return;
    }
    if (this.press && Math.hypot(e.clientX - this.press.x, e.clientY - this.press.y) > 10)
      clearTimeout(this.holdTimer);
    if (e.pointerType === 'mouse') this.hoverQueued = { x: e.clientX, y: e.clientY };
  }

  private onUp(e: PointerEvent): void {
    if (e.pointerType === 'touch') {
      this.touches.delete(e.pointerId);
      if (this.gesture && (e.pointerId === this.gesture.a || e.pointerId === this.gesture.b))
        this.gesture = null;
      if (this.gestureIds.delete(e.pointerId)) return;
    }
    if (this.orbitDrag && e.pointerId === this.orbitDrag.pointerId) {
      this.orbitDrag = null;
      this.releasePointer(e.pointerId);
      this.renderer.domElement.style.cursor = '';
      return;
    }
    if (this.drag && e.pointerId === this.drag.pointerId) {
      this.endDrag(false);
      return;
    }
    clearTimeout(this.holdTimer);
    const pr = this.press;
    this.press = null;
    if (!pr || !this.active || pr.held) return;
    if (
      Math.hypot(e.clientX - pr.x, e.clientY - pr.y) < 10 &&
      e.type === 'pointerup' &&
      this.active.resting
    ) {
      if (pr.hit.kind === 'cell' && pr.hit.spot) this.tapCell(pr.hit.spot);
      else if (pr.hit.kind === 'name' && pr.hit.spot) this.openNamePicker(pr.hit.spot);
    }
  }

  private releasePointer(id: number): void {
    try {
      this.renderer.domElement.releasePointerCapture(id);
    } catch {
      /* już zwolniony */
    }
  }

  private beginOrbit(e: PointerEvent): void {
    if (!this.spec) return;
    e.preventDefault();
    this.orbitDrag = { pointerId: e.pointerId, x: e.clientX, y: e.clientY };
    try {
      this.renderer.domElement.setPointerCapture(e.pointerId);
    } catch {
      /* obrót działa i bez przechwycenia */
    }
    this.renderer.domElement.style.cursor = 'move';
  }

  /** Drugi palec: przerywa pisanie i przewracanie kartki, dalej palce obracają i przybliżają. */
  private beginGesture(): void {
    const ids = [...this.touches.keys()].slice(-2);
    const [a, b] = ids as [number, number];
    this.gesture = { a, b };
    for (const id of this.touches.keys()) this.gestureIds.add(id);
    clearTimeout(this.holdTimer);
    this.press = null;
    if (this.drag) this.endDrag(true);
    this.orbitDrag = null;
    // wpisywanie punktów zostaje: palce obracają i przybliżają, klawiatura telefonu się nie chowa
    this.closeNamePicker();
    this.hideTip();
  }

  private moveGesture(e: PointerEvent): void {
    const g = this.gesture as { a: number; b: number };
    const a0 = this.touches.get(g.a);
    const b0 = this.touches.get(g.b);
    this.touches.set(e.pointerId, { x: e.clientX, y: e.clientY });
    if (!a0 || !b0 || (e.pointerId !== g.a && e.pointerId !== g.b)) return;
    const m = twoFinger(
      a0,
      b0,
      this.touches.get(g.a) as { x: number; y: number },
      this.touches.get(g.b) as { x: number; y: number },
    );
    if (m.scale !== 1) {
      this.rotateView(m.dx, m.dy, m.twist, false);
      this.zoomView(m.x, m.y, 1 / m.scale);
    } else this.rotateView(m.dx, m.dy, m.twist);
  }

  private processHover(): void {
    if (!this.hoverQueued || this.drag || !this.active) return;
    const { x, y } = this.hoverQueued;
    this.hoverQueued = null;
    const hit = this.hitTest(x, y);
    const cl = this.active.cloth;
    const c = this.renderer.domElement;
    if (hit && hit.kind === 'edge' && this.active.resting) {
      c.style.cursor = 'grab';
      cl.hover = this.edgeParticle(hit.uv);
      cl.hoverWant = 1;
      cl.wake();
    } else {
      cl.hoverWant = 0;
      c.style.cursor =
        hit && (hit.kind === 'cell' || hit.kind === 'name')
          ? 'pointer'
          : hit && hit.kind === 'edge'
            ? 'grab'
            : '';
    }
    // chmurka z opisem kategorii nad polem pod kursorem
    const sp =
      hit && hit.kind !== 'edge' && this.active.resting && !this.pickerOpen ? hit.spot : undefined;
    this.hoverTip(sp && this.hintOf(sp) ? sp : null);
  }

  // ═════════════════════════════════════════════════════ chmurka z opisem kategorii

  private hintOf(sp: Spot): string {
    return (this.t?.lines[sp.li]?.hint ?? '').trim();
  }

  private hoverTip(sp: Spot | null): void {
    if ((sp?.key ?? null) === this.tipKey) return;
    clearTimeout(this.tipTimer);
    if (!sp) {
      this.hideTip();
      return;
    }
    // przy przejściu między polami chmurka zmienia się od razu (także tuż po zniknięciu), pierwsza — po chwili
    const warm =
      (!this.ui.tip.hidden && this.ui.tip.classList.contains('on')) ||
      performance.now() - this.tipHiddenAt < 600;
    this.tipKey = sp.key;
    if (warm) this.showTip(sp);
    else this.tipTimer = window.setTimeout(() => this.showTip(sp), 320);
  }

  private showTip(sp: Spot, autoHide = 0): void {
    const t = this.t;
    const tip = this.ui.tip as HTMLElement;
    if (!t || !this.active) return;
    const line = t.lines[sp.li];
    const text = this.hintOf(sp);
    if (!line || !text) return;
    clearTimeout(this.tipTimer);
    this.tipKey = sp.key;
    (this.ui.tipT as HTMLElement).textContent = line.label;
    (this.ui.tipX as HTMLElement).textContent = text;
    tip.hidden = false;
    tip.classList.remove('up', 'down');
    // punkt zaczepienia: środek górnej (albo dolnej) krawędzi pola na ekranie
    const r = sp.rect;
    const a = this.screenOf(r.x + r.w / 2, 1 - r.y);
    const b = this.screenOf(r.x + r.w / 2, 1 - (r.y + r.h));
    const cx = (a.x + b.x) / 2;
    const top = Math.min(a.y, b.y);
    const bottom = Math.max(a.y, b.y);
    const W = this.wrap.clientWidth;
    const w = tip.offsetWidth;
    const h = tip.offsetHeight;
    const x = clamp(cx - w / 2, 8, Math.max(8, W - w - 8));
    const up = top - h - 10 >= 8;
    tip.classList.add(up ? 'up' : 'down');
    tip.style.left = `${x}px`;
    tip.style.top = `${up ? top - h - 10 : bottom + 10}px`;
    tip.style.setProperty('--ax', `${clamp(cx - x, 14, w - 14)}px`);
    tip.classList.remove('on');
    void tip.offsetWidth;
    tip.classList.add('on');
    if (autoHide) this.tipTimer = window.setTimeout(() => this.hideTip(), autoHide);
  }

  private hideTip(): void {
    clearTimeout(this.tipTimer);
    this.tipKey = null;
    const tip = this.ui.tip as HTMLElement | undefined;
    if (!tip || tip.hidden) return;
    if (tip.classList.contains('on')) this.tipHiddenAt = performance.now();
    tip.classList.remove('on');
    this.tipTimer = window.setTimeout(() => {
      if (!this.tipKey) tip.hidden = true;
    }, 160);
  }

  // ═════════════════════════════════════════════════════ przewracanie i odrywanie

  private floorPoint(cx: number, cy: number, y: number, out: THREE.Vector3): boolean {
    this.setRay(cx, cy, this.dragCam ?? this.camera);
    const plane = new THREE.Plane(new THREE.Vector3(0, 1, 0), -y);
    return !!this.raycaster.ray.intersectPlane(plane, out);
  }

  private beginDrag(e: PointerEvent, hit: Hit): void {
    this.hideTip();
    const a = this.active as PaperSheet;
    const cl = a.cloth;
    this.closePicker();
    const idx = this.nearestParticle(hit.uv);
    const o = idx * 3;
    const p = new THREE.Vector3(cl.pos[o], cl.pos[o + 1], cl.pos[o + 2]);
    const R = Math.max(0.2, cl.rest[o + 2] - cl.hingeZ);
    const theta = Math.atan2(Math.max(0, p.y - cl.floorY), p.z - cl.hingeZ);
    this.dragCam = this.camera.clone();
    this.dragCam.updateMatrixWorld();
    const f = new THREE.Vector3();
    if (!this.floorPoint(e.clientX, e.clientY, cl.floorY, f)) return;
    this.drag = {
      idx,
      pointerId: e.pointerId,
      R,
      s0: clamp(theta / (Math.PI / 2), 0, 2),
      z0: f.z,
      offX: p.x - f.x,
      raw: p.clone(),
      clamped: p.clone(),
      excess: 0,
      loads: new Float32Array(this.spec!.NX),
      x: e.clientX,
      y: e.clientY,
      tearing: false,
    };
    cl.hoverWant = 0;
    cl.startGrab(idx, p);
    try {
      this.renderer.domElement.setPointerCapture(e.pointerId);
    } catch {
      /* przeciąganie działa i bez przechwycenia */
    }
    this.renderer.domElement.style.cursor = 'grabbing';
    this.sfx.rustle();
  }

  /**
   * Widok z góry: przesunięcie kursora w stronę grzbietu obraca kartkę wokół zawiasu
   * (od leżącej, przez pionową, do przewróconej za grzbiet). Ruch dalej niż pozwala kartka
   * staje się ciągnięciem, które przy dużej sile odrywa ją od kleju.
   */
  private updateDragRaw(d: Drag, cx: number, cy: number): void {
    const cl = (this.active as PaperSheet).cloth;
    const f = new THREE.Vector3();
    if (!this.floorPoint(cx, cy, cl.floorY, f)) return;
    const k = 0.62;
    const s = d.s0 + (d.z0 - f.z) / (d.R * k);
    const zh = cl.hingeZ;
    const yf = cl.floorY;
    const x = f.x + d.offX;
    if (s < 0) d.raw.set(x, yf, zh + d.R - s * d.R * k);
    else if (s > 2) d.raw.set(x, yf, zh - d.R - (s - 2) * d.R * k);
    else {
      const th = (s * Math.PI) / 2;
      d.raw.set(x, yf + d.R * Math.sin(th), zh + d.R * Math.cos(th));
    }
    d.x = cx;
    d.y = cy;
  }

  private evaluatePull(d: Drag): void {
    const cl = (this.active as PaperSheet).cloth;
    const NX = cl.s.NX;
    const R = cl.rest;
    const g = d.idx * 3;
    const out = d.clamped.copy(d.raw);
    const reach = (i: number): number => {
      const o = (NX + i) * 3;
      return Math.hypot(R[g] - R[o], R[g + 2] - R[o + 2]) + 0.01;
    };
    for (let it = 0; it < 10; it++) {
      for (let i = 0; i < NX; i++) {
        if (!cl.glued[i]) continue;
        const o = (NX + i) * 3;
        const dx = out.x - R[o];
        const dy = out.y - R[o + 1];
        const dz = out.z - R[o + 2];
        const L = Math.sqrt(dx * dx + dy * dy + dz * dz);
        const r = reach(i);
        if (L > r) {
          const kk = r / L;
          out.set(R[o] + dx * kk, R[o + 1] + dy * kk, R[o + 2] + dz * kk);
        }
      }
      cl.clampPoint(out);
    }
    d.excess = d.raw.distanceTo(out);
    for (let i = 0; i < NX; i++) {
      const o = (NX + i) * 3;
      d.loads[i] = cl.glued[i]
        ? Math.max(0, Math.hypot(d.raw.x - R[o], d.raw.y - R[o + 1], d.raw.z - R[o + 2]) - reach(i))
        : 0;
    }
  }

  private updateTear(d: Drag, dt: number): void {
    const cl = (this.active as PaperSheet).cloth;
    const NX = cl.s.NX;
    const T = this.cfg.tear;
    // szybkie szarpnięcie przyspiesza pękanie kleju (siła wpływu: tear.speed)
    const speedF = Math.max(
      0.05,
      1 + (clamp((this.pointerSpeed - 150) / 800, 0.18, 2.6) - 1) * T.speed,
    );
    let released = cl.releasedCount();
    for (let i = 0; i < NX; i++) {
      if (!cl.glued[i]) continue;
      // klej puszcza wyłącznie pod naciągiem — bez ciągnięcia rozdarcie się nie posuwa
      let rate = 0;
      if (d.loads[i] > T.threshold) rate += (d.loads[i] - T.threshold) * T.rate * speedF;
      const nb = cl.neighbourReleased(i);
      if (nb && d.excess > T.threshold * 0.4) rate += T.spread * d.excess * Math.max(speedF, 0.6);
      cl.damage[i] += rate * dt;
      if (cl.damage[i] >= 1) {
        cl.release(i);
        released++;
        d.tearing = true;
        this.sfx.crackle();
      }
    }
    if (released >= cl.glueCols) this.completeTear();
  }

  private endDrag(silent: boolean): void {
    const d = this.drag;
    if (!d || !this.active) return;
    // puszczona w połowie odrywania kartka zostaje przy bloczku (częściowo oderwana)
    void silent;
    this.active.cloth.endGrab();
    try {
      this.renderer.domElement.releasePointerCapture(d.pointerId);
    } catch {
      /* już zwolniony */
    }
    this.drag = null;
    this.dragCam = null;
    this.ui.tension.hidden = true;
    this.renderer.domElement.style.cursor = '';
  }

  private completeTear(): void {
    const sheet = this.active;
    const t = this.t;
    if (!sheet || !t || !this.pad) return;
    // poprawny wpis z klawiatury trafia na odrywaną kartkę
    this.closePicker();
    const cl = sheet.cloth;
    for (let i = 0; i < cl.s.NX; i++) cl.release(i);
    cl.endGrab();
    cl.flying = true;
    cl.flyT = 0;
    cl.wake();
    sheet.uni.uTorn.value = 1;
    sheet.focus = null;
    sheet.dirty = true;
    if (this.drag) {
      try {
        this.renderer.domElement.releasePointerCapture(this.drag.pointerId);
      } catch {
        /* już zwolniony */
      }
    }
    this.drag = null;
    this.dragCam = null;
    this.ui.tension.hidden = true;
    this.renderer.domElement.style.cursor = '';
    this.flyers.push(sheet);

    // każde oderwanie, także pustej kartki (wtedy bez `scorepad:save`)
    this.host.dispatchEvent(new CustomEvent('scorepad:tear', { bubbles: true, composed: true }));
    const entry = this.recordSheet(sheet.data, t);
    // tryb klubowy: partie zapisuje aplikacja, notes nie prowadzi własnej historii
    if (entry && !this.opts.club) {
      this.saved.history.unshift(entry);
      this.saved.history = this.saved.history.slice(0, 40);
    }
    const st = this.saved.sheets[t.id];
    this.lastTear = { tpl: t.id, left: st.left };
    st.left = st.left > 1 ? st.left - 1 : this.cfg.view.sheets;
    this.pad.setLeft(st.left);
    st.data = blankSheet(t, sheet.data.game + 1);
    // notes testowy kreatora: fikcyjni gracze zostają na kolejnej kartce (EDT-14)
    if (this.opts.test) st.data.names = sheet.data.names.map((n) => (n ? { ...n } : null));
    this.active = this.makeSheet(st.data);
    this.scene.add(this.active.mesh);
    this.updatePadInfo();
    this.persist();
    this.sfx.whoosh();
    const data = sheet.data;
    // obraz karteczki teraz: lecąca kartka jest potem usuwana razem z teksturą (PAD-6)
    // (tylko partia w trybie klubowym; notes testowy kreatora i demo obrazu nie zapisują)
    const shot =
      entry && this.opts.club && !this.opts.test ? sheet.snapshot(SHEET_IMAGE_MAX_SIDE) : null;
    // Partia: podsumowanie z potwierdzeniem pokazuje aplikacja (PAD-5).
    if (this.opts.summary !== false) window.setTimeout(() => this.showSaved(entry, data, t), 700);
    if (entry) {
      const detail: PadSaveDetail = {
        ...entry,
        sheet: packSheet(data),
        results: this.sheetResults(data, t),
        image: (options) => (shot ? encodeSheetImage(shot, options) : Promise.resolve(null)),
      };
      this.host.dispatchEvent(
        new CustomEvent('scorepad:save', { detail, bubbles: true, composed: true }),
      );
    }
  }

  /** Wyniki graczy kartki (PAD-7): gracze z imieniem albo wpisem, w kolejności miejsc. */
  private sheetResults(d: SheetData, t: PadTemplate): PadSaveResult[] {
    const seats: { seat: number; values: Record<string, number | null> }[] = [];
    for (let p = 0; p < playerCount(t); p++)
      if (playerActive(t, d, p)) seats.push({ seat: p, values: valuesOf(t, d, p) });
    return rankSheet(t, seats).map((r) => ({
      seat: r.seat,
      values: { ...(r.values as Record<string, number | null>) },
      totals: { ...r.totals },
      rankingValue: r.rankingValue,
      place: r.place,
      tied: r.tied,
      tiedWith: [...r.tiedWith],
    }));
  }

  private recordSheet(d: SheetData, t: PadTemplate): HistoryEntry | null {
    if (!anyValue(d)) return null;
    const seats: { seat: number; name: string; values: Record<string, number | null> }[] = [];
    for (let p = 0; p < playerCount(t); p++) {
      if (!playerActive(t, d, p)) continue;
      seats.push({
        seat: p,
        name: d.names[p]?.text || `Gracz ${p + 1}`,
        values: valuesOf(t, d, p),
      });
    }
    if (!seats.length) return null;
    const players = seats.map((p) => ({
      name: p.name,
      total: computePlayer(t, p.values).__total ?? 0,
    }));
    // Zwycięzcy według reguły miejsc notesu (EDT-2…EDT-4): każdy na miejscu 1, także wspólnym.
    // Puste pole jest za każdą liczbą; bez żadnej wartości kategorii decydującej nikt nie wygrywa.
    const first = new Set(
      rankSheet(t, seats)
        .filter((r) => r.place === 1 && r.rankingValue != null)
        .map((r) => r.seat),
    );
    return {
      id: uid(),
      tpl: t.id,
      tplName: t.name,
      game: d.game,
      at: new Date().toISOString(),
      players,
      winners: seats.filter((p) => first.has(p.seat)).map((p) => p.name),
    };
  }

  // ═════════════════════════════════════════════════════ wybór liczby

  /** Punkt kartki w scenie; (u, v) we współrzędnych tekstury treści (v = 1 u góry). */
  private sheetPoint(u: number, v: number): THREE.Vector3 {
    // notes klejony z lewej: punkt treści (u, y = 1 − v) leży w punkcie fizycznym (1 − y, u), czyli w uv (v, 1 − u)
    const [pu, pv] = this.spec?.rot ? [v, 1 - u] : [u, v];
    return (this.active as PaperSheet).cloth.pointAt(pu, pv, new THREE.Vector3());
  }

  /** Punkt kartki na ekranie; (u, v) we współrzędnych tekstury treści (v = 1 u góry). */
  private screenOf(
    u: number,
    v: number,
    r: { width: number; height: number } = this.wrap.getBoundingClientRect(),
  ): { x: number; y: number } {
    const p = this.sheetPoint(u, v).project(this.camera);
    return { x: ((p.x + 1) / 2) * r.width, y: ((1 - p.y) / 2) * r.height };
  }

  private anchors(sp: Spot): [{ x: number; y: number }, { x: number; y: number }] {
    const r = sp.rect;
    const v = 1 - (r.y + r.h / 2);
    return [this.screenOf(r.x, v), this.screenOf(r.x + r.w, v)];
  }

  private placePicker(l: { x: number; y: number }, r: { x: number; y: number }): void {
    const pk = this.ui.picker;
    pk.hidden = false;
    const W = this.wrap.clientWidth;
    const H = this.wrap.clientHeight;
    if (W < 560 || H < 360) {
      pk.classList.add('as-sheet');
      pk.style.left = '';
      pk.style.top = '';
    } else {
      pk.classList.remove('as-sheet');
      const b = pk.getBoundingClientRect();
      let x = r.x + 16;
      if (x + b.width > W - 12) x = l.x - 16 - b.width;
      x = clamp(x, 12, W - b.width - 12);
      const y = clamp((l.y + r.y) / 2 - b.height / 2, 12, H - b.height - 12);
      pk.style.left = `${x}px`;
      pk.style.top = `${y}px`;
    }
    requestAnimationFrame(() => pk.classList.add('open'));
    this.hideTip();
    this.pickerOpen = true;
    this.pickerShownAt = performance.now();
  }

  /** Kończy wpisywanie punktów i zamyka okno imienia. */
  private closePicker(): void {
    this.leaveEntry();
    this.closeNamePicker();
  }

  private closeNamePicker(): void {
    if (!this.pickerOpen) return;
    this.pickerOpen = false;
    this.ui.picker.hidden = true;
    this.ui.picker.classList.remove('open');
    if (this.active) {
      this.active.focus = null;
      this.active.dirty = true;
    }
  }

  private button(
    label: string,
    cls: string,
    onClick: () => void,
    aria?: string,
  ): HTMLButtonElement {
    const b = el('button', cls);
    b.type = 'button';
    b.textContent = label;
    if (aria) b.setAttribute('aria-label', aria);
    b.addEventListener('click', () => {
      if (performance.now() - this.pickerShownAt < 380) return;
      onClick();
    });
    return b;
  }

  // ═════════════════════════════════════════════════════ wpisywanie w pole (PAD-13…PAD-15)

  private get enIn(): HTMLInputElement {
    return this.ui.enIn as HTMLInputElement;
  }

  /** Telefon i tablet: przycisk ± i „Dalej” przy polu (komputer wpisuje z klawiatury sprzętowej). */
  private coarse(): boolean {
    return typeof matchMedia === 'function' && matchMedia('(pointer: coarse)').matches;
  }

  private wireEntry(): void {
    const inp = this.enIn;
    // litery nie pojawiają się w polu wcale: blokujemy je, zanim trafią do pola; minus zmienia znak
    inp.addEventListener('beforeinput', (e) => {
      const ie = e as InputEvent;
      if (ie.inputType !== 'insertText' || !ie.data) return;
      if (/^[-−+]$/.test(ie.data)) {
        e.preventDefault();
        this.flipTyped(ie.data === '+' ? false : undefined);
        return;
      }
      if (/\D/.test(ie.data)) e.preventDefault();
    });
    inp.addEventListener('input', () => {
      const clean = cleanNumber(inp.value, !!this.entry?.neg);
      if (clean !== inp.value) {
        inp.value = clean;
        inp.setSelectionRange(clean.length, clean.length);
      }
      this.typed();
    });
    inp.addEventListener('keydown', (e) => {
      const en = this.entry;
      if (!en || e.isComposing || e.ctrlKey || e.metaKey || e.altKey) return;
      const k = e.key;
      if (k === 'Enter' || k === 'Tab') {
        // Enter, „Dalej” klawiatury systemowej i Tab: zapis i następna kategoria; z Shift: poprzednia
        e.preventDefault();
        e.stopPropagation();
        this.commitEntry(e.shiftKey ? -1 : 1);
      } else if (k === 'Escape') {
        // Esc cofa zmianę; drugi Esc (bez zmian) kończy wpisywanie. Popup aplikacji się nie zamyka.
        e.preventDefault();
        e.stopPropagation();
        if (inp.value !== en.orig) {
          inp.value = en.orig;
          this.typed();
          inp.select();
        } else this.closeEntry(true);
      } else if (k === 'ArrowUp' || k === 'ArrowDown') {
        const line = this.t?.lines[en.spot.li];
        if (!line) return;
        e.preventDefault();
        inp.value = stepTyped(line, inp.value, k === 'ArrowUp' ? 1 : -1);
        inp.setSelectionRange(inp.value.length, inp.value.length);
        this.typed();
      } else if ((k === 'Backspace' || k === 'Delete') && !inp.value && this.scratched()) {
        // skreślone pole: Backspace w pustym polu usuwa skreślenie
        e.preventDefault();
        this.setValue(en.spot, null, false);
        this.syncScratch();
      }
    });
    // fokus poza notesem (np. pasek aplikacji): wpis zostaje zapisany, gdy jest poprawny
    inp.addEventListener('blur', () => {
      window.setTimeout(() => {
        if (this.entry && this.root.activeElement !== inp) this.leaveEntry();
      }, 0);
    });
    // przyciski przy polu nie zabierają fokusu, więc klawiatura telefonu zostaje otwarta
    for (const b of [this.ui.enSign, this.ui.enScratch, this.ui.enNext])
      b.addEventListener('pointerdown', (e) => e.preventDefault());
    this.ui.enSign.addEventListener('click', () => {
      this.flipTyped();
      inp.focus({ preventScroll: true });
    });
    this.ui.enNext.addEventListener('click', () => this.commitEntry(1));
    this.ui.enScratch.addEventListener('click', () => {
      const en = this.entry;
      if (!en) return;
      // drugie naciśnięcie w skreślonym polu usuwa skreślenie
      if (this.scratched()) {
        this.setValue(en.spot, null, false);
        en.orig = '';
        inp.value = '';
        this.typed();
        this.syncScratch();
        return;
      }
      this.setValue(en.spot, 0, true);
      this.moveEntry(1);
    });
    // klawiatura ekranowa zmniejsza widoczny obszar: zaznaczone pole ma zostać w kadrze
    const vv = window.visualViewport;
    if (vv) {
      const onViewport = (): void => {
        if (!this.entry) return;
        this.entryPos = '';
        this.placeEntry();
        this.revealEntry();
      };
      vv.addEventListener('resize', onViewport);
      vv.addEventListener('scroll', onViewport);
      this.cleanups.push(() => {
        vv.removeEventListener('resize', onViewport);
        vv.removeEventListener('scroll', onViewport);
      });
    }
  }

  /** Czy zaznaczone pole jest skreślone. */
  private scratched(): boolean {
    const en = this.entry;
    const a = this.active;
    if (!en || !a || !this.t) return false;
    return !!cellOf(a.data, this.t, en.spot)?.cur?.scratch;
  }

  private syncScratch(): void {
    this.ui.enScratch.setAttribute('aria-pressed', String(this.scratched()));
  }

  /** Dotknięcie albo kliknięcie pola punktów: zaznacza je i od razu przyjmuje cyfry. */
  private tapCell(sp: Spot): void {
    const en = this.entry;
    if (en) {
      if (en.spot.key === sp.key) {
        this.enIn.focus({ preventScroll: true });
        return;
      }
      // wpis spoza zakresu nie przechodzi dalej (PAD-15)
      if (!this.applyEntry()) return;
    }
    this.selectCell(sp);
  }

  private selectCell(sp: Spot): void {
    const a = this.active;
    const t = this.t;
    if (!a || !t) return;
    const cell = cellOf(a.data, t, sp);
    if (!cell) return;
    if (this.pickerOpen) this.closeNamePicker();
    this.hideTip();
    const line = t.lines[sp.li];
    const neg = canBeNegative(line);
    const orig = cell.cur && !cell.cur.scratch ? String(cell.cur.value) : '';
    this.entry = { spot: sp, neg, orig };
    const who = a.data.names[sp.p]?.text || `Gracz ${sp.p + 1}`;
    // kilka pól tej samej kategorii u gracza: które to pole
    const same = spots(t).filter((x) => x.field && x.li === sp.li && x.p === sp.p);
    const which =
      sp.field && same.length > 1
        ? `pole ${same.findIndex((x) => x.key === sp.key) + 1} z ${same.length}, sumowane`
        : '';
    const inp = this.enIn;
    inp.value = orig;
    inp.setAttribute('aria-label', `${line.label}, ${who}`);
    // zakres widać przy polu, zanim wpis zostanie odrzucony; dowolna liczba nie potrzebuje opisu
    this.ui.enHint.textContent = [which, line.hint, line.free ? '' : describeValues(line)]
      .filter(Boolean)
      .join(' · ');
    const coarse = this.coarse();
    this.ui.enSign.hidden = !neg || !coarse;
    this.ui.enNext.hidden = !coarse;
    this.ui.enScratch.hidden = !line.scratch;
    this.syncScratch();
    this.barDims = null;
    this.showEntryError('');
    a.focus = sp;
    a.draft = null;
    a.dirty = true;
    this.ui.entry.hidden = false;
    this.entryPos = '';
    this.placeEntry();
    // od razu można pisać; na telefonie wyskakuje klawiatura numeryczna i zostaje między polami
    inp.focus({ preventScroll: true });
    inp.select();
    this.revealEntry();
  }

  /** Aktualizuje cyfry na kartce po zmianie tekstu pola. */
  private typed(showError = false): Typed | null {
    const en = this.entry;
    const a = this.active;
    if (!en || !a || !this.t) return null;
    const text = this.enIn.value;
    const res = checkTyped(this.t.lines[en.spot.li], text);
    // błąd pokazujemy przy zatwierdzeniu, a po poprawce (albo kolejnym znaku) znika od razu
    if (showError || this.ui.enErr.textContent) this.showEntryError(res.error);
    a.draft =
      text === en.orig
        ? null
        : {
            key: en.spot.key,
            text: text.replace('-', '−'),
            bad: !!res.error && !!this.ui.enErr.textContent,
            ink: a.draft?.key === en.spot.key ? a.draft.ink : inkDone(),
          };
    a.dirty = true;
    return res;
  }

  /** Komunikat przy polu; `bad` (domyślnie przy komunikacie) oznacza wpis, który nie przejdzie. */
  private showEntryError(msg: string, bad = !!msg): void {
    const inp = this.enIn;
    if (this.ui.enErr.textContent !== msg) {
      this.ui.enErr.textContent = msg;
      this.barDims = null;
    }
    if (bad) inp.setAttribute('aria-invalid', 'true');
    else inp.removeAttribute('aria-invalid');
    this.ui.entry.classList.toggle('bad', bad);
    const bar = this.ui.enBar;
    const show =
      !!msg ||
      !!this.ui.enHint.textContent ||
      !this.ui.enSign.hidden ||
      !this.ui.enNext.hidden ||
      !this.ui.enScratch.hidden;
    if (bar.hidden === show) {
      bar.hidden = !show;
      this.entryPos = '';
    }
    const a = this.active;
    if (a?.draft && a.draft.bad !== bad) {
      a.draft.bad = bad;
      a.dirty = true;
    }
    if (this.entry) this.placeEntry();
  }

  private flipTyped(force?: boolean): void {
    const en = this.entry;
    if (!en) return;
    if (!en.neg) {
      // tylko ostrzeżenie: wpis w polu dalej jest poprawny
      if (force !== false)
        this.showEntryError('Ta kategoria nie przyjmuje ujemnych punktów.', false);
      return;
    }
    const inp = this.enIn;
    inp.value = flipSign(inp.value, force);
    inp.setSelectionRange(inp.value.length, inp.value.length);
    this.typed();
  }

  /**
   * Zapisuje zmieniony wpis na kartce; `false`, gdy wpis jest spoza zakresu. Bez `silent` błąd
   * staje przy polu, a fokus zostaje w polu.
   */
  private applyEntry(silent = false): boolean {
    const en = this.entry;
    const a = this.active;
    if (!en || !a || !this.t) return true;
    const text = this.enIn.value;
    if (text === en.orig) return true;
    const res = silent ? checkTyped(this.t.lines[en.spot.li], text) : this.typed(true);
    if (!res || res.error) {
      if (!silent) this.enIn.focus({ preventScroll: true });
      return false;
    }
    // cyfry były już widoczne na kartce: zostają w tym samym miejscu, bez ponownego pisania
    const ink = a.draft?.ink;
    if (res.value === null) this.setValue(en.spot, null, false);
    else this.setValue(en.spot, res.value, false, ink);
    en.orig = text;
    return true;
  }

  private commitEntry(move: 1 | -1): void {
    if (!this.applyEntry()) return;
    this.moveEntry(move);
  }

  /**
   * Następna albo poprzednia kategoria punktowa (PAD-15); bez niej wpisywanie się kończy. Gdy
   * kartka ma imiona graczy, fokus chodzi tylko po miejscach z imieniem (puste miejsca notesu
   * są pomijane).
   */
  private moveEntry(move: 1 | -1): void {
    const en = this.entry;
    const a = this.active;
    if (!en || !a || !this.t) return;
    const names = a.data.names;
    const seat = names.some(Boolean) ? (p: number): boolean => !!names[p] : undefined;
    const next = nextInput(this.t, en.spot, move, seat);
    if (next) this.selectCell(next);
    else this.closeEntry(true);
  }

  /** Kończy wpisywanie: zapisuje poprawny wpis, a błędny porzuca (bez komunikatu). */
  private leaveEntry(): void {
    if (!this.entry) return;
    this.applyEntry(true);
    this.closeEntry(false);
  }

  private closeEntry(keepFocus: boolean): void {
    if (!this.entry) return;
    this.entry = null;
    this.entryPos = '';
    this.ui.entry.hidden = true;
    this.ui.entry.classList.remove('bad');
    this.ui.enErr.textContent = '';
    this.enIn.removeAttribute('aria-invalid');
    const a = this.active;
    if (a) {
      a.focus = null;
      a.draft = null;
      a.dirty = true;
    }
    const inp = this.enIn;
    if (this.root.activeElement === inp) {
      // klawiatura dalej steruje notesem (skróty widoku), ale nie otwiera klawiatury ekranowej
      if (keepFocus && this.renderer) this.renderer.domElement.focus({ preventScroll: true });
      else inp.blur();
    }
  }

  /** Pole na ekranie (względem notesu `wr`): prostokąt opisany na rogach pola na kartce. */
  private cellBox(sp: Spot, wr: DOMRect = this.wrap.getBoundingClientRect()): Box {
    const r = sp.rect;
    const pts = [
      this.screenOf(r.x, 1 - r.y, wr),
      this.screenOf(r.x + r.w, 1 - r.y, wr),
      this.screenOf(r.x, 1 - r.y - r.h, wr),
      this.screenOf(r.x + r.w, 1 - r.y - r.h, wr),
    ];
    const xs = pts.map((p) => p.x);
    const ys = pts.map((p) => p.y);
    const x = Math.min(...xs);
    const y = Math.min(...ys);
    return { x, y, w: Math.max(...xs) - x, h: Math.max(...ys) - y };
  }

  /** Widoczna część notesu: bez paska u góry i bez klawiatury ekranowej (visualViewport). */
  private visibleBox(r: DOMRect = this.wrap.getBoundingClientRect()): Box {
    let top = 0;
    let left = 0;
    let bottom = r.height;
    let right = r.width;
    const vv = window.visualViewport;
    if (vv) {
      top = Math.max(top, vv.offsetTop - r.top);
      left = Math.max(left, vv.offsetLeft - r.left);
      bottom = Math.min(bottom, vv.offsetTop + vv.height - r.top);
      right = Math.min(right, vv.offsetLeft + vv.width - r.left);
    }
    const bar = this.root.querySelector('.bar') as HTMLElement | null;
    if (bar && !bar.hidden) {
      const b = bar.getBoundingClientRect();
      if (b.height) top = Math.max(top, b.bottom - r.top);
    }
    return { x: left, y: top, w: Math.max(0, right - left), h: Math.max(0, bottom - top) };
  }

  /** Rozmiar paska przy polu (mierzony raz po zmianie zawartości). */
  private barSize(): { w: number; h: number } {
    const bar = this.ui.enBar;
    if (bar.hidden) return { w: 0, h: 0 };
    this.barDims ??= { w: bar.offsetWidth, h: bar.offsetHeight };
    return this.barDims;
  }

  /**
   * Ustawia niewidoczne pole wpisywania nad polem kartki i pasek (zakres, ±, Dalej, błąd) obok
   * niego. Wywoływane w każdej klatce: najpierw odczyty, potem zapisy stylu, tylko po zmianie.
   */
  private placeEntry(): void {
    const en = this.entry;
    if (!en || !this.active) return;
    const wr = this.wrap.getBoundingClientRect();
    const b = this.cellBox(en.spot, wr);
    const bar = this.ui.enBar;
    const key = `${b.x | 0},${b.y | 0},${b.w | 0},${b.h | 0},${bar.hidden}`;
    if (key === this.entryPos) return;
    this.entryPos = key;
    let pos: { x: number; y: number } | null = null;
    if (!bar.hidden) {
      const view = this.visibleBox(wr);
      const { w: bw, h: bh } = this.barSize();
      const x = clamp(
        b.x + b.w / 2 - bw / 2,
        view.x + 8,
        Math.max(view.x + 8, view.x + view.w - bw - 8),
      );
      let y = b.y + b.h + 8;
      if (y + bh > view.y + view.h - 8 && b.y - 8 - bh >= view.y) y = b.y - 8 - bh;
      pos = { x, y };
    }
    const inp = this.enIn;
    inp.style.left = `${b.x}px`;
    inp.style.top = `${b.y}px`;
    inp.style.width = `${Math.max(1, b.w)}px`;
    inp.style.height = `${Math.max(1, b.h)}px`;
    if (pos) {
      bar.style.left = `${pos.x}px`;
      bar.style.top = `${pos.y}px`;
    }
  }

  /** Przesuwa widok, gdy zaznaczone pole (z paskiem) wychodzi poza kadr (PAD-15). */
  private revealEntry(): void {
    const en = this.entry;
    if (!en || !this.active || !this.spec) return;
    const wr = this.wrap.getBoundingClientRect();
    const b = this.cellBox(en.spot, wr);
    const extra = this.ui.enBar.hidden ? 0 : this.barSize().h + 8;
    const { dx, dy } = revealShift({ ...b, h: b.h + extra }, this.visibleBox(wr), 12);
    if (Math.abs(dx) < 1 && Math.abs(dy) < 1) return;
    const p = this.freePose();
    if (!p) return;
    this.poseCamera();
    const r = en.spot.rect;
    const pt = this.sheetPoint(r.x + r.w / 2, 1 - r.y - r.h / 2);
    const cam = this.camera;
    const depth = Math.max(0.01, -pt.clone().applyMatrix4(cam.matrixWorldInverse).z);
    const h = this.renderer.domElement.clientHeight || wr.height || 1;
    const wpp = (2 * depth * Math.tan(THREE.MathUtils.degToRad(cam.fov / 2))) / h;
    const right = new THREE.Vector3(1, 0, 0).applyQuaternion(cam.quaternion);
    const up = new THREE.Vector3(0, 1, 0).applyQuaternion(cam.quaternion);
    p.target.addScaledVector(right, dx * wpp).addScaledVector(up, -dy * wpp);
    this.clampTarget(p);
    this.poseCamera();
    this.entryPos = '';
    this.placeEntry();
  }

  private openNamePicker(sp: Spot): void {
    const a = this.active as PaperSheet;
    const p = sp.p;
    this.leaveEntry();
    this.ui.pkTitle.textContent = 'Imię gracza';
    this.ui.pkWho.textContent = `gracz ${p + 1}`;
    this.ui.pkHint.textContent = '';
    const inp = this.ui.pkInput as HTMLInputElement;
    inp.value = a.data.names[p]?.text ?? '';
    inp.dataset.p = String(p);
    const acts = this.ui.pkActions;
    acts.replaceChildren();
    if (a.data.names[p]) {
      acts.appendChild(
        this.button('Usuń imię', 'pk-act subtle', () => {
          this.setName(p, '');
          this.closePicker();
        }),
      );
    }
    a.focus = sp;
    a.dirty = true;
    const [l, r] = this.anchors(sp);
    this.placePicker(l, r);
    inp.focus({ preventScroll: true });
    inp.select();
  }

  private writeStart(d: SheetData): void {
    if (!d.started) {
      d.started = fmtDate(new Date());
      d.startInk = inkNow(450);
    }
  }

  /** Wpis w polu; `ink` podane: cyfry już widać na kartce (wpisywanie z klawiatury), bez animacji. */
  private setValue(sp: Spot, value: number | null, scratch: boolean, ink?: Ink): void {
    const a = this.active as PaperSheet;
    const cell = cellOf(a.data, this.t as PadTemplate, sp);
    if (!cell) return;
    const cur = cell.cur;
    if (value === null) {
      if (!cur) return;
      cell.old = cur;
      cell.strike = inkNow();
      cell.cur = null;
    } else {
      if (cur && cur.value === value && cur.scratch === scratch) return;
      if (cur) {
        cell.old = cur;
        cell.strike = inkNow();
      }
      cell.cur = { value, scratch, ink: ink ?? inkNow(cur ? 300 : 0) };
      this.writeStart(a.data);
    }
    this.sfx.scratch(scratch ? 380 : 140 + 100 * String(value ?? '').length);
    a.dirty = true;
    this.persist();
  }

  private setName(p: number, text: string): void {
    const a = this.active as PaperSheet;
    const tt = text.trim().slice(0, 14);
    if ((a.data.names[p]?.text ?? '') === tt) return;
    a.data.names[p] = tt ? { text: tt, ink: inkNow() } : null;
    if (tt) {
      this.writeStart(a.data);
      this.sfx.scratch(120 + 70 * tt.length);
    }
    a.dirty = true;
    this.persist();
  }

  // ═════════════════════════════════════════════════════ adnotacja i historia

  private showTension(frac: number, tearing: boolean): void {
    const d = this.drag;
    if (!d) return;
    const r = this.wrap.getBoundingClientRect();
    const el2 = this.ui.tension;
    el2.hidden = false;
    el2.style.transform = `translate(${d.x - r.left + 18}px, ${d.y - r.top + 14}px)`;
    (el2.querySelector('.t-val') as SVGElement).style.strokeDashoffset = String(
      100 - clamp(frac, 0, 1) * 100,
    );
    el2.classList.toggle('tearing', tearing);
    this.ui.tensionLabel.textContent = tearing
      ? 'Odrywam…'
      : frac > 0.85
        ? 'Szarpnij mocno!'
        : 'Ciągnij mocniej, by oderwać';
  }

  private showSaved(entry: HistoryEntry | null, data: SheetData, t: PadTemplate): void {
    if (this.destroyed) return;
    window.clearTimeout(this.annotTimer);
    this.ui.chip.hidden = true;
    const card = el('article', 'note');
    if (!entry) {
      card.innerHTML = `<span class="note-tape" aria-hidden="true"></span>
        <div class="note-top">
          <svg class="note-check" viewBox="0 0 40 40" aria-hidden="true"><path pathLength="1" d="M9 10c7 6 15 13 22 21M31 9C24 16 16 24 9 31"/></svg>
          <div><h2 class="note-title"><span>Kartka oderwana</span></h2>
          <p class="note-meta">${esc(t.name)} · partia nr ${data.game}</p></div>
        </div>
        <p class="note-foot">${this.opts.test ? 'Kartka była pusta.' : 'Kartka była pusta, więc nic nie zapisano.'}</p>`;
    } else {
      const max = Math.max(1, ...entry.players.map((p) => Math.max(0, p.total)));
      const rows = [...entry.players]
        .sort((a, b) => b.total - a.total)
        .map((p, i) => {
          const win = entry.winners.includes(p.name);
          return `<li class="${win ? 'win' : ''}" style="--i:${i};--w:${Math.max(0.03, Math.max(0, p.total) / max).toFixed(3)}">
            <span class="nm">${esc(p.name)}</span><span class="meter"><i></i></span>
            <span class="sc"><b data-to="${p.total}">0</b>${win ? RING : ''}</span></li>`;
        })
        .join('');
      const foot =
        entry.players.length === 1
          ? `Wynik: <b>${esc(entry.players[0].name)}</b>`
          : entry.winners.length === 1
            ? `Wygrywa <b>${esc(entry.winners[0])}</b>`
            : `Remis: <b>${entry.winners.map(esc).join('</b> i <b>')}</b>`;
      card.innerHTML = `<span class="note-tape" aria-hidden="true"></span>
        <div class="note-top">
          <svg class="note-check" viewBox="0 0 40 40" aria-hidden="true"><path pathLength="1" d="M7 21.5c3.2 2.4 6 5.6 8.6 9.4C20 21.2 26 13.4 34 7"/></svg>
          <div><h2 class="note-title"><span>${this.opts.test ? 'Wynik testu' : 'Wynik zapisany'}</span></h2>
          <p class="note-meta">${esc(t.name)} · partia nr ${entry.game} · ${fmtTime(new Date(entry.at))}</p></div>
        </div>
        <ol class="note-rows">${rows}</ol>
        <p class="note-foot">${foot}</p>${this.opts.test ? '<p class="note-foot">Karteczka testowa nie jest zapisywana.</p>' : ''}`;
    }
    this.ui.annot.replaceChildren(card);
    this.ui.annot.hidden = false;
    requestAnimationFrame(() => requestAnimationFrame(() => card.classList.add('in')));
    const reduce = window.matchMedia('(prefers-reduced-motion: reduce)').matches;
    card.querySelectorAll<HTMLElement>('b[data-to]').forEach((b, i) => {
      const to = Number(b.dataset.to);
      if (reduce) {
        b.textContent = String(to);
        return;
      }
      const t0 = performance.now() + 620 + i * 90;
      const tick = (now: number): void => {
        const k = clamp((now - t0) / 750, 0, 1);
        b.textContent = String(Math.round(to * (1 - Math.pow(1 - k, 3))));
        if (k < 1) requestAnimationFrame(tick);
      };
      requestAnimationFrame(tick);
    });
    this.annotTimer = window.setTimeout(() => this.collapseNote(card), 9000);
  }

  private collapseNote(card: HTMLElement): void {
    card.classList.add('out');
    window.setTimeout(() => {
      this.ui.annot.hidden = true;
      this.ui.annot.replaceChildren();
      this.updateChip(true);
    }, 480);
  }

  private updateChip(pop: boolean): void {
    const n = this.saved.history.length;
    const chip = this.ui.chip;
    chip.hidden = n === 0;
    chip.innerHTML = `<span class="chip-n">${n}</span> ${plural(n, 'zapisana partia', 'zapisane partie', 'zapisanych partii')}`;
    chip.classList.remove('pop');
    if (pop) {
      void chip.offsetWidth;
      chip.classList.add('pop');
    }
  }

  private showHistory(): void {
    window.clearTimeout(this.annotTimer);
    this.ui.chip.hidden = true;
    const card = el('article', 'note in still');
    const items = this.saved.history
      .slice(0, 10)
      .map((h) => {
        const d = new Date(h.at);
        const res = [...h.players]
          .sort((a, b) => b.total - a.total)
          .map(
            (p) =>
              `<span class="${h.winners.includes(p.name) ? 'w' : ''}">${esc(p.name)} <b>${p.total}</b></span>`,
          )
          .join('');
        return `<li><span class="h-meta">${esc(h.tplName ?? '')} · nr ${h.game} · ${fmtDate(d)}, ${fmtTime(d)}</span><span class="h-res">${res}</span></li>`;
      })
      .join('');
    card.innerHTML = `<span class="note-tape" aria-hidden="true"></span>
      <div class="note-top hist-top"><h2 class="note-title"><span>Zapisane partie</span></h2>
      <button type="button" class="note-close" aria-label="Zamknij listę">×</button></div>
      <ol class="hist">${items}</ol>`;
    (card.querySelector('.note-close') as HTMLButtonElement).addEventListener('click', () =>
      this.collapseNote(card),
    );
    this.ui.annot.replaceChildren(card);
    this.ui.annot.hidden = false;
  }

  // ═════════════════════════════════════════════════════ ustawienia i tryb debugowania

  /** Podmienia wartości ustawień w miejscu (obiekty sekcji zostają te same). */
  private replaceSettings(next: Settings): void {
    for (const sec of Object.keys(next) as (keyof Settings)[])
      Object.assign(this.cfg[sec], next[sec]);
  }

  private saveDebugSettings(): void {
    if (!this.debugAvail) return;
    const diff = diffSettings(this.cfg, this.baseCfg);
    this.saved.settings = Object.keys(diff).length ? diff : undefined;
    this.persist();
  }

  private syncHelp(): void {
    const roomy = this.wrap.clientWidth >= 720 && this.wrap.clientHeight >= 520;
    const show = this.cfg.ui.help && this.saved.help && roomy;
    this.ui.help.hidden = !show;
    this.ui.helpBtn.hidden = show || !this.cfg.ui.help;
  }

  /** Przenosi ustawienia na scenę, kartki, kamerę i interfejs. */
  private applySettings(): void {
    const c = this.cfg;
    if (!this.renderer) return;
    this.renderer.toneMappingExposure = c.light.exposure;
    this.key.intensity = c.light.key;
    this.key.color.set(c.light.keyColor);
    this.key.castShadow = c.light.shadows;
    this.back.intensity = c.light.back;
    this.hemi.intensity = c.light.ambient;
    this.placeLights();
    for (const sh of [this.active, ...this.flyers]) {
      if (!sh) continue;
      sh.cloth.applyStiffness();
      sh.uni.uTrans.value = c.light.transmission;
      sh.dirty = true;
    }
    if (this.camera.fov !== c.view.fov) this.camera.fov = c.view.fov;
    if (!c.view.autoZoom) this.autoZoom = 1;
    this.autoZoom = Math.min(this.autoZoom, c.view.autoZoomMax);
    this.poseCamera();
    this.ui.vignette.hidden = !c.view.vignette;
    (this.root.querySelector('.bar') as HTMLElement).hidden = !c.ui.controls;
    this.syncHelp();
    // dźwięk z ustawień; przełącznik na pasku działa niezależnie, dopóki ustawienie się nie zmieni
    if (this.uiSound !== null && this.uiSound !== c.ui.sound) {
      this.sfx.on = this.saved.sound = c.ui.sound;
      this.syncSound();
    }
    this.uiSound = c.ui.sound;
    if (this.t) {
      const st = this.saved.sheets[this.t.id];
      if (st && st.left > c.view.sheets) {
        st.left = c.view.sheets;
        this.pad?.setLeft(st.left);
        this.viz?.rebuildCollider();
      }
      this.updatePadInfo();
    }
    if (!this.ui.menu.hidden) this.renderMenu();
    this.viz?.show(c.debug.particles, c.debug.collider);
    this.emit('settings');
  }

  /** Stan symulacji do panelu debugowania. */
  private statsRows(): [string, string][] {
    const a = this.active;
    if (!a) return [];
    const cl = a.cloth;
    const state = cl.flying
      ? 'w locie'
      : this.drag
        ? this.drag.tearing
          ? 'odrywana'
          : 'trzymana'
        : cl.flipped
          ? 'przewrócona'
          : a.resting
            ? 'leży'
            : 'w ruchu';
    return [
      ['Klatki na sekundę', this.fps.toFixed(0)],
      ['Kroków fizyki na klatkę', String(this.stepsLast)],
      ['Węzły × więzy', `${cl.n} × ${cl.kind.length}`],
      ['Kartka', state + (cl.sleeping ? ' (uśpiona)' : '')],
      ['Uniesienie', cl.maxLift.toFixed(3)],
      ['Klej trzyma', `${cl.glueCols - cl.releasedCount()} z ${cl.glueCols} kolumn`],
      ['Naciąg ponad zasięg', this.drag ? this.drag.excess.toFixed(3) : '—'],
      ['Odsunięcie kamery', `${this.autoZoom.toFixed(2)}×`],
      ['Notes', this.t ? `${this.t.name} · ${fmtSize(this.t)}` : '—'],
      [
        'Pola',
        this.t ? `${spots(this.t).length} (${(this.t.fields ?? []).length} dowolnych)` : '—',
      ],
      [
        'Kształt kartki',
        this.t?.shape
          ? `własny · ${this.t.shape.outline.length} pkt${this.t.shape.holes?.length ? ` · otwory ${this.t.shape.holes.length}` : ''}`
          : 'prostokąt',
      ],
      ['Węzły papieru', cl ? `${cl.real.reduce((n, r) => n + r, 0)} z ${cl.n}` : '—'],
    ];
  }

  private blankSheetNow(): void {
    this.setSheet(null);
  }

  /**
   * Zastępuje wpisy na wierzchniej kartce (np. losowe wpisy testu w kreatorze, EDT-14); `null`
   * daje czystą kartkę. Numer partii zostaje, a niezatwierdzony wpis z klawiatury przepada.
   */
  setSheet(sheet: ScorePadSheet | null): void {
    if (!this.t || this.switching) return;
    this.closeEntry(false);
    this.closeNamePicker();
    const st = this.saved.sheets[this.t.id];
    // `unpackSheet` tylko czyta wpisy.
    const raw = sheet ? ({ ...sheet, game: st.data.game } as PadConfig['sheet']) : null;
    const names = st.data.names;
    st.data = raw ? unpackSheet(raw, this.t) : blankSheet(this.t, st.data.game);
    // notes testowy kreatora: czysta kartka zostawia fikcyjnych graczy (EDT-14)
    if (!raw && this.opts.test) st.data.names = names.map((n) => (n ? { ...n } : null));
    if (this.active) {
      this.scene.remove(this.active.mesh);
      this.active.dispose();
    }
    this.active = this.makeSheet(st.data);
    this.scene.add(this.active.mesh);
    this.persist();
  }

  /**
   * Kładzie oderwaną kartkę z powrotem na wierzch (anulowanie podsumowania partii, PAD-5):
   * wpisy i numer partii z `sheet`, liczba kartek w bloku sprzed oderwania. `false`, gdy notes
   * nie jest gotowy (np. w trakcie zmiany szablonu) i kartki nie położył.
   */
  restoreSheet(sheet: ScorePadSheet): boolean {
    if (!this.t || this.switching || !this.pad) return false;
    this.closeEntry(false);
    this.closeNamePicker();
    window.clearTimeout(this.annotTimer);
    this.ui.annot.hidden = true;
    const st = this.saved.sheets[this.t.id];
    if (this.lastTear?.tpl === this.t.id) {
      st.left = this.lastTear.left;
      this.pad.setLeft(st.left);
    }
    this.lastTear = null;
    // `unpackSheet` tylko czyta wpisy.
    st.data = unpackSheet(sheet as PadConfig['sheet'], this.t);
    if (this.active) {
      this.scene.remove(this.active.mesh);
      this.active.dispose();
    }
    this.active = this.makeSheet(st.data);
    this.scene.add(this.active.mesh);
    this.updatePadInfo();
    this.persist();
    return true;
  }

  private emit(type: HostEvent, ...args: unknown[]): void {
    for (const fn of this.listeners.get(type) ?? []) fn(...args);
  }

  /** Interfejs dla wtyczek (pakiet edytora). */
  private makeHost(): PadHost {
    const self = this;
    return {
      element: this.host,
      shadow: this.root,
      frame: this.wrap,
      debug: this.opts.debug ?? false,
      settings: this.cfg,
      baseSettings: () => this.baseCfg,
      setSetting: (k, v) => this.setSetting(k, v),
      resetSetting: (k) => {
        setPath(this.cfg, k, getPath(this.baseCfg, k));
        this.saveDebugSettings();
        this.applySettings();
      },
      resetSettings: () => {
        this.replaceSettings(this.baseCfg);
        this.saveDebugSettings();
        this.applySettings();
      },
      templates: () => [...this.templates],
      current: () => this.t,
      isCustom: (id) => this.custom.has(id),
      saveTemplate: async (t, fresh) => {
        await this.store.put(t);
        this.custom.add(t.id);
        dropPrint(t);
        this.upsert(t);
        await this.useTemplate(t.id, fresh);
        this.renderMenu();
      },
      exportConfig: (o) => this.exportConfig(o),
      saveFile: (w) => this.saveConfigFile(w),
      copyConfig: async (w) => {
        const json = JSON.stringify(this.exportConfig({ sheet: w }), null, 2);
        try {
          await navigator.clipboard.writeText(json);
          return `Skopiowano plik notesu (${Math.max(1, Math.round(json.length / 1024))} KB).`;
        } catch {
          this.showDialog('Schowek jest tu niedostępny. Zaznacz tekst i skopiuj go ręcznie.', json);
          return '';
        }
      },
      pickFile: () => (this.ui.fileIn as HTMLInputElement).click(),
      tear: () => this.completeTear(),
      blankSheet: () => this.blankSheetNow(),
      clearHistory: () => {
        this.saved.history = [];
        this.updateChip(false);
        this.persist();
      },
      stats: () => this.statsRows(),
      suspend: (on) => {
        this.suspended = on;
      },
      setInset: (px) => {
        this.inset = Math.max(0, px);
        this.poseCamera();
      },
      addMenu: (f) => this.menuProviders.push(f),
      addTool: (b) => {
        b.classList.add('tool-btn');
        this.ui.tools.appendChild(b);
      },
      provide: (name, fn) => this.actions.set(name, fn),
      on: (type, fn) => {
        const list = this.listeners.get(type) ?? [];
        list.push(fn);
        this.listeners.set(type, list);
      },
      prefs: {
        get: (k) => self.saved.prefs?.[k],
        set: (k, v) => {
          self.saved.prefs = { ...(self.saved.prefs ?? {}), [k]: v };
          self.persist();
        },
      },
    };
  }

  private async importFile(f: File): Promise<void> {
    try {
      const name = await this.importConfig(await f.text(), true);
      this.emit('status', name ? `Wczytano notes „${name}”.` : 'Wczytano ustawienia.', 'ok');
    } catch (e) {
      const msg = (e as Error).message || 'Nie udało się wczytać pliku.';
      if (this.listeners.get('status')?.length) this.emit('status', msg, 'err');
      else this.showDialog(msg, '');
    }
  }

  /** Zapisuje plik notesu. W podglądzie Claude prosi o zgodę na pobranie; na zwykłej stronie pobiera od razu. */
  private async saveConfigFile(withSheet: boolean): Promise<string> {
    const json = JSON.stringify(this.exportConfig({ sheet: withSheet }), null, 2);
    const slug =
      (this.t?.name ?? 'notes')
        .toLowerCase()
        .normalize('NFD')
        .replace(/[\u0300-\u036f]/g, '')
        .replace(/ł/g, 'l')
        .replace(/[^a-z0-9]+/g, '-')
        .replace(/^-|-$/g, '') || 'notes';
    const filename = `notes-${slug}.json`;
    const hostApi = (window as unknown as { claude?: { use?: (n: string) => Promise<unknown> } })
      .claude;
    if (hostApi && typeof hostApi.use === 'function') {
      try {
        const dl = (await hostApi.use('downloads')) as {
          save(r: { filename: string; data: string }): Promise<unknown>;
        } | null;
        if (dl) {
          await dl.save({ filename, data: json });
          return `Zapisano ${filename}.`;
        }
      } catch (e) {
        if ((e as { code?: string }).code === 'declined') return 'Zapis anulowany.';
      }
      // podgląd bez pobierania plików: pokaż treść do skopiowania
      this.showDialog(
        `Pobieranie plików jest tu niedostępne. Skopiuj zawartość i zapisz ją jako ${filename}.`,
        json,
      );
      return '';
    }
    try {
      const url = URL.createObjectURL(new Blob([json], { type: 'application/json' }));
      const a = document.createElement('a');
      a.href = url;
      a.download = filename;
      document.body.appendChild(a);
      a.click();
      a.remove();
      setTimeout(() => URL.revokeObjectURL(url), 4000);
      return `Zapisano ${filename}.`;
    } catch {
      this.showDialog(
        `Nie udało się pobrać pliku. Skopiuj zawartość i zapisz ją jako ${filename}.`,
        json,
      );
      return '';
    }
  }

  private showDialog(msg: string, text: string): void {
    const d = this.ui.dlg;
    (d.querySelector('.dlg-msg') as HTMLElement).textContent = msg;
    const ta = d.querySelector('textarea') as HTMLTextAreaElement;
    ta.value = text;
    ta.hidden = !text;
    (d.querySelector('[data-d="copy"]') as HTMLElement).hidden = !text;
    d.hidden = false;
    (d.querySelector('[data-d="close"]') as HTMLElement).focus();
  }

  // ═════════════════════════════════════════════════════ pętla

  private loop(): void {
    cancelAnimationFrame(this.rafId);
    this.last = performance.now();
    this.budget?.restart();
    const frame = (now: number): void => {
      if (this.destroyed || !this.visible) return;
      this.rafId = requestAnimationFrame(frame);
      this.tick(now);
    };
    this.rafId = requestAnimationFrame(frame);
  }

  private tick(now: number): void {
    const frameMs = now - this.last;
    const dt = Math.min(0.05, frameMs / 1000);
    this.last = now;
    if (this.suspended) return;
    const ratio = this.budget?.sample(now, frameMs);
    if (ratio) this.renderer?.setPixelRatio(ratio);
    this.pointerSpeed *= Math.pow(0.04, dt);
    const a = this.active;
    if (!a || !this.renderer) {
      this.renderer?.render(this.scene, this.camera);
      return;
    }
    this.processHover();
    const cl = a.cloth;
    cl.hoverAmt += (cl.hoverWant - cl.hoverAmt) * Math.min(1, dt * 9);
    if (cl.hoverAmt > 0.001) cl.wake();

    const d = this.drag;
    if (d) {
      this.evaluatePull(d);
      cl.setTarget(d.clamped);
      this.updateTear(d, dt);
      if (this.drag) {
        const frac = d.tearing
          ? cl.releasedCount() / cl.glueCols
          : d.excess / this.cfg.tear.threshold;
        if (d.tearing || d.excess > 0.07) this.showTension(frac, d.tearing);
        else this.ui.tension.hidden = true;
      }
    }

    // kamera odsuwa się, gdy podniesiona kartka wychodzi poza kadr, i wraca, gdy kartka leży
    // tylko w widoku domyślnym (PAD-12)
    let want = 1;
    if (
      !this.free &&
      this.cfg.view.autoZoom &&
      !a.resting &&
      (a.cloth.maxLift > 0.04 || a.cloth.flipped)
    )
      want = clamp(this.autoZoom * this.sheetExtent(a), 1, this.cfg.view.autoZoomMax);
    if (this.homeAnim) this.stepHome(now);
    else if (!this.free && Math.abs(want - this.autoZoom) > 0.002) {
      const rate = want > this.autoZoom ? 2.6 : 1.1;
      this.autoZoom += (want - this.autoZoom) * Math.min(1, dt * rate);
      this.poseCamera();
    }

    const sim = this.cfg.sim;
    const subDt = 1 / sim.rate;
    if (!sim.paused) this.acc += dt * sim.timeScale;
    let steps = Math.floor(this.acc / subDt);
    if (steps > sim.maxSteps) {
      steps = sim.maxSteps;
      this.acc = 0;
    } else this.acc -= steps * subDt;
    this.stepsLast = steps;
    const act = this.active as PaperSheet;
    for (let s = 0; s < steps; s++) {
      const al = (s + 1) / steps;
      act.cloth.step(subDt, al);
      for (const f of this.flyers) f.cloth.step(subDt, al);
    }
    if (steps > 0) act.cloth.gFrom.copy(act.cloth.gTo);

    for (const s of [act, ...this.flyers]) {
      if (s.dirty || s.animating) s.paint(now);
      if (s.cloth.moved) s.sync();
    }

    const fr = new THREE.Frustum().setFromProjectionMatrix(
      new THREE.Matrix4().multiplyMatrices(
        this.camera.projectionMatrix,
        this.camera.matrixWorldInverse,
      ),
    );
    for (let i = this.flyers.length - 1; i >= 0; i--) {
      const f = this.flyers[i];
      f.offscreen = fr.intersectsObject(f.mesh) ? 0 : f.offscreen + 1;
      if ((f.cloth.flyT > 0.6 && f.offscreen > 20) || f.cloth.flyT > 7) {
        this.scene.remove(f.mesh);
        f.dispose();
        this.flyers.splice(i, 1);
      }
    }
    // pole wpisywania idzie za polem kartki przy obrocie, zoomie i ruchu kartki
    if (this.entry) this.placeEntry();
    if (this.viz) this.viz.update();
    this.frames++;
    if (now - this.statT > 300) {
      this.fps = (this.frames * 1000) / Math.max(1, now - this.statT);
      this.frames = 0;
      this.statT = now;
      this.emit('frame', now);
    }
    this.renderer.render(this.scene, this.camera);
  }

  /** Odrywa wierzchnią kartkę bez gestu (przycisk „Oderwij kartkę” w kreatorze, EDT-14). */
  tear(): void {
    if (!this.t || this.switching || this.opts.tear === false || this.opts.readOnly) return;
    this.completeTear();
  }

  /** Do testów: wymusza oderwanie bieżącej kartki. */
  tearNow(): void {
    this.completeTear();
  }

  /** Do testów: stan kartki i przeciągania. */
  debug(): Record<string, unknown> {
    const a = this.active;
    return {
      game: a?.data.game,
      resting: a?.resting,
      flipped: a?.cloth.flipped,
      lift: a?.cloth.maxLift,
      released: a?.cloth.releasedCount(),
      excess: this.drag?.excess ?? null,
      flyers: this.flyers.length,
      tpl: this.t?.id,
      view: this.free ? 'free' : 'home',
      seesTop: this.seesTop(),
      zoom: this.free && this.spec ? this.homePose(1).dist / this.free.dist : 1,
      fps: Math.round(this.fps),
      texture: this.ps ? [this.ps.CW, this.ps.CH] : null,
      pixelRatio: this.renderer?.getPixelRatio(),
      entry: this.entryDebug(),
    };
  }

  /** Do testów: zaznaczone pole wpisywania, tekst, błąd i położenie pola na ekranie. */
  private entryDebug(): Record<string, unknown> | null {
    const en = this.entry;
    if (!en || !this.t || !this.active) return null;
    const r = this.wrap.getBoundingClientRect();
    const b = this.cellBox(en.spot);
    return {
      line: this.t.lines[en.spot.li].id,
      seat: en.spot.p,
      text: this.enIn.value,
      error: this.ui.enErr.textContent,
      focused: this.root.activeElement === this.enIn,
      box: { x: b.x + r.left, y: b.y + r.top, w: b.w, h: b.h },
      visible: this.visibleBox(),
    };
  }

  /** Do testów: punkt kartki na ekranie (współrzędne klienta). */
  pointOnSheet(u: number, v: number): { x: number; y: number } {
    const s = this.screenOf(u, v);
    const r = this.wrap.getBoundingClientRect();
    return { x: s.x + r.left, y: s.y + r.top };
  }
}

function fmtSize(t: PadTemplate): string {
  const f = (v: number): string => (Math.round(v * 10) / 10).toString().replace('.', ',');
  return `${f(t.size.w)} × ${f(t.size.h)} cm`;
}
