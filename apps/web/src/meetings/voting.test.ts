import type { SupabaseClient } from '@supabase/supabase-js';
import { describe, expect, it, vi } from 'vitest';
import type { Game } from '../games/games';
import { t } from '../i18n';
import {
  castVote,
  countLabel,
  fitsPlayers,
  mismatchLabel,
  myVoteCount,
  publishGames,
  reopenVoting,
  voteRows,
  votesLabel,
  votingFailure,
  withdrawVote,
  type Vote,
  type VotingFailure,
} from './voting';

function game(id: string, title: string, min = 2, max = 4): Game {
  return {
    id,
    title,
    cover_path: null,
    min_players: min,
    max_players: max,
    placement_points: [],
    created_at: '2026-11-01T00:00:00Z',
    last_played_at: null,
  };
}

const GAMES = [
  game('g1', 'Żółwie Wyścigi'),
  game('g2', 'Azul'),
  game('g3', 'Pasjans', 1, 1),
  game('g4', 'Brzdęk'),
];
const VOTES: Vote[] = [
  { game_id: 'g1', profile_id: 'ania' },
  { game_id: 'g3', profile_id: 'ania' },
  { game_id: 'g3', profile_id: 'bartek' },
  { game_id: 'g1', profile_id: 'celina' },
  { game_id: 'g4', profile_id: 'bartek' },
  // Głos na grę spoza kolekcji (np. właśnie usuniętą) i powtórzony wiersz.
  { game_id: 'gone', profile_id: 'ania' },
  { game_id: 'g4', profile_id: 'bartek' },
];

describe('lista głosowania (VOTE-3, VOTE-4)', () => {
  it('sortuje malejąco po głosach, przy remisie alfabetycznie', () => {
    const rows = voteRows(GAMES, VOTES, { me: 'ania', participants: 3 });
    expect(rows.map((row) => [row.game.title, row.voters.length])).toEqual([
      ['Pasjans', 2],
      ['Żółwie Wyścigi', 2],
      ['Brzdęk', 1],
      ['Azul', 0],
    ]);
  });

  it('pokazuje głosujących w kolejności, własny głos i dopasowanie do liczby uczestników', () => {
    const rows = voteRows(GAMES, VOTES, { me: 'ania', participants: 3 });
    const byId = new Map(rows.map((row) => [row.game.id, row]));
    expect(byId.get('g1')).toMatchObject({ voters: ['ania', 'celina'], mine: true, fits: true });
    expect(byId.get('g4')).toMatchObject({ voters: ['bartek'], mine: false });
    // Niepasująca gra jest oznaczona, ale zostaje na liście (można na nią głosować).
    expect(byId.get('g3')).toMatchObject({ fits: false, mine: true });
  });

  it('wyszukuje bez wielkości liter i polskich znaków', () => {
    expect(
      voteRows(GAMES, VOTES, { me: 'ania', participants: 3, query: ' ZOLW ' }).map(
        (row) => row.game.id,
      ),
    ).toEqual(['g1']);
    expect(voteRows(GAMES, VOTES, { me: 'ania', participants: 3, query: 'xyz' })).toEqual([]);
  });

  it('liczy dopasowanie min ≤ n ≤ max i własne głosy', () => {
    expect(fitsPlayers({ min_players: 2, max_players: 4 }, 2)).toBe(true);
    expect(fitsPlayers({ min_players: 2, max_players: 4 }, 5)).toBe(false);
    expect(fitsPlayers({ min_players: 2, max_players: 4 }, 1)).toBe(false);
    expect(myVoteCount(VOTES, 'bartek')).toBe(2);
    expect(myVoteCount(VOTES, 'dawid')).toBe(0);
  });

  it('oznacza niepasujące gry zakresem graczy (VOTE-4)', () => {
    expect(mismatchLabel({ min_players: 1, max_players: 1 })).toBe('Dla 1 gracza');
    expect(mismatchLabel({ min_players: 2, max_players: 2 })).toBe('Dla 2 graczy');
    expect(mismatchLabel({ min_players: 2, max_players: 4 })).toBe('Dla 2–4 graczy');
  });

  it('odmienia liczbę głosów i wybranych gier', () => {
    expect([0, 1, 2, 5, 22].map(votesLabel)).toEqual([
      'Brak głosów',
      '1 głos',
      '2 głosy',
      '5 głosów',
      '22 głosy',
    ]);
    expect([0, 1, 3, 5].map((n) => countLabel(n, t.meetings.publish.selected))).toEqual([
      'Nie wybrano gier',
      'Wybrano 1 grę',
      'Wybrano 3 gry',
      'Wybrano 5 gier',
    ]);
  });
});

