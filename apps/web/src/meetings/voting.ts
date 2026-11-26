import type { SupabaseClient } from '@supabase/supabase-js';
import type { Game } from '../games/games';
import { format, plural, t, type PluralForms } from '../i18n';
import { normalizeSearch } from '../ui/search';
import { meetingsKey } from './meetings';

/*
 * Głosowanie na gry i publikacja (PRD VOTE-1…VOTE-6, migracja [024]). Głos to wiersz
 * `game_votes`, który uczestnik dodaje i usuwa sam (RLS), a publikację i ponowne otwarcie
 * robią RPC administratora `publish_meeting_games` i `reopen_voting`.
 */

/** Jeden głos: kto (`profile_id`) na jaką grę. Głosowanie jest jawne (VOTE-3). */
export interface Vote {
  readonly game_id: string;
  readonly profile_id: string;
}

/** Gra z listy „Gramy w:” (VOTE-5) w kolejności publikacji. */
export interface PublishedGame {
  readonly id: string;
  readonly title: string;
  readonly cover_path: string | null;
  readonly min_players: number;
  readonly max_players: number;
}

export const meetingVotesKey = (id: string) => [...meetingsKey, 'votes', id] as const;
export const meetingGamesKey = (id: string) => [...meetingsKey, 'games', id] as const;

/** Głosy oddane w spotkaniu. */
export function meetingVotesQuery(client: SupabaseClient, meetingId: string) {
  return {
    queryKey: meetingVotesKey(meetingId),
    queryFn: async (): Promise<Vote[]> => {
      const { data, error } = await client
        .from('game_votes')
        .select('game_id, profile_id')
        .eq('meeting_id', meetingId)
        .order('created_at')
        .returns<Vote[]>();
      if (error) throw error;
      return data;
    },
  };
}

interface MeetingGameRow {
  readonly position: number;
  readonly games: PublishedGame | null;
}

/** Opublikowane gry spotkania w kolejności wyboru administratora. */
export function publishedGamesQuery(client: SupabaseClient, meetingId: string) {
  return {
    queryKey: meetingGamesKey(meetingId),
    queryFn: async (): Promise<PublishedGame[]> => {
      const { data, error } = await client
        .from('meeting_games')
        .select('position, games(id, title, cover_path, min_players, max_players)')
        .eq('meeting_id', meetingId)
        .order('position')
        .returns<MeetingGameRow[]>();
      if (error) throw error;
      return data.flatMap((row) => (row.games ? [row.games] : []));
    },
  };
}

/** Gra na liście głosowania z głosami i oznaczeniem dopasowania (VOTE-3, VOTE-4). */
export interface VoteRow {
  readonly game: Game;
  /** Głosujący w kolejności oddania głosu. */
  readonly voters: readonly string[];
  /** Czy zalogowany ma głos na tę grę. */
  readonly mine: boolean;
  /** Czy gra mieści liczbę uczestników (min ≤ n ≤ max). Niepasujące też przyjmują głosy. */
  readonly fits: boolean;
  /** Czy gra jest dostępna: na niedostępną nie można głosować (oddany głos można cofnąć). */
  readonly available: boolean;
}

/** Czy gra pasuje do liczby uczestników spotkania (VOTE-4). */
export function fitsPlayers(
  game: Pick<Game, 'min_players' | 'max_players'>,
  participants: number,
): boolean {
  return participants >= game.min_players && participants <= game.max_players;
}

/**
 * Lista głosowania (VOTE-3): wszystkie gry kolekcji z głosami, najpierw dostępne, malejąco po
 * liczbie głosów, potem alfabetycznie po tytule; niedostępne na końcu. Głosy na gry spoza listy (np. właśnie usunięte) pomijamy.
 * Wyszukiwanie bez wielkości liter i polskich znaków.
 */
export function voteRows(
  games: readonly Game[],
  votes: readonly Vote[],
  options: { readonly me: string; readonly participants: number; readonly query?: string },
): VoteRow[] {
  const byGame = new Map<string, string[]>();
  for (const vote of votes) {
    const voters = byGame.get(vote.game_id) ?? [];
    if (!voters.includes(vote.profile_id)) voters.push(vote.profile_id);
    byGame.set(vote.game_id, voters);
  }
  const query = normalizeSearch(options.query ?? '');
  return games
    .filter((game) => query === '' || normalizeSearch(game.title).includes(query))
    .map((game) => {
      const voters = byGame.get(game.id) ?? [];
      return {
        game,
        voters,
        mine: voters.includes(options.me),
        fits: fitsPlayers(game, options.participants),
        // Brak pola (starsza odpowiedź) = dostępna.
        available: game.available !== false,
      };
    })
    .sort(
      (a, b) =>
        Number(b.available) - Number(a.available) ||
        b.voters.length - a.voters.length ||
        a.game.title.localeCompare(b.game.title, 'pl') ||
        a.game.id.localeCompare(b.game.id),
    );
}

/** Liczba różnych gier, na które głosował `profileId` („Twoje głosy: 2”). */
export function myVoteCount(votes: readonly Vote[], profileId: string): number {
  return new Set(votes.filter((vote) => vote.profile_id === profileId).map((v) => v.game_id)).size;
}

