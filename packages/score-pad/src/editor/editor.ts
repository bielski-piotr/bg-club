// Edytor notesu w trzech krokach: zdjęcie → kształt kartki → pola punktacji.
// Działa samodzielnie (<score-pad-editor>) albo — na życzenie — jako nakładka w notesie.
// W trybie kreatora (`wizard`, EDT-9) kroki, nawigację i wczytywanie zdjęcia prowadzi aplikacja:
// edytor pokazuje tylko scenę z narzędziami bieżącego kroku i zgłasza zmiany stanu (`onChange`).

import type { Pt, Quad } from './photo';
import {
  Persp,
  canvasFromBlob,
  canvasFromUrl,
  detectPaper,
  flattenPaper,
  fullQuad,
  looksCropped,
  quadAspect,
  rotate,
  rotateQuad,
  toJpeg,
  warp,
} from './photo';
import type { LineKind, PadTemplate } from '../core/templates';
import { validateTemplate } from '../core/templates';
import type { PadConfig } from '../core/settings';
import type { ShapePt, SheetShape } from '../core/shape';
import { clamp, el, esc, uid } from '../core/util';
import {
  detectShape,
  findOnPlainBackground,
  maskSize,
  paintPoly,
  rasterize,
  smoothShape,
  traceShape,
  wandRegion,
} from './shape-tools';
import { FieldsStep } from './fields';
import { icon } from './icons';
import { scorePadFileName } from '../file-name';

export type Step = 1 | 2 | 3;
type Tool = 'none' | 'wand' | 'lasso';

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
  /** Notes został zmieniony od otwarcia edytora (zdjęcie, kształt, pola, kategorie). */
  readonly dirty: boolean;
  /** Nie udało się wczytać zdjęcia notesu otwartego do edycji. */
  readonly openFailed: boolean;
}

const STEPS: { n: Step; title: string; sub: string }[] = [
  { n: 1, title: 'Zdjęcie', sub: 'Wczytanie zdjęcia notesu' },
  { n: 2, title: 'Kształt', sub: 'Obszar i kształt kartki' },
  { n: 3, title: 'Pola', sub: 'Pola do wpisywania' },
];

const RECT: ShapePt[] = [
  [0, 0],
  [1, 0],
  [1, 1],
  [0, 1],
];

const cloneShape = (s: SheetShape | undefined): SheetShape | undefined =>
  s ? (JSON.parse(JSON.stringify(s)) as SheetShape) : undefined;

