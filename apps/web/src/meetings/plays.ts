import type { SupabaseClient } from '@supabase/supabase-js';
import { useQuery } from '@tanstack/react-query';
import type { OwnProfile } from '../auth/useOwnProfile';
import { format, plural, t } from '../i18n';
import { isUuid } from '../popups/routes';
import { todayIn, localDateTime } from './datetime';
import { meetingsKey, type Meeting } from './meetings';

/*
 * Przebieg spotkania: partie spotkania, uprawnienia
 * prowadzącego i teksty stanu. Partie tworzy i zapisuje notes; tu jest tylko odczyt.
 */

/** Wynik gracza w partii. W szkicu (`draft`) miejsce, punkty i wygrana są `null`. */
export interface PlayResult {
  readonly profile_id: string;
  readonly seat: number;
  /** Wartość kategorii decydującej: wynik pokazywany przy graczu. */
  readonly ranking_value: number | null;
  readonly place: number | null;
  readonly points: number | null;
  readonly is_win: boolean | null;
}

/** Partia spotkania z grą i wynikami graczy. */
export interface MeetingPlay {
  readonly id: string;
  readonly status: 'draft' | 'saved';
  readonly started_at: string;
  readonly saved_at: string | null;
  readonly started_by: string;
  /** Obraz oderwanej karteczki w buckecie `sheets`; `null` = brak (podgląd zastępczy). */
  readonly sheet_image_path: string | null;
  /** Gra partii; usunięta z kolekcji zostaje w historii. */
  readonly game: {
    readonly id: string;
    readonly title: string;
    readonly cover_path: string | null;
  };
  readonly results: readonly PlayResult[];
}

interface PlayRow extends Omit<MeetingPlay, 'game' | 'results'> {
  readonly game_id: string;
  readonly games: MeetingPlay['game'] | null;
  readonly play_results: readonly PlayResult[];
}

const PLAY_COLUMNS =
  'id, status, started_at, saved_at, started_by, sheet_image_path, game_id, games(id, title, cover_path), ' +
  'play_results!play_results_play_id_meeting_id_fkey(profile_id, seat, ranking_value, place, points, is_win)';

export const meetingPlaysKey = (id: string) => [...meetingsKey, 'plays', id] as const;

export function fromPlayRow(row: PlayRow): MeetingPlay {
  const { games, game_id, play_results, ...rest } = row;
  return {
    ...rest,
    game: games ?? { id: game_id, title: t.meetings.plays.unknownGame, cover_path: null },
    results: play_results,
  };
}

/**
 * Partie spotkania: zapisane i szkice (partie w toku). `fresh`: pobiera je od nowa przy każdym
 * otwarciu (dialog zakończenia nie może polegać na liście sprzed chwili).
 */
export function useMeetingPlays(client: SupabaseClient, meetingId: string, fresh = false) {
  return useQuery({
    queryKey: meetingPlaysKey(meetingId),
    ...(fresh ? { refetchOnMount: 'always' as const } : {}),
    queryFn: async (): Promise<MeetingPlay[]> => {
      if (!isUuid(meetingId)) return [];
      const { data, error } = await client
        .from('plays')
        .select(PLAY_COLUMNS)
        .eq('meeting_id', meetingId)
        .returns<PlayRow[]>();
      if (error) throw error;
      return data.map(fromPlayRow);
    },
  });
}

/** Partia z kartką i szkicem: notes partii w toku i jej wznowienie. */
export interface PlayDetail {
  readonly id: string;
  readonly meeting_id: string;
  readonly status: 'draft' | 'saved';
  readonly started_at: string;
  /** Wpisy kartki (format `sheet` pliku notesu) albo `null` przed pierwszym zapisem szkicu. */
  readonly sheet: unknown;
  readonly draft_version: number;
  readonly draft_saved_at: string | null;
  readonly draft_saved_by: string | null;
  /** Punktacja miejsc z chwili rozpoczęcia partii: podgląd punktów w podsumowaniu. */
  readonly points_snapshot: readonly number[];
  readonly scorepad_version_id: string;
  readonly game: MeetingPlay['game'];
  /** Nazwa notesu i liczba miejsc wersji, z którą partia się zaczęła. */
  readonly scorepad: { readonly name: string; readonly slots: number };
  readonly seats: readonly { readonly profile_id: string; readonly seat: number }[];
}

interface PlayDetailRow extends Omit<PlayDetail, 'game' | 'scorepad' | 'seats'> {
  readonly game_id: string;
  readonly games: MeetingPlay['game'] | null;
  readonly scorepad_versions: {
    readonly player_slots: number;
    readonly scorepads: { readonly name: string } | null;
  } | null;
  readonly play_results: PlayDetail['seats'];
}

const PLAY_DETAIL_COLUMNS =
  'id, meeting_id, status, started_at, sheet, draft_version, draft_saved_at, draft_saved_by, points_snapshot, ' +
  'scorepad_version_id, game_id, games(id, title, cover_path), ' +
  'scorepad_versions(player_slots, scorepads!scorepad_versions_scorepad_id_fkey(name)), ' +
  'play_results!play_results_play_id_meeting_id_fkey(profile_id, seat)';

