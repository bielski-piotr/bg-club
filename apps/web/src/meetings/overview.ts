import type { SupabaseClient } from '@supabase/supabase-js';
import { useQuery } from '@tanstack/react-query';
import { isUuid } from '../popups/routes';
import { gridRange, monthKey, type YearMonth } from './calendar';
import { MEETING_COLUMNS, fromRow, meetingsKey, type Meeting, type MeetingRow } from './meetings';

/**
 * Spotkania z podsumowaniem partii dla timeline i kalendarza (MTG-3, CAL-1, CAL-2): liczba
 * zapisanych partii i zwycięzcy. Szkice (partie w toku) nie liczą się do statystyk (§5.6).
 */
export interface MeetingOverview extends Meeting {
  /** Zapisane partie spotkania. */
  readonly playCount: number;
  /**
   * Zwycięzcy spotkania: gracze z co najmniej jedną wygraną partią (miejsce 1, także wspólne),
   * od największej liczby wygranych, a przy równej liczbie według pierwszej wygranej
   * (kolejność partii z §5.6.6: `saved_at`, potem `id`), na koniec po `id` profilu.
   */
  readonly winners: readonly string[];
}

/** Partia osadzona w wierszu spotkania. */
export interface OverviewPlay {
  readonly id: string;
  readonly status: 'draft' | 'saved';
  readonly saved_at: string | null;
  readonly play_results: readonly {
    readonly profile_id: string;
    readonly is_win: boolean | null;
  }[];
}

interface OverviewRow extends MeetingRow {
  readonly plays: readonly OverviewPlay[];
}

const OVERVIEW_COLUMNS =
  `${MEETING_COLUMNS}, ` +
  'plays!plays_meeting_id_fkey(id, status, saved_at, ' +
  'play_results!play_results_play_id_meeting_id_fkey(profile_id, is_win))';

/** Liczba zapisanych partii i zwycięzcy (opis w `MeetingOverview.winners`). */
export function summarizePlays(plays: readonly OverviewPlay[]): {
  playCount: number;
  winners: string[];
} {
  const saved = plays
    .filter((play) => play.status === 'saved' && play.saved_at !== null)
    .sort(
      (a, b) =>
        new Date(a.saved_at ?? 0).getTime() - new Date(b.saved_at ?? 0).getTime() ||
        a.id.localeCompare(b.id),
    );
  const wins = new Map<string, { count: number; first: number }>();
  saved.forEach((play, index) => {
    for (const result of play.play_results) {
      if (result.is_win !== true) continue;
      const entry = wins.get(result.profile_id);
      if (entry) entry.count += 1;
      else wins.set(result.profile_id, { count: 1, first: index });
    }
  });
  const winners = [...wins.entries()]
    .sort(([idA, a], [idB, b]) => b.count - a.count || a.first - b.first || idA.localeCompare(idB))
    .map(([id]) => id);
  return { playCount: saved.length, winners };
}

function fromOverviewRow(row: OverviewRow): MeetingOverview {
  const { plays, ...meeting } = row;
  return { ...fromRow(meeting), ...summarizePlays(plays) };
}

/** Pozycje timeline (MTG-3, DS §15.1). */
export interface Timeline {
  /** Najwyżej 2 najbliższe niezakończone spotkania, od dalszego (kolejność wyświetlania). */
  readonly upcoming: readonly MeetingOverview[];
  /** Najwyżej 4 ostatnie zakończone spotkania, od najnowszego. */
  readonly finished: readonly MeetingOverview[];
}

export const TIMELINE_UPCOMING = 2;
export const TIMELINE_FINISHED = 4;

export const timelineKey = [...meetingsKey, 'timeline'] as const;
export const calendarKey = (ym: YearMonth) => [...meetingsKey, 'calendar', monthKey(ym)] as const;

/**
 * Timeline: nadchodzące to zaplanowane i trwające (najbliższe według `starts_at`, potem `id`,
 * Q24), odbyte to zakończone (najnowsze najpierw).
 */
export function useTimeline(client: SupabaseClient) {
  return useQuery({
    queryKey: timelineKey,
    queryFn: async (): Promise<Timeline> => {
      const [upcoming, finished] = await Promise.all([
        client
          .from('meetings')
          .select(OVERVIEW_COLUMNS)
          .in('status', ['planned', 'in_progress'])
          .order('starts_at')
          .order('id')
          .limit(TIMELINE_UPCOMING)
          .returns<OverviewRow[]>(),
        client
          .from('meetings')
          .select(OVERVIEW_COLUMNS)
          .eq('status', 'finished')
          .order('starts_at', { ascending: false })
          .order('id', { ascending: false })
          .limit(TIMELINE_FINISHED)
          .returns<OverviewRow[]>(),
      ]);
      if (upcoming.error) throw upcoming.error;
      if (finished.error) throw finished.error;
      return {
        upcoming: upcoming.data.map(fromOverviewRow).reverse(),
        finished: finished.data.map(fromOverviewRow),
      };
    },
  });
}

/** Spotkania widoczne w siatce miesiąca `ym` (z zapasem, `gridRange`). */
export function useCalendarMonth(client: SupabaseClient, ym: YearMonth) {
  return useQuery({
    queryKey: calendarKey(ym),
    queryFn: async (): Promise<MeetingOverview[]> => {
      const { from, to } = gridRange(ym);
      const { data, error } = await client
        .from('meetings')
        .select(OVERVIEW_COLUMNS)
        .gte('starts_at', from)
        .lt('starts_at', to)
        .order('starts_at')
        .order('id')
        .returns<OverviewRow[]>();
      if (error) throw error;
      return data.map(fromOverviewRow);
    },
  });
}

export const meetingOverviewKey = (id: string) => [...meetingsKey, 'overview', id] as const;

/** Jedno spotkanie z podsumowaniem partii (popup spotkania). `null` = nie ma takiego. */
export function useMeetingOverview(client: SupabaseClient, id: string) {
  return useQuery({
    queryKey: meetingOverviewKey(id),
    queryFn: async (): Promise<MeetingOverview | null> => {
      if (!isUuid(id)) return null;
      const { data, error } = await client
        .from('meetings')
        .select(OVERVIEW_COLUMNS)
        .eq('id', id)
        .maybeSingle<OverviewRow>();
      if (error) throw error;
      return data ? fromOverviewRow(data) : null;
    },
  });
}
