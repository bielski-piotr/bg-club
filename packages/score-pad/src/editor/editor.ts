// Edytor notesu w trzech krokach: zdjęcie → obszar kartki → mapowanie pól (EDT-11).
// Działa samodzielnie (<score-pad-editor>) albo — na życzenie — jako nakładka w notesie.
// W trybie kreatora (`wizard`, EDT-9) kroki, nawigację i wczytywanie zdjęcia prowadzi aplikacja:
// edytor pokazuje tylko scenę z narzędziami bieżącego kroku i zgłasza zmiany stanu (`onChange`).

import type { Pt, Quad } from './photo';
import {
  Persp,
  canvasFromBlob,
  canvasFromUrl,
  encodeSheet,
  flattenPaper,
  fullQuad,
  quadAspect,
  releasePixels,
  rotate,
  sheetSize,
  warp,
} from './photo';
import type { AreaMode } from './area';
import {
  MAX_DETECTED_POINTS,
  MAX_SMOOTHING,
  MIN_AREA_POINTS,
  areaCorners,
  areaShape,
  areaValid,
  fullArea,
  limitPoints,
  removePoint,
  rotatePoint,
  segmentDistance,
  toPhotoRing,
} from './area';
import type { LineKind, PadTemplate } from '../core/templates';
import { validateTemplate } from '../core/templates';
import type { PadConfig } from '../core/settings';
import type { ShapePt, SheetShape } from '../core/shape';
import { clamp, el, esc, uid } from '../core/util';
import { detectArea } from './shape-tools';
import {
  FieldsStep,
  type CategoriesAction,
  type CategoriesState,
  type MappingAction,
  type MappingState,
} from './fields';
import { icon } from './icons';
import { scorePadFileName } from '../file-name';

/** Kroki edytora; krok 4 (kategorie na kartce, EDT-13) jest tylko w trybie kreatora. */
export type Step = 1 | 2 | 3 | 4;
export type { AreaMode } from './area';
export type {
  CategoriesAction,
  CategoriesState,
  CategoriesView,
  CategoryPatch,
  CategoryState,
  MappingAction,
  MappingMode,
  MappingState,
  RangeMode,
} from './fields';

/** Stan kroku 3 „Mapowanie pól” (EDT-11) dla panelu kreatora. */
export interface EditorMapping extends MappingState {
  /** Widok kartki jest powiększony (przycisk „Dopasuj widok”). */
  readonly zoomed: boolean;
}

/** Zmiana mapowania z panelu kreatora; `fit` dopasowuje widok do całej kartki. */
export type EditorMappingAction = MappingAction | { readonly type: 'fit' };

/** Stan kroku 4 „Kategorie” (EDT-13, EDT-2…EDT-4) dla panelu kreatora. */
export interface EditorCategories extends CategoriesState {
  /** Widok kartki jest powiększony (przycisk „Dopasuj widok”). */
  readonly zoomed: boolean;
}

/** Zmiana kroku 4 z panelu kreatora; `fit` dopasowuje widok do całej kartki. */
export type EditorCategoriesAction = CategoriesAction | { readonly type: 'fit' };

export interface EditorOptions {
  /** Notes do poprawienia (zamiast nowego). */
  existing?: PadTemplate;
  /** Edytor w notesie: „Wstaw do notesu”. */
  onUse?(t: PadTemplate): void | Promise<void>;
  /** Edytor w nakładce: zamknięcie. */
  onClose?(): void;
  /** Gotowy plik notesu (po zapisie albo skopiowaniu). */
  onExport?(config: PadConfig, via: 'file' | 'clipboard'): void;
  /**
   * Tryb kreatora: bez paska kroków, przycisków nawigacji i pola wczytywania zdjęcia (prowadzi
   * je aplikacja). Wczytane zdjęcie nie przenosi do kroku 2.
   */
  wizard?: boolean;
  /** Zmiana stanu edytora (`status()`): wczytanie, edycja, poprawność kroków. */
  onChange?(status: EditorStatus): void;
}

/** Kategoria w stanie edytora (krok „Kategorie” kreatora). */
export interface EditorLine {
  readonly label: string;
  readonly kind: LineKind;
}

/** Ustawienia kroku 2 „Obszar kartki” (EDT-10) dla panelu kreatora. */
export interface EditorArea {
  /** Nazwa notesu. */
  readonly name: string;
  /** Kolor grzbietu (`#rrggbb`). */
  readonly tape: string;
  /** Całe zdjęcie, wykrycie automatyczne albo punkty ustawione ręcznie. */
  readonly mode: AreaMode;
  /** Liczba punktów obszaru. */
  readonly points: number;
  /** Wygładzanie krawędzi i jego siła 0…10. */
  readonly smoothing: boolean;
  readonly strength: number;
  /** Rozmiar kartki w centymetrach. */
  readonly size: { readonly w: number; readonly h: number };
  /** Grzbiet notesu: u góry albo z lewej. */
  readonly binding: 'top' | 'left';
  /** Jest zmiana obszaru do cofnięcia (Ctrl+Z). */
  readonly canUndo: boolean;
  /** Wynik ostatniego wykrywania: nieregularny kształt, kartka, nic albo brak wykrywania. */
  readonly detected: 'shape' | 'sheet' | 'missing' | null;
}

/** Zmiana ustawień kroku 2 z panelu kreatora. */
export interface EditorAreaPatch {
  readonly name?: string;
  readonly tape?: string;
  readonly mode?: AreaMode;
  readonly smoothing?: boolean;
  readonly strength?: number;
  readonly size?: { readonly w?: number; readonly h?: number };
  readonly binding?: 'top' | 'left';
}

/** Stan obszaru do cofnięcia. */
interface AreaSnapshot {
  area: Pt[];
  holes: Pt[][];
  mode: AreaMode;
  smoothing: boolean;
  strength: number;
  detected: EditorArea['detected'];
  fixed: boolean;
  size: { w: number; h: number };
  sizeManual: boolean;
  pristine: boolean;
}

/** Stan edytora dla kreatora w aplikacji. */
export interface EditorStatus {
  /** Bieżący krok edytora. */
  readonly step: Step;
  /** Trwa wczytywanie zdjęcia albo prostowanie kartki. */
  readonly busy: boolean;
  /** Jest zdjęcie (krok 1 poprawny). */
  readonly photo: boolean;
  /** Podgląd zdjęcia (zmniejszony, data URL) albo pusty napis. */
  readonly photoUrl: string;
  /** Obszar kartki jest poprawny (krok 2). */
  readonly area: boolean;
  /** Powód, dla którego pól i kategorii nie da się jeszcze zapisać, albo null. */
  readonly fields: string | null;
  /** Wyprostowana kartka (data URL) po wejściu w krok pól, albo pusty napis. */
  readonly sheetUrl: string;
  /** Liczba miejsc dla graczy. */
  readonly seats: number;
  /** Kategorie notesu w kolejności. */
  readonly lines: readonly EditorLine[];
  /** Ustawienia kroku 2: obszar, rozmiar, grzbiet, nazwa i kolor (EDT-10). */
  readonly settings: EditorArea;
  /** Krok 3: sposób mapowania, miejsca, kategorie i problem do poprawy (EDT-11, EDT-6). */
  readonly mapping: EditorMapping;
  /** Krok 4: kategorie, reguła miejsc i problemy walidatora (EDT-13). */
  readonly categories: EditorCategories;
  /** Notes został zmieniony od otwarcia edytora (zdjęcie, kształt, pola, kategorie). */
  readonly dirty: boolean;
  /** Nie udało się wczytać zdjęcia notesu otwartego do edycji. */
  readonly openFailed: boolean;
}

const STEPS: { n: Step; title: string; sub: string }[] = [
  { n: 1, title: 'Zdjęcie', sub: 'Wczytanie zdjęcia notesu' },
  { n: 2, title: 'Obszar', sub: 'Obszar i kształt kartki' },
  { n: 3, title: 'Pola', sub: 'Pola do wpisywania' },
];

export class Editor {
  readonly root: HTMLDivElement;
  readonly svg: SVGSVGElement;
  private onDocPaste: ((e: ClipboardEvent) => void) | null = null;
  private resizeObs: ResizeObserver | null = null;
  private baseImg: SVGImageElement;
  private ov: SVGGElement;
  private loupe: SVGGElement;
  /** Strona lupy względem narożnika — ustalona na początku przeciągania, żeby lupa nie przeskakiwała. */
  private loupeSide = { x: 1, y: 1 };
  readonly toolbar: HTMLElement;
  readonly panel: HTMLElement;
  private stage: HTMLElement;
  private drop: HTMLElement;
  private nav: HTMLElement;
  private toastEl: HTMLElement;
  private step: Step = 1;
  private reached: Step = 1;
  private busy = '';
  /** Zmiany od otwarcia edytora (EDT-1: ochrona przed utratą zmian). */
  private dirty = false;
  private notifyRaf = 0;
  /** Ostatnio zgłoszony stan: bez zmiany (np. przeciąganie w kroku 2) aplikacja nie dostaje nic. */
  private lastStatus: EditorStatus | null = null;
  /** Nie udało się wczytać notesu otwartego do edycji (kreator: zdjęcie trzeba wczytać od nowa). */
  private openFailed = false;

  // zdjęcie i kadr
  private src: HTMLCanvasElement | null = null;
  private srcId = 0;
  private srcUrl = '';
  private quad: Quad = fullQuad(1, 1);
  size = { w: 10.5, h: 14.8 };
  private sizeManual = false;
  private binding: 'top' | 'left' = 'top';
  private flatten = true;

