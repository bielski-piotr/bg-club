// Panel trybu debugowania (pakiet edytora): suwaki wszystkich ustawień z opisów w settings.ts, statystyki, akcje.

import type { FieldDef, Settings } from '../core/settings';
import { SECTIONS, getPath } from '../core/settings';
import { el, esc } from '../core/util';

export interface DebugHandlers {
  change(key: string, value: unknown): void;
  reset(key: string): void;
  action(name: string): void;
  close(): void;
}

const fmt = (f: FieldDef, v: unknown): string => {
  if (f.type !== 'range') return String(v);
  const n = Number(v);
  const dec = (f.step ?? 1) >= 1 ? 0 : Math.min(3, String(f.step).split('.')[1]?.length ?? 2);
  return n.toFixed(dec) + (f.unit ?? '');
};

export class DebugPanel {
  readonly root: HTMLElement;
  private stats: HTMLElement;
  private status: HTMLElement;
  private idBase = `dbg${Math.random().toString(36).slice(2, 7)}`;

  constructor(
    parent: HTMLElement,
    private cfg: Settings,
    private base: () => Settings,
    private h: DebugHandlers,
  ) {
    this.root = el('aside', 'dbg');
    this.root.setAttribute('aria-label', 'Tryb debugowania');
    this.root.hidden = true;
    this.root.innerHTML = `
      <header class="dbg-head">
        <b>Tryb debugowania</b>
        <button type="button" class="dbg-x" aria-label="Zamknij tryb debugowania">×</button>
      </header>
      <div class="dbg-body">
        <section class="dbg-box">
          <h3>Notes</h3>
          <button type="button" class="dbg-btn-main" data-a="save">Zapisz notes do pliku</button>
          <label class="dbg-check"><input type="checkbox" data-opt="sheet"> razem z wpisami z bieżącej kartki</label>
          <div class="dbg-pair">
            <button type="button" data-a="copy">Kopiuj JSON</button>
            <button type="button" data-a="load">Wczytaj z pliku…</button>
          </div>
          <p class="dbg-status" aria-live="polite"></p>
          <p class="dbg-note">Zapisany plik podajesz kontrolce w atrybucie <code>config</code> — odtworzy notes razem z tymi ustawieniami.</p>
        </section>
        <section class="dbg-box dbg-statbox"><h3>Stan</h3><dl class="dbg-stats"></dl></section>
        ${SECTIONS.map((s, i) => `<details class="dbg-sec" ${i < 2 ? 'open' : ''}><summary>${s.title}</summary><div class="dbg-fields">${s.fields.map((f) => this.fieldHtml(f)).join('')}</div></details>`).join('')}
        <section class="dbg-box">
          <h3>Akcje</h3>
          <div class="dbg-acts">
            <button type="button" data-a="tear">Oderwij kartkę</button>
            <button type="button" data-a="blank">Nowa pusta kartka</button>
            <button type="button" data-a="grid">Edytuj siatkę pól…</button>
            <button type="button" data-a="history">Wyczyść historię</button>
            <button type="button" data-a="defaults" class="warn">Przywróć domyślne ustawienia</button>
          </div>
        </section>
      </div>`;
    parent.appendChild(this.root);
    this.stats = this.root.querySelector('.dbg-stats') as HTMLElement;
    this.status = this.root.querySelector('.dbg-status') as HTMLElement;
    this.bind();
    this.refresh();
  }

  get sheetOpt(): boolean {
    return (this.root.querySelector('[data-opt="sheet"]') as HTMLInputElement).checked;
  }

  get open(): boolean {
    return !this.root.hidden;
  }

  show(on: boolean): void {
    this.root.hidden = !on;
    if (on) this.refresh();
  }

  private fieldHtml(f: FieldDef): string {
    const id = `${this.idBase}-${f.key.replace('.', '-')}`;
    const hint = f.hint ? `<small>${esc(f.hint)}</small>` : '';
    const reset = `<button type="button" class="dbg-reset" data-reset="${f.key}" aria-label="Przywróć: ${esc(f.label)}" title="Przywróć wartość bazową">↺</button>`;
    if (f.type === 'bool') {
      return `<div class="dbg-row bool" data-key="${f.key}"><label for="${id}"><input type="checkbox" id="${id}"> <span>${esc(f.label)}</span></label>${reset}${hint}</div>`;
    }
    if (f.type === 'color') {
      return `<div class="dbg-row color" data-key="${f.key}"><label for="${id}">${esc(f.label)}</label><input type="color" id="${id}">${reset}${hint}</div>`;
    }
    return `<div class="dbg-row" data-key="${f.key}">
      <label for="${id}">${esc(f.label)}</label><output for="${id}"></output>${reset}
      <input type="range" id="${id}" min="${f.min}" max="${f.max}" step="${f.step}">${hint}</div>`;
  }

  private bind(): void {
    const r = this.root;
    (r.querySelector('.dbg-x') as HTMLElement).addEventListener('click', () => this.h.close());
    r.addEventListener('keydown', (e) => {
      if (e.key === 'Escape') {
        e.stopPropagation();
        this.h.close();
      }
    });
    r.querySelectorAll<HTMLElement>('.dbg-row').forEach((row) => {
      const key = row.dataset.key as string;
      const inp = row.querySelector('input') as HTMLInputElement;
      inp.addEventListener(inp.type === 'range' ? 'input' : 'change', () => {
        const v =
          inp.type === 'checkbox'
            ? inp.checked
            : inp.type === 'color'
              ? inp.value
              : Number(inp.value);
        this.h.change(key, v);
        this.syncRow(row);
      });
    });
    r.querySelectorAll<HTMLButtonElement>('[data-reset]').forEach((b) =>
      b.addEventListener('click', () => {
        this.h.reset(b.dataset.reset as string);
        this.refresh();
      }),
    );
    r.querySelectorAll<HTMLButtonElement>('[data-a]').forEach((b) =>
      b.addEventListener('click', () => this.h.action(b.dataset.a as string)),
    );
  }

  private syncRow(row: HTMLElement): void {
    const key = row.dataset.key as string;
    const f = SECTIONS.flatMap((s) => s.fields).find((x) => x.key === key) as FieldDef;
    const v = getPath(this.cfg, key);
    const inp = row.querySelector('input') as HTMLInputElement;
    if (inp.type === 'checkbox') inp.checked = !!v;
    else if (document.activeElement !== inp || inp.type === 'color') inp.value = String(v);
    const out = row.querySelector('output');
    if (out) out.textContent = fmt(f, v);
    row.classList.toggle('changed', v !== getPath(this.base(), key));
  }

  /** Synchronizuje wszystkie pola z bieżącymi ustawieniami (po wczytaniu pliku albo przywróceniu). */
  refresh(): void {
    this.root.querySelectorAll<HTMLElement>('.dbg-row').forEach((row) => this.syncRow(row));
    (this.root.querySelector('.dbg-statbox') as HTMLElement).hidden = !this.cfg.debug.stats;
  }

  setStats(rows: [string, string][]): void {
    if (!this.open || !this.cfg.debug.stats) return;
    this.stats.innerHTML = rows.map(([k, v]) => `<dt>${esc(k)}</dt><dd>${esc(v)}</dd>`).join('');
  }

  say(msg: string, kind: '' | 'ok' | 'err' = ''): void {
    this.status.textContent = msg;
    this.status.dataset.kind = kind;
  }
}
