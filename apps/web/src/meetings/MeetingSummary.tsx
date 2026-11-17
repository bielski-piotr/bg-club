import { useAuth } from '../auth/authContext';
import { format, formatNumber, t } from '../i18n';
import { QueryStatus } from '../popups/QueryStatus';
import { ProfileAvatar } from '../profile/ProfileAvatar';
import { ProfileLink } from '../profile/ProfileLink';
import { fullName, useAllProfiles } from '../profile/profiles';
import { Badge, type Tone } from '../ui';
import { cx } from '../ui/cx';
import {
  pointsBreakdown,
  streakChange,
  streakLabel,
  useMeetingSummary,
  winsLabel,
  type StreakChange,
} from './summary';

const text = t.meetings.summary;

const STREAK_TONE: Record<StreakChange, Tone> = {
  up: 'success',
  broken: 'danger',
  unchanged: 'neutral',
};

/**
 * Podsumowanie leaderboardowe spotkania (VIEW-4, DS §15 „Meeting summary row”): dla każdego
 * gracza z zapisaną partią punkty z rozbiciem na gry, wygrane (za które gry) i zmiana serii.
 * Bez zapisanych partii sekcji nie ma (listę partii i jej pusty stan pokazuje sekcja „Partie”).
 */
export function MeetingSummarySection({ meetingId }: { readonly meetingId: string }) {
  const { client } = useAuth();
  const summary = useMeetingSummary(client, meetingId);
  const profiles = useAllProfiles(client);
  const headingId = `${meetingId}-summary`;
  // Sekcja pojawia się dopiero z danymi (albo błędem): spotkanie bez zapisanych partii nie ma
  // podsumowania, więc nagłówek z ładowaniem tylko by mignął.
  if (summary.data?.length === 0) return null;
  if (!summary.isError && !profiles.isError && (!summary.data || !profiles.data)) return null;
  return (
    <section className="meeting-view__section" aria-labelledby={headingId}>
      <div className="meeting-view__head-row">
        <h3 id={headingId} className="meeting-view__head">
          {text.title}
        </h3>
        <span className="meeting-view__note">{text.note}</span>
      </div>
      {!summary.data || !profiles.data ? (
        <QueryStatus
          isError={summary.isError || profiles.isError}
          onRetry={() => {
            if (summary.isError) void summary.refetch();
            if (profiles.isError) void profiles.refetch();
          }}
        />
      ) : (
        <ol className="tray meeting-summary" aria-label={text.label}>
          {summary.data.map((entry) => {
            const person = profiles.data.get(entry.profile_id);
            const name = person ? fullName(person) : t.meetings.plays.unknownPlayer;
            const wins = winsLabel(entry);
            return (
              <li
                key={entry.profile_id}
                className={cx('tray__item summary-row', entry.deleted && 'summary-row--muted')}
              >
                <span className="summary-row__place">
                  <span aria-hidden="true">{format(text.place, { n: entry.place })}</span>
                  <span className="sr-only">
                    {format(t.meetings.plays.placeLabel, { n: entry.place })}
                  </span>
                </span>
                {person ? (
                  <ProfileLink id={person.id} name={name}>
                    <ProfileAvatar profile={person} size={36} decorative />
                  </ProfileLink>
                ) : null}
                <span className="summary-row__body">
                  <span className="summary-row__head">
                    <span className="summary-row__name">{name}</span>
                    <span className="summary-row__points">
                      <span aria-hidden="true">
                        {formatNumber(entry.points)}{' '}
                        <span className="summary-row__unit">{text.points}</span>
                      </span>
                      <span className="sr-only">
                        {format(text.pointsLabel, { n: entry.points })}
                      </span>
                    </span>
                  </span>
                  <span className="summary-row__breakdown">{pointsBreakdown(entry.games)}</span>
                  <span className="summary-row__badges">
                    {wins ? <Badge tone="accent">{wins}</Badge> : null}
                    <Badge tone={STREAK_TONE[streakChange(entry)]}>{streakLabel(entry)}</Badge>
                  </span>
                </span>
              </li>
            );
          })}
        </ol>
      )}
    </section>
  );
}