  // obszar kartki (EDT-10): wielokąt na zdjęciu; z niego narożniki (`quad`) i kształt
  private area: Pt[] = fullArea(1, 1);
  /** Otwory w kartce (np. dziurki) z wykrycia albo z wczytanego notesu, w pikselach zdjęcia. */
  private holes: Pt[][] = [];
  private mode: AreaMode = 'auto';
  private smoothing = false;
  private strength = 4;
  private detected: EditorArea['detected'] = null;
  /** Kartka wczytana z notesu jest już wyprostowana: narożniki to całe zdjęcie. */
  private fixedCorners = false;
  /** Kształt wczytanego notesu i to, czy obszar od tamtej pory się nie zmienił. */
  private loadedShape: SheetShape | undefined;
  private pristine = false;
  private smoothed: { key: string; shape: SheetShape | undefined } = { key: '', shape: undefined };
  private exported = false;
  private sundo: AreaSnapshot[] = [];
  private undoKind = '';
  private undoAt = 0;
  /** Przeciągany punkt obszaru (`moved`: ruszył się, więc to nie dotknięcie ani przytrzymanie). */
  private pdrag: {
    i: number;
    moved: boolean;
    x: number;
    y: number;
    snap: AreaSnapshot;
    pointer: number;
  } | null = null;
  private press = 0;
  /** Ostatnie wciśnięcie punktu (wykrywanie dwukliku). */
  private lastPress: { i: number; at: number } | null = null;
  private focusPt = -1;
  private refocus = -1;

  // wyprostowana kartka (krok 3)
  sheet: HTMLCanvasElement | null = null;
  sheetUrl = '';
  private sheetKey = '';
  readonly fields: FieldsStep;
  private raf = 0;
  /** Widok kartki w kroku 3 (powiększenie), null = cała kartka. */
  private view: { x: number; y: number; w: number; h: number } | null = null;
  /** Palce na scenie kroku 3 (szczypanie powiększa, dwa palce przesuwają widok). */
  private touches = new Map<number, { x: number; y: number }>();
  private pinch: { d: number; x: number; y: number } | null = null;

  constructor(
    mount: ShadowRoot | HTMLElement,
    private opts: EditorOptions = {},
  ) {
    this.root = el('div', 'spe') as HTMLDivElement;
    this.root.dataset.step = '1';
    if (opts.wizard) this.root.classList.add('wizard');
    if (opts.onClose) {
      this.root.classList.add('overlay');
      this.root.setAttribute('role', 'dialog');
      this.root.setAttribute('aria-modal', 'true');
    }
    this.root.setAttribute('aria-label', 'Edytor notesu');
    this.root.innerHTML = `
      <div class="spe-in">
      <aside class="spe-rail">
        <div class="spe-brand">${icon('pad')}<b>Edytor notesu</b>${opts.onClose ? `<button type="button" class="spe-x" data-close aria-label="Zamknij edytor">${icon('x')}</button>` : ''}</div>
        <ol class="spe-steps">${STEPS.map(
          (s) => `<li class="spe-step" data-s="${s.n}"><button type="button" data-go="${s.n}">
          <span class="spe-dot"><span class="n">${s.n}</span>${icon('check', 'ok')}</span>
          <span class="spe-step-t"><b>${s.title}</b><small>${s.sub}</small></span></button></li>`,
        ).join('')}</ol>
        <div class="spe-nav"></div>
      </aside>
      <main class="spe-main">
        <div class="spe-toolbar" role="toolbar" aria-label="Narzędzia"></div>
        <div class="spe-work">
          <div class="spe-stage">
            <svg class="spe-svg" xmlns="http://www.w3.org/2000/svg" preserveAspectRatio="xMidYMid meet" tabindex="-1"></svg>
            <div class="spe-drop" role="button" tabindex="0" aria-label="Wczytaj zdjęcie notesu">
              <input type="file" accept="image/*,.json,application/json" hidden>
              <div class="spe-drop-thumb"></div>
              <div class="spe-drop-art">${icon('image')}<span class="spe-drop-up">${icon('upload')}</span></div>
              <strong>Przeciągnij zdjęcie notesu</strong>
              <span>albo kliknij, aby wybrać plik</span>
              <div class="spe-spin" aria-hidden="true"></div>
            </div>
            <div class="spe-busy" aria-hidden="true"><div class="spe-spin"></div></div>
          </div>
          <aside class="spe-panel"></aside>
        </div>
      </main>
      </div>
      <div class="spe-toast" role="status" aria-live="polite"></div>`;
    this.svg = this.root.querySelector('.spe-svg') as SVGSVGElement;
    // zdjęcie i lupa są trwałe (zmieniają się tylko ich atrybuty), przebudowuje się wyłącznie nakładka —
    // dzięki temu obraz nie ładuje się od nowa przy każdym ruchu, a lupa nie miga
    this.svg.innerHTML = `<image class="spe-base" x="0" y="0" preserveAspectRatio="none"/><g class="spe-ov"></g>
      <g class="spe-loupe" style="display:none"><defs><clipPath id="spe-loupe-clip"><circle class="lc"/></clipPath></defs>
        <circle class="ring"/>
        <g clip-path="url(#spe-loupe-clip)"><rect class="bg" fill="#000"/><g class="lt"><image class="li" x="0" y="0" preserveAspectRatio="none"/><polygon class="lp"/></g></g>
        <path class="cross"/></g>`;
    this.baseImg = this.svg.querySelector('.spe-base') as SVGImageElement;
    this.ov = this.svg.querySelector('.spe-ov') as SVGGElement;
    this.loupe = this.svg.querySelector('.spe-loupe') as SVGGElement;
    this.toolbar = this.root.querySelector('.spe-toolbar') as HTMLElement;
    this.panel = this.root.querySelector('.spe-panel') as HTMLElement;
    this.stage = this.root.querySelector('.spe-stage') as HTMLElement;
    this.drop = this.root.querySelector('.spe-drop') as HTMLElement;
    this.nav = this.root.querySelector('.spe-nav') as HTMLElement;
    this.toastEl = this.root.querySelector('.spe-toast') as HTMLElement;
    const self = this;
    this.fields = new FieldsStep({
      svg: this.svg,
      toolbar: this.toolbar,
      panel: this.panel,
      get sheet() {
        return self.sheet;
      },
      get sheetUrl() {
        return self.sheetUrl;
      },
      shape: () => this.shape(),
      scale: (w) => this.scale(w),
      toSvg: (e) => this.toSvg(e),
      capture: (e) => this.capture(e),
      render: () => this.render(),
      changed: () => this.renderChrome(),
      toast: (m, k) => this.toast(m, k),
      // W kreatorze zmianę trybu potwierdza popup aplikacji (DS §18), tu systemowe pytanie.
      confirm: (m) => typeof window.confirm !== 'function' || window.confirm(m),
      wizard: !!opts.wizard,
    });
    mount.appendChild(this.root);
    this.bind();
    this.goStep(1);
    if (opts.existing)
      this.loadTemplate(opts.existing).catch(() => {
        this.openFailed = true;
        this.notify();
      });
  }

  // ─────────────────────────────────────────────── zdarzenia

  private bind(): void {
    const r = this.root;
    r.querySelector('[data-close]')?.addEventListener('click', () => this.close());
    r.querySelectorAll<HTMLButtonElement>('[data-go]').forEach((b) =>
      b.addEventListener('click', () => this.goStep(Number(b.dataset.go) as Step)),
    );
    const file = this.drop.querySelector('input') as HTMLInputElement;
    file.addEventListener('change', () => {
      if (file.files?.[0]) void this.loadFile(file.files[0]);
      file.value = '';
    });
    this.drop.addEventListener('click', () => !this.busy && file.click());
    this.drop.addEventListener('keydown', (e) => {
      if (e.key === 'Enter' || e.key === ' ') {
        e.preventDefault();
        file.click();
      }
    });
    let depth = 0;
    this.stage.addEventListener('dragenter', (e) => {
      e.preventDefault();
      depth++;
      this.root.classList.add('dragging');
    });
    this.stage.addEventListener('dragover', (e) => e.preventDefault());
    this.stage.addEventListener('dragleave', () => {
      depth = Math.max(0, depth - 1);
      if (!depth) this.root.classList.remove('dragging');
    });
    this.stage.addEventListener('drop', (e) => {
      e.preventDefault();
      depth = 0;
      this.root.classList.remove('dragging');
      const f = e.dataTransfer?.files?.[0];
      if (f) void this.loadFile(f);
    });
    const paste = (e: ClipboardEvent, inside: boolean): void => {
      if (e.defaultPrevented || !this.root.isConnected) return;
      if (!inside && this.step !== 1) return;
      const t = e.composedPath()[0] as HTMLElement | undefined;
      if (t?.closest?.('input, textarea, [contenteditable]')) return;
      const item = Array.from(e.clipboardData?.items ?? []).find((i) =>
        i.type.startsWith('image/'),
      );
      const f = item?.getAsFile();
      if (f) {
        e.preventDefault();
        void this.loadFile(f);
      }
    };
    // W kreatorze zdjęcie (także ze schowka) wczytuje aplikacja.
    if (!this.opts.wizard) {
      r.addEventListener('paste', (e) => paste(e, true));
      // krok 1: obraz wklejony gdziekolwiek na stronie (fokus nie musi być w edytorze)
      this.onDocPaste = (e) => paste(e, false);
      document.addEventListener('paste', this.onDocPaste);
    }
    r.addEventListener('keydown', (e) => this.onKey(e));
    // Zmiany użytkownika: pola i przyciski narzędzi oraz przeciąganie na scenie (EDT-1). Klik
    // bez skutku też liczy się jako zmiana; zbędne pytanie o odrzucenie zmian jest mniejszym złem
    // niż utracona praca.
    const touched = (): void => this.touch();
    for (const part of [this.toolbar, this.panel]) {
      part.addEventListener('input', touched);
      part.addEventListener('change', touched);
      part.addEventListener('click', (e) => {
        if ((e.target as HTMLElement).closest('button:not(:disabled)')) touched();
      });
    }
    this.svg.addEventListener('pointerdown', touched);
    this.svg.addEventListener('pointerdown', (e) => this.onDown(e));
    this.svg.addEventListener('pointermove', (e) => this.onMove(e));
    const up = (e: PointerEvent): void => this.onUp(e);
    this.svg.addEventListener('pointerup', up);
    this.svg.addEventListener('pointercancel', up);
    // krok 3: Ctrl + kółko (i szczypanie na gładziku) powiększa, kółko w powiększeniu przesuwa
    this.svg.addEventListener('wheel', (e) => this.onWheel(e), { passive: false });
    this.resizeObs = new ResizeObserver(() => this.render());
    this.resizeObs.observe(this.svg);
  }

