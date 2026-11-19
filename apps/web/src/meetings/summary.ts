import type { SupabaseClient } from '@supabase/supabase-js';
import { useQuery } from '@tanstack/react-query';
import { format, plural, t } from '../i18n';
import { isUuid } from '../popups/routes';
import { meetingsKey } from './meetings';

/**
 * Podsumowanie leaderboardowe spotkania z funkcji SQL
 * `meeting_summary(meeting_id)` (migracja `20261113001800_game_stats.sql`). Baza liczy punkty,
 * wygrane i serie z zapisanych partii (szkice się nie liczą); tu tylko teksty wiersza.
 */

/** Wkład jednej gry spotkania w wynik gracza. */
export interface SummaryGame {
  readonly game_id: string;
  readonly title: string;
  /** Gra usunięta z kolekcji zostaje w historii z oznaczeniem. */
  readonly deleted: boolean;
  readonly points: number;
  readonly wins: number;
}

export interface SummaryEntry {
  readonly place: number;
  readonly profile_id: string;
  readonly deleted: boolean;
  readonly points: number;
  readonly wins: number;
  /** Gry w kolejności pierwszej partii gry w spotkaniu. */
  readonly games: readonly SummaryGame[];
  /** Seria zwycięstw przed spotkaniem i po nim (cała historia). */
  readonly streak_before: number;
  readonly streak_after: number;
}

/** Klucz w `meetingsKey`: zapis i usunięcie partii odświeżają podsumowanie. */
export const meetingSummaryKey = (id: string) => [...meetingsKey, 'summary', id] as const;

export function useMeetingSummary(client: SupabaseClient, meetingId: string) {
  return useQuery({
    queryKey: meetingSummaryKey(meetingId),
    queryFn: async (): Promise<readonly SummaryEntry[]> => {
      if (!isUuid(meetingId)) return [];
      const { data, error } = await client.rpc('meeting_summary', { meeting_id: meetingId });
      if (error) throw error;
      return (data ?? []) as SummaryEntry[];
    },
  });
}

const text = t.meetings.summary;

export type StreakChange = 'up' | 'broken' | 'unchanged';

/**
 * Zmiana serii na spotkaniu: wygrana przedłuża serię, brak wygranej przerywa serię
 * > 0, a seria 0 bez wygranej zostaje bez zmian.
 */
export function streakChange(
  entry: Pick<SummaryEntry, 'streak_before' | 'streak_after'>,
): StreakChange {
  if (entry.streak_after > entry.streak_before) return 'up';
  if (entry.streak_after < entry.streak_before) return 'broken';
  return 'unchanged';
}

/** „+1 → seria 4”, „seria przerwana”, „seria bez zmian”. */
export function streakLabel(entry: Pick<SummaryEntry, 'streak_before' | 'streak_after'>): string {
  switch (streakChange(entry)) {
    case 'up':
      return format(text.streakUp, { n: entry.streak_after });
    case 'broken':
      return text.streakBroken;
    default:
      return text.streakSame;
  }
}

function gameTitle(game: SummaryGame): string {
  return game.deleted ? format(text.deletedGame, { title: game.title }) : game.title;
}

/** Rozbicie punktów na gry: „Wingspan +8, Azul +4”. */
export function pointsBreakdown(games: readonly SummaryGame[]): string {
  return games
    .map((game) => format(text.gamePoints, { title: gameTitle(game), n: game.points }))
    .join(', ');
}

/** „1 wygrana · Azul”, „3 wygrane · Azul ×2, Wingspan”; `null` bez wygranych. */
export function winsLabel(entry: Pick<SummaryEntry, 'wins' | 'games'>): string | null {
  if (entry.wins === 0) return null;
  const games = entry.games
    .filter((game) => game.wins > 0)
    .map((game) =>
      game.wins > 1
        ? format(text.repeated, { title: gameTitle(game), n: game.wins })
        : gameTitle(game),
    )
    .join(', ');
  return format(text.winsGames, { wins: plural(entry.wins, text.wins), games });
}
