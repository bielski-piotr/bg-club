import { useAuth } from '../auth/authContext';
import { FALLBACK_TIMEZONE } from '../club/timezones';
import { useClub } from '../hub/club';
import { format, t } from '../i18n';
import { shortMeetingDate } from '../meetings/datetime';
import { usePopups } from '../popups/popupContext';
import { PopupDialog } from '../popups/PopupDialog';
import { PopupLink } from '../popups/PopupLink';
import { QueryStatus } from '../popups/QueryStatus';
import { Button } from '../ui';
import { AchievementBadge, ProgressBar } from './AchievementShowcase';
import { showcaseItem, usePlayerAchievements } from './achievements';
import { fullName, useProfile } from './profiles';

const text = t.profile.achievements;

/**
 * Szczegóły odznaki z gabloty: nazwa, warunek
 * z katalogu i stan u tego gracza: data odblokowania z linkiem do spotkania albo postęp.
 * Mały dialog nad profilem, zamykany przyciskiem, Esc albo tłem.
 */
export function AchievementDialog({
  profileId,
  id,
}: {
  readonly profileId: string;
  readonly id: string;
}) {
  const { client } = useAuth();
  const { back } = usePopups();
  const profile = useProfile(client, profileId);
  const achievements = usePlayerAchievements(client, profileId);
  const club = useClub(client);
  const timeZone = club.data?.timezone ?? FALLBACK_TIMEZONE;
  const close = (
    <Button variant="secondary" onClick={back}>
      {text.close}
    </Button>
  );

  if (!profile.isSuccess || !achievements.isSuccess) {
    return (
      <PopupDialog title={text.detailsTitle} footer={close}>
        <QueryStatus
          isError={profile.isError || achievements.isError}
          onRetry={() => {
            if (profile.isError) void profile.refetch();
            if (achievements.isError) void achievements.refetch();
          }}
        />
      </PopupDialog>
    );
  }

  const item = achievements.data ? showcaseItem(achievements.data, id) : null;
  if (!profile.data || !item) {
    return (
      <PopupDialog
        title={t.profile.notFoundTitle}
        description={t.profile.notFoundBody}
        icon="alert"
        tone="warning"
        footer={close}
      />
    );
  }

  const { achievement, unlock, progress } = item;
  const removed = profile.data.deleted_at !== null;
  return (
    <PopupDialog
      title={achievement.name}
      description={
        <>
          <span className="sr-only">{text.conditionLabel}: </span>
          {achievement.description}
        </>
      }
      media={<AchievementBadge icon={achievement.icon} unlocked={unlock !== null} size={56} />}
      footer={close}
    >
      <div className="achievement-details">
        <p className="achievement-details__player">{fullName(profile.data)}</p>
        {unlock ? (
          <p className="achievement-details__state">
            {format(text.unlockedAt, { date: shortMeetingDate(unlock.unlocked_at, timeZone) })}{' '}
            <PopupLink
              to={{ kind: 'meeting', id: unlock.meeting_id }}
              className="achievement-details__meeting"
              aria-label={format(text.meetingLink, {
                title: unlock.meeting_title,
                date: shortMeetingDate(unlock.unlocked_at, timeZone),
              })}
            >
              {unlock.meeting_title}
            </PopupLink>
          </p>
        ) : (
          <>
            <p className="achievement-details__state">
              {removed ? text.lockedByRemoved : text.lockedNote}
            </p>
            {progress ? (
              <p className="achievement-details__progress">
                <ProgressBar {...progress} />
                <span aria-hidden="true">{format(text.progress, progress)}</span>
                <span className="sr-only">{format(text.progressLabel, progress)}</span>
              </p>
            ) : null}
          </>
        )}
      </div>
    </PopupDialog>
  );
}