  /** Odpina nasłuch dokumentu i obserwatora (element usunięty ze strony). */
  destroy(): void {
    cancelAnimationFrame(this.notifyRaf);
    clearTimeout(this.press);
    if (this.onDocPaste) document.removeEventListener('paste', this.onDocPaste);
    this.onDocPaste = null;
    this.resizeObs?.disconnect();
    this.resizeObs = null;
  }

  private onKey(e: KeyboardEvent): void {
    const typing = !!(e.target as HTMLElement).closest('input, select, textarea');
    if (e.key === 'Escape') {
      // Esc obsłużony w edytorze nie zamyka popupu, w którym edytor jest osadzony.
      if (this.pdrag && this.step === 2) {
        e.preventDefault();
        this.cancelDrag();
        return;
      }
      if (this.step === 4 && this.pinch) {
        e.preventDefault();
        this.endPinch();
        return;
      }
      if (this.step === 3 && (this.pinch || this.fields.key(e))) {
        e.preventDefault();
        this.endPinch();
        return;
      }
      if (this.opts.onClose) this.close();
      return;
    }
    if (typing) return;
    if (this.step === 2 && (e.ctrlKey || e.metaKey) && e.key.toLowerCase() === 'z') {
      e.preventDefault();
      this.touch();
      this.undoArea();
      return;
    }
    if (this.step === 2 && !e.ctrlKey && !e.metaKey && !e.altKey && this.pointKey(e)) {
      e.preventDefault();
      this.touch();
      return;
    }
    if (this.step === 3 && (e.ctrlKey || e.metaKey) && e.key.toLowerCase() === 'z') {
      e.preventDefault();
      if (!e.shiftKey) this.editMapping({ type: 'undo' });
      return;
    }
    if (this.step >= 3 && !e.ctrlKey && !e.metaKey && !e.altKey && this.zoomKey(e)) {
      e.preventDefault();
      return;
    }
    if (this.step === 3 && this.fields.key(e)) {
      e.preventDefault();
      this.touch();
    }
  }

  private close(): void {
    this.root.remove();
    this.opts.onClose?.();
  }

  toast(msg: string, kind: 'err' | 'ok' = 'err'): void {
    const t = this.toastEl;
    t.innerHTML = `${icon(kind === 'ok' ? 'check' : 'alert')}<span>${esc(msg)}</span>`;
    t.dataset.kind = kind;
    t.classList.remove('show');
    void t.offsetWidth;
    t.classList.add('show');
    clearTimeout(Number(t.dataset.timer));
    t.dataset.timer = String(window.setTimeout(() => t.classList.remove('show'), 3200));
  }

  private setBusy(on: string): void {
    this.busy = on;
    this.root.classList.toggle('busy', !!on);
    this.root.dataset.busy = on;
    this.notify();
  }

  /** Zmiana wprowadzona przez użytkownika. */
  private touch(): void {
    if (this.dirty) return;
    this.dirty = true;
    this.notify();
  }

  /** Zgłasza stan aplikacji, najwyżej raz na klatkę. */
  private notify(): void {
    if (!this.opts.onChange || this.notifyRaf) return;
    this.notifyRaf = requestAnimationFrame(() => {
      this.notifyRaf = 0;
      if (!this.root.isConnected) return;
      const status = this.status();
      if (this.lastStatus && sameStatus(this.lastStatus, status)) return;
      this.lastStatus = status;
      this.opts.onChange?.(status);
    });
  }

  /** Stan edytora dla kreatora w aplikacji (EDT-9). */
  status(): EditorStatus {
    return {
      step: this.step,
      busy: !!this.busy,
      photo: !!this.src,
      photoUrl: this.srcUrl,
      area: !!this.src && this.shapeOk(),
      fields: this.fields.problem(),
      sheetUrl: this.sheetUrl,
      seats: this.fields.players(),
      lines: this.fields.draft.lines.map((l) => ({ label: l.label, kind: l.kind })),
      settings: this.areaState(),
      mapping: { ...this.fields.state(), zoomed: !!this.view },
      categories: { ...this.fields.categoriesState(this.step < 3), zoomed: !!this.view },
      dirty: this.dirty,
      openFailed: this.openFailed,
    };
  }

  // ─────────────────────────────────────────────── kroki

  /** Czy dany krok jest ukończony (można przejść dalej). */
  private complete(s: Step): boolean {
    if (s === 1) return !!this.src;
    if (s === 2) return !!this.src && this.shapeOk();
    // Kreator: kategorie (typy, zakresy) poprawia się w kroku 4, więc krok 3 to samo mapowanie.
    // Kartkę do kroku 4 edytor prostuje sam (np. po imporcie `.json` od razu do kroku 4).
    if (s === 3 && this.opts.wizard)
      return !!this.src && this.shapeOk() && !this.fields.mappingProblem();
    return !!this.sheet && !this.fields.problem();
  }

  private shapeOk(): boolean {
    const src = this.src;
    return !!src && areaValid(this.area, src.width, src.height);
  }

  private canGo(s: Step): boolean {
    if (s <= this.reached) return s === 1 || this.complete((s - 1) as Step);
    return s === this.reached + 1 && this.complete(this.reached);
  }

  goStep(s: Step): void {
    if (s === 4 && !this.opts.wizard) return;
    if (s !== 1 && !this.canGo(s)) return;
    if (s >= 3 && this.src && (!this.sheet || this.sheetKey !== this.sheetWant())) {
      // prostowanie trwa chwilę — najpierw wskaźnik
      this.setBusy('sheet');
      setTimeout(() => {
        this.ensureSheet();
        this.setBusy('');
        this.show(s);
      }, 40);
      return;
    }
    this.show(s);
  }

  private show(s: Step): void {
    const prev = this.step;
    this.step = s;
    if (s > this.reached) this.reached = s;
    this.pdrag = null;
    clearTimeout(this.press);
    this.touches.clear();
    this.pinch = null;
    this.exported = false;
    this.root.dataset.step = String(s);
    if (prev !== s) {
      const main = this.root.querySelector('.spe-work') as HTMLElement;
      main.classList.remove('enter');
      void main.offsetWidth;
      main.classList.add('enter');
    }
    this.fields.setReview(s === 4);
    if (s >= 3) {
      this.ensureSheet();
      this.fields.enter();
    } else {
      this.panel.innerHTML = '';
      this.renderToolbar();
    }
    this.renderChrome();
    this.render();
    if (s >= 2) this.svg.focus({ preventScroll: true });
  }

  /** Bieżący krok. */
  get current(): Step {
    return this.step;
  }

  /** Pasek kroków i przyciski nawigacji. */
  private renderChrome(): void {
    this.notify();
    this.root.querySelectorAll<HTMLElement>('.spe-step').forEach((li) => {
      const n = Number(li.dataset.s) as Step;
      const done = n === 3 ? this.exported : n < this.reached && this.complete(n);
      li.classList.toggle('current', n === this.step);
      li.classList.toggle('done', done);
      const b = li.querySelector('button') as HTMLButtonElement;
      b.disabled = n !== this.step && !this.canGo(n);
      if (n === this.step) b.setAttribute('aria-current', 'step');
      else b.removeAttribute('aria-current');
    });
    const s = this.step;
    const problem = s === 3 ? (this.sheet ? this.fields.problem() : 'Brak kartki.') : null;
    if (s === 1) {
      this.nav.innerHTML = `<button type="button" class="spe-btn primary" data-n="next" ${this.src ? '' : 'disabled'}>Dalej${icon('arrowR')}</button>`;
    } else if (s === 2) {
      this.nav.innerHTML = `<button type="button" class="spe-btn primary" data-n="next" ${this.shapeOk() ? '' : 'disabled'}>Dalej${icon('arrowR')}</button>
        <button type="button" class="spe-btn ghost" data-n="back">${icon('arrowL')}<span>Wstecz</span></button>`;
    } else {
      this.nav.innerHTML = `
        ${this.opts.onUse ? `<button type="button" class="spe-btn primary" data-n="use" ${problem ? 'disabled' : ''}>${icon('insert')}<span>Wstaw do notesu</span></button>` : ''}
        <button type="button" class="spe-btn ${this.opts.onUse ? '' : 'primary'}" data-n="file" ${problem ? 'disabled' : ''}>${icon('download')}<span>Zapisz do pliku</span></button>
        <button type="button" class="spe-btn" data-n="copy" ${problem ? 'disabled' : ''}>${icon('copy')}<span>Kopiuj do schowka</span></button>
        ${problem ? `<p class="spe-hint">${icon('alert')}<span>${esc(problem)}</span></p>` : ''}
        <button type="button" class="spe-btn ghost" data-n="back">${icon('arrowL')}<span>Wstecz</span></button>`;
    }
    this.nav.querySelectorAll<HTMLButtonElement>('[data-n]').forEach((b) =>
      b.addEventListener('click', () => {
        const a = b.dataset.n;
        if (a === 'next') this.goStep((s + 1) as Step);
        else if (a === 'back') this.goStep((s - 1) as Step);
        else if (a === 'file') void this.saveFile(b);
        else if (a === 'copy') void this.copy(b);
        else if (a === 'use') void this.use(b);
      }),
    );
  }

