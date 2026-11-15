import type { ScorePadSaveResult } from '@bg-club/score-pad';
import type { SupabaseClient } from '@supabase/supabase-js';
import { describe, expect, it, vi } from 'vitest';
import { PlaySaveError, playSaveFailure, playSummary, savePlay } from './playSave';

const play = {
  id: 'play-1',
  scorepad_version_id: 'version-1',
  seats: [
    { profile_id: 'ada', seat: 1 },
    { profile_id: 'bea', seat: 2 },
    { profile_id: 'cel', seat: 4 },
  ],
  points_snapshot: [10, 6, 4, 2],
};
const sheet = { game: 3, names: ['Ada', 'Bea', null, 'Cel'], cells: { a: [9, 9, null, 4] } };

const result = (
  seat: number,
  rankingValue: number | null,
  place: number,
  tied = false,
): ScorePadSaveResult => ({
  seat,
  values: { a: rankingValue },
  totals: {},
  rankingValue,
  place,
  tied,
  tiedWith: [],
});

describe('podsumowanie oderwanej kartki (PAD-5)', () => {
  it('wiersze w kolejności miejsc z podglądem punktów floor i ładunek bez punktów', () => {
    const summary = playSummary(play, sheet, [
      result(0, 9, 1, true),
      result(1, 9, 1, true),
      result(3, 4, 3),
    ]);
    expect(summary?.rows).toEqual([
      { seat: 1, profileId: 'ada', place: 1, tied: true, value: 9, points: 8, win: true },
      { seat: 2, profileId: 'bea', place: 1, tied: true, value: 9, points: 8, win: true },
      { seat: 4, profileId: 'cel', place: 3, tied: false, value: 4, points: 4, win: false },
    ]);
    expect(summary?.results).toEqual([
      { profile_id: 'ada', seat: 1, place: 1, scores: { a: 9 }, ranking_value: 9 },
      { profile_id: 'bea', seat: 2, place: 1, scores: { a: 9 }, ranking_value: 9 },
      { profile_id: 'cel', seat: 4, place: 3, scores: { a: 4 }, ranking_value: 4 },
    ]);
    expect(summary?.sheet).toBe(sheet);
  });

  it('kartki z graczem spoza partii, bez gracza albo bez wyników nie da się zapisać', () => {
    expect(playSummary(play, sheet, [result(0, 9, 1), result(2, 5, 2), result(3, 4, 3)])).toBe(
      null,
    );
    expect(playSummary(play, sheet, [result(0, 9, 1), result(3, 4, 2)])).toBe(null);
    expect(
      playSummary(play, sheet, [result(0, null, 1), result(1, null, 1), result(3, null, 1)]),
    ).toBe(null);
  });
});

describe('błędy zapisu partii', () => {
  it.each([
    [{ code: '23514', hint: 'plays_already_saved' }, 'saved'],
    [{ code: 'P0002', hint: 'plays_not_found' }, 'gone'],
    [{ code: '23514', hint: 'plays_meeting_in_progress' }, 'closed'],
    [{ code: '23514', hint: 'plays_results_ranking' }, 'invalid'],
    [{ code: '23514', hint: 'plays_scorepad_version_mismatch' }, 'invalid'],
    [{ code: '42501', hint: null }, 'forbidden'],
    [{ code: '', hint: '' }, 'network'],
    [{ code: '23514', hint: null }, 'invalid'],
    [{ code: 'PGRST301', hint: null }, 'server'],
    [{ code: '40P01', hint: null }, 'server'],
  ] as const)('%o → %s', (error, reason) => {
    expect(playSaveFailure(error)).toBe(reason);
  });
});

/** Klient z `rpc(...).abortSignal(...).select(...).single()` zwracającym kolejne odpowiedzi. */
function fakeClient(replies: (() => Promise<{ error: unknown }>)[]) {
  const calls: unknown[] = [];
  const rpc = vi.fn((name: string, args: unknown) => {
    calls.push({ name, args });
    const reply = replies.shift() ?? (() => Promise.resolve({ error: null }));
    const chain = {
      abortSignal: () => chain,
      select: () => chain,
      single: () => reply(),
    };
    return chain;
  });
  return { client: { rpc } as unknown as SupabaseClient, calls };
}

const summary = { sheet, results: [] };
const noSleep = { sleep: () => Promise.resolve(), retryDelays: [1, 1] };

describe('zapis partii z ponowieniem (powtórzenie po timeout bez duplikatów)', () => {
  it('ponawia tę samą treść po błędzie sieci i przekroczeniu czasu', async () => {
    const { client, calls } = fakeClient([
      () => Promise.resolve({ error: { code: '', hint: '', message: 'FetchError' } }),
      () => Promise.reject(new DOMException('timeout', 'TimeoutError')),
      () => Promise.resolve({ error: null }),
    ]);
    await savePlay(client, play, summary, noSleep);
    expect(calls).toHaveLength(3);
    const body = {
      name: 'save_play',
      args: { play_id: 'play-1', scorepad_version_id: 'version-1', sheet, results: [] },
    };
    expect(calls).toEqual([body, body, body]);
  });

  it('nie ponawia błędów, których ponowienie nie naprawi', async () => {
    const { client, calls } = fakeClient([
      () => Promise.resolve({ error: { code: '23514', hint: 'plays_already_saved' } }),
    ]);
    await expect(savePlay(client, play, summary, noSleep)).rejects.toEqual(
      new PlaySaveError('saved'),
    );
    expect(calls).toHaveLength(1);
  });

  it('po wyczerpaniu ponowień zgłasza błąd sieci', async () => {
    const offline = () => Promise.resolve({ error: { code: '', hint: '' } });
    const { client, calls } = fakeClient([offline, offline, offline, offline]);
    const failure = savePlay(client, play, summary, noSleep);
    await expect(failure).rejects.toBeInstanceOf(PlaySaveError);
    await expect(failure).rejects.toMatchObject({ reason: 'network' });
    expect(calls).toHaveLength(3);
  });
});
