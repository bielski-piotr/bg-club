import { useState, type ReactNode } from 'react';
import { useAuth } from '../auth/authContext';
import { FALLBACK_TIMEZONE } from '../club/timezones';
import { GameCover } from '../games/GameCover';
import { useClub } from '../hub/club';
import { format, formatNumber, plural, t } from '../i18n';
import { FilterBar } from '../leaderboard/FilterBar';
import { NO_FILTERS, type LeaderboardFilters } from '../leaderboard/filters';
import { shortMeetingDate } from '../meetings/datetime';
import { PopupLink } from '../popups/PopupLink';
import { QueryStatus } from '../popups/QueryStatus';
import { EmptyState, ListRow, Tray } from '../ui';
import {
  BEST_GAME_MIN_PLAYS,
  usePlayerStats,
  winRate,
  type PlayerGame,
  type PlayerStats,
} from './playerStatsData';

const text = t.profile.stats;

/**
 * Statystyki gracza w profilu (PRD STAT-1–STAT-3, USR-4, DS „Profil / Popup”) w grupach:
 * - **Statystyki profilu** z tymi samymi filtrami co ranking (zakres dat w strefie klubu i gry):
 *   spotkania, partie, wygrane, % wygranych;
 * - **Leaderboard** z całej historii: miejsce i punkty, miejsce i zwycięstwa, obecna i najwyższa
 *   seria;
 * - **Ulubione** z całej historii: ulubiona (najwięcej partii) i najlepsza gra;
 * - **Ostatnie spotkania**: 5 ostatnich spotkań z partiami gracza z linkami.
 * Usunięty członek ma te same statystyki z historii, tylko bez miejsc w rankingach (MEM-5, LB-7).
 */
export function PlayerStatsSection({ profileId }: { readonly profileId: string }) {
  const { client } = useAuth();
  const [filters, setFilters] = useState<LeaderboardFilters>(NO_FILTERS);
  const stats = usePlayerStats(client, profileId, filters);
  const club = useClub(client);
  const timeZone = club.data?.timezone ?? FALLBACK_TIMEZONE;
  const headingId = `${profileId}-stats`;
  const data = stats.data;

  return (
    <section className="profile__section" aria-labelledby={headingId}>
      <h3 id={headingId} className="profile__section-title">
        {text.title}
      </h3>
      {data === undefined ? (
        <QueryStatus isError={stats.isError} onRetry={() => void stats.refetch()} />
      ) : data === null || data.recent_meetings.length === 0 ? (
        // Bez żadnej partii w historii filtry nie mają sensu: zostaje stan oczekiwania.
        <EmptyState icon="trophy" title={text.pendingTitle} helper={text.pendingHelper} />
      ) : (
        <StatsBody
          headingId={headingId}
          stats={data}
          timeZone={timeZone}
          filters={filters}
          onFilters={setFilters}
        />
      )}
    </section>
  );
}

