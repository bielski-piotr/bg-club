import { afterEach, describe, expect, it, vi } from 'vitest';
import { isConfig, packSheet, unpackSheet, type PadConfig } from './core/settings';
import { TemplateStore } from './core/storage';
import {
  BUILTINS,
  SEAT_SANITY_LIMIT,
  playerCount,
  validateTemplate,
  type FreeField,
  type PadTemplate,
} from './core/templates';
import { ScorePad } from './core/viewer';

/** Tabela z kolumną opisu i `players` kolumnami graczy (gracze w kolumnach). */
function gridTemplate(players: number): PadTemplate {
  const cols = players + 1;
  return {
    v: 2,
    id: `grid-${players}`,
    name: `Tabela ${players}`,
    size: { w: 20, h: 14 },
    tape: '#2c3a46',
    grid: {
      x: Array.from({ length: cols + 1 }, (_, i) => i / cols),
      y: [0, 0.25, 0.5, 0.75, 1],
      players: 'cols',
      labels: 1,
    },
    lines: [
      { id: 'names', label: 'Gracze', kind: 'names' },
      { id: 'a', label: 'Kategoria 1', kind: 'input', min: 0, max: 50, step: 1 },
      { id: 'b', label: 'Kategoria 2', kind: 'input', free: true },
      { id: 'sum', label: 'Suma', kind: 'total' },
    ],
  };
}

function freeTemplate(players: number): PadTemplate {
  const fields: FreeField[] = Array.from({ length: players }, (_, p) => ({
    id: `f${p}`,
    line: 'a',
    p,
    x: 0.05,
    y: (p + 0.1) / players,
    w: 0.2,
    h: 0.5 / players,
  }));
  return {
    v: 2,
    id: `free-${players}`,
    name: `Pola ${players}`,
    size: { w: 10, h: 14 },
    tape: '#2c3a46',
    lines: [{ id: 'a', label: 'Punkty', kind: 'input', free: true }],
    fields,
  };
}

const roundTrip = (t: unknown) => validateTemplate(JSON.parse(JSON.stringify(t)));

describe('brak limitu graczy (EDT-8)', () => {
  it.each([2, 8, 9, 12, 20])('tabela z %i miejscami przechodzi walidację', (n) => {
    const t = roundTrip(gridTemplate(n));
    expect(t).not.toBeNull();
    expect(playerCount(t as PadTemplate)).toBe(n);
  });

  it('pola dowolne i jawne `players` powyżej ośmiu', () => {
    const fromFields = roundTrip(freeTemplate(10));
    expect(fromFields && playerCount(fromFields)).toBe(10);

    const explicit = roundTrip({ ...freeTemplate(3), players: 16 });
    expect(explicit && playerCount(explicit)).toBe(16);
  });

  it('uszkodzony plik z absurdalną liczbą miejsc nie zamraża notesu', () => {
    expect(roundTrip({ ...freeTemplate(3), players: 100_000_000 })).toMatchObject({
      players: SEAT_SANITY_LIMIT,
    });
    const huge = freeTemplate(2);
    huge.fields = [...(huge.fields ?? []), { ...(huge.fields?.[0] as FreeField), id: 'x', p: 1e8 }];
    expect(roundTrip(huge) && playerCount(roundTrip(huge) as PadTemplate)).toBe(2);
    expect(roundTrip(gridTemplate(SEAT_SANITY_LIMIT + 1))).toBeNull();
  });

  it('nadal odrzuca notes bez miejsc dla graczy', () => {
    const t = gridTemplate(2);
    expect(validateTemplate({ ...t, grid: { ...t.grid, x: [0, 1], labels: 1 } })).toBeNull();
  });
});