export const playKey = (id: string) => [...meetingsKey, 'play', id] as const;

export function fromPlayDetailRow(row: PlayDetailRow): PlayDetail {
  const { games, game_id, scorepad_versions, play_results, ...rest } = row;
  const seats = [...play_results].sort((a, b) => a.seat - b.seat);
  return {
    ...rest,
    game: games ?? { id: game_id, title: t.meetings.plays.unknownGame, cover_path: null },
    scorepad: {
      name: scorepad_versions?.scorepads?.name ?? '',
      slots: scorepad_versions?.player_slots ?? Math.max(0, ...seats.map((s) => s.seat)),
    },
    seats,
  };
}

/**
 * Partia z kartką. `null` = nie ma jej (np. porzucona). Szkic czyta się z bazy przy
 * każdym otwarciu: na innym urządzeniu mógł się zmienić (wznowienie bez synchronizacji na żywo).
 */
export function usePlay(client: SupabaseClient, id: string) {
  return useQuery({
    queryKey: playKey(id),
    refetchOnMount: 'always',
    // Notes trzyma własny stan; ponowne pobranie przy powrocie do karty niczego by nie zmieniło.
    refetchOnWindowFocus: false,
    queryFn: async (): Promise<PlayDetail | null> => {
      if (!isUuid(id)) return null;
      const { data, error } = await client
        .from('plays')
        .select(PLAY_DETAIL_COLUMNS)
        .eq('id', id)
        .maybeSingle<PlayDetailRow>();
      if (error) throw error;
      return data ? fromPlayDetailRow(data) : null;
    },
  });
}

export interface SplitPlays {
  /** Zapisane partie w kolejności rozegrania (`saved_at`, potem `id`). */
  readonly saved: readonly MeetingPlay[];
  /** Partie w toku (szkice) od najwcześniej rozpoczętej (`started_at`, potem `id`). */
  readonly drafts: readonly MeetingPlay[];
}

const time = (iso: string | null) => (iso ? new Date(iso).getTime() : 0);

export function splitPlays(plays: readonly MeetingPlay[]): SplitPlays {
  const saved = plays
    .filter((play) => play.status === 'saved')
    .sort((a, b) => time(a.saved_at) - time(b.saved_at) || a.id.localeCompare(b.id));
  const drafts = plays
    .filter((play) => play.status === 'draft')
    .sort((a, b) => time(a.started_at) - time(b.started_at) || a.id.localeCompare(b.id));
  return { saved, drafts };
}

/**
 * Wyniki zapisanej partii od najlepszego miejsca (remis: ta sama liczba, potem miejsce
 * w notesie). Szkic nie ma miejsc, więc zostaje kolejność miejsc w notesie.
 */
export function sortedResults(play: Pick<MeetingPlay, 'results'>): PlayResult[] {
  return [...play.results].sort(
    (a, b) => (a.place ?? Infinity) - (b.place ?? Infinity) || a.seat - b.seat,
  );
}

/**
 * Czy zalogowany prowadzi spotkanie (`private.is_meeting_runner`): admin zawsze,
 * prowadzący (`host_id`) tylko w niezakończonym. Rozpoczyna i kończy spotkanie.
 */
export function isMeetingRunner(meeting: Meeting, me: Pick<OwnProfile, 'id' | 'role'>): boolean {
  if (me.role === 'admin') return true;
  return meeting.host_id === me.id && meeting.status !== 'finished';
}

/** „2 rozegrane · 1 w toku”. Bez partii w toku: tylko rozegrane. */
export function playsProgressLabel(saved: number, drafts: number): string {
  const text = t.meetings.plays;
  const done = plural(saved, text.saved);
  return drafts > 0 ? `${done} · ${plural(drafts, text.drafts)}` : done;
}

/**
 * Odliczanie w nagłówku widżetu: „dziś”, „jutro”, „za 16 dni”
 * według dat w strefie klubu. Termin, który już minął (spotkanie nie rozpoczęło się), daje
 * `null`: widżet pokazuje wtedy tylko datę.
 */
export function countdownLabel(
  startsAt: string,
  timeZone: string,
  now: Date = new Date(),
): string | null {
  const day = (date: string) => Date.parse(`${date}T00:00:00Z`) / 86_400_000;
  const days = Math.round(
    day(localDateTime(startsAt, timeZone).date) - day(todayIn(timeZone, now)),
  );
  const text = t.hub.meeting.countdown;
  if (days < 0) return null;
  if (days === 0) return text.today;
  if (days === 1) return text.tomorrow;
  return plural(days, text.days);
}

/** „Partia 1 · 18:10 · 5 graczy”. */
export function playSubtitle(play: MeetingPlay, index: number, timeZone: string): string {
  const text = t.meetings.plays;
  const at = localDateTime(play.saved_at ?? play.started_at, timeZone).time;
  return format(text.subtitle, {
    n: index + 1,
    time: at,
    players: plural(play.results.length, text.players),
  });
}
