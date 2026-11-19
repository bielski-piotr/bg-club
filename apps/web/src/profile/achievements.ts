import {
  ACHIEVEMENT_GROUPS,
  ACHIEVEMENTS,
  achievementById,
  type AchievementDefinition,
  type AchievementGroup,
} from '@bg-club/scoring';
import type { SupabaseClient } from '@supabase/supabase-js';
import { useQuery } from '@tanstack/react-query';
import { format, t } from '../i18n';
import { shortMeetingDate } from '../meetings/datetime';
import { meetingsKey } from '../meetings/meetings';
import { isUuid } from '../popups/routes';

/**
 * Gablota osiągnięć i osiągnięcia spotkania. Katalog jest w kodzie
 * (`ACHIEVEMENTS`); odblokowania zapisuje przeliczenie w bazie, a aplikacja je
 * tylko czyta: `player_achievements(profile_id)` i `meeting_achievements(meeting_id)` (migracja
 * `20261116000000_achievement_showcase.sql`).
 */

/** Odblokowanie gracza z terminem i tytułem spotkania (data = termin spotkania). */
export interface PlayerUnlock {
  readonly achievement_id: string;
  readonly unlocked_at: string;
  readonly meeting_id: string;
  readonly meeting_title: string;
  readonly play_id: string | null;
}

/** Liczniki z całej historii do postępu „7/10”. */
export interface AchievementProgress {
  readonly meetings: number;
  readonly plays: number;
  readonly wins: number;
  readonly points: number;
  /** Bieżąca seria zwycięstw. */
  readonly streak: number;
  /** Różne zagrane gry. */
  readonly games: number;
  /** Różne gry z wygraną. */
  readonly won_games: number;
  /** Najwięcej wygranych w jednej grze. */
  readonly game_wins: number;
  readonly last_places: number;
  /** Zaliczone głosowania. */
  readonly votes: number;
}

export interface PlayerAchievements {
  readonly unlocks: readonly PlayerUnlock[];
  readonly progress: AchievementProgress;
}

/** Osiągnięcie odblokowane na spotkaniu; `play_id` `null` dla `voter-10`. */
export interface MeetingUnlock {
  readonly profile_id: string;
  readonly achievement_id: string;
  readonly play_id: string | null;
}

/**
 * Licznik postępu każdej odznaki z progiem. Odznaki bez licznika (jednorazowe zdarzenia, np.
 * Hat-trick) i z progiem 1 nie pokazują postępu: „0/1” nic nie mówi („gdzie ma to sens”).
 */
const PROGRESS_COUNTER: Readonly<Record<string, keyof AchievementProgress>> = {
  'meet-10': 'meetings',
  'meet-25': 'meetings',
  'meet-50': 'meetings',
  'play-10': 'plays',
  'play-50': 'plays',
  'play-100': 'plays',
  'win-10': 'wins',
  'win-50': 'wins',
  'streak-3': 'streak',
  'streak-5': 'streak',
  'streak-10': 'streak',
  'explorer-10': 'games',
  'explorer-25': 'games',
  'versatile-5': 'won_games',
  specialist: 'game_wins',
  'lantern-10': 'last_places',
  'pts-100': 'points',
  'pts-500': 'points',
  'voter-10': 'votes',
};

/** Odznaka w gablocie: definicja, odblokowanie albo postęp. */
export interface ShowcaseItem {
  readonly achievement: AchievementDefinition;
  readonly unlock: PlayerUnlock | null;
  /** Postęp nieodblokowanej odznaki z progiem; wartość przycięta do progu. */
  readonly progress: { readonly value: number; readonly goal: number } | null;
}

export interface ShowcaseGroup {
  readonly group: AchievementGroup;
  readonly title: string;
  readonly items: readonly ShowcaseItem[];
}

