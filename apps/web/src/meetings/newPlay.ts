import type { SupabaseClient } from '@supabase/supabase-js';
import type { Game } from '../games/games';
import { format, plural, t } from '../i18n';
import type { Scorepad } from '../score-pad/scorepads';
import { normalizeSearch } from '../ui/search';

/*
 * Nowa partia: wybór gry, notesu i graczy w miejscach notesu. Te same reguły
 * sprawdza RPC `start_play` (migracja); tu są po to, żeby niepasujące opcje były
 * wyłączone z wyjaśnieniem, zanim ktoś je wybierze.
 */

/** Kroki kreatora w kolejności pigułek („Gra”, „Dodatki”, „Notes”, „Gracze”). */
export type NewPlayStep = 'game' | 'expansions' | 'scorepad' | 'players';
export const NEW_PLAY_STEPS: readonly NewPlayStep[] = ['game', 'scorepad', 'players'];

/** Kroki dla wybranej gry: „Dodatki” tylko, gdy gra ma aktywne dodatki. */
export function newPlaySteps(hasExpansions: boolean): readonly NewPlayStep[] {
  return hasExpansions ? ['game', 'expansions', 'scorepad', 'players'] : NEW_PLAY_STEPS;
}

/** Dozwolona liczba graczy partii (włącznie). */
export interface PlayerBounds {
  readonly min: number;
  readonly max: number;
}

type GameRange = Pick<Game, 'min_players' | 'max_players'>;

/**
 * Liczba graczy partii gry z dodatkami: najmniejsze min i największe max spośród gry
 * i wybranych dodatków (dodatek może rozszerzać liczbę graczy).
 */
export function combinedRange(game: GameRange, expansions: readonly GameRange[]): GameRange {
  return {
    min_players: Math.min(game.min_players, ...expansions.map((e) => e.min_players)),
    max_players: Math.max(game.max_players, ...expansions.map((e) => e.max_players)),
  };
}

type ScoringCandidate = Pick<Game, 'id' | 'title' | 'max_players' | 'complexity'>;

/**
 * Tytuł, którego punktację stosuje partia (jak `private.play_scoring_game`): najwyższe
 * skomplikowanie spośród gry i wybranych dodatków, które mieszczą wszystkich graczy; przy remisie
 * gra podstawowa. Gdy żaden nie mieści graczy, tytuł z największą liczbą graczy.
 */
export function scoringTitle<T extends ScoringCandidate>(
  game: T,
  expansions: readonly T[],
  players: number,
): T {
  const all = [game, ...expansions];
  const fitting = all.filter((title) => title.max_players >= players);
  const pool = fitting.length > 0 ? fitting : all;
  const key = (title: T) => (fitting.length > 0 ? (title.complexity ?? 0) : title.max_players);
  return pool.reduce((best, title) => {
    const diff = key(title) - key(best);
    if (diff > 0) return title;
    if (diff < 0 || best === game) return best;
    if (title === game) return title;
    return title.title.localeCompare(best.title, 'pl') < 0 ? title : best;
  });
}

/** Najmniej graczy partii: zawsze co najmniej 2, także gdy gra ma min = 1. */
export function minPlayers(game: GameRange): number {
  return Math.max(2, game.min_players);
}

/**
 * max(2, min gry) ≤ n ≤ min(max gry, miejsca notesu). W notesie z zespołami na miejscu
 * może siedzieć kilku graczy, więc górną granicą jest tylko max gry.
 */
export function playerBounds(game: GameRange, slots: number, teams = false): PlayerBounds {
  return {
    min: minPlayers(game),
    max: teams ? game.max_players : Math.min(game.max_players, slots),
  };
}

/** Miejsca dla graczy bieżącej wersji notesu; 0 = notes bez wersji (chwilowo przy tworzeniu). */
export function scorepadSlots(pad: Scorepad): number {
  return pad.current?.player_slots ?? 0;
}

/** Notes z zespołami (kategoria nazwy gracza przyjmuje kilku graczy). */
export function scorepadTeams(pad: Scorepad): boolean {
  return pad.current?.teams === true;
}

/**
 * Dlaczego notesu nie można wybrać dla tej gry („niedostępne, z wyjaśnieniem
 * dlaczego”); `null` = pasuje.
 */