describe('błędy głosowania (migracje [003], [024])', () => {
  it('czyta reguły z HINT i komunikatów wyzwalaczy', () => {
    const cases: [{ code: string; hint?: string; message: string }, VotingFailure][] = [
      [{ code: '23514', hint: 'meeting_games_required', message: 'x' }, 'noGames'],
      [{ code: '23514', hint: 'meeting_games_game_active', message: 'x' }, 'gameDeleted'],
      [{ code: '23514', hint: 'meeting_games_planned', message: 'x' }, 'notPlanned'],
      [{ code: '23514', hint: 'meetings_reopen_planned', message: 'x' }, 'notPlanned'],
      [{ code: 'P0002', hint: 'meetings_not_found', message: 'x' }, 'gone'],
      [{ code: '42501', message: 'administrator required' }, 'forbidden'],
      [{ code: '23514', message: 'voting is closed in meeting m1' }, 'closed'],
      [{ code: '23514', message: 'game g1 is deleted' }, 'gameDeleted'],
      [{ code: '23503', message: 'game_votes_meeting_id_profile_id_fkey' }, 'notParticipant'],
      [{ code: '08006', message: 'network' }, 'save'],
    ];
    for (const [error, reason] of cases) expect(votingFailure(error)).toBe(reason);
  });

  it('ma polski komunikat dla każdego powodu', () => {
    for (const reason of Object.keys(t.meetings.voting.errors)) {
      expect(t.meetings.voting.errors[reason as VotingFailure]).toMatch(/\S/);
    }
  });
});

type Result = { data?: unknown; error?: { code: string; message: string; hint?: string } | null };

function fakeClient(results: { insert?: Result; delete?: Result; meeting?: Result; rpc?: Result }) {
  const reply = (r: Result | undefined, empty: unknown) =>
    Promise.resolve({ data: r?.data ?? empty, error: r?.error ?? null });
  const insert = vi.fn(() => reply(results.insert, null));
  const deleteSelect = vi.fn(() => reply(results.delete, []));
  const deleteEq: { eq: ReturnType<typeof vi.fn>; select: typeof deleteSelect } = {
    eq: vi.fn(() => deleteEq),
    select: deleteSelect,
  };
  const maybeSingle = vi.fn(() => reply(results.meeting, null));
  const meetingEq = vi.fn(() => ({ maybeSingle }));
  const from = vi.fn((table: string) =>
    table === 'game_votes'
      ? { insert, delete: vi.fn(() => deleteEq) }
      : { select: vi.fn(() => ({ eq: meetingEq })) },
  );
  const rpc = vi.fn(() => reply(results.rpc, null));
  return { client: { from, rpc } as unknown as SupabaseClient, insert, rpc, deleteEq };
}

const TARGET = { meetingId: 'm1', gameId: 'g1', profileId: 'ania' };

describe('głos, cofnięcie, publikacja i ponowne otwarcie', () => {
  it('oddaje własny głos; ponowienie (klucz główny) jest sukcesem', async () => {
    const ok = fakeClient({});
    await castVote(ok.client, TARGET);
    expect(ok.insert).toHaveBeenCalledWith({ meeting_id: 'm1', game_id: 'g1', profile_id: 'ania' });
    const duplicate = fakeClient({ insert: { error: { code: '23505', message: 'pkey' } } });
    await expect(castVote(duplicate.client, TARGET)).resolves.toBeUndefined();
    const closed = fakeClient({
      insert: { error: { code: '23514', message: 'voting is closed in meeting m1' } },
    });
    await expect(castVote(closed.client, TARGET)).rejects.toMatchObject({ reason: 'closed' });
  });

  it('cofa głos; gdy nic nie usunięto, rozpoznaje zamknięte głosowanie', async () => {
    const ok = fakeClient({ delete: { data: [{ game_id: 'g1' }] } });
    await withdrawVote(ok.client, TARGET);
    expect(ok.deleteEq.eq).toHaveBeenCalledWith('profile_id', 'ania');
    const already = fakeClient({ delete: { data: [] }, meeting: { data: { voting_open: true } } });
    await expect(withdrawVote(already.client, TARGET)).resolves.toBeUndefined();
    const closed = fakeClient({ delete: { data: [] }, meeting: { data: { voting_open: false } } });
    await expect(withdrawVote(closed.client, TARGET)).rejects.toMatchObject({ reason: 'closed' });
    const gone = fakeClient({ delete: { data: [] }, meeting: { data: null } });
    await expect(withdrawVote(gone.client, TARGET)).rejects.toMatchObject({ reason: 'gone' });
  });

  it('publikuje gry i otwiera głosowanie przez RPC administratora', async () => {
    const ok = fakeClient({});
    await publishGames(ok.client, 'm1', ['g2', 'g1']);
    expect(ok.rpc).toHaveBeenCalledWith('publish_meeting_games', {
      meeting_id: 'm1',
      game_ids: ['g2', 'g1'],
    });
    await reopenVoting(ok.client, 'm1');
    expect(ok.rpc).toHaveBeenCalledWith('reopen_voting', { meeting_id: 'm1' });
    const started = fakeClient({
      rpc: { error: { code: '23514', hint: 'meetings_reopen_planned', message: 'x' } },
    });
    await expect(reopenVoting(started.client, 'm1')).rejects.toMatchObject({
      reason: 'notPlanned',
    });
  });
});