describe('pliki notesu v2', () => {
  it('wczytuje plik v2 z kartką dla dziesięciu graczy i zapisuje go bez zmian', () => {
    const template = gridTemplate(10);
    const names = Array.from({ length: 10 }, (_, i) => `Gracz ${i + 1}`);
    const file: PadConfig = {
      format: 'score-pad',
      version: 2,
      template,
      active: template.id,
      sheet: {
        game: 3,
        started: null,
        names,
        cells: { a: [1, 2, 3, 4, 5, 6, 7, 8, 9, 10], b: [null, 'x', 0, -2, 5, 5, 5, 5, 5, 42] },
      },
    };
    const parsed: unknown = JSON.parse(JSON.stringify(file));
    expect(isConfig(parsed)).toBe(true);

    const t = validateTemplate((parsed as PadConfig).template);
    expect(t).not.toBeNull();
    const data = unpackSheet((parsed as PadConfig).sheet, t as PadTemplate);
    const packed = packSheet(data);
    expect(packed.names).toEqual(names);
    expect(packed.cells.a).toEqual(file.sheet?.cells.a);
    expect(packed.cells.b).toEqual(file.sheet?.cells.b);
    expect(packed.game).toBe(3);
  });

  it('wbudowane notesy POC przechodzą przez JSON bez zmian', () => {
    for (const b of BUILTINS) {
      const t = roundTrip(b);
      expect(t?.id).toBe(b.id);
      expect(t?.lines.map((l) => l.id)).toEqual(b.lines.map((l) => l.id));
      expect(t && playerCount(t)).toBe(playerCount(b));
    }
  });
});