function StatsBody({
  headingId,
  stats,
  timeZone,
  filters,
  onFilters,
}: {
  readonly headingId: string;
  readonly stats: PlayerStats;
  readonly timeZone: string;
  readonly filters: LeaderboardFilters;
  readonly onFilters: (filters: LeaderboardFilters) => void;
}) {
  const rate = winRate(stats.wins, stats.plays);
  const tiles: readonly (readonly [string, ReactNode])[] = [
    [text.meetings, stats.meetings],
    [text.plays, stats.plays],
    [text.wins, stats.wins],
    [text.winRate, rate === null ? text.none : format(text.percent, { n: rate })],
  ];
  const leaderboard: readonly (readonly [string, ReactNode])[] = [
    [text.pointsPlace, <Place key="points" place={stats.places.points} />],
    [text.points, formatNumber(stats.points)],
    [text.winsPlace, <Place key="wins" place={stats.places.wins} />],
    [text.winsTotal, stats.wins_total],
    [text.streakCurrent, stats.streak_current],
    [text.streakRecord, stats.streak_record],
  ];
  const profileHeading = `${headingId}-profile`;
  const leaderboardHeading = `${headingId}-leaderboard`;
  const favoritesHeading = `${headingId}-favorites`;
  return (
    <>
      <div className="player-stats__group">
        <h4 id={profileHeading} className="player-stats__subhead">
          {text.profileTitle}
        </h4>
        <FilterBar filters={filters} onChange={onFilters} label={text.filtersLabel} />
        {stats.plays === 0 ? (
          <EmptyState
            icon="calendar"
            title={text.emptyFilteredTitle}
            helper={text.emptyFilteredHelper}
          />
        ) : (
          <dl className="player-stats" aria-labelledby={profileHeading}>
            {tiles.map(([label, value]) => (
              <div key={label} className="player-stats__tile">
                <dt className="player-stats__label">{label}</dt>
                <dd className="player-stats__value">{value}</dd>
              </div>
            ))}
          </dl>
        )}
      </div>

      <div className="player-stats__group">
        <div className="player-stats__head">
          <h4 id={leaderboardHeading} className="player-stats__subhead">
            {text.leaderboardTitle}
          </h4>
          <span className="player-stats__hint">{text.leaderboardHint}</span>
        </div>
        <dl className="player-stats player-stats--pairs" aria-label={text.leaderboardLabel}>
          {leaderboard.map(([label, value]) => (
            <div key={label} className="player-stats__tile">
              <dt className="player-stats__label">{label}</dt>
              <dd className="player-stats__value">{value}</dd>
            </div>
          ))}
        </dl>
      </div>

      <div className="player-stats__group">
        <div className="player-stats__head">
          <h4 id={favoritesHeading} className="player-stats__subhead">
            {text.favoritesTitle}
          </h4>
          <span className="player-stats__hint">{text.leaderboardHint}</span>
        </div>
        <div className="player-stats__games" role="group" aria-label={text.favoritesLabel}>
          <GameTile label={text.favoriteGame} game={stats.favorite_game} empty={text.none} />
          <GameTile
            label={text.bestGame}
            game={stats.best_game}
            empty={format(text.bestGameEmpty, { n: BEST_GAME_MIN_PLAYS })}
            showRate
          />
        </div>
      </div>

      <div className="player-stats__group">
        <h4 className="player-stats__subhead">{text.recentTitle}</h4>
        <Tray label={text.recentTitle} className="player-stats__recent">
          {stats.recent_meetings.map((meeting) => {
            const date = shortMeetingDate(meeting.starts_at, timeZone);
            return (
              <ListRow
                key={meeting.meeting_id}
                title={
                  <PopupLink
                    to={{ kind: 'meeting', id: meeting.meeting_id }}
                    className="player-stats__meeting"
                    aria-label={format(text.meetingLink, { title: meeting.title, date })}
                  >
                    {meeting.title}
                  </PopupLink>
                }
                meta={format(text.recentMeta, {
                  date,
                  plays: plural(meeting.plays, text.playsCount),
                  wins: plural(meeting.wins, text.winsCount),
                })}
                trailing={
                  <span className="score">
                    {formatNumber(meeting.points)}
                    <span className="score__unit">{text.pointsUnit}</span>
                  </span>
                }
              />
            );
          })}
        </Tray>
      </div>
    </>
  );
}

function Place({ place }: { readonly place: number | null }) {
  return place === null ? (
    <>
      <span aria-hidden="true">–</span>
      <span className="sr-only">{text.noPlace}</span>
    </>
  ) : (
    format(text.place, { place })
  );
}

function GameTile({
  label,
  game,
  empty,
  showRate = false,
}: {
  readonly label: string;
  readonly game: PlayerGame | null;
  readonly empty: string;
  readonly showRate?: boolean;
}) {
  return (
    <div className="player-stats__tile player-stats__tile--game">
      {game ? (
        <GameCover id={game.game_id} title={game.title} coverPath={game.cover_path} size="thumb" />
      ) : null}
      <span className="player-stats__game-text">
        <span className="player-stats__label">{label}</span>
        {game ? (
          <>
            <PopupLink to={{ kind: 'game', id: game.game_id }} className="player-stats__game">
              {game.title}
            </PopupLink>
            <span className="player-stats__sub">
              {showRate
                ? format(text.bestGameMeta, {
                    rate: winRate(game.wins, game.plays) ?? 0,
                    plays: plural(game.plays, text.playsCount),
                  })
                : format(text.favoriteGameMeta, {
                    plays: plural(game.plays, text.playsCount),
                    wins: plural(game.wins, text.winsCount),
                  })}
            </span>
          </>
        ) : (
          <span className="player-stats__sub">{empty}</span>
        )}
      </span>
    </div>
  );
}