  // ─────────────────────────────────────────────── krok 1: zdjęcie

  /**
   * Wczytuje zdjęcie kartki albo (poza kreatorem) plik notesu `.json`. W kreatorze zwraca
   * błąd zamiast komunikatu w edytorze, bo komunikaty pokazuje aplikacja.
   */
  async loadFile(f: File | Blob): Promise<void> {
    if (this.busy) {
      // Kreator nie może uznać pominiętego wczytania za udane.
      if (this.opts.wizard) throw new EditorLoadError('busy');
      return;
    }
    const isJson = f.type === 'application/json' || ('name' in f && /\.json$/i.test(f.name));
    if (isJson && !this.opts.wizard) {
      try {
        const raw = JSON.parse(await f.text()) as PadConfig & Record<string, unknown>;
        const t = validateTemplate(raw.template ?? raw.templates?.[0] ?? raw);
        if (!t || !t.image) throw new Error('To nie jest plik notesu ze zdjęciem kartki.');
        if (await this.loadTemplate(t)) this.touch();
      } catch (err) {
        this.toast((err as Error).message || 'Nie udało się wczytać pliku.');
      }
      return;
    }
    if (isJson || (f.type && !f.type.startsWith('image/'))) {
      if (this.opts.wizard) throw new EditorLoadError('type');
      this.toast('Wybierz zdjęcie (JPG, PNG) albo plik notesu .json.');
      return;
    }
    this.setBusy('load');
    await new Promise((r) => setTimeout(r, 30));
    try {
      const c = await canvasFromBlob(f);
      this.setSource(c);
      // nowe zdjęcie: kroki 2 i 3 od nowa (nazwa i kolor grzbietu zostają)
      this.fields.reset();
      this.editId = '';
      this.sheet = null;
      this.sheetKey = '';
      this.reached = 1;
      this.dirty = true;
      this.openFailed = false;
      this.setBusy('');
      if (this.opts.wizard) this.show(1);
      else this.goStep(2);
    } catch (err) {
      this.setBusy('');
      if (this.opts.wizard) throw new EditorLoadError('image');
      this.toast((err as Error).message || 'Nie udało się wczytać zdjęcia.');
    }
  }

  /**
   * Notes do poprawienia: zdjęcie już wyprostowane, więc kadr to całe zdjęcie. `imported`
   * (plik `.json` w kreatorze) liczy się jako zmiana; notes otwarty do edycji nie. Zwraca,
   * czy notes został wczytany (poza kreatorem błąd kończy się komunikatem w edytorze).
   */
  async loadTemplate(t: PadTemplate, imported = false): Promise<boolean> {
    if (!t.image) {
      if (this.opts.wizard) throw new EditorLoadError('image');
      return false;
    }
    if (this.busy) {
      if (this.opts.wizard) throw new EditorLoadError('busy');
      return false;
    }
    this.setBusy('load');
    try {
      const c = await canvasFromUrl(t.image);
      this.src = c;
      this.srcId++;
      this.quad = fullQuad(c.width, c.height);
      this.size = { ...t.size };
      this.sizeManual = true;
      this.binding = t.binding === 'left' ? 'left' : 'top';
      this.flatten = false;
      // Kartka jest już wyprostowana: obszar to jej kształt na całym zdjęciu, bez wygładzania
      // (zapisany kształt jest już wygładzony).
      this.fixedCorners = true;
      // Wygładzony obrys ma nawet setki punktów: do edycji uproszczony, a zapis bez zmian obszaru
      // zachowuje dokładny kształt (`pristine`).
      const diag = Math.hypot(c.width, c.height);
      this.area = t.shape
        ? limitPoints(toPhotoRing(t.shape.outline, this.quad), MAX_DETECTED_POINTS, diag)
        : fullArea(c.width, c.height);
      this.holes = (t.shape?.holes ?? []).map((r) => toPhotoRing(r, this.quad));
      this.loadedShape = t.shape ? (JSON.parse(JSON.stringify(t.shape)) as SheetShape) : undefined;
      this.pristine = true;
      if (this.area.length < MIN_AREA_POINTS) this.area = fullArea(c.width, c.height);
      this.mode = t.shape ? 'manual' : 'full';
      this.smoothing = false;
      this.detected = null;
      this.pdrag = null;
      this.sundo = [];
      this.fields.load(t);
      this.editId = t.id;
      // Zdjęcie bez zmian zapisujemy tym samym plikiem (bez ponownej kompresji JPEG, [015]).
      this.loadedImage = { url: t.image, key: this.sheetWant() };
      this.refreshSrcUrl();
      this.reached = 3;
      if (imported) this.dirty = true;
      this.openFailed = false;
      this.setBusy('');
      if (this.opts.wizard) this.show(1);
      else this.goStep(3);
      return true;
    } catch (err) {
      this.setBusy('');
      if (this.opts.wizard) throw new EditorLoadError('image');
      this.toast((err as Error).message || 'Nie udało się wczytać notesu.');
      return false;
    }
  }

  private editId = '';
  /** Zdjęcie wczytanego notesu i stan kadru, przy którym jest aktualne. */
  private loadedImage: { url: string; key: string } | null = null;

  /** Nowe zdjęcie: obszar wykryty automatycznie (EDT-10), do poprawy punktami. */
  private setSource(c: HTMLCanvasElement): void {
    this.src = c;
    this.srcId++;
    const r = detectArea(c);
    // skan (przycięta kartka) ma już równe światło
    this.flatten = !r.cropped;
    this.area = r.area;
    this.holes = r.holes;
    this.mode = 'auto';
    this.detected = r.found;
    this.smoothing = false;
    this.fixedCorners = false;
    this.pristine = false;
    this.loadedShape = undefined;
    this.pdrag = null;
    this.sundo = [];
    this.sizeManual = false;
    this.updateCorners();
    this.applyPhotoSize();
    this.refreshSrcUrl();
  }

  private refreshSrcUrl(): void {
    const c = this.src;
    if (!c) return;
    const k = Math.min(1, 1600 / Math.max(c.width, c.height));
    if (k >= 1) this.srcUrl = c.toDataURL('image/jpeg', 0.88);
    else {
      const p = document.createElement('canvas');
      p.width = Math.round(c.width * k);
      p.height = Math.round(c.height * k);
      (p.getContext('2d') as CanvasRenderingContext2D).drawImage(c, 0, 0, p.width, p.height);
      this.srcUrl = p.toDataURL('image/jpeg', 0.88);
    }
    (this.drop.querySelector('.spe-drop-thumb') as HTMLElement).style.backgroundImage =
      `url("${this.srcUrl}")`;
    this.drop.classList.add('has');
    (this.drop.querySelector('strong') as HTMLElement).textContent = 'Upuść inne zdjęcie';
  }

  private applyPhotoSize(): void {
    if (!this.src || this.sizeManual) return;
    const a = quadAspect(this.quad);
    const long = Math.max(this.size.w, this.size.h) || 14.8;
    this.size = a <= 1 ? { w: round1(long * a), h: long } : { w: long, h: round1(long / a) };
  }

  // ─────────────────────────────────────────────── krok 2: obszar kartki (EDT-10)

  private geomKey(): string {
    return `${this.srcId}|${this.quad.map((p) => `${p.x.toFixed(1)},${p.y.toFixed(1)}`).join(';')}|${this.size.w}x${this.size.h}`;
  }

  /** Kształt kartki z obszaru (po wygładzeniu); undefined = prostokąt. */
  shape(): SheetShape | undefined {
    // Wczytany notes bez zmian obszaru: dokładnie zapisany kształt (punkty do edycji są uproszczone).
    if (this.pristine) return this.loadedShape;
    const key = `${this.srcId}|${JSON.stringify(this.area)}|${JSON.stringify(this.holes)}|${this.geomKey()}|${this.smoothing ? this.strength : 0}`;
    if (this.smoothed.key !== key)
      this.smoothed = {
        key,
        shape: this.src
          ? areaShape(this.area, this.holes, this.quad, this.smoothing ? this.strength : 0)
          : undefined,
      };
    return this.smoothed.shape;
  }

  private snapshot(): AreaSnapshot {
    return {
      area: this.area.map((p) => ({ ...p })),
      holes: this.holes.map((r) => r.map((p) => ({ ...p }))),
      mode: this.mode,
      smoothing: this.smoothing,
      strength: this.strength,
      detected: this.detected,
      fixed: this.fixedCorners,
      size: { ...this.size },
      sizeManual: this.sizeManual,
      pristine: this.pristine,
    };
  }

  /** Zapamiętuje stan do cofnięcia; `kind` łączy serię zmian (np. przesuwanie suwaka) w jeden krok. */
  private pushUndo(snap = this.snapshot(), kind = ''): void {
    const now = Date.now();
    if (kind && kind === this.undoKind && now - this.undoAt < 900) {
      this.undoAt = now;
      return;
    }
    this.undoKind = kind;
    this.undoAt = now;
    // Każda zmiana obszaru odcina zapisany kształt wczytanego notesu (od teraz liczy się obszar).
    this.pristine = false;
    this.sundo.push(snap);
    if (this.sundo.length > 60) this.sundo.shift();
  }

  /** Cofa ostatnią zmianę obszaru (Ctrl+Z). */
  undoArea(): void {
    const s = this.sundo.pop();
    if (!s || !this.src) return;
    this.touch();
    this.undoKind = '';
    this.area = s.area;
    this.holes = s.holes;
    this.mode = s.mode;
    this.smoothing = s.smoothing;
    this.strength = s.strength;
    this.detected = s.detected;
    this.fixedCorners = s.fixed;
    this.size = { ...s.size };
    this.sizeManual = s.sizeManual;
    this.pristine = s.pristine;
    this.pdrag = null;
    this.areaChanged();
  }

