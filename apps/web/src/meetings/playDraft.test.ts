import type { ScorePadSheet } from '@bg-club/score-pad';
import type { SupabaseClient } from '@supabase/supabase-js';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import {
  discardPlay,
  DraftError,
  draftFailure,
  DraftSaver,
  hasEntries,
  localDraftKey,
  readLocalDraft,
  removeLocalDrafts,
  resolveDraftStart,
  sameSheet,
  saveDraft,
  sheetWithPlayers,
  writeLocalDraft,
  type DraftStatus,
  type LocalDraft,
  type SavedDraft,
  type ServerDraft,
} from './playDraft';

const ME = '00000000-0000-4000-a000-000000000001';
const PLAY = '00000000-0000-4000-f000-000000000001';

function sheet(a: number | null, b: number | null = null): ScorePadSheet {
  return { game: 1, names: ['Ada', 'Bea'], cells: { a: [a, b] } };
}

function local(extra: Partial<LocalDraft> = {}): LocalDraft {
  return {
    v: 1,
    profileId: ME,
    playId: PLAY,
    baseVersion: 2,
    sheet: sheet(5),
    dirty: true,
    updatedAt: '2026-11-12T19:00:00Z',
    ...extra,
  };
}

function server(version: number, entries: ScorePadSheet | null): ServerDraft {
  return { version, sheet: entries, savedAt: null, savedBy: null };
}

describe('kopia szkicu w localStorage', () => {
  afterEach(() => localStorage.clear());

  it('zapisuje i czyta kopię konta i partii', () => {
    expect(writeLocalDraft(localStorage, local())).toBe(true);
    expect(localStorage.getItem(localDraftKey(ME, PLAY))).not.toBeNull();
    expect(readLocalDraft(localStorage, ME, PLAY)).toEqual(local());
  });

  it('nie oddaje kopii innego konta ani uszkodzonej', () => {
    writeLocalDraft(localStorage, local());
    const other = '00000000-0000-4000-a000-000000000002';
    expect(readLocalDraft(localStorage, other, PLAY)).toBeNull();
    localStorage.setItem(localDraftKey(other, PLAY), JSON.stringify(local()));
    expect(readLocalDraft(localStorage, other, PLAY)).toBeNull();
    localStorage.setItem(localDraftKey(ME, PLAY), '{zły json');
    expect(readLocalDraft(localStorage, ME, PLAY)).toBeNull();
    localStorage.setItem(localDraftKey(ME, PLAY), JSON.stringify({ ...local(), sheet: [1] }));
    expect(readLocalDraft(localStorage, ME, PLAY)).toBeNull();
  });

  it('bez localStorage (tryb prywatny, blokada) nie rzuca błędem', () => {
    expect(readLocalDraft(null, ME, PLAY)).toBeNull();
    expect(writeLocalDraft(null, local())).toBe(false);
    const full = {
      ...localStorage,
      setItem: () => {
        throw new Error('QuotaExceededError');
      },
    } as unknown as Storage;
    expect(writeLocalDraft(full, local())).toBe(false);
  });

  it('porzucenie usuwa kopie partii ze wszystkich kont, a innych partii nie', () => {
    const other = '00000000-0000-4000-a000-000000000002';
    const otherPlay = '00000000-0000-4000-f000-000000000002';
    writeLocalDraft(localStorage, local());
    writeLocalDraft(localStorage, local({ profileId: other }));
    writeLocalDraft(localStorage, local({ playId: otherPlay }));
    localStorage.setItem('bg-club:theme', 'dark');
    removeLocalDrafts(localStorage, PLAY);
    expect(readLocalDraft(localStorage, ME, PLAY)).toBeNull();
    expect(readLocalDraft(localStorage, other, PLAY)).toBeNull();
    expect(readLocalDraft(localStorage, ME, otherPlay)).not.toBeNull();
    expect(localStorage.getItem('bg-club:theme')).toBe('dark');
  });
});