/** Postęp nieodblokowanej odznaki (`null` = bez licznika albo już odblokowana). */
export function achievementProgress(
  achievement: AchievementDefinition,
  progress: AchievementProgress,
  unlocked: boolean,
): ShowcaseItem['progress'] {
  const counter = PROGRESS_COUNTER[achievement.id];
  if (unlocked || !counter || !achievement.goal || achievement.goal <= 1) return null;
  return { value: Math.min(progress[counter], achievement.goal), goal: achievement.goal };
}

/** Jedna odznaka gabloty; `null` dla identyfikatora spoza katalogu. */
export function showcaseItem(data: PlayerAchievements, id: string): ShowcaseItem | null {
  const achievement = achievementById(id);
  if (!achievement) return null;
  const unlock = data.unlocks.find((u) => u.achievement_id === id) ?? null;
  return {
    achievement,
    unlock,
    progress: achievementProgress(achievement, data.progress, unlock !== null),
  };
}

/**
 * Cały katalog w kolejności katalogu, pogrupowany jak w `ACHIEVEMENT_GROUPS`.
 * Odblokowania spoza katalogu (np. po usunięciu pozycji z kodu) są pomijane.
 */
export function showcaseGroups(data: PlayerAchievements): ShowcaseGroup[] {
  return (Object.keys(ACHIEVEMENT_GROUPS) as AchievementGroup[]).flatMap((group) => {
    const items = ACHIEVEMENTS.filter((a) => a.group === group).flatMap((a) => {
      const item = showcaseItem(data, a.id);
      return item ? [item] : [];
    });
    return items.length > 0 ? [{ group, title: ACHIEVEMENT_GROUPS[group], items }] : [];
  });
}

/** Opis stanu odznaki: data odblokowania, postęp albo „Do odblokowania”. */
export function itemState(item: ShowcaseItem, timeZone: string): string {
  if (item.unlock) {
    return format(t.profile.achievements.unlockedOn, {
      date: shortMeetingDate(item.unlock.unlocked_at, timeZone),
    });
  }
  if (item.progress) return format(t.profile.achievements.progressLabel, item.progress);
  return t.profile.achievements.locked;
}

/** Liczba odblokowanych odznak z katalogu. */
export function unlockedCount(data: PlayerAchievements): number {
  return data.unlocks.filter((u) => achievementById(u.achievement_id)).length;
}

/**
 * Oba klucze są w `meetingsKey`, bo osiągnięcia przelicza baza przy zdarzeniach partii i spotkań
 * (zapis i usunięcie partii, rozpoczęcie, zakończenie, publikacja gier, zmiana terminu,
 * usunięcie spotkania), a każda z tych mutacji unieważnia `meetingsKey` (partie przez
 * `PLAY_DEPENDENT_KEYS`). Gablota i lista spotkania nie zostają więc z nieaktualnymi
 * odznakami.
 */
export const playerAchievementsKey = (id: string) =>
  [...meetingsKey, 'player-achievements', id] as const;
export const meetingAchievementsKey = (id: string) => [...meetingsKey, 'achievements', id] as const;

/** Gablota gracza; `null` w danych = nie ma profilu. */
export function usePlayerAchievements(client: SupabaseClient, id: string) {
  return useQuery({
    queryKey: playerAchievementsKey(id),
    queryFn: async (): Promise<PlayerAchievements | null> => {
      if (!isUuid(id)) return null;
      const { data, error } = await client.rpc('player_achievements', { profile_id: id });
      if (error) throw error;
      return (data ?? null) as PlayerAchievements | null;
    },
  });
}

/** Osiągnięcia odblokowane na spotkaniu, tylko z katalogu, w kolejności partii. */
export function useMeetingAchievements(client: SupabaseClient, meetingId: string) {
  return useQuery({
    queryKey: meetingAchievementsKey(meetingId),
    queryFn: async (): Promise<readonly MeetingUnlock[]> => {
      if (!isUuid(meetingId)) return [];
      const { data, error } = await client.rpc('meeting_achievements', { meeting_id: meetingId });
      if (error) throw error;
      return ((data ?? []) as MeetingUnlock[]).filter((u) => achievementById(u.achievement_id));
    },
  });
}
