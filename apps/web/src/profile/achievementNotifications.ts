import { achievementById } from '@bg-club/scoring';
import { isUuid } from '../popups/routes';

export interface AchievementNotification {
  readonly profile_id: string;
  readonly achievement_id: string;
}

/** Nieznana odznaka w nowszej bazie nie może zepsuć zapisu partii na starszym kliencie. */
export function parseAchievementNotifications(data: unknown): readonly AchievementNotification[] {
  if (!data || typeof data !== 'object' || !('unlocks' in data) || !Array.isArray(data.unlocks)) {
    return [];
  }
  const seen = new Set<string>();
  return data.unlocks.filter((item: unknown): item is AchievementNotification => {
    if (!item || typeof item !== 'object' || !('profile_id' in item) || !('achievement_id' in item))
      return false;
    if (
      typeof item.profile_id !== 'string' ||
      !isUuid(item.profile_id) ||
      typeof item.achievement_id !== 'string' ||
      !achievementById(item.achievement_id)
    )
      return false;
    const key = `${item.profile_id}:${item.achievement_id}`;
    if (seen.has(key)) return false;
    seen.add(key);
    return true;
  });
}