describe('wpisy kartki', () => {
  it('porównuje wpisy niezależnie od kolejności pól', () => {
    expect(
      sameSheet({ game: 1, names: [], cells: { a: [1], b: [2] } }, {
        cells: { b: [2], a: [1] },
        names: [],
        game: 1,
      } as ScorePadSheet),
    ).toBe(true);
    expect(sameSheet(sheet(1), sheet(2))).toBe(false);
    expect(sameSheet(null, null)).toBe(true);
    expect(sameSheet(sheet(1), null)).toBe(false);
  });

  it('pomija puste kolumny i czas rozpoczęcia dopisane przez notes przy wczytaniu', () => {
    const padded = {
      game: 1,
      started: '2026-11-12T19:00:00Z',
      names: ['Ada', 'Bea', null, null],
      cells: { a: [5, null, null, null], b: [null, null, null, null] },
    };
    expect(sameSheet(padded, sheet(5))).toBe(true);
    expect(sameSheet(padded, { ...sheet(5), game: 2 })).toBe(false);
    expect(sameSheet({ ...padded, names: ['Ada', 'Celina'] }, sheet(5))).toBe(false);
    expect(sameSheet({ ...padded, cells: { a: ['x'] } }, sheet(null))).toBe(false);
  });

  it('rozpoznaje pustą kartkę', () => {
    expect(hasEntries(null)).toBe(false);
    expect(hasEntries(sheet(null))).toBe(false);
    expect(hasEntries(sheet(0))).toBe(true);
    expect(hasEntries({ game: 1, names: [], cells: {}, free: { f: 'x' } })).toBe(true);
  });

  it('wstawia graczy z miejsc partii, zostawiając wpisy', () => {
    expect(sheetWithPlayers(null, ['Ada Adamska', null, 'Bea Bobrowska'])).toEqual({
      game: 1,
      names: ['Ada Adamska', null, 'Bea Bobrowska'],
      cells: {},
    });
    expect(sheetWithPlayers(sheet(4), ['Celina', 'Dawid'])).toEqual({
      game: 1,
      names: ['Celina', 'Dawid'],
      cells: { a: [4, null] },
    });
  });
});

describe('wznowienie partii', () => {
  it('bez kopii lokalnej albo z kopią już w bazie: wpisy z bazy', () => {
    expect(resolveDraftStart(null, server(3, sheet(1)))).toEqual({
      kind: 'server',
      sheet: sheet(1),
      version: 3,
    });
    expect(resolveDraftStart(local({ dirty: false }), server(3, sheet(1)))).toMatchObject({
      kind: 'server',
      version: 3,
    });
    expect(resolveDraftStart(local({ baseVersion: 1 }), server(3, sheet(5)))).toMatchObject({
      kind: 'server',
    });
  });

  it('niezapisane wpisy po utracie sieci albo awarii: kopia lokalna na tej samej wersji', () => {
    expect(resolveDraftStart(local(), server(2, sheet(1)))).toEqual({
      kind: 'local',
      sheet: sheet(5),
      version: 2,
    });
  });

  it('kopia lokalna i nowszy szkic z innego urządzenia: konflikt zamiast nadpisania', () => {
    const start = resolveDraftStart(local(), server(4, sheet(7)));
    expect(start.kind).toBe('conflict');
  });

  it('pusta kopia lokalna nie wywołuje konfliktu z nowszym szkicem', () => {
    expect(resolveDraftStart(local({ sheet: sheet(null) }), server(4, sheet(7)))).toMatchObject({
      kind: 'server',
      version: 4,
    });
  });
});

