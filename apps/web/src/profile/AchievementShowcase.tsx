import { ACHIEVEMENTS } from '@bg-club/scoring';
import { useAuth } from '../auth/authContext';
import { FALLBACK_TIMEZONE } from '../club/timezones';
import { useClub } from '../hub/club';
import { format, t } from '../i18n';
import { shortMeetingDate } from '../meetings/datetime';
import { PopupLink } from '../popups/PopupLink';
import { QueryStatus } from '../popups/QueryStatus';
import { EmptyState } from '../ui';
import { cx } from '../ui/cx';
import { achievementIcons } from './achievementIconPaths';
import { pictograms } from '../ui/iconPaths';
import './profile.css';
import {
  showcaseGroups,
  unlockedCount,
  itemState,
  usePlayerAchievements,
  type ShowcaseItem,
} from './achievements';

const text = t.profile.achievements;

/**
 * Odznaka osiągnięcia: kółko 44. Odblokowana jest kolorowa
 * (bursztyn z białą ikoną), nieodblokowana wyszarzona. Dekoracyjna: stan podaje tekst.
 */
export function AchievementBadge({
  icon,
  unlocked,
  size = 44,
}: {
  readonly icon: string;
  readonly unlocked: boolean;
  readonly size?: 44 | 56;
}) {
  return (
    <span
      className={cx(
        'achievement-badge',
        unlocked ? 'achievement-badge--unlocked' : 'achievement-badge--locked',
        size === 56 && 'achievement-badge--large',
      )}
      aria-hidden="true"
    >
      <AchievementIcon name={icon} size={size === 56 ? 26 : 20} />
    </span>
  );
}

/** Pasek postępu „7/10” (dekoracyjny: wartość podaje tekst obok). */
export function ProgressBar({ value, goal }: { readonly value: number; readonly goal: number }) {
  return (
    <span className="achievement-progress" aria-hidden="true">
      <span
        className="achievement-progress__fill"
        style={{ width: `${Math.round((value * 100) / goal)}%` }}
      />
    </span>
  );
}

/**
 * Gablota osiągnięć w profilu: cały katalog w grupach. Odblokowane odznaki
 * są kolorowe z datą spotkania, nieodblokowane wyszarzone z postępem tam, gdzie warunek ma
 * licznik. Każda odznaka otwiera szczegóły z warunkiem (`profile/<id>/achievement/<id>`).
 * Gracz bez odblokowań widzi pusty stan nad wyszarzonym katalogiem, a usunięty członek swoją
 * gablotę z historii. Zapis i usunięcie partii odświeżają gablotę.
 */
export function AchievementShowcase({ profileId }: { readonly profileId: string }) {
  const { client } = useAuth();
  const achievements = usePlayerAchievements(client, profileId);
  const club = useClub(client);
  const timeZone = club.data?.timezone ?? FALLBACK_TIMEZONE;
  const headingId = `${profileId}-achievements`;
  const data = achievements.data;
  const total = ACHIEVEMENTS.length;
  const unlocked = data ? unlockedCount(data) : 0;

  return (
    <section className="profile__section" aria-labelledby={headingId}>
      <div className="showcase__head">
        <h3 id={headingId} className="profile__section-title">
          {text.title}
        </h3>
        {data ? (
          <span className="showcase__count">
            <span aria-hidden="true">{format(text.count, { n: unlocked, total })}</span>
            <span className="sr-only">{format(text.countLabel, { n: unlocked, total })}</span>
          </span>
        ) : null}
      </div>
      {!data ? (
        <QueryStatus isError={achievements.isError} onRetry={() => void achievements.refetch()} />
      ) : (
        <>
          {unlocked === 0 ? (
            <EmptyState icon="trophy" title={text.emptyTitle} helper={text.emptyHelper} />
          ) : null}
          {showcaseGroups(data).map((group) => (
            <div key={group.group} className="showcase__group">
              <h4 className="showcase__group-title">{group.title}</h4>
              <ul
                className="showcase__grid"
                aria-label={format(text.groupLabel, { group: group.title })}
              >
                {group.items.map((item) => (
                  <li key={item.achievement.id}>
                    <ShowcaseTile profileId={profileId} item={item} timeZone={timeZone} />
                  </li>
                ))}
              </ul>
            </div>
          ))}
        </>
      )}
    </section>
  );
}

function ShowcaseTile({
  profileId,
  item,
  timeZone,
}: {
  readonly profileId: string;
  readonly item: ShowcaseItem;
  readonly timeZone: string;
}) {
  const { achievement, unlock, progress } = item;
  const state = itemState(item, timeZone);
  return (
    <PopupLink
      to={{ kind: 'achievement', profileId, id: achievement.id }}
      className={cx('showcase-tile', !unlock && 'showcase-tile--locked')}
      aria-label={format(text.details, { name: achievement.name, state })}
      data-achievement={achievement.id}
      data-unlocked={unlock ? 'true' : 'false'}
    >
      <AchievementBadge icon={achievement.icon} unlocked={unlock !== null} />
      <span className="showcase-tile__name">{achievement.name}</span>
      {unlock ? (
        <span className="showcase-tile__meta">
          {shortMeetingDate(unlock.unlocked_at, timeZone)}
        </span>
      ) : progress ? (
        <span className="showcase-tile__progress">
          <ProgressBar {...progress} />
          <span className="showcase-tile__meta">{format(text.progress, progress)}</span>
        </span>
      ) : (
        <span className="showcase-tile__meta">{achievement.description}</span>
      )}
    </PopupLink>
  );
}

/** Ikona odznaki (dekoracyjna). Nieznana nazwa daje puchar, żeby gablota zawsze coś pokazała. */
export function AchievementIcon({
  name,
  size = 20,
}: {
  readonly name: string;
  readonly size?: number;
}) {
  return (
    <svg
      width={size}
      height={size}
      viewBox="0 0 16 16"
      fill="none"
      stroke="currentColor"
      strokeWidth={1.75}
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden="true"
      focusable="false"
    >
      {achievementIcons[name] ?? pictograms.trophy}
    </svg>
  );
}