export function scorepadReason(game: GameRange, pad: Scorepad): string | null {
  const text = t.meetings.newPlay.reasons;
  const slots = scorepadSlots(pad);
  if (slots === 0) return text.scorepadNotReady;
  // Zespoły: wystarczą dwa miejsca (dwie strony), graczy może być więcej niż miejsc.
  const need = scorepadTeams(pad) ? 2 : minPlayers(game);
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
 * Dlaczego gry nie można wybrać („bez notesu partii nie da się rozpocząć”);
 * `null` = można. `participants` to liczba aktywnych uczestników spotkania.
 */
export function gameReason(
  game: GameRange,
  pads: readonly Scorepad[],
  participants: number,
): string | null {
  const text = t.meetings.newPlay.reasons;
  // Partia ma co najmniej 2 graczy, więc gra jednoosobowa nie ma partii w klubie.
  if (game.max_players < 2) return text.solo;
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
  /** Gry opublikowane („Gramy w”) w kolejności publikacji. */
  readonly published: readonly Game[];
  /** Reszta kolekcji alfabetycznie („najpierw opublikowane, potem reszta”). */
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
  const publishedSet = new Set(publishedIds);
  const published = publishedIds.flatMap((id) => {
    const game = byId.get(id);
    return game ? [game] : [];
  });
  const others = matching
    .filter((game) => !publishedSet.has(game.id))
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
 * Miejsca notesu: `seats[i]` to gracze na miejscu i + 1 (pusta lista = wolne; więcej niż jeden
 * tylko w notesie z zespołami). Długość = liczba miejsc notesu, więc kolejność odpowiada
 * kolumnom albo wierszom kartki.
 */
export type Seats = readonly (readonly string[])[];

export function emptySeats(slots: number): Seats {
  return Array.from({ length: slots }, () => []);
}

/**
 * Sadza gracza na miejscu `index` zamiast dotychczasowych (`null` zwalnia miejsce). Gracz
 * siedzący już gdzie indziej przesiada się, więc nikt nie zajmuje dwóch miejsc.
 */
export function assignSeat(seats: Seats, index: number, profileId: string | null): Seats {
  return seats.map((current, i) => {
    if (i === index) return profileId === null ? [] : [profileId];
    return profileId === null ? current : current.filter((id) => id !== profileId);
  });
}

/**
 * Zespół: dodaje gracza do miejsca `index` (przesiadając go z innego) albo usuwa go z tego
 * miejsca, gdy już na nim siedzi.
 */
export function toggleTeamMember(seats: Seats, index: number, profileId: string): Seats {
  const here = seats[index]?.includes(profileId) ?? false;
  return seats.map((current, i) => {
    const without = current.filter((id) => id !== profileId);
    return i === index && !here ? [...without, profileId] : without;
  });
}

/** Pierwsze wolne miejsce; -1 = notes jest pełny. */
export function firstFreeSeat(seats: Seats): number {
  return seats.findIndex((ids) => ids.length === 0);
}

/** Miejsce gracza (indeks od 0); -1 = poza partią. */
export function seatOf(seats: Seats, profileId: string): number {
  return seats.findIndex((ids) => ids.includes(profileId));
}

export function seatedPlayers(seats: Seats): string[] {
  return seats.flat();
}

/**
 * Za mało albo za dużo graczy albo tylko jedna strona (wszyscy w jednym zespole); `null` =
 * można rozpocząć.
 */
export function seatsProblem(
  seats: Seats,
  bounds: PlayerBounds,
): 'tooFew' | 'tooMany' | 'sides' | null {
  const n = seatedPlayers(seats).length;
  if (n < bounds.min) return 'tooFew';
  if (n > bounds.max) return 'tooMany';
  if (seats.filter((ids) => ids.length > 0).length < 2) return 'sides';
  return null;
}

/** Powód nieudanego rozpoczęcia partii (komunikaty w `t.meetings.newPlay.errors`). */
export type StartPlayFailure =
  | 'forbidden'
  | 'notInProgress'
  | 'scorepadGone'
  | 'gameGone'
  | 'gameUnavailable'
  | 'scorepadTooSmall'
  | 'seats'
  | 'duplicate'
  | 'count'
  | 'participant'
  | 'expansionGone'
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
  games_unavailable: 'gameUnavailable',
  plays_scorepad_fits_game: 'scorepadTooSmall',
  play_results_seat_within_slots: 'seats',
  plays_players_unique: 'duplicate',
  plays_players_count: 'count',
  plays_teams_unavailable: 'count',
  plays_player_participant: 'participant',
  plays_expansion_unavailable: 'expansionGone',
};

/** Błąd PostgREST → powód z polskim komunikatem (HINT). */
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
  /** Dodatki gry zaznaczone przez prowadzącego (wyniki i tak trafiają do gry podstawowej). */
  readonly expansionIds?: readonly string[] | undefined;
}

/**
 * Argumenty `start_play` dla miejsc: bez zespołów `player_ids[i]` to gracz miejsca i + 1
 * (`null` = wolne); z zespołem płaska lista graczy i `seat_numbers` z ich miejscami (od 1).
 */
export function startPlayArgs(seats: Seats): {
  readonly player_ids: readonly (string | null)[];
  readonly seat_numbers?: readonly number[];
} {
  if (seats.every((ids) => ids.length <= 1))
    return { player_ids: seats.map((ids) => ids[0] ?? null) };
  const seated = seats.flatMap((ids, i) => ids.map((id) => ({ id, seat: i + 1 })));
  return { player_ids: seated.map((s) => s.id), seat_numbers: seated.map((s) => s.seat) };
}

/** Rozpoczyna partię (szkic) z bieżącą wersją notesu i graczami w miejscach. */
export async function startPlay(client: SupabaseClient, play: NewPlay): Promise<void> {
  const { error } = await client.rpc('start_play', {
    play_id: play.playId,
    meeting_id: play.meetingId,
    scorepad_id: play.scorepadId,
    ...startPlayArgs(play.seats),
    ...(play.expansionIds && play.expansionIds.length > 0
      ? { expansion_ids: [...play.expansionIds].sort() }
      : {}),
  });
  if (error) throw new StartPlayError(startPlayFailure(error));
}