describe('błędy zapisu szkicu', () => {
  it('HINT → powód', () => {
    expect(draftFailure({ code: 'PT409', hint: 'plays_draft_conflict' })).toBe('conflict');
    expect(draftFailure({ code: 'P0002', hint: 'plays_not_found' })).toBe('gone');
    expect(draftFailure({ code: '23514', hint: 'plays_not_draft' })).toBe('gone');
    expect(draftFailure({ code: '23514', hint: 'plays_meeting_in_progress' })).toBe('closed');
    expect(draftFailure({ code: '23514', hint: 'plays_draft_too_large' })).toBe('invalid');
    expect(draftFailure({ code: '42501' })).toBe('forbidden');
    expect(draftFailure({ code: '' })).toBe('network');
    expect(draftFailure({})).toBe('network');
    expect(draftFailure({ code: 'PGRST000' })).toBe('server');
  });

  function rpcClient(result: { data?: unknown; error?: unknown }) {
    const single = vi.fn(() => Promise.resolve({ data: null, error: null, ...result }));
    const rpc = vi.fn(() => ({ single, then: (ok: (v: unknown) => unknown) => ok(result) }));
    return { client: { rpc } as unknown as SupabaseClient, rpc };
  }

  it('saveDraft wysyła wpisy z wersją i zwraca nową wersję', async () => {
    const { client, rpc } = rpcClient({ data: { draft_version: 4, draft_saved_at: 'T' } });
    await expect(saveDraft(client, PLAY, sheet(1), 3)).resolves.toEqual({
      version: 4,
      savedAt: 'T',
    });
    expect(rpc).toHaveBeenCalledWith('save_play_draft', {
      play_id: PLAY,
      sheet: sheet(1),
      base_version: 3,
    });
  });

  it('saveDraft: konflikt jako DraftError', async () => {
    const { client } = rpcClient({ error: { code: 'PT409', hint: 'plays_draft_conflict' } });
    await expect(saveDraft(client, PLAY, sheet(1), 3)).rejects.toEqual(new DraftError('conflict'));
  });

  it('discardPlay: ponowienie po porzuceniu (partii już nie ma) to sukces', async () => {
    const ok = rpcClient({ error: null });
    await expect(discardPlay(ok.client, PLAY)).resolves.toBeUndefined();
    expect(ok.rpc).toHaveBeenCalledWith('discard_play', { play_id: PLAY });
    const gone = rpcClient({ error: { code: 'P0002', hint: 'plays_not_found' } });
    await expect(discardPlay(gone.client, PLAY)).resolves.toBeUndefined();
    const saved = rpcClient({ error: { code: '23514', hint: 'plays_not_draft' } });
    await expect(discardPlay(saved.client, PLAY)).rejects.toEqual(new DraftError('gone'));
    const denied = rpcClient({ error: { code: '42501' } });
    await expect(discardPlay(denied.client, PLAY)).rejects.toEqual(new DraftError('forbidden'));
  });
});