  /** Ustawienia kroku 2 dla panelu aplikacji (kreator). */
  areaState(): EditorArea {
    return {
      name: this.fields.draft.name,
      tape: this.fields.draft.tape,
      mode: this.mode,
      points: this.area.length,
      smoothing: this.smoothing,
      strength: this.strength,
      size: { ...this.size },
      binding: this.binding,
      canUndo: this.sundo.length > 0,
      detected: this.detected,
    };
  }

  /** Zmiana ustawień kroku 2 z panelu (kreator) albo z paska narzędzi edytora. */
  setArea(patch: EditorAreaPatch): void {
    this.touch();
    let geometry = false;
    if (patch.name !== undefined) this.fields.draft.name = String(patch.name).slice(0, 80);
    if (patch.tape !== undefined && /^#[0-9a-f]{6}$/i.test(patch.tape))
      this.fields.draft.tape = patch.tape.toLowerCase();
    if (patch.binding === 'top' || patch.binding === 'left') this.binding = patch.binding;
    if (patch.size) {
      const next = { ...this.size };
      for (const k of ['w', 'h'] as const) {
        const v = patch.size[k];
        if (v !== undefined && Number.isFinite(v)) next[k] = round1(clamp(v, 3, 60));
      }
      if (next.w !== this.size.w || next.h !== this.size.h) {
        this.size = next;
        this.sizeManual = true;
      }
    }
    if (patch.smoothing !== undefined && patch.smoothing !== this.smoothing) {
      this.pushUndo();
      this.smoothing = patch.smoothing;
      geometry = true;
    }
    if (patch.strength !== undefined) {
      const v = Math.round(clamp(Number(patch.strength) || 0, 0, MAX_SMOOTHING));
      if (v !== this.strength) {
        this.pushUndo(this.snapshot(), 'strength');
        this.strength = v;
        geometry = true;
      }
    }
    if (patch.mode && this.src) {
      this.setMode(patch.mode);
      geometry = true;
    }
    if (geometry) this.areaChanged();
    else {
      this.renderToolbar();
      this.render();
      this.renderChrome();
    }
  }

  /** Tryb obszaru: całe zdjęcie, ponowne wykrycie albo ręczna edycja bieżących punktów. */
  private setMode(mode: AreaMode): void {
    const src = this.src;
    if (!src) return;
    this.pushUndo();
    this.pdrag = null;
    if (mode === 'full') {
      this.area = fullArea(src.width, src.height);
      this.holes = [];
      this.detected = null;
    } else if (mode === 'auto') {
      const r = detectArea(src);
      this.area = r.area;
      this.holes = r.holes;
      this.detected = r.found;
      this.fixedCorners = false;
      this.sizeManual = false;
      if (r.found === 'missing')
        this.toast('Nie widzę wyraźnej kartki — ustaw punkty obszaru ręcznie.');
    }
    this.mode = mode;
  }

  /** Obrót zdjęcia o 90° razem z obszarem i historią cofania. */
  rotatePhoto(dir: 1 | -1): void {
    const src = this.src;
    if (!src || this.busy) return;
    this.touch();
    const { width: w, height: h } = src;
    const rot = (r: Pt[]): Pt[] => r.map((p) => rotatePoint(p, w, h, dir));
    this.area = rot(this.area);
    this.holes = this.holes.map(rot);
    this.sundo = this.sundo.map((s) => ({
      ...s,
      area: rot(s.area),
      holes: s.holes.map(rot),
      size: { w: s.size.h, h: s.size.w },
      // zapisany kształt nie obraca się razem ze zdjęciem
      pristine: false,
    }));
    this.pristine = false;
    this.src = rotate(src, dir);
    this.srcId++;
    this.size = { w: this.size.h, h: this.size.w };
    this.pdrag = null;
    this.refreshSrcUrl();
    this.areaChanged();
  }

  /** Narożniki do prostowania z obszaru (kartka wczytana z notesu jest już wyprostowana). */
  private updateCorners(): void {
    const src = this.src;
    if (!src) return;
    this.quad = this.fixedCorners
      ? fullQuad(src.width, src.height)
      : areaCorners(this.area, src.width, src.height);
  }

  /** Po zmianie obszaru: narożniki, rozmiar z proporcji, podgląd i stan kroku. */
  private areaChanged(): void {
    this.updateCorners();
    this.applyPhotoSize();
    this.renderToolbar();
    this.render();
    this.renderChrome();
  }

  private renderToolbar(): void {
    const tb = this.toolbar;
    // W kreatorze panel i pasek kroku 2 są w aplikacji (DS §18).
    // Kroki pól (3 i 4) mają własny pasek (`FieldsStep`, w kreatorze w aplikacji).
    if (this.step >= 3) return;
    if (this.step === 1 || !this.src || (this.opts.wizard && this.step === 2)) {
      tb.innerHTML = '';
      return;
    }
    const mode = (m: AreaMode, ic: string, label: string): string =>
      `<button type="button" role="radio" class="spe-tb-btn" data-mode="${m}" aria-checked="${this.mode === m}" title="${label}">${icon(ic)}<span>${label}</span></button>`;
    tb.innerHTML = `
      <div class="spe-tb-group">
        <button type="button" class="spe-tb-btn" data-a="rotl" title="Obróć w lewo">${icon('rotL')}</button>
        <button type="button" class="spe-tb-btn" data-a="rotr" title="Obróć w prawo">${icon('rotR')}</button>
      </div>
      <span class="spe-tb-sep"></span>
      <div class="spe-tb-group spe-seg" role="radiogroup" aria-label="Obszar kartki">
        ${mode('full', 'full', 'Całe zdjęcie')}
        ${mode('auto', 'detect', 'Wykryj')}
        ${mode('manual', 'rect', 'Ręcznie')}
      </div>
      <span class="spe-tb-sep"></span>
      <div class="spe-tb-group">
        <div class="spe-dims" title="Rozmiar kartki w centymetrach">
          <input type="number" min="3" max="60" step="0.1" data-dim="w" value="${this.size.w}" aria-label="Szerokość w cm">
          <span>×</span>
          <input type="number" min="3" max="60" step="0.1" data-dim="h" value="${this.size.h}" aria-label="Wysokość w cm">
          <span>cm</span>
        </div>
        <div class="spe-seg" role="radiogroup" aria-label="Grzbiet notesu">
          <button type="button" role="radio" data-bind="top" aria-checked="${this.binding === 'top'}" title="Grzbiet u góry">${icon('bindTop')}</button>
          <button type="button" role="radio" data-bind="left" aria-checked="${this.binding === 'left'}" title="Grzbiet z lewej">${icon('bindLeft')}</button>
        </div>
      </div>
      <span class="spe-tb-sep"></span>
      <div class="spe-tb-group">
        <button type="button" class="spe-tb-btn" data-a="smooth" aria-pressed="${this.smoothing}" title="Wygładź krawędzie">${icon('smooth')}</button>
        <label class="spe-range" title="Siła wygładzania"><span>Siła</span><input type="range" min="0" max="${MAX_SMOOTHING}" step="1" data-smooth value="${this.strength}" ${this.smoothing ? '' : 'disabled'}><output>${this.strength}</output></label>
        <button type="button" class="spe-tb-btn" data-a="undo" title="Cofnij (Ctrl+Z)" ${this.sundo.length ? '' : 'disabled'}>${icon('undo')}</button>
      </div>`;
    tb.querySelectorAll<HTMLButtonElement>('[data-a]').forEach((b) =>
      b.addEventListener('click', () => this.action(b.dataset.a as string)),
    );
    tb.querySelectorAll<HTMLButtonElement>('[data-mode]').forEach((b) =>
      b.addEventListener('click', () => this.setArea({ mode: b.dataset.mode as AreaMode })),
    );
    tb.querySelectorAll<HTMLButtonElement>('[data-bind]').forEach((b) =>
      b.addEventListener('click', () =>
        this.setArea({ binding: b.dataset.bind as 'top' | 'left' }),
      ),
    );
    tb.querySelectorAll<HTMLInputElement>('[data-dim]').forEach((i) =>
      i.addEventListener('change', () =>
        this.setArea({ size: { [i.dataset.dim as 'w' | 'h']: Number(i.value) || 10 } }),
      ),
    );
    const sm = tb.querySelector<HTMLInputElement>('[data-smooth]');
    // Bez przebudowy paska w trakcie przeciągania suwaka; seria zmian to jeden krok cofania.
    sm?.addEventListener('input', () => {
      (sm.nextElementSibling as HTMLElement).textContent = sm.value;
      this.pushUndo(this.snapshot(), 'strength');
      this.strength = Math.round(Number(sm.value));
      this.render();
    });
    sm?.addEventListener('change', () => this.renderToolbar());
  }

  private action(a: string): void {
    if (!this.src) return;
    if (a === 'rotl' || a === 'rotr') this.rotatePhoto(a === 'rotl' ? -1 : 1);
    else if (a === 'smooth') this.setArea({ smoothing: !this.smoothing });
    else if (a === 'undo') this.undoArea();
  }

  private persp(): Persp {
    return new Persp(this.quad);
  }

  /** Usuwa punkt obszaru (dwuklik, przytrzymanie, Delete); zostają co najmniej trzy. */
  private deletePoint(i: number): void {
    const next = removePoint(this.area, i);
    if (!next) {
      this.toast(`Obszar musi mieć co najmniej ${MIN_AREA_POINTS} punkty.`);
      return;
    }
    this.pushUndo();
    this.area = next;
    this.mode = 'manual';
    this.refocus = this.focusPt >= 0 ? Math.min(i, next.length - 1) : -1;
    this.areaChanged();
  }

  // ─────────────────────────────────────────────── krok 3: wyprostowana kartka

  private sheetWant(): string {
    return `${this.geomKey()}|${this.flatten}`;
  }

  private ensureSheet(): void {
    if (!this.src) return;
    const key = this.sheetWant();
    if (this.sheet && this.sheetKey === key) return;
    // EDT-12: rozdzielczość zdjęcia źródłowego (bez powiększania), dłuższy bok do 4096 px
    const { w: ow, h: oh } = sheetSize(this.quad, this.size.w / this.size.h);
    const out = warp(this.src, this.quad, ow, oh);
    releasePixels();
    if (this.flatten) flattenPaper(out, 0.92);
    this.sheet = out;
    this.sheetKey = key;
    this.view = null;
    const k = Math.min(1, 1400 / Math.max(out.width, out.height));
    if (k >= 1) this.sheetUrl = out.toDataURL('image/jpeg', 0.86);
    else {
      const p = document.createElement('canvas');
      p.width = Math.round(out.width * k);
      p.height = Math.round(out.height * k);
      (p.getContext('2d') as CanvasRenderingContext2D).drawImage(out, 0, 0, p.width, p.height);
      this.sheetUrl = p.toDataURL('image/jpeg', 0.86);
    }
  }

  // ─────────────────────────────────────────────── podgląd

  scale(w: number): number {
    const m = this.svg.getScreenCTM();
    return m && m.a ? 1 / m.a : w / Math.max(200, this.svg.clientWidth || 600);
  }

  render(): void {
    cancelAnimationFrame(this.raf);
    this.raf = requestAnimationFrame(() => this.draw());
    this.notify();
  }

  /** Ustawia obraz (href tylko przy zmianie — bez ponownego dekodowania co klatkę). */
  private setImage(img: SVGImageElement, url: string, w: number, h: number): void {
    if ((img as unknown as { _href?: string })._href !== url) {
      (img as unknown as { _href?: string })._href = url;
      img.setAttribute('href', url);
    }
    img.setAttribute('width', String(w));
    img.setAttribute('height', String(h));
  }

  private draw(): void {
    const svg = this.svg;
    svg.classList.toggle('spe-c-draw', this.step === 3 && this.fields.mode === 'rects');
    svg.classList.toggle('spe-zoomed', this.step >= 3 && !!this.view);
    if (this.step !== 2 || !this.pdrag?.moved) this.loupe.style.display = 'none';
    if (this.step === 1 || !this.src) {
      this.baseImg.style.display = 'none';
      this.ov.innerHTML = '';
      return;
    }
    this.baseImg.style.display = '';
    if (this.step >= 3) {
      const sheet = this.sheet;
      if (!sheet) return;
      const v = this.view;
      svg.setAttribute(
        'viewBox',
        v ? `${v.x} ${v.y} ${v.w} ${v.h}` : `0 0 ${sheet.width} ${sheet.height}`,
      );
      this.setImage(this.baseImg, this.sheetUrl, sheet.width, sheet.height);
      this.ov.innerHTML = this.fields.draw() + this.spineSvg(sheet.width, sheet.height);
      return;
    }
    this.drawShape();
  }

  /** Grzbiet na wyprostowanej kartce (krok 3): pasek wzdłuż klejonej krawędzi. */
  private spineSvg(w: number, h: number): string {
    const k = this.scale(w);
    const t = 5 * k;
    const tape = esc(this.fields.draft.tape);
    return this.binding === 'left'
      ? `<rect x="${-t}" y="0" width="${t}" height="${h}" fill="${tape}" class="spe-spine-r"/>`
      : `<rect x="0" y="${-t}" width="${w}" height="${t}" fill="${tape}" class="spe-spine-r"/>`;
  }

  private drawShape(): void {
    const src = this.src as HTMLCanvasElement;
    const { width: w, height: h } = src;
    this.svg.setAttribute('viewBox', `0 0 ${w} ${h}`);
    const k = this.scale(w);
    const P = this.persp();
    const q = this.quad;
    const sh = this.shape();
    const pts = (r: { x: number; y: number }[]): string =>
      r.map((p, i) => `${i ? 'L' : 'M'}${p.x.toFixed(1)} ${p.y.toFixed(1)}`).join('') + 'Z';
    const path = sh
      ? [sh.outline, ...(sh.holes ?? [])]
          .map((r) => pts(r.map(([u, v]) => P.toPhoto(u, v))))
          .join('')
      : pts(this.area);
    this.setImage(this.baseImg, this.srcUrl, w, h);
    // fokus klawiatury na punkcie przetrwa przebudowę nakładki
    const root = this.svg.getRootNode() as Document | ShadowRoot;
    const active = root.activeElement as Element | null;
    const focusIdx =
      this.refocus >= 0
        ? this.refocus
        : active && this.ov.contains(active) && active.hasAttribute('data-p')
          ? Number(active.getAttribute('data-p'))
          : -1;
    this.refocus = -1;
    let s = `<path d="M0 0H${w}V${h}H0Z${path}" class="spe-dim" fill-rule="evenodd"/>`;
    // narożniki prostowania, gdy obszar nie jest czworokątem
    if (this.area.length !== 4 || sh)
      s += `<polygon points="${q.map((p) => `${p.x},${p.y}`).join(' ')}" class="spe-frame"/>`;
    s += `<path d="${path}" class="spe-outline" fill-rule="evenodd"/>`;
    // wielokąt punktów (przy wygładzaniu obrys idzie obok punktów)
    if (this.smoothing && this.strength > 0) s += `<path d="${pts(this.area)}" class="spe-raw"/>`;
    // grzbiet: klejona krawędź w kolorze taśmy
    const [a, b] = this.binding === 'left' ? [q[0], q[3]] : [q[0], q[1]];
    s += `<line x1="${a.x}" y1="${a.y}" x2="${b.x}" y2="${b.y}" class="spe-spine halo"/><line x1="${a.x}" y1="${a.y}" x2="${b.x}" y2="${b.y}" class="spe-spine" stroke="${esc(this.fields.draft.tape)}"/>`;
    s += `<rect x="0" y="0" width="${w}" height="${h}" fill="transparent" data-bg="1"/>`;
    // krawędzie: kliknięcie albo dotknięcie wstawia punkt
    const n = this.area.length;
    this.area.forEach((p, i) => {
      const c = this.area[(i + 1) % n];
      s += `<line data-e="${i}" class="spe-edge" x1="${p.x}" y1="${p.y}" x2="${c.x}" y2="${c.y}"/>`;
    });
    // strefa chwytu: większa pod palcem, mniejsza dla myszy (krótkie krawędzie da się kliknąć)
    const grab = (coarsePointer() ? 22 : 14) * k;
    this.area.forEach((p, i) => {
      s += `<g data-p="${i}" class="spe-qh${this.pdrag?.i === i ? ' on' : ''}" tabindex="0" role="button" aria-label="Punkt obszaru ${i + 1} z ${n}. Strzałki przesuwają, Delete usuwa."><circle cx="${p.x}" cy="${p.y}" r="${grab}" fill="transparent"/><circle cx="${p.x}" cy="${p.y}" r="${8 * k}" class="dot"/></g>`;
    });
    this.ov.innerHTML = s;
    if (focusIdx >= 0)
      (
        this.ov.querySelector(`[data-p="${Math.min(focusIdx, n - 1)}"]`) as SVGElement | null
      )?.focus({
        preventScroll: true,
      });
    this.drawLoupe(k);
  }

  /** Lupa przy przeciąganiu punktu (DS §18): koło 88 (telefon 72) z celownikiem. */
  private drawLoupe(k: number): void {
    const L = this.loupe;
    const src = this.src;
    const drag = this.pdrag;
    if (!drag?.moved || !src || !this.srcUrl) {
      L.style.display = 'none';
      return;
    }
    const { width: w, height: h } = src;
    const p = this.area[drag.i];
    if (!p) return;
    const R = (this.svg.clientWidth && this.svg.clientWidth < 520 ? 36 : 44) * k;
    const Z = 3;
    const off = R + 40 * k;
    const lx = clamp(p.x + this.loupeSide.x * off, R, w - R);
    const ly = clamp(p.y + this.loupeSide.y * off, R, h - R);
    const set = (sel: string, attrs: Record<string, string | number>): void => {
      const e = L.querySelector(sel) as SVGElement;
      for (const a in attrs) e.setAttribute(a, String(attrs[a]));
    };
    set('.lc', { cx: lx, cy: ly, r: R });
    set('.ring', { cx: lx, cy: ly, r: R + 3 * k });
    set('.bg', { x: lx - R, y: ly - R, width: 2 * R, height: 2 * R });
    set('.lt', { transform: `translate(${lx} ${ly}) scale(${Z}) translate(${-p.x} ${-p.y})` });
    this.setImage(L.querySelector('.li') as SVGImageElement, this.srcUrl, w, h);
    set('.lp', { points: this.area.map((c) => `${c.x},${c.y}`).join(' ') });
    const r = 7 * k;
    set('.cross', {
      d: `M${lx - r} ${ly}a${r} ${r} 0 1 0 ${2 * r} 0a${r} ${r} 0 1 0 ${-2 * r} 0`,
    });
    L.style.display = '';
  }

  toSvg(e: PointerEvent): { x: number; y: number } {
    const m = this.svg.getScreenCTM();
    if (!m) return { x: 0, y: 0 };
    const p = new DOMPoint(e.clientX, e.clientY).matrixTransform(m.inverse());
    return { x: p.x, y: p.y };
  }

  capture(e: PointerEvent): void {
    try {
      this.svg.setPointerCapture(e.pointerId);
    } catch {
      /* przechwycenie niedostępne */
    }
    e.preventDefault();
  }

  /** Początek przeciągania punktu `i`; lupa po przeciwnej stronie niż bliższy brzeg zdjęcia. */
  private startDrag(e: PointerEvent, i: number, moved: boolean, snap: AreaSnapshot): void {
    const src = this.src as HTMLCanvasElement;
    const c = this.area[i];
    this.loupeSide = { x: c.x > src.width / 2 ? -1 : 1, y: c.y > src.height / 2 ? -1 : 1 };
    const p = this.toSvg(e);
    this.pdrag = { i, moved, x: p.x, y: p.y, snap, pointer: e.pointerId };
    clearTimeout(this.press);
    // przytrzymanie punktu bez ruchu usuwa go na ekranie dotykowym (mysz: dwuklik, klawiatura: Delete)
    if (!moved && e.pointerType === 'touch')
      this.press = window.setTimeout(() => {
        const d = this.pdrag;
        if (!d || d.moved || d.i !== i) return;
        this.pdrag = null;
        this.deletePoint(i);
      }, 550);
    this.capture(e);
    this.render();
  }

  private onDown(e: PointerEvent): void {
    if (e.button > 0) return;
    // fokus zostaje w edytorze — skróty (Delete, strzałki, Ctrl+Z) działają po kliknięciu podglądu
    const t = e.target as Element;
    const ph = t.closest('[data-p]') as SVGElement | null;
    if (this.step !== 2 || !ph) this.svg.focus({ preventScroll: true });
    if (this.step >= 3) {
      if (this.sheet) this.sheetDown(e);
      return;
    }
    // drugi palec nie przejmuje przeciąganego punktu
    if (this.step !== 2 || !this.src || this.pdrag) return;
    if (ph) {
      const i = Number(ph.dataset.p);
      // Dwuklik (mysz, pióro) usuwa punkt. Wykrywamy go sami: nakładka jest przebudowywana po
      // każdym wciśnięciu, a wtedy przeglądarka bywa, że nie wysyła zdarzenia `dblclick`.
      const last = this.lastPress;
      const now = e.timeStamp;
      this.lastPress = { i, at: now };
      if (e.pointerType !== 'touch' && last?.i === i && now - last.at < 400) {
        this.lastPress = null;
        e.preventDefault();
        this.deletePoint(i);
        return;
      }
      ph.focus({ preventScroll: true });
      this.startDrag(e, i, false, this.snapshot());
      return;
    }
    const edge = t.closest('[data-e]') as SVGElement | null;
    if (edge) {
      const i = Number(edge.dataset.e);
      const a = this.area[i];
      const b = this.area[(i + 1) % this.area.length];
      if (!a || !b) return;
      const snap = this.snapshot();
      this.pushUndo(snap);
      const { at } = segmentDistance(this.toSvg(e), a, b);
      this.area.splice(i + 1, 0, at);
      this.mode = 'manual';
      this.startDrag(e, i + 1, true, snap);
      this.updateCorners();
    }
  }

  private onMove(e: PointerEvent): void {
    if (this.step >= 3) {
      this.sheetMove(e);
      return;
    }
    const d = this.pdrag;
    const src = this.src;
    if (!d || !src || e.pointerId !== d.pointer) return;
    const p = this.toSvg(e);
    if (!d.moved) {
      // drobne drgnięcie palca to jeszcze nie przeciąganie
      if (Math.hypot(p.x - d.x, p.y - d.y) < 5 * this.scale(src.width)) return;
      d.moved = true;
      this.lastPress = null;
      clearTimeout(this.press);
      this.pushUndo(d.snap);
      this.mode = 'manual';
    }
    this.area[d.i] = { x: clamp(p.x, 0, src.width), y: clamp(p.y, 0, src.height) };
    this.updateCorners();
    this.render();
  }

  private onUp(e: PointerEvent): void {
    if (this.step >= 3) {
      this.sheetUp(e);
      return;
    }
    const d = this.pdrag;
    if (!d || e.pointerId !== d.pointer) return;
    clearTimeout(this.press);
    if (e.type === 'pointercancel') {
      this.cancelDrag();
      return;
    }
    this.pdrag = null;
    if (d.moved) this.areaChanged();
    else this.render();
  }

  /** Przerwane przeciąganie (Esc, pointercancel): obszar wraca do stanu sprzed przeciągania. */
  private cancelDrag(): void {
    const d = this.pdrag;
    if (!d) return;
    this.pdrag = null;
    clearTimeout(this.press);
    if (d.moved) {
      this.sundo.pop();
      this.area = d.snap.area;
      this.mode = d.snap.mode;
      this.pristine = d.snap.pristine;
      this.areaChanged();
    } else this.render();
  }

  /** Klawiatura na punkcie obszaru: strzałki przesuwają (Shift: dalej), Delete usuwa. */
  private pointKey(e: KeyboardEvent): boolean {
    const ph = (e.composedPath()[0] as Element | undefined)?.closest?.('[data-p]') as
      SVGElement | null | undefined;
    const src = this.src;
    if (!ph || !src) return false;
    const i = Number(ph.dataset.p);
    if (e.key === 'Delete' || e.key === 'Backspace') {
      this.focusPt = i;
      this.deletePoint(i);
      this.focusPt = -1;
      return true;
    }
    const dirs: Record<string, [number, number]> = {
      ArrowLeft: [-1, 0],
      ArrowRight: [1, 0],
      ArrowUp: [0, -1],
      ArrowDown: [0, 1],
    };
    const dir = dirs[e.key];
    if (!dir) return false;
    const step = (e.shiftKey ? 10 : 1) * this.scale(src.width);
    this.pushUndo(this.snapshot(), `key${i}`);
    const p = this.area[i];
    this.area[i] = {
      x: clamp(p.x + dir[0] * step, 0, src.width),
      y: clamp(p.y + dir[1] * step, 0, src.height),
    };
    this.mode = 'manual';
    this.refocus = i;
    this.areaChanged();
    return true;
  }

  // ─────────────────────────────────────────────── krok 3: mapowanie pól (EDT-11)

  /** Zmiana mapowania z panelu kreatora (sposób, miejsca, kategorie, cofanie, widok). */
  editMapping(action: EditorMappingAction): void {
    if (this.step !== 3 || !this.sheet || this.busy) return;
    if (action.type === 'fit') {
      this.view = null;
      this.render();
      return;
    }
    if (action.type !== 'category' && action.type !== 'seat') this.touch();
    this.fields.apply(action);
    this.notify();
  }

  // ─────────────────────────────────────────────── krok 4: kategorie (EDT-13, kreator)

  /** Zmiana kategorii i reguły miejsc z panelu kreatora (nazwa, typ, zakres, sumy, wygrana). */
  editCategories(action: EditorCategoriesAction): void {
    if (this.step !== 4 || !this.sheet || this.busy) return;
    if (action.type === 'fit') {
      this.view = null;
      this.render();
      return;
    }
    if (action.type !== 'view' && action.type !== 'select') this.touch();
    this.fields.applyCategories(action);
    this.notify();
  }

  /** Widok kartki: cała kartka albo powiększony fragment (współrzędne kartki). */
  private viewBox(): { x: number; y: number; w: number; h: number } {
    const sheet = this.sheet as HTMLCanvasElement;
    return this.view ?? { x: 0, y: 0, w: sheet.width, h: sheet.height };
  }

  /** Punkt ekranu → punkt kartki dla widoku `v` (viewBox z preserveAspectRatio „meet”). */
  private screenToSheet(cx: number, cy: number, v = this.viewBox()): { x: number; y: number } {
    const r = this.svg.getBoundingClientRect();
    const k = Math.min(r.width / v.w, r.height / v.h) || 1;
    const ox = (r.width - v.w * k) / 2;
    const oy = (r.height - v.h * k) / 2;
    return { x: v.x + (cx - r.left - ox) / k, y: v.y + (cy - r.top - oy) / k };
  }

  /** Ustawia widok w granicach kartki (od całej kartki do ośmiokrotnego powiększenia). */
  private setView(v: { x: number; y: number; w: number; h: number }): void {
    const sheet = this.sheet;
    if (!sheet) return;
    const W = sheet.width;
    const H = sheet.height;
    const w = clamp(v.w, W / MAX_ZOOM, W);
    const h = (w * H) / W;
    if (w >= W - 0.5) {
      this.view = null;
    } else {
      this.view = { x: clamp(v.x, 0, W - w), y: clamp(v.y, 0, H - h), w, h };
    }
    this.render();
  }

  /** Powiększa `f` razy wokół punktu ekranu (punkt kartki pod nim zostaje na miejscu). */
  private zoomAt(cx: number, cy: number, f: number): void {
    const v = this.viewBox();
    const p = this.screenToSheet(cx, cy, v);
    const w = v.w / f;
    const h = v.h / f;
    this.setView({ x: p.x - (p.x - v.x) / f, y: p.y - (p.y - v.y) / f, w, h });
  }

  /** Przesuwa widok o wektor ekranu. */
  private panBy(dx: number, dy: number): void {
    const v = this.viewBox();
    const r = this.svg.getBoundingClientRect();
    const k = Math.min(r.width / v.w, r.height / v.h) || 1;
    this.setView({ ...v, x: v.x - dx / k, y: v.y - dy / k });
  }

  private onWheel(e: WheelEvent): void {
    if (this.step < 3 || !this.sheet) return;
    if (e.ctrlKey || e.metaKey) {
      e.preventDefault();
      this.zoomAt(e.clientX, e.clientY, Math.exp(-clamp(e.deltaY, -60, 60) * 0.01));
    } else if (this.view) {
      e.preventDefault();
      this.panBy(-e.deltaX, -e.deltaY);
    }
  }

  /** Klawiatura w kroku 3: + i - powiększają, 0 dopasowuje widok. */
  private zoomKey(e: KeyboardEvent): boolean {
    if (!this.sheet) return false;
    const r = this.svg.getBoundingClientRect();
    const cx = r.left + r.width / 2;
    const cy = r.top + r.height / 2;
    if (e.key === '+' || e.key === '=') this.zoomAt(cx, cy, 1.25);
    else if (e.key === '-' || e.key === '_') this.zoomAt(cx, cy, 0.8);
    else if (e.key === '0') {
      this.view = null;
      this.render();
    } else return false;
    return true;
  }

  private sheetDown(e: PointerEvent): void {
    if (e.pointerType === 'touch') {
      this.touches.set(e.pointerId, { x: e.clientX, y: e.clientY });
      if (this.touches.size >= 2) {
        // drugi palec: zamiast rysowania powiększenie i przesuwanie widoku
        if (this.fields.dragging) this.fields.cancel();
        const [a, b] = [...this.touches.values()];
        this.pinch = {
          d: Math.hypot(a.x - b.x, a.y - b.y),
          x: (a.x + b.x) / 2,
          y: (a.y + b.y) / 2,
        };
        this.capture(e);
        return;
      }
    }
    if (this.pinch) return;
    if (this.step === 4) this.fields.pick(e);
    else this.fields.down(e);
  }

  private sheetMove(e: PointerEvent): void {
    if (e.pointerType === 'touch' && this.touches.has(e.pointerId))
      this.touches.set(e.pointerId, { x: e.clientX, y: e.clientY });
    const pin = this.pinch;
    if (pin) {
      const [a, b] = [...this.touches.values()];
      if (!a || !b) return;
      const d = Math.hypot(a.x - b.x, a.y - b.y);
      const x = (a.x + b.x) / 2;
      const y = (a.y + b.y) / 2;
      this.panBy(x - pin.x, y - pin.y);
      if (pin.d > 0 && d > 0) this.zoomAt(x, y, d / pin.d);
      this.pinch = { d, x, y };
      return;
    }
    if (this.step === 3) this.fields.move(e);
  }

  private sheetUp(e: PointerEvent): void {
    this.touches.delete(e.pointerId);
    if (this.pinch) {
      // palec, który został po szczypaniu, niczego nie rysuje
      if (!this.touches.size) this.pinch = null;
      return;
    }
    if (this.step === 4) return;
    if (e.type === 'pointercancel') {
      if (this.fields.dragging) this.fields.cancel();
      return;
    }
    this.fields.up(e);
  }

  private endPinch(): void {
    this.pinch = null;
    this.touches.clear();
  }

  // ─────────────────────────────────────────────── wynik

  private build(): PadTemplate | null {
    if (!this.sheet || this.fields.problem()) return null;
    const sh = this.shape();
    const r4 = (v: number): number => Math.round(v * 10000) / 10000;
    const out = this.fields.output();
    return {
      v: 2,
      id: this.editId || `n-${uid()}`,
      ...out,
      size: { ...this.size },
      image: this.sheetImage() as string,
      shape: sh
        ? {
            outline: sh.outline.map(([x, y]) => [r4(x), r4(y)] as ShapePt),
            holes: sh.holes?.length
              ? sh.holes.map((h) => h.map(([x, y]) => [r4(x), r4(y)] as ShapePt))
              : undefined,
          }
        : undefined,
      binding: this.binding === 'left' ? 'left' : undefined,
    };
  }

  /**
   * Obraz kartki do zapisu (EDT-12): zdjęcie wczytanego notesu bez zmian kadru zostaje tym samym
   * plikiem, a nowa kartka jest kodowana w pełnej rozdzielczości (WebP albo JPEG, jakość 0,92).
   */
  sheetImage(): string | null {
    if (!this.sheet) return null;
    return this.loadedImage?.key === this.sheetWant()
      ? this.loadedImage.url
      : encodeSheet(this.sheet);
  }

  /** Plik notesu (taki sam jak „Zapisz notes do pliku” w notesie). */
  exportConfig(): PadConfig | null {
    const t = this.build();
    if (!t) return null;
    return { format: 'score-pad', version: 2, template: t, active: t.id };
  }

  /** Ostatni krok odhaczony po zapisie (bez przebudowy przycisków). */
  private markDone(): void {
    this.root.querySelector('.spe-step[data-s="3"]')?.classList.add('done');
  }

  private flash(b: HTMLButtonElement, label: string): void {
    const html = b.innerHTML;
    b.classList.add('did');
    b.innerHTML = `${icon('check')}<span>${label}</span>`;
    setTimeout(() => {
      b.classList.remove('did');
      if (b.isConnected) b.innerHTML = html;
    }, 1700);
  }

  private async saveFile(b: HTMLButtonElement): Promise<void> {
    const cfg = this.exportConfig();
    if (!cfg?.template) return;
    const json = JSON.stringify(cfg, null, 2);
    const filename = scorePadFileName(cfg.template.name);
    const res = await saveText(filename, json);
    if (res === 'saved') {
      this.flash(b, 'Zapisano');
      this.exported = true;
      this.markDone();
      this.opts.onExport?.(cfg, 'file');
    } else if (res === 'unavailable')
      this.toast('Pobieranie plików jest tu niedostępne — użyj „Kopiuj do schowka”.');
  }

  private async copy(b: HTMLButtonElement): Promise<void> {
    const cfg = this.exportConfig();
    if (!cfg) return;
    if (await copyText(JSON.stringify(cfg))) {
      this.flash(b, 'Skopiowano');
      this.exported = true;
      this.markDone();
      this.opts.onExport?.(cfg, 'clipboard');
    } else this.toast('Schowek jest niedostępny w tej przeglądarce.');
  }

  private async use(b: HTMLButtonElement): Promise<void> {
    const t = this.build();
    if (!t || !this.opts.onUse) return;
    b.disabled = true;
    try {
      await this.opts.onUse(t);
      this.root.remove();
    } catch (err) {
      b.disabled = false;
      this.toast((err as Error).message || 'Nie udało się wstawić notesu.');
    }
  }
}

const round1 = (v: number): number => Math.round(v * 10) / 10;

/** Największe powiększenie kartki w kroku 3. */
const MAX_ZOOM = 8;

/** Dotyk jako główny wskaźnik (telefon, tablet). */
const coarsePointer = (): boolean =>
  typeof matchMedia === 'function' && matchMedia('(pointer: coarse)').matches;

/** Czy stan edytora się zmienił (podglądy porównujemy po adresie, nie po treści). */
function sameStatus(a: EditorStatus, b: EditorStatus): boolean {
  return (
    a.step === b.step &&
    a.busy === b.busy &&
    a.photo === b.photo &&
    a.photoUrl === b.photoUrl &&
    a.area === b.area &&
    a.fields === b.fields &&
    a.sheetUrl === b.sheetUrl &&
    a.seats === b.seats &&
    a.dirty === b.dirty &&
    a.openFailed === b.openFailed &&
    sameArea(a.settings, b.settings) &&
    sameMapping(a.mapping, b.mapping) &&
    (a.categories === b.categories ||
      JSON.stringify(a.categories) === JSON.stringify(b.categories)) &&
    a.lines.length === b.lines.length &&
    a.lines.every((l, i) => l.label === b.lines[i]?.label && l.kind === b.lines[i]?.kind)
  );
}

function sameMapping(a: EditorMapping, b: EditorMapping): boolean {
  return (Object.keys(a) as (keyof EditorMapping)[]).every((k) => a[k] === b[k]);
}

function sameArea(a: EditorArea, b: EditorArea): boolean {
  return (
    a.name === b.name &&
    a.tape === b.tape &&
    a.mode === b.mode &&
    a.points === b.points &&
    a.smoothing === b.smoothing &&
    a.strength === b.strength &&
    a.size.w === b.size.w &&
    a.size.h === b.size.h &&
    a.binding === b.binding &&
    a.canUndo === b.canUndo &&
    a.detected === b.detected
  );
}

/**
 * Nieudane wczytanie w kreatorze: plik nie jest obrazem (`type`), obrazu nie da się odczytać
 * (`image`) albo edytor jest zajęty innym wczytywaniem lub prostowaniem kartki (`busy`).
 */
export class EditorLoadError extends Error {
  constructor(readonly reason: 'type' | 'image' | 'busy') {
    super(`score-pad-editor: ${reason}`);
    this.name = 'EditorLoadError';
  }
}

/** Zapis pliku: w podglądzie Claude przez zgodę na pobranie, na zwykłej stronie od razu. */
async function saveText(
  filename: string,
  text: string,
): Promise<'saved' | 'declined' | 'unavailable'> {
  const hostApi = (window as unknown as { claude?: { use?: (n: string) => Promise<unknown> } })
    .claude;
  if (hostApi && typeof hostApi.use === 'function') {
    try {
      const dl = (await hostApi.use('downloads')) as {
        save(r: { filename: string; data: string }): Promise<unknown>;
      } | null;
      if (dl) {
        await dl.save({ filename, data: text });
        return 'saved';
      }
    } catch (e) {
      if ((e as { code?: string }).code === 'declined') return 'declined';
    }
    return 'unavailable';
  }
  try {
    const url = URL.createObjectURL(new Blob([text], { type: 'application/json' }));
    const a = document.createElement('a');
    a.href = url;
    a.download = filename;
    document.body.appendChild(a);
    a.click();
    a.remove();
    setTimeout(() => URL.revokeObjectURL(url), 4000);
    return 'saved';
  } catch {
    return 'unavailable';
  }
}

async function copyText(text: string): Promise<boolean> {
  try {
    await navigator.clipboard.writeText(text);
    return true;
  } catch {
    // starsze przeglądarki i ramki bez uprawnień do schowka
    const ta = document.createElement('textarea');
    ta.value = text;
    ta.setAttribute('readonly', '');
    ta.style.cssText = 'position:fixed;left:-9999px;top:0;opacity:0';
    document.body.appendChild(ta);
    ta.select();
    let ok: boolean;
    try {
      ok = document.execCommand('copy');
    } catch {
      ok = false;
    }
    ta.remove();
    return ok;
  }
}
