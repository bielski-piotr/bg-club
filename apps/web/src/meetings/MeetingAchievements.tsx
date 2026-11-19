import { achievementById } from '@bg-club/scoring';
import { useAuth } from '../auth/authContext';
import { format, t } from '../i18n';
import { PopupLink } from '../popups/PopupLink';
import { QueryStatus } from '../popups/QueryStatus';
import { AchievementBadge } from '../profile/AchievementShowcase';
import { useMeetingAchievements } from '../profile/achievements';
import { ProfileAvatar } from '../profile/ProfileAvatar';
import { fullName, useAllProfiles } from '../profile/profiles';
import { cx } from '../ui/cx';

const text = t.meetings.achievements;

/**
 * Osiągnięcia odblokowane na spotkaniu: odznaka, „Nowe
 * osiągnięcie”, nazwa i awatar gracza, w kolejności partii. Wiersz otwiera szczegóły odznaki
 * w gablocie gracza. Bez odblokowań sekcji nie ma. Lista pochodzi z przeliczenia w bazie, więc
 * po usunięciu partii (odświeżenie `meetingsKey`) nie zostają na niej nieaktualne odznaki.
 */
export function MeetingAchievementsSection({ meetingId }: { readonly meetingId: string }) {
  const { client } = useAuth();
  const unlocks = useMeetingAchievements(client, meetingId);
  const profiles = useAllProfiles(client);
  const headingId = `${meetingId}-achievements`;
  if (unlocks.data?.length === 0) return null;
  if (!unlocks.isError && !profiles.isError && (!unlocks.data || !profiles.data)) return null;
  return (
    <section className="meeting-view__section" aria-labelledby={headingId}>
      <div className="meeting-view__head-row">
        <h3 id={headingId} className="meeting-view__head">
          {text.title}
        </h3>
      </div>
      {!unlocks.data || !profiles.data ? (
        <QueryStatus
          isError={unlocks.isError || profiles.isError}
          onRetry={() => {
            if (unlocks.isError) void unlocks.refetch();
            if (profiles.isError) void profiles.refetch();
          }}
        />
      ) : (
        <ul className="meeting-achievements" aria-label={text.label}>
          {unlocks.data.map((unlock) => {
            const achievement = achievementById(unlock.achievement_id);
            if (!achievement) return null;
            const person = profiles.data.get(unlock.profile_id);
            const name = person ? fullName(person) : t.meetings.plays.unknownPlayer;
            return (
              <li key={`${unlock.profile_id}:${unlock.achievement_id}`}>
                <PopupLink
                  to={{ kind: 'achievement', profileId: unlock.profile_id, id: achievement.id }}
                  className={cx('achievement-row', person?.deleted_at && 'achievement-row--muted')}
                  aria-label={format(text.row, { name, achievement: achievement.name })}
                >
                  <AchievementBadge icon={achievement.icon} unlocked />
                  <span className="achievement-row__body">
                    <span className="achievement-row__eyebrow">
                      {text.eyebrow} · {name}
                    </span>
                    <span className="achievement-row__title">{achievement.name}</span>
                  </span>
                  {person ? <ProfileAvatar profile={person} size={28} decorative /> : null}
                </PopupLink>
              </li>
            );
          })}
        </ul>
      )}
    </section>
  );
}