describe('DraftSaver', () => {
  beforeEach(() => vi.useFakeTimers());
  afterEach(() => {
    vi.useRealTimers();
    localStorage.clear();
  });

  function setup(
    save: (sheet: ScorePadSheet, base: number) => Promise<SavedDraft>,
    extra: { version?: number; sheet?: ScorePadSheet | null; dirty?: boolean } = {},
  ) {
    const statuses: DraftStatus[] = [];
    const saveMock = vi.fn(save);
    const saver = new DraftSaver({
      profileId: ME,
      playId: PLAY,
      version: extra.version ?? 0,
      sheet: extra.sheet ?? null,
      dirty: extra.dirty,
      save: saveMock,
      storage: localStorage,
      onStatus: (status) => statuses.push(status),
    });
    return { saver, save: saveMock, statuses, last: () => statuses.at(-1) };
  }

  it('zapisuje w bazie dopiero po 1,5 s od ostatniej zmiany, a lokalnie od razu', async () => {
    const { saver, save, last } = setup((_, base) =>
      Promise.resolve({ version: base + 1, savedAt: null }),
    );
    saver.change(sheet(1));
    expect(readLocalDraft(localStorage, ME, PLAY)).toMatchObject({ dirty: true, sheet: sheet(1) });
    expect(last()?.state).toBe('pending');
    await vi.advanceTimersByTimeAsync(1000);
    saver.change(sheet(2));
    await vi.advanceTimersByTimeAsync(1000);
    expect(save).not.toHaveBeenCalled();
    await vi.advanceTimersByTimeAsync(600);
    expect(save).toHaveBeenCalledOnce();
    expect(save).toHaveBeenCalledWith(sheet(2), 0);
    expect(last()).toMatchObject({ state: 'saved', version: 1 });
    expect(readLocalDraft(localStorage, ME, PLAY)).toMatchObject({
      dirty: false,
      baseVersion: 1,
      sheet: sheet(2),
    });
    saver.dispose();
  });

  it('te same wpisy (np. przełączenie dźwięku) nie zapisują się ponownie', async () => {
    const { saver, save } = setup(() => Promise.resolve({ version: 1, savedAt: null }), {
      sheet: sheet(1),
    });
    saver.change(sheet(1));
    await vi.advanceTimersByTimeAsync(5000);
    expect(save).not.toHaveBeenCalled();
    saver.dispose();
  });

  it('zmiana w trakcie zapisu idzie w kolejnym zapisie od nowej wersji', async () => {
    let finish: (value: SavedDraft) => void = () => undefined;
    const { saver, save, last } = setup((_, base) =>
      base === 0
        ? new Promise((resolve) => (finish = resolve))
        : Promise.resolve({ version: base + 1, savedAt: null }),
    );
    saver.change(sheet(1));
    await vi.advanceTimersByTimeAsync(1500);
    expect(last()?.state).toBe('saving');
    saver.change(sheet(2));
    await vi.advanceTimersByTimeAsync(1500);
    expect(save).toHaveBeenCalledOnce();
    finish({ version: 1, savedAt: null });
    await vi.advanceTimersByTimeAsync(1500);
    expect(save).toHaveBeenCalledTimes(2);
    expect(save).toHaveBeenLastCalledWith(sheet(2), 1);
    expect(last()).toMatchObject({ state: 'saved', version: 2 });
    saver.dispose();
  });

  it('po utracie sieci wpisy zostają lokalnie, a zapis wraca po połączeniu', async () => {
    let online = false;
    const { saver, save, last } = setup((_, base) =>
      online
        ? Promise.resolve({ version: base + 1, savedAt: null })
        : Promise.reject(new DraftError('network')),
    );
    saver.change(sheet(3));
    await vi.advanceTimersByTimeAsync(1500);
    expect(last()).toMatchObject({ state: 'offline', reason: 'network' });
    expect(readLocalDraft(localStorage, ME, PLAY)).toMatchObject({ dirty: true, sheet: sheet(3) });
    online = true;
    window.dispatchEvent(new Event('online'));
    await vi.advanceTimersByTimeAsync(0);
    expect(save).toHaveBeenCalledTimes(2);
    expect(last()).toMatchObject({ state: 'saved', version: 1 });
    saver.dispose();
  });

  it('ponawia zapis po błędzie sieci co 5 s', async () => {
    const results = [
      Promise.reject(new DraftError('network')),
      Promise.resolve({ version: 1, savedAt: null }),
    ];
    results[0]?.catch(() => undefined);
    let call = 0;
    const { saver, save, last } = setup(() => results[call++] as Promise<SavedDraft>);
    saver.change(sheet(3));
    await vi.advanceTimersByTimeAsync(1500);
    expect(last()?.state).toBe('offline');
    await vi.advanceTimersByTimeAsync(5000);
    expect(save).toHaveBeenCalledTimes(2);
    expect(last()?.state).toBe('saved');
    saver.dispose();
  });

  it('konflikt wstrzymuje zapis do decyzji, a nadpisanie zapisuje od wersji z bazy', async () => {
    const { saver, save, last } = setup((_, base) =>
      base === 0
        ? Promise.reject(new DraftError('conflict'))
        : Promise.resolve({ version: base + 1, savedAt: null }),
    );
    saver.change(sheet(1));
    await vi.advanceTimersByTimeAsync(1500);
    expect(last()).toMatchObject({ state: 'conflict', reason: 'conflict' });
    saver.change(sheet(2));
    await vi.advanceTimersByTimeAsync(10_000);
    expect(save).toHaveBeenCalledOnce();
    expect(readLocalDraft(localStorage, ME, PLAY)).toMatchObject({ dirty: true, sheet: sheet(2) });

    saver.reset(5, sheet(2), true);
    await vi.advanceTimersByTimeAsync(0);
    expect(save).toHaveBeenLastCalledWith(sheet(2), 5);
    expect(last()).toMatchObject({ state: 'saved', version: 6 });
    saver.dispose();
  });

  it('wczytanie wersji z bazy po konflikcie nie zapisuje niczego', async () => {
    const { saver, save, last } = setup(() => Promise.reject(new DraftError('conflict')));
    saver.change(sheet(1));
    await vi.advanceTimersByTimeAsync(1500);
    saver.reset(5, sheet(9), false);
    await vi.advanceTimersByTimeAsync(5000);
    expect(save).toHaveBeenCalledOnce();
    expect(last()).toMatchObject({ state: 'saved', version: 5 });
    expect(readLocalDraft(localStorage, ME, PLAY)).toMatchObject({
      dirty: false,
      baseVersion: 5,
      sheet: sheet(9),
    });
    saver.dispose();
  });

  it('partia porzucona albo zapisana gdzie indziej: zapis kończy się błędem bez ponowień', async () => {
    const { saver, save, last } = setup(() => Promise.reject(new DraftError('gone')));
    saver.change(sheet(1));
    await vi.advanceTimersByTimeAsync(1500);
    expect(last()).toMatchObject({ state: 'failed', reason: 'gone' });
    await vi.advanceTimersByTimeAsync(20_000);
    expect(save).toHaveBeenCalledOnce();
    saver.dispose();
  });

  it('wznowienie z niezapisaną kopią lokalną wysyła ją od razu', async () => {
    const { saver, save, last } = setup(
      (_, base) => Promise.resolve({ version: base + 1, savedAt: null }),
      { version: 2, sheet: sheet(5), dirty: true },
    );
    await vi.advanceTimersByTimeAsync(0);
    expect(save).toHaveBeenCalledWith(sheet(5), 2);
    expect(last()).toMatchObject({ state: 'saved', version: 3 });
    saver.dispose();
  });

  it('zamknięcie w trakcie zapisu dosyła zmiany i zapamiętuje wynik w kopii lokalnej', async () => {
    let finish: (value: SavedDraft) => void = () => undefined;
    const { saver, save, statuses } = setup((_, base) =>
      base === 0
        ? new Promise((resolve) => (finish = resolve))
        : Promise.resolve({ version: base + 1, savedAt: null }),
    );
    saver.change(sheet(1));
    await vi.advanceTimersByTimeAsync(1500);
    saver.change(sheet(2));
    const shown = statuses.length;
    saver.dispose(true);
    finish({ version: 1, savedAt: null });
    await vi.advanceTimersByTimeAsync(0);
    expect(save).toHaveBeenCalledTimes(2);
    expect(save).toHaveBeenLastCalledWith(sheet(2), 1);
    expect(readLocalDraft(localStorage, ME, PLAY)).toMatchObject({
      dirty: false,
      baseVersion: 2,
      sheet: sheet(2),
    });
    // Zamknięty notes nie dostaje już stanu.
    expect(statuses).toHaveLength(shown);
  });

  it('obietnica zamknięcia spełnia się dopiero po zapisie w bazie albo błędzie', async () => {
    let finish: (value: SavedDraft) => void = () => undefined;
    const { saver } = setup(() => new Promise((resolve) => (finish = resolve)));
    saver.change(sheet(1));
    let settled = false;
    void saver.dispose(true).then(() => (settled = true));
    await vi.advanceTimersByTimeAsync(0);
    expect(settled).toBe(false);
    finish({ version: 1, savedAt: null });
    await vi.advanceTimersByTimeAsync(0);
    expect(settled).toBe(true);

    const failing = setup(() => Promise.reject(new DraftError('network')));
    failing.saver.change(sheet(2));
    await expect(failing.saver.dispose(true)).resolves.toBeUndefined();
    const clean = setup(() => Promise.resolve({ version: 1, savedAt: null }));
    await expect(clean.saver.dispose(true)).resolves.toBeUndefined();
  });

  it('otwarcie bez zmian zapisuje czystą kopię lokalną (stara niezapisana kopia nie wraca)', () => {
    writeLocalDraft(localStorage, local({ baseVersion: 1, sheet: sheet(3) }));
    const { saver, save } = setup(() => Promise.resolve({ version: 1, savedAt: null }), {
      version: 4,
      sheet: sheet(7),
    });
    expect(readLocalDraft(localStorage, ME, PLAY)).toMatchObject({
      dirty: false,
      baseVersion: 4,
      sheet: sheet(7),
    });
    expect(save).not.toHaveBeenCalled();
    saver.dispose();
  });

  it('flush zapisuje od razu, a po dispose nic się nie dzieje', async () => {
    const { saver, save } = setup((_, base) =>
      Promise.resolve({ version: base + 1, savedAt: null }),
    );
    saver.change(sheet(1));
    saver.flush();
    await vi.advanceTimersByTimeAsync(0);
    expect(save).toHaveBeenCalledOnce();
    saver.dispose();
    saver.change(sheet(2));
    await vi.advanceTimersByTimeAsync(5000);
    expect(save).toHaveBeenCalledOnce();
  });
});