describe('tryb klubowy (PAD-1)', () => {
  const realIndexedDb = globalThis.indexedDB;
  afterEach(() => {
    Object.defineProperty(globalThis, 'indexedDB', { value: realIndexedDb, configurable: true });
    localStorage.clear();
    document.body.innerHTML = '';
  });

  function stubIndexedDb() {
    const open = vi.fn(() => {
      throw new Error('IndexedDB niedostępne w teście');
    });
    Object.defineProperty(globalThis, 'indexedDB', { value: { open }, configurable: true });
    return open;
  }

  it('biblioteka szablonów nie otwiera IndexedDB i trzyma notesy w pamięci', async () => {
    const open = stubIndexedDb();
    const store = new TemplateStore('klub', false);
    await store.put(gridTemplate(9));
    expect((await store.list()).map((t) => t.id)).toEqual(['grid-9']);
    await store.remove('grid-9');
    expect(await store.list()).toEqual([]);
    expect(open).not.toHaveBeenCalled();

    // Poza trybem klubowym POC nadal korzysta z IndexedDB.
    void new TemplateStore('poc');
    expect(open).toHaveBeenCalledOnce();
  });

  it('notes w trybie klubowym nie czyta stanu ani historii POC z localStorage', () => {
    stubIndexedDb();
    const history = [
      { id: 'h', tpl: 'general', tplName: 'Generał', game: 1, at: '', players: [], winners: [] },
    ];
    localStorage.setItem(
      'score-pad:state:v2',
      JSON.stringify({ v: 2, tpl: 'general', sheets: {}, history }),
    );
    const getItem = vi.spyOn(Storage.prototype, 'getItem');

    const club = new ScorePad(document.createElement('div'), { club: true });
    expect(getItem).not.toHaveBeenCalled();
    expect(club.getHistory()).toEqual([]);
    club.destroy();

    const poc = new ScorePad(document.createElement('div'), {});
    expect(getItem).toHaveBeenCalledWith('score-pad:state:v2');
    expect(poc.getHistory()).toHaveLength(1);
    poc.destroy();
  });

  it('zmiana kartki wysyła `scorepad:change` z wpisami zamiast zapisu w localStorage (PAD-4)', () => {
    stubIndexedDb();
    const host = document.createElement('div');
    const pad = new ScorePad(host, { club: true });
    const t = gridTemplate(2);
    const sheet = { game: 3, names: ['Ada', null], cells: { a: [7, null] } };
    const data = unpackSheet(sheet, t);
    const events: unknown[] = [];
    host.addEventListener('scorepad:change', (event) => {
      events.push((event as CustomEvent).detail);
    });
    const setItem = vi.spyOn(Storage.prototype, 'setItem');
    // Notes bez WebGL w jsdom: wierzchnia kartka podstawiona tak, jak po wczytaniu szablonu.
    const inner = pad as unknown as { t: PadTemplate; active: { data: unknown }; persist(): void };
    inner.persist();
    expect(events).toEqual([]);
    inner.t = t;
    inner.active = { data };
    inner.persist();
    expect(events).toEqual([{ sheet: packSheet(data) }]);
    expect(events[0]).toMatchObject({ sheet: { game: 3, names: ['Ada', null] } });
    expect(setItem).not.toHaveBeenCalled();
    pad.destroy();
  });

  it('wyniki oderwanej kartki mają miejsca, remisy i wartości (PAD-7)', () => {
    stubIndexedDb();
    const pad = new ScorePad(document.createElement('div'), { club: true, summary: false });
    const t = gridTemplate(3);
    const data = unpackSheet(
      { game: 2, names: ['Ada', 'Bartek', 'Celina'], cells: { a: [7, 9, 4], b: [3, 1, 1] } },
      t,
    );
    const results = (
      pad as unknown as { sheetResults(d: unknown, t: PadTemplate): unknown[] }
    ).sheetResults(data, t);
    expect(results).toEqual([
      {
        seat: 0,
        values: { a: 7, b: 3 },
        totals: { sum: 10, __total: 10 },
        rankingValue: 10,
        place: 1,
        tied: true,
        tiedWith: [1],
      },
      {
        seat: 1,
        values: { a: 9, b: 1 },
        totals: { sum: 10, __total: 10 },
        rankingValue: 10,
        place: 1,
        tied: true,
        tiedWith: [0],
      },
      {
        seat: 2,
        values: { a: 4, b: 1 },
        totals: { sum: 5, __total: 5 },
        rankingValue: 5,
        place: 3,
        tied: false,
        tiedWith: [],
      },
    ]);
    pad.destroy();
  });

  it('bez odrywania (`tear: false`) pomoc nie wspomina o odrywaniu, a `tear()` nic nie robi', () => {
    stubIndexedDb();
    const tips = (options: { tear?: boolean }) => {
      const host = document.createElement('div');
      const pad = new ScorePad(host, { club: true, ...options });
      const count = host.shadowRoot?.querySelectorAll('.help li').length ?? 0;
      const torn = vi.fn();
      host.addEventListener('scorepad:tear', torn);
      (pad as unknown as { t: PadTemplate }).t = gridTemplate(2);
      if (options.tear === false) pad.tear();
      pad.destroy();
      return { count, torn };
    };
    expect(tips({}).count).toBe(4);
    const blocked = tips({ tear: false });
    expect(blocked.count).toBe(2);
    expect(blocked.torn).not.toHaveBeenCalled();
  });

  it('element <score-pad> przyjmuje opcje obiektem i motyw atrybutem', async () => {
    stubIndexedDb();
    await import('./core/index');
    const el = document.createElement('score-pad');
    el.options = { club: true, theme: 'light' };
    document.body.append(el);
    const frame = () => el.shadowRoot?.querySelector<HTMLElement>('.sp');
    expect(frame()?.dataset.theme).toBe('light');
    el.setAttribute('theme', 'dark');
    expect(frame()?.dataset.theme).toBe('dark');
    el.remove();
    expect(el.pad).toBeNull();
  });
});

describe('sprzątanie po usunięciu elementu', () => {
  afterEach(() => {
    vi.unstubAllGlobals();
    document.body.innerHTML = '';
  });

  it('edytor odpina nasłuch wklejania i obserwatora rozmiaru', async () => {
    const disconnect = vi.fn();
    vi.stubGlobal(
      'ResizeObserver',
      class {
        observe() {}
        disconnect = disconnect;
      },
    );
    const add = vi.spyOn(document, 'addEventListener');
    const remove = vi.spyOn(document, 'removeEventListener');
    await import('./editor/index');
    const editor = document.createElement('score-pad-editor');
    document.body.append(editor);
    const paste = add.mock.calls.find(([type]) => type === 'paste')?.[1];
    expect(paste).toBeTypeOf('function');

    editor.remove();
    expect(remove).toHaveBeenCalledWith('paste', paste);
    expect(disconnect).toHaveBeenCalled();
  });
});
