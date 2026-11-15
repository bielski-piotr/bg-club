import { useAuth } from '../auth/authContext';
import { format, plural, t } from '../i18n';
import { shortMeetingDate } from '../meetings/datetime';
import { PopupLink } from '../popups/PopupLink';
import { QueryStatus } from '../popups/QueryStatus';
import { ProfileAvatar } from '../profile/ProfileAvatar';
import { ProfileLink } from '../profile/ProfileLink';
import { fullName, useAllProfiles, type Profile } from '../profile/profiles';
import { EmptyState, Icon, ListRow, Tray } from '../ui';
import { formatScore, useGameStats, type GameRecord, type GameStats } from './gameStats';

const text = t.games.details.stats;

/**
 * Statystyki gry w szczegółach gry (GAME-10, GAME-11): liczba partii, data ostatniej partii,
 * najczęstszy zwycięzca, średni wynik zwycięzcy, rekord gry (wszyscy rekordziści przy równej
 * wartości, Q25; kto i kiedy, z linkiem do spotkania) i ranking graczy w grze (wygrane, punkty).
 */
export function GameStatsSection({
  gameId,
  title,
  timeZone,
}: {
  readonly gameId: string;
  readonly title: string;
  readonly timeZone: string;
}) {
  const { client } = useAuth();
  const stats = useGameStats(client, gameId);
  const profiles = useAllProfiles(client);
  const headingId = `${gameId}-stats`;
  return (
    <section className="meeting-view__section" aria-labelledby={headingId}>
      <div className="meeting-view__head-row">
        <h3 id={headingId} className="meeting-view__head">
          {text.title}
        </h3>
      </div>
      {stats.data === undefined || !profiles.data ? (
        <QueryStatus
          isError={stats.isError || profiles.isError}
          onRetry={() => {
            if (stats.isError) void stats.refetch();
            if (profiles.isError) void profiles.refetch();
          }}
        />
      ) : !stats.data || stats.data.play_count === 0 ? (
        <EmptyState icon="trophy" title={text.emptyTitle} helper={text.empty} />
      ) : (
        <StatsBody stats={stats.data} profiles={profiles.data} title={title} timeZone={timeZone} />
      )}
    </section>
  );
}

function StatsBody({
  stats,
  profiles,
  title,
  timeZone,
}: {
  readonly stats: GameStats;
  readonly profiles: ReadonlyMap<string, Profile>;
  readonly title: string;
  readonly timeZone: string;
}) {
  const name = (id: string) => {
    const person = profiles.get(id);
    return person ? fullName(person) : t.meetings.plays.unknownPlayer;
  };
  const topWins = stats.top_winners[0]?.wins ?? 0;
  return (
    <>
      <dl className="game-stats">
        <div className="game-stats__tile">
          <dt className="game-stats__label">{text.plays}</dt>
          <dd className="game-stats__value">{stats.play_count}</dd>
        </div>
        <div className="game-stats__tile">
          <dt className="game-stats__label">{text.lastPlay}</dt>
          <dd className="game-stats__value">
            {stats.last_played_at ? shortMeetingDate(stats.last_played_at, timeZone) : text.none}
          </dd>
        </div>
        <div className="game-stats__tile">
          <dt className="game-stats__label">{text.topWinner}</dt>
          <dd className="game-stats__value">
            {stats.top_winners.length > 0
              ? stats.top_winners.map((winner) => name(winner.profile_id)).join(', ')
              : text.none}
            {topWins > 0 ? (
              <span className="game-stats__sub game-stats__sub--block">
                {plural(topWins, text.topWins)}
              </span>
            ) : null}
          </dd>
        </div>
        <div className="game-stats__tile">
          <dt className="game-stats__label">{text.winnerAverage}</dt>
          <dd className="game-stats__value">
            {stats.winner_average !== null ? formatScore(stats.winner_average) : text.none}
          </dd>
        </div>
      </dl>
      <RecordBlock record={stats.record} profiles={profiles} timeZone={timeZone} />
      <h4 className="meeting-view__head">{text.ranking}</h4>
      <Tray label={format(text.rankingLabel, { title })}>
        {stats.ranking.map((entry) => {
          const person = profiles.get(entry.profile_id);
          const label = name(entry.profile_id);
          return (
            <ListRow
              key={entry.profile_id}
              muted={entry.deleted}
              leading={
                <>
                  <span className="rank">{entry.place}</span>
                  {person ? (
                    <ProfileLink id={person.id} name={label}>
                      <ProfileAvatar profile={person} size={36} decorative />
                    </ProfileLink>
                  ) : null}
                </>
              }
              title={entry.deleted ? `${label} ${text.removed}` : label}
              meta={format(text.rankingMeta, {
                plays: plural(entry.plays, text.rankingPlays),
                wins: plural(entry.wins, text.wins),
              })}
              trailing={
                <span className="score">
                  {entry.points}
                  <span className="score__unit">{text.points}</span>
                </span>
              }
            />
          );
        })}
      </Tray>
    </>
  );
}

function RecordBlock({
  record,
  profiles,
  timeZone,
}: {
  readonly record: GameRecord | null;
  readonly profiles: ReadonlyMap<string, Profile>;
  readonly timeZone: string;
}) {
  return (
    <div className="game-record">
      <span className="game-record__icon" aria-hidden="true">
        <Icon name="trophy" size={20} />
      </span>
      <div className="game-record__body">
        <span className="game-stats__label">{text.record}</span>
        {record ? (
          <>
            <p className="game-record__value">
              {formatScore(record.value)}
              {record.dir === 'asc' ? (
                <span className="game-record__dir">{text.recordAsc}</span>
              ) : null}
            </p>
            <ul className="game-record__holders">
              {record.holders.map((holder) => {
                const person = profiles.get(holder.profile_id);
                const name = person ? fullName(person) : t.meetings.plays.unknownPlayer;
                const date = shortMeetingDate(holder.starts_at, timeZone);
                return (
                  <li key={holder.profile_id} className="game-record__holder">
                    {person ? <ProfileAvatar profile={person} size={24} decorative /> : null}
                    <PopupLink
                      to={{ kind: 'meeting', id: holder.meeting_id }}
                      aria-label={format(text.recordMeeting, { name, date })}
                    >
                      {format(text.recordHolder, { name, date })}
                    </PopupLink>
                  </li>
                );
              })}
            </ul>
          </>
        ) : (
          <p className="game-stats__sub">{text.recordEmpty}</p>
        )}
      </div>
    </div>
  );
}
