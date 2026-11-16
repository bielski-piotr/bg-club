import { achievementById } from '@bg-club/scoring';
import { format, t } from '../i18n';
import { isPlainClick, type PopupApi } from '../popups/popupContext';
import { stackSearch } from '../popups/routes';
import { AchievementBadge } from './AchievementShowcase';
import type { AchievementNotification as Notification } from './achievementNotifications';
import { fullName, type Profile } from './profiles';
import './achievementNotification.css';

/** Jedna przewijalna lista obejmuje wszystkie nowe odznaki, bez limitu trzech toastów. */
export function AchievementNotification({
  unlocks,
  profiles,
  open,
}: {
  readonly unlocks: readonly Notification[];
  readonly profiles: ReadonlyMap<string, Profile>;
  readonly open: PopupApi['open'];
}) {
  const text = t.profile.achievementNotification;
  return (
    <ul className="achievement-notification" aria-label={text.label}>
      {unlocks.map((unlock) => {
        const achievement = achievementById(unlock.achievement_id);
        if (!achievement) return null;
        const profile = profiles.get(unlock.profile_id);
        const name = profile ? fullName(profile) : text.unknownPlayer;
        const route = {
          kind: 'achievement',
          profileId: unlock.profile_id,
          id: achievement.id,
        } as const;
        return (
          <li key={`${unlock.profile_id}:${achievement.id}`}>
            <AchievementBadge icon={achievement.icon} unlocked />
            <span className="achievement-notification__text">
              <span className="achievement-notification__eyebrow">{text.eyebrow}</span>
              <span className="achievement-notification__title">{achievement.name}</span>
              <span className="achievement-notification__player">{name}</span>
            </span>
            <a
              href={stackSearch('', [route])}
              aria-label={format(text.details, { name, achievement: achievement.name })}
              onClick={(event) => {
                if (!isPlainClick(event)) return;
                event.preventDefault();
                open(route);
              }}
            >
              {text.view}
              <span aria-hidden="true"> ›</span>
            </a>
          </li>
        );
      })}
    </ul>
  );
}
