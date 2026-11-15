import type { SupabaseClient } from '@supabase/supabase-js';
import type { Game } from '../games/games';
import { format, plural, t } from '../i18n';
import type { Scorepad } from '../score-pad/scorepads';
import { normalizeSearch } from '../ui';

/*
 * Nowa partia (PRD RUN-2, RUN-3, PAD-2, PAD-3, PAD-9, DS §15 „Game / notes pick row”,
 * „Step pills”, „Seat row”): wybór gry, notesu i graczy w miejscach notesu. Te same reguły
 * sprawdza RPC `start_play` (migracja [027]); tu są po to, żeby niepasujące opcje były
 * wyłączone z wyjaśnieniem, zanim ktoś je wybierze.
 */

/** Kroki kreatora w kolejności pigułek („Gra”, „Notes”, „Gracze”). */
export type NewPlayStep = 'game' | 'scorepad' | 'players';
export const NEW_PLAY_STEPS: readonly NewPlayStep[] = ['game', 'scorepad', 'players'];

/** Dozwolona liczba graczy partii (włącznie). */
export interface PlayerBounds {
  readonly min: number;
  readonly max: number;
}

type GameRange = Pick<Game, 'min_players' | 'max_players'>;

/** Najmniej graczy partii: zawsze co najmniej 2, także gdy gra ma min = 1 (PAD-3, Q2). */
export function minPlayers(game: GameRange): number {
  return Math.max(2, game.min_players);
}

/** max(2, min gry) ≤ n ≤ min(max gry, miejsca notesu) (PAD-3). */
export function playerBounds(game: GameRange, slots: number): PlayerBounds {
  return { min: minPlayers(game), max: Math.min(game.max_players, slots) };
}

/** Miejsca dla graczy bieżącej wersji notesu; 0 = notes bez wersji (chwilowo przy tworzeniu). */
export function scorepadSlots(pad: Scorepad): number {
  return pad.current?.player_slots ?? 0;
}

/**
 * Dlaczego notesu nie można wybrać dla tej gry (PAD-3: „niedostępne, z wyjaśnieniem
 * dlaczego”); `null` = pasuje.
 */
export function scorepadReason(game: GameRange, pad: Scorepad): string | null {
  const text = t.meetings.newPlay.reasons;
  const slots = scorepadSlots(pad);
  if (slots === 0) return text.scorepadNotReady;
  const need = minPlayers(game);
  if (slots < need) {
    return format(text.scorepadTooSmall, {
      slots: plural(slots, text.slots),
      need: plural(need, text.players),
    });
  }
  return null;
}

/** Notesy gry, które pasują do jej liczby graczy. */
export function fittingScorepads(game: GameRange, pads: readonly Scorepad[]): Scorepad[] {
  return pads.filter((pad) => scorepadReason(game, pad) === null);
}

/**
 * Dlaczego gry nie można wybrać (RUN-2: „bez notesu partii nie da się rozpocząć”, PAD-3);
 * `null` = można. `participants` to liczba aktywnych uczestników spotkania.
 */
export function gameReason(
  game: GameRange,
  pads: readonly Scorepad[],
  participants: number,
): string | null {
  const text = t.meetings.newPlay.reasons;
  if (pads.length === 0) return text.noScorepad;
  if (fittingScorepads(game, pads).length === 0) {
    return format(text.noFittingScorepad, { need: plural(minPlayers(game), text.players) });
  }
  const need = minPlayers(game);
  if (participants < need) {
    return format(text.tooFewParticipants, {
      need: plural(need, text.players),
      n: participants,
    });
  }
  return null;
}

/** „2–4 graczy” albo „2 graczy” (zakres liczby graczy partii tej gry). */
export function boundsLabel(bounds: PlayerBounds): string {
  const text = t.meetings.newPlay;
  return bounds.min === bounds.max
    ? plural(bounds.min, text.reasons.players)
    : format(text.range, { min: bounds.min, max: bounds.max });
}

/** Opis gry na liście: „2–4 graczy · 2 notesy”. */
export function gameSubtitle(game: GameRange, pads: readonly Scorepad[]): string {
  const range = boundsLabel({ min: minPlayers(game), max: game.max_players });
  return pads.length === 0 ? range : `${range} · ${plural(pads.length, t.scorepads.count)}`;
}

/** Opis notesu na liście: „4 miejsca · wersja 2”. */
export function scorepadSubtitle(pad: Scorepad): string {
  const text = t.meetings.newPlay;
  const slots = plural(scorepadSlots(pad), text.reasons.slots);
  return pad.current ? `${slots} · ${format(text.version, { n: pad.current.version })}` : slots;
}

export interface GameGroups {
  /** Gry opublikowane („Gramy w”, VOTE-5) w kolejności publikacji. */
  readonly published: readonly Game[];
  /** Reszta kolekcji alfabetycznie (RUN-2: „najpierw opublikowane, potem reszta”). */
  readonly others: readonly Game[];
}