/** „Brak głosów”, „1 głos”, „3 głosy”, „5 głosów” (DS §15 „Vote row”). */
export function votesLabel(n: number): string {
  return countLabel(n, t.meetings.voting.votes);
}

/** Oznaczenie gry niepasującej do liczby uczestników (VOTE-4): „Dla 1 gracza”, „Dla 2–4 graczy”. */
export function mismatchLabel(game: Pick<Game, 'min_players' | 'max_players'>): string {
  const text = t.meetings.voting;
  return game.min_players === game.max_players
    ? plural(game.min_players, text.mismatchExact)
    : format(text.mismatch, { min: game.min_players, max: game.max_players });
}

/** Licznik z osobną formą dla zera, np. „Nie wybrano gier” / „Wybrano 3 gry”. */
export function countLabel(n: number, forms: PluralForms & { readonly zero: string }): string {
  return n === 0 ? forms.zero : plural(n, forms);
}

/** Powód nieudanego głosu, publikacji albo ponownego otwarcia (`t.meetings.voting.errors`). */
export type VotingFailure =
  | 'closed'
  | 'gameDeleted'
  | 'gameUnavailable'
  | 'notParticipant'
  | 'noGames'
  | 'notPlanned'
  | 'gone'
  | 'forbidden'
  | 'save';

export class VotingError extends Error {
  constructor(readonly reason: VotingFailure) {
    super(`voting: ${reason}`);
    this.name = 'VotingError';
  }
}

interface PostgrestLikeError {
  readonly code?: string | undefined;
  readonly hint?: string | null | undefined;
  readonly message?: string | undefined;
}

const HINTS: Readonly<Record<string, VotingFailure>> = {
  meeting_games_required: 'noGames',
  meeting_games_game_active: 'gameDeleted',
  games_unavailable: 'gameUnavailable',
  meeting_games_planned: 'notPlanned',
  meetings_reopen_planned: 'notPlanned',
  meetings_not_found: 'gone',
};

/** Błąd PostgREST → powód z polskim komunikatem. */
export function votingFailure(error: PostgrestLikeError): VotingFailure {
  const byHint = error.hint ? HINTS[error.hint] : undefined;
  if (byHint) return byHint;
  if (error.code === '42501') return 'forbidden';
  // Wyzwalacze głosu (migracje [003], [007]): głosowanie zamknięte albo gra usunięta.
  if (error.code === '23514' && error.message?.includes('voting is closed')) return 'closed';
  if (error.code === '23514' && error.message?.includes('is deleted')) return 'gameDeleted';
  // Klucz obcy głosu do uczestników: gracz wypadł z planu albo spotkanie usunięto.
  if (error.code === '23503') return 'notParticipant';
  return 'save';
}

export interface VoteTarget {
  readonly meetingId: string;
  readonly gameId: string;
  readonly profileId: string;
}

/**
 * Oddaje głos (VOTE-2). Głos, który już jest (ponowienie, druga karta), to sukces: klucz
 * główny pilnuje jednego głosu na grę.
 */
export async function castVote(client: SupabaseClient, target: VoteTarget): Promise<void> {
  const { error } = await client.from('game_votes').insert({
    meeting_id: target.meetingId,
    game_id: target.gameId,
    profile_id: target.profileId,
  });
  if (error && error.code !== '23505') throw new VotingError(votingFailure(error));
}

/**
 * Cofa głos (VOTE-2). RLS usuwa tylko własny głos przy otwartym głosowaniu; gdy nic nie
 * usunięto, sprawdzamy, czy głosowanie jest jeszcze otwarte (wtedy głosu już nie było).
 */
export async function withdrawVote(client: SupabaseClient, target: VoteTarget): Promise<void> {
  const { data, error } = await client
    .from('game_votes')
    .delete()
    .eq('meeting_id', target.meetingId)
    .eq('game_id', target.gameId)
    .eq('profile_id', target.profileId)
    .select('game_id');
  if (error) throw new VotingError(votingFailure(error));
  if (data.length > 0) return;
  const meeting = await client
    .from('meetings')
    .select('voting_open')
    .eq('id', target.meetingId)
    .maybeSingle<{ voting_open: boolean }>();
  if (meeting.error) throw new VotingError('save');
  if (!meeting.data) throw new VotingError('gone');
  if (!meeting.data.voting_open) throw new VotingError('closed');
}

/**
 * Zamyka głosowanie i publikuje gry (VOTE-5) w jednej transakcji. Kolejność `gameIds` to
 * kolejność listy „Gramy w:”. Tylko administrator.
 */
export async function publishGames(
  client: SupabaseClient,
  meetingId: string,
  gameIds: readonly string[],
): Promise<void> {
  const { error } = await client.rpc('publish_meeting_games', {
    meeting_id: meetingId,
    game_ids: gameIds,
  });
  if (error) throw new VotingError(votingFailure(error));
}

/** Otwiera głosowanie ponownie przed rozpoczęciem (VOTE-6); lista „Gramy w:” znika. */
export async function reopenVoting(client: SupabaseClient, meetingId: string): Promise<void> {
  const { error } = await client.rpc('reopen_voting', { meeting_id: meetingId });
  if (error) throw new VotingError(votingFailure(error));
}