/** Obrót kształtu razem ze zdjęciem (dir 1 = w prawo). */
function rotateShape(s: SheetShape | undefined, dir: 1 | -1): SheetShape | undefined {
  if (!s) return s;
  const f = ([u, v]: ShapePt): ShapePt => (dir === 1 ? [1 - v, u] : [v, 1 - u]);
  return { outline: s.outline.map(f), holes: s.holes?.map((h) => h.map(f)) };
}

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

  // kształt (przed wygładzeniem) i narzędzia
  private raw: SheetShape | undefined;
  private smooth = 2;
  private smoothed: { key: string; shape: SheetShape | undefined } = { key: '', shape: undefined };
  /** Kształt poprawiany ręcznie — po zmianie kadru nie wykrywa się go ponownie. */
  private manual = false;
  private exported = false;
  private sundo: (SheetShape | undefined)[] = [];
  private tool: Tool = 'none';
  private paint: 'cut' | 'restore' = 'cut';
  private wandTol = 42;
  private qdrag: { i: number } | null = null;
  private lasso: { pts: Pt[]; restore: boolean } | null = null;
  private wandPx: { key: string; w: number; h: number; data: Uint8ClampedArray } | null = null;
  private redetect = 0;

  // wyprostowana kartka (krok 3)
  sheet: HTMLCanvasElement | null = null;
  sheetUrl = '';
  private sheetKey = '';
  readonly fields: FieldsStep;
  private raf = 0;

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
    this.resizeObs = new ResizeObserver(() => this.render());
    this.resizeObs.observe(this.svg);
  }

  /** Odpina nasłuch dokumentu i obserwatora (element usunięty ze strony). */
  destroy(): void {
    cancelAnimationFrame(this.notifyRaf);
    if (this.onDocPaste) document.removeEventListener('paste', this.onDocPaste);
    this.onDocPaste = null;
    this.resizeObs?.disconnect();
    this.resizeObs = null;
  }

  private onKey(e: KeyboardEvent): void {
    const typing = !!(e.target as HTMLElement).closest('input, select, textarea');
    if (e.key === 'Escape') {
      // Esc obsłużony w edytorze nie zamyka popupu, w którym edytor jest osadzony.
      if (this.lasso) {
        e.preventDefault();
        this.lasso = null;
        this.render();
        return;
      }
      if (this.step === 3 && this.fields.key(e)) {
        e.preventDefault();
        return;
      }
      if (this.tool !== 'none' && this.step === 2) {
        e.preventDefault();
        this.setTool('none');
        return;
      }
      if (this.opts.onClose) this.close();
      return;
    }
    if (typing) return;
    if (this.step === 2 && (e.ctrlKey || e.metaKey) && e.key.toLowerCase() === 'z') {
      e.preventDefault();
      this.touch();
      this.undo();
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
      dirty: this.dirty,
      openFailed: this.openFailed,
    };
  }

  // ─────────────────────────────────────────────── kroki

  /** Czy dany krok jest ukończony (można przejść dalej). */
  private complete(s: Step): boolean {
    if (s === 1) return !!this.src;
    if (s === 2) return !!this.src && this.shapeOk();
    return !!this.sheet && !this.fields.problem();
  }

  private shapeOk(): boolean {
    return this.shape() !== null;
  }

  private canGo(s: Step): boolean {
    if (s <= this.reached) return s === 1 || this.complete((s - 1) as Step);
    return s === this.reached + 1 && this.complete(this.reached);
  }

  goStep(s: Step): void {
    if (s !== 1 && !this.canGo(s)) return;
    if (s === 3 && this.src && (!this.sheet || this.sheetKey !== this.sheetWant())) {
      // prostowanie trwa chwilę — najpierw wskaźnik
      this.setBusy('sheet');
      setTimeout(() => {
        this.ensureSheet();
        this.setBusy('');
        this.show(3);
      }, 40);
      return;
    }
    this.show(s);
  }

  private show(s: Step): void {
    const prev = this.step;
    this.step = s;
    if (s > this.reached) this.reached = s;
    this.lasso = null;
    this.qdrag = null;
    this.exported = false;
    this.root.dataset.step = String(s);
    if (prev !== s) {
      const main = this.root.querySelector('.spe-work') as HTMLElement;
      main.classList.remove('enter');
      void main.offsetWidth;
      main.classList.add('enter');
    }
    if (s === 3) {
      this.ensureSheet();
      this.fields.enter();
    } else {
      this.panel.innerHTML = '';
      this.renderToolbar();
    }
    this.renderChrome();
    this.render();
    if (s === 2 || s === 3) this.svg.focus({ preventScroll: true });
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
      this.raw = cloneShape(t.shape);
      this.smooth = 0;
      this.manual = true;
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

  private setSource(c: HTMLCanvasElement): void {
    this.src = c;
    this.srcId++;
    let scan = looksCropped(c);
    // jasne tło dookoła to też „przycięty skan” — chyba że na nim leży wyraźny przedmiot (np. plansza)
    const onPlain = scan ? findOnPlainBackground(c) : null;
    if (onPlain) scan = false;
    this.flatten = !scan && !onPlain;
    this.quad = onPlain || (!scan && detectPaper(c)) || fullQuad(c.width, c.height);
    this.sizeManual = false;
    this.applyPhotoSize();
    this.raw = undefined;
    this.manual = false;
    this.sundo = [];
    this.tool = 'none';
    this.autoShape();
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

  // ─────────────────────────────────────────────── krok 2: kadr i kształt

  private geomKey(): string {
    return `${this.srcId}|${this.quad.map((p) => `${p.x.toFixed(1)},${p.y.toFixed(1)}`).join(';')}|${this.size.w}x${this.size.h}`;
  }

  /** Kształt po wygładzeniu (undefined = prostokąt, null = błąd). */
  shape(): SheetShape | undefined {
    const key = `${JSON.stringify(this.raw ?? null)}|${this.smooth}|${this.size.w}x${this.size.h}`;
    if (this.smoothed.key !== key)
      this.smoothed = { key, shape: smoothShape(this.raw, this.smooth, this.size.w / this.size.h) };
    return this.smoothed.shape;
  }

  private pushUndo(): void {
    this.sundo.push(cloneShape(this.raw));
    if (this.sundo.length > 50) this.sundo.shift();
  }

  private setRaw(sh: SheetShape | undefined): void {
    this.pushUndo();
    this.raw = sh;
    this.manual = true;
    this.renderToolbar();
    this.render();
  }

  private undo(): void {
    if (!this.sundo.length) return;
    this.raw = this.sundo.pop();
    this.manual = true;
    this.renderToolbar();
    this.render();
  }

  /** Wykrywa kształt z tła zdjęcia; `force` zastępuje także kształt poprawiany ręcznie. */
  private autoShape(force = false): void {
    if (!this.src || (!force && this.manual)) return;
    const r = detectShape(this.src, this.quad, this.size.w / this.size.h);
    if (force && (this.raw || r.found)) this.pushUndo();
    this.raw = r.found ? r.shape : undefined;
    this.manual = false;
  }

  private setTool(t: Tool): void {
    this.tool = t;
    this.renderToolbar();
    this.render();
  }

  private renderToolbar(): void {
    const tb = this.toolbar;
    if (this.step === 1 || !this.src) {
      tb.innerHTML = '';
      return;
    }
    const tool = (t: Tool, ic: string, label: string, title: string): string =>
      `<button type="button" class="spe-tb-btn" data-tool="${t}" aria-pressed="${this.tool === t}" title="${title}">${icon(ic)}<span>${label}</span></button>`;
    tb.innerHTML = `
      <div class="spe-tb-group">
        <button type="button" class="spe-tb-btn" data-a="rotl" title="Obróć w lewo">${icon('rotL')}</button>
        <button type="button" class="spe-tb-btn" data-a="rotr" title="Obróć w prawo">${icon('rotR')}</button>
        <button type="button" class="spe-tb-btn" data-a="full" title="Całe zdjęcie">${icon('full')}</button>
        <button type="button" class="spe-tb-btn" data-a="detect" title="Wykryj kartkę automatycznie">${icon('detect')}<span>Wykryj</span></button>
      </div>
      <span class="spe-tb-sep"></span>
      <div class="spe-tb-group">
        <div class="spe-dims" title="Rozmiar kartki w centymetrach">
          <input type="number" min="3" max="60" step="0.1" data-dim="w" value="${this.size.w}" aria-label="Szerokość w cm">
          <span>×</span>
          <input type="number" min="3" max="60" step="0.1" data-dim="h" value="${this.size.h}" aria-label="Wysokość w cm">
          <span>cm</span>
        </div>
        <div class="spe-seg" role="radiogroup" aria-label="Orientacja notesu">
          <button type="button" role="radio" data-bind="top" aria-checked="${this.binding === 'top'}" title="Pionowa — kartki klejone u góry">${icon('bindTop')}</button>
          <button type="button" role="radio" data-bind="left" aria-checked="${this.binding === 'left'}" title="Pozioma — kartki klejone z lewej strony">${icon('bindLeft')}</button>
        </div>
      </div>
      <span class="spe-tb-sep"></span>
      <div class="spe-tb-group">
        ${tool('wand', 'wand', 'Różdżka', 'Różdżka — kliknij tło, by wyciąć obszar w jego kolorze')}
        ${tool('lasso', 'lasso', 'Lasso', 'Lasso — obrysuj obszar do wycięcia')}
        <div class="spe-seg mini" role="radiogroup" aria-label="Działanie narzędzia">
          <button type="button" role="radio" data-paint="cut" aria-checked="${this.paint === 'cut'}" title="Wycinaj">${icon('cut')}</button>
          <button type="button" role="radio" data-paint="restore" aria-checked="${this.paint === 'restore'}" title="Przywracaj (albo przytrzymaj Shift)">${icon('restore')}</button>
        </div>
        ${this.tool === 'wand' ? `<label class="spe-range" title="Tolerancja koloru różdżki"><span>Tolerancja</span><input type="range" min="6" max="120" step="1" data-tol value="${this.wandTol}"><output>${this.wandTol}</output></label>` : ''}
      </div>
      <span class="spe-tb-sep"></span>
      <div class="spe-tb-group">
        <label class="spe-range" title="Wygładzenie krawędzi">${icon('smooth')}<input type="range" min="0" max="10" step="1" data-smooth value="${this.smooth}"><output>${this.smooth}</output></label>
        <button type="button" class="spe-tb-btn" data-a="undo" title="Cofnij (Ctrl+Z)" ${this.sundo.length ? '' : 'disabled'}>${icon('undo')}</button>
        <button type="button" class="spe-tb-btn" data-a="rect" title="Przywróć prostokąt" ${this.raw ? '' : 'disabled'}>${icon('rect')}</button>
      </div>`;
    tb.querySelectorAll<HTMLButtonElement>('[data-a]').forEach((b) =>
      b.addEventListener('click', () => this.action(b.dataset.a as string)),
    );
    tb.querySelectorAll<HTMLButtonElement>('[data-tool]').forEach((b) =>
      b.addEventListener('click', () => {
        const t = b.dataset.tool as Tool;
        this.setTool(this.tool === t ? 'none' : t);
      }),
    );
    tb.querySelectorAll<HTMLButtonElement>('[data-paint]').forEach((b) =>
      b.addEventListener('click', () => {
        this.paint = b.dataset.paint as 'cut' | 'restore';
        if (this.tool === 'none') this.tool = 'wand';
        this.renderToolbar();
        this.render();
      }),
    );
    tb.querySelectorAll<HTMLButtonElement>('[data-bind]').forEach((b) =>
      b.addEventListener('click', () => {
        this.binding = b.dataset.bind as 'top' | 'left';
        tb.querySelectorAll('[data-bind]').forEach((x) =>
          x.setAttribute('aria-checked', String(x === b)),
        );
        this.render();
      }),
    );
    tb.querySelectorAll<HTMLInputElement>('[data-dim]').forEach((i) =>
      i.addEventListener('change', () => {
        const v = clamp(Number(i.value) || 10, 3, 60);
        this.size = { ...this.size, [i.dataset.dim as 'w' | 'h']: round1(v) };
        i.value = String(round1(v));
        this.sizeManual = true;
        this.render();
        this.renderChrome();
      }),
    );
    const tol = tb.querySelector<HTMLInputElement>('[data-tol]');
    tol?.addEventListener('input', () => {
      this.wandTol = Number(tol.value);
      (tol.nextElementSibling as HTMLElement).textContent = tol.value;
    });
    const sm = tb.querySelector<HTMLInputElement>('[data-smooth]');
    sm?.addEventListener('input', () => {
      this.smooth = Number(sm.value);
      (sm.nextElementSibling as HTMLElement).textContent = sm.value;
      this.render();
    });
  }

  private action(a: string): void {
    const src = this.src;
    if (!src) return;
    if (a === 'rotl' || a === 'rotr') {
      const dir = a === 'rotl' ? -1 : 1;
      this.quad = rotateQuad(this.quad, src.width, src.height, dir);
      this.src = rotate(src, dir);
      this.srcId++;
      this.size = { w: this.size.h, h: this.size.w };
      this.raw = rotateShape(this.raw, dir);
      this.sundo = this.sundo.map((s) => rotateShape(s, dir));
      this.refreshSrcUrl();
    } else if (a === 'full') {
      this.quad = fullQuad(src.width, src.height);
      this.applyPhotoSize();
      this.autoShape();
    } else if (a === 'detect') {
      const q = findOnPlainBackground(src) || detectPaper(src);
      if (!q) {
        this.toast('Nie widzę wyraźnej kartki — przeciągnij narożniki ręcznie.');
        return;
      }
      this.quad = q;
      this.sizeManual = false;
      this.applyPhotoSize();
      this.autoShape(true);
    } else if (a === 'undo') this.undo();
    else if (a === 'rect') this.setRaw(undefined);
    this.wandPx = null;
    this.renderToolbar();
    this.render();
    this.renderChrome();
  }

  private persp(): Persp {
    return new Persp(this.quad);
  }

  /** Kolory wyprostowanej kartki w rozdzielczości maski (dla różdżki). */
  private wandPixels(): { w: number; h: number; data: Uint8ClampedArray } {
    const key = this.geomKey();
    if (this.wandPx?.key === key) return this.wandPx;
    const { w, h } = maskSize(this.size.w / this.size.h);
    const c = warp(this.src as HTMLCanvasElement, this.quad, w, h);
    const data = (c.getContext('2d') as CanvasRenderingContext2D).getImageData(0, 0, w, h).data;
    this.wandPx = { key, w, h, data };
    return this.wandPx;
  }

  private wandAt(u: number, v: number, restore: boolean): void {
    const px = this.wandPixels();
    const reg = wandRegion(px.data, px.w, px.h, u, v, this.wandTol);
    let n = 0;
    for (let i = 0; i < reg.length; i++) n += reg[i];
    if (!restore && n > reg.length * 0.6) {
      this.toast('To prawie cała kartka — kliknij tło albo zmniejsz tolerancję.');
      return;
    }
    const m = rasterize(this.raw, px.w, px.h);
    for (let i = 0; i < m.d.length; i++) if (reg[i]) m.d[i] = restore ? 1 : 0;
    this.applyMask(m);
  }

  private applyMask(m: { w: number; h: number; d: Uint8Array }): void {
    const sh = traceShape(m);
    if (sh === null) {
      this.toast('Z kartki prawie nic by nie zostało — pominąłem tę zmianę.');
      this.render();
      return;
    }
    if (JSON.stringify(sh ?? null) === JSON.stringify(this.raw ?? null)) {
      this.render();
      return;
    }
    this.setRaw(sh);
    this.renderChrome();
  }

  private finishLasso(): void {
    const l = this.lasso;
    this.lasso = null;
    if (!l || l.pts.length < 3) {
      this.render();
      return;
    }
    const P = this.persp();
    const uv = l.pts.map((p) => P.toSheet(p.x, p.y));
    const { w, h } = maskSize(this.size.w / this.size.h);
    const m = rasterize(this.raw, w, h);
    const changed = paintPoly(m, uv, l.restore ? 1 : 0);
    if (changed < 4) {
      this.render();
      return;
    }
    this.applyMask(m);
  }

  /** Po zmianie kadru: rozmiar z proporcji i ponowne wykrycie kształtu (gdy był wykryty automatycznie). */
  private quadChanged(): void {
    this.applyPhotoSize();
    this.wandPx = null;
    if (!this.manual) {
      clearTimeout(this.redetect);
      this.redetect = window.setTimeout(() => {
        this.autoShape();
        this.render();
      }, 60);
    }
    this.renderToolbar();
    this.renderChrome();
  }

  // ─────────────────────────────────────────────── krok 3: wyprostowana kartka

  private sheetWant(): string {
    return `${this.geomKey()}|${this.flatten}`;
  }

  private ensureSheet(): void {
    if (!this.src) return;
    const key = this.sheetWant();
    if (this.sheet && this.sheetKey === key) return;
    const a = this.size.w / this.size.h;
    const long = 1600;
    const ow = a <= 1 ? Math.round(long * a) : long;
    const oh = a <= 1 ? long : Math.round(long / a);
    const out = warp(this.src, this.quad, ow, oh);
    if (this.flatten) flattenPaper(out, 0.92);
    this.sheet = out;
    this.sheetKey = key;
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
    svg.classList.toggle('spe-c-wand', this.step === 2 && this.tool === 'wand');
    svg.classList.toggle('spe-c-lasso', this.step === 2 && this.tool === 'lasso');
    svg.classList.toggle('spe-c-draw', this.step === 3 && this.fields.mode === 'free');
    if (this.step !== 2 || !this.qdrag) this.loupe.style.display = 'none';
    if (this.step === 1 || !this.src) {
      this.baseImg.style.display = 'none';
      this.ov.innerHTML = '';
      return;
    }
    this.baseImg.style.display = '';
    if (this.step === 3) {
      const sheet = this.sheet;
      if (!sheet) return;
      svg.setAttribute('viewBox', `0 0 ${sheet.width} ${sheet.height}`);
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
    const rings = sh ? [sh.outline, ...(sh.holes ?? [])] : [RECT];
    const path = rings
      .map(
        (r) =>
          r
            .map(([u, v], i) => {
              const p = P.toPhoto(u, v);
              return `${i ? 'L' : 'M'}${p.x.toFixed(1)} ${p.y.toFixed(1)}`;
            })
            .join('') + 'Z',
      )
      .join('');
    this.setImage(this.baseImg, this.srcUrl, w, h);
    let s = `<path d="M0 0H${w}V${h}H0Z${path}" class="spe-dim" fill-rule="evenodd"/>`;
    // ramka narożników (gdy kształt odbiega od prostokąta) i obrys kartki
    if (sh) s += `<polygon points="${q.map((p) => `${p.x},${p.y}`).join(' ')}" class="spe-frame"/>`;
    s += `<path d="${path}" class="spe-outline" fill-rule="evenodd"/>`;
    // grzbiet: klejona krawędź w kolorze taśmy
    const [a, b] = this.binding === 'left' ? [q[0], q[3]] : [q[0], q[1]];
    s += `<line x1="${a.x}" y1="${a.y}" x2="${b.x}" y2="${b.y}" class="spe-spine halo"/><line x1="${a.x}" y1="${a.y}" x2="${b.x}" y2="${b.y}" class="spe-spine" stroke="${esc(this.fields.draft.tape)}"/>`;
    s += `<rect x="0" y="0" width="${w}" height="${h}" fill="transparent" data-bg="1"/>`;
    // lasso w trakcie rysowania
    const l = this.lasso;
    if (l && l.pts.length > 1) {
      s += `<path d="${l.pts.map((p, i) => `${i ? 'L' : 'M'}${p.x.toFixed(1)} ${p.y.toFixed(1)}`).join('')}Z" class="spe-lasso${l.restore ? ' add' : ''}"/>`;
    }
    q.forEach((p, i) => {
      s += `<g data-q="${i}" class="spe-qh${this.qdrag?.i === i ? ' on' : ''}"><circle cx="${p.x}" cy="${p.y}" r="${22 * k}" fill="transparent"/><circle cx="${p.x}" cy="${p.y}" r="${8 * k}" class="dot"/></g>`;
    });
    this.ov.innerHTML = s;
    this.drawLoupe(k);
  }

  /** Lupa przy przeciąganiu narożnika: trwała grupa, przesuwana i przybliżana atrybutami. */
  private drawLoupe(k: number): void {
    const L = this.loupe;
    const src = this.src;
    if (!this.qdrag || !src || !this.srcUrl) {
      L.style.display = 'none';
      return;
    }
    const { width: w, height: h } = src;
    const q = this.quad;
    const p = q[this.qdrag.i];
    const R = 58 * k;
    const Z = 3;
    const off = 92 * k;
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
    set('.lp', { points: q.map((c) => `${c.x},${c.y}`).join(' ') });
    set('.cross', {
      d: `M${lx - 12 * k} ${ly}H${lx + 12 * k}M${lx} ${ly - 12 * k}V${ly + 12 * k}`,
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

  private onDown(e: PointerEvent): void {
    if (e.button > 0) return;
    // fokus zostaje w edytorze — skróty (Delete, strzałki, Ctrl+Z) działają po kliknięciu podglądu
    this.svg.focus({ preventScroll: true });
    if (this.step === 3) {
      if (this.sheet) this.fields.down(e);
      return;
    }
    if (this.step !== 2 || !this.src) return;
    const t = e.target as Element;
    const qh = t.closest('[data-q]') as HTMLElement | null;
    if (qh) {
      this.qdrag = { i: Number(qh.dataset.q) };
      const c = this.quad[this.qdrag.i];
      this.loupeSide = {
        x: c.x > this.src.width / 2 ? -1 : 1,
        y: c.y > this.src.height / 2 ? -1 : 1,
      };
      this.capture(e);
      this.render();
      return;
    }
    const p = this.toSvg(e);
    const restore = (this.paint === 'restore') !== e.shiftKey;
    if (this.tool === 'wand') {
      const uv = this.persp().toSheet(p.x, p.y);
      if (uv.u < 0 || uv.u > 1 || uv.v < 0 || uv.v > 1) return;
      this.wandAt(clamp(uv.u, 0, 1), clamp(uv.v, 0, 1), restore);
      return;
    }
    if (this.tool === 'lasso') {
      this.lasso = { pts: [p], restore };
      this.capture(e);
      this.render();
    }
  }

  private onMove(e: PointerEvent): void {
    if (this.step === 3) {
      this.fields.move(e);
      return;
    }
    if (this.qdrag && this.src) {
      const p = this.toSvg(e);
      this.quad[this.qdrag.i] = {
        x: clamp(p.x, 0, this.src.width),
        y: clamp(p.y, 0, this.src.height),
      };
      this.render();
      return;
    }
    if (this.lasso) {
      const p = this.toSvg(e);
      const last = this.lasso.pts[this.lasso.pts.length - 1];
      if (Math.hypot(p.x - last.x, p.y - last.y) > 3 * this.scale(this.src?.width ?? 1)) {
        this.lasso.pts.push(p);
        this.render();
      }
    }
  }

  private onUp(e: PointerEvent): void {
    if (this.step === 3) {
      this.fields.up(e);
      return;
    }
    if (this.qdrag) {
      this.qdrag = null;
      this.quadChanged();
      this.render();
      return;
    }
    if (this.lasso) this.finishLasso();
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
      image:
        this.loadedImage?.key === this.sheetWant()
          ? this.loadedImage.url
          : toJpeg(this.sheet, 0.86),
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
    a.lines.length === b.lines.length &&
    a.lines.every((l, i) => l.label === b.lines[i]?.label && l.kind === b.lines[i]?.kind)
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