/** Gry kreatora: opublikowane przed resztą kolekcji, po filtrze wyszukiwania. */
export function groupGames(
  games: readonly Game[],
  publishedIds: readonly string[],
  query = '',
): GameGroups {
  const needle = normalizeSearch(query.trim());
  const matching = needle
    ? games.filter((game) => normalizeSearch(game.title).includes(needle))
    : games;
  const byId = new Map(matching.map((game) => [game.id, game]));
  const published = publishedIds.flatMap((id) => {
    const game = byId.get(id);
    return game ? [game] : [];
  });
  const others = matching
    .filter((game) => !publishedIds.includes(game.id))
    .sort((a, b) => a.title.localeCompare(b.title, 'pl') || a.id.localeCompare(b.id));
  return { published, others };
}

/** Notesy pogrupowane według gry (aktywne, w kolejności dodania). */
export function scorepadsByGame(pads: readonly Scorepad[]): ReadonlyMap<string, Scorepad[]> {
  const map = new Map<string, Scorepad[]>();
  for (const pad of pads) {
    const list = map.get(pad.game_id);
    if (list) list.push(pad);
    else map.set(pad.game_id, [pad]);
  }
  return map;
}

/**
 * Miejsca notesu: `seats[i]` to gracz na miejscu i + 1, `null` = wolne. Długość = liczba
 * miejsc notesu, więc kolejność odpowiada kolumnom albo wierszom kartki (PAD-2).
 */
export type Seats = readonly (string | null)[];

export function emptySeats(slots: number): Seats {
  return Array.from({ length: slots }, () => null);
}

/**
 * Sadza gracza na miejscu `index` (`null` zwalnia miejsce). Gracz siedzący już gdzie indziej
 * przesiada się, więc nikt nie zajmuje dwóch miejsc.
 */
export function assignSeat(seats: Seats, index: number, profileId: string | null): Seats {
  return seats.map((current, i) => {
    if (i === index) return profileId;
    return profileId !== null && current === profileId ? null : current;
  });
}

/** Pierwsze wolne miejsce; -1 = notes jest pełny. */
export function firstFreeSeat(seats: Seats): number {
  return seats.indexOf(null);
}

export function seatedPlayers(seats: Seats): string[] {
  return seats.filter((id): id is string => id !== null);
}

/** Za mało albo za dużo graczy; `null` = można rozpocząć. */
export function seatsProblem(seats: Seats, bounds: PlayerBounds): 'tooFew' | 'tooMany' | null {
  const n = seatedPlayers(seats).length;
  if (n < bounds.min) return 'tooFew';
  if (n > bounds.max) return 'tooMany';
  return null;
}

/** Powód nieudanego rozpoczęcia partii (komunikaty w `t.meetings.newPlay.errors`). */
export type StartPlayFailure =
  | 'forbidden'
  | 'notInProgress'
  | 'scorepadGone'
  | 'gameGone'
  | 'scorepadTooSmall'
  | 'seats'
  | 'duplicate'
  | 'count'
  | 'participant'
  | 'save';

export class StartPlayError extends Error {
  constructor(readonly reason: StartPlayFailure) {
    super(`start play: ${reason}`);
    this.name = 'StartPlayError';
  }
}

interface PostgrestLikeError {
  readonly code?: string | undefined;
  readonly hint?: string | null | undefined;
}

const HINTS: Readonly<Record<string, StartPlayFailure>> = {
  plays_meeting_in_progress: 'notInProgress',
  plays_scorepad_unavailable: 'scorepadGone',
  plays_game_active: 'gameGone',
  plays_scorepad_fits_game: 'scorepadTooSmall',
  play_results_seat_within_slots: 'seats',
  plays_players_unique: 'duplicate',
  plays_players_count: 'count',
  plays_player_participant: 'participant',
};

/** Błąd PostgREST → powód z polskim komunikatem (HINT z migracji [027]). */
export function startPlayFailure(error: PostgrestLikeError): StartPlayFailure {
  const byHint = error.hint ? HINTS[error.hint] : undefined;
  if (byHint) return byHint;
  if (error.code === '42501') return 'forbidden';
  return 'save';
}

export interface NewPlay {
  /** Id partii nadaje kreator: ponowienie po błędzie sieci nie zdubluje partii. */
  readonly playId: string;
  readonly meetingId: string;
  readonly scorepadId: string;
  readonly seats: Seats;
}

/** Rozpoczyna partię (szkic) z bieżącą wersją notesu i graczami w miejscach (RUN-2). */
export async function startPlay(client: SupabaseClient, play: NewPlay): Promise<void> {
  const { error } = await client.rpc('start_play', {
    play_id: play.playId,
    meeting_id: play.meetingId,
    scorepad_id: play.scorepadId,
    player_ids: play.seats,
  });
  if (error) throw new StartPlayError(startPlayFailure(error));
}
