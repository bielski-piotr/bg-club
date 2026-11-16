import { useState } from 'react';
import { useAuth } from '../auth/authContext';
import { FALLBACK_TIMEZONE } from '../club/timezones';
import { useClub } from '../hub/club';
import { format, plural, t } from '../i18n';
import { filterYear, yearFilterValues, type YearFilter } from '../leaderboard/leaderboard';
import { shortMeetingDate } from '../meetings/datetime';
import { PopupLink } from '../popups/PopupLink';
import { QueryStatus } from '../popups/QueryStatus';
import { EmptyState, ListRow, Select, Tray, type SelectOption } from '../ui';
import {
  BEST_GAME_MIN_PLAYS,
  usePlayerStats,
  winRate,
  type PlayerGame,
  type PlayerStats,
} from './playerStatsData';

const text = t.profile.stats;

/**
 * Statystyki gracza w profilu (PRD STAT-1–STAT-3, USR-4, DS „Profil / Popup”, „Profil / Filtr
 * roku”): liczniki w kafelkach (DS „Stat tile”), miejsca w trzech rankingach, ulubiona i najlepsza
 * gra oraz ostatnie partie z linkami do spotkań. Filtr roku działa jak w rankingu („Cała
 * historia” albo rok w strefie klubu). Usunięty członek ma te same statystyki z historii, tylko
 * bez miejsc w rankingach (MEM-5, LB-7).
 */
export function PlayerStatsSection({ profileId }: { readonly profileId: string }) {
  const { client } = useAuth();
  const [year, setYear] = useState<YearFilter>('all');
  const stats = usePlayerStats(client, profileId, filterYear(year));
  const club = useClub(client);
  const timeZone = club.data?.timezone ?? FALLBACK_TIMEZONE;
  const headingId = `${profileId}-stats`;
  const data = stats.data;
  // Ostatnia znana lista lat: filtr zostaje widoczny także podczas wczytywania albo po błędzie
  // nowego roku, więc zawsze można wrócić do całej historii.
  const [years, setYears] = useState<readonly number[]>([]);
  if (data && data.years !== years) setYears(data.years);
  // Bez żadnej partii w historii filtr nie ma sensu: zostaje stan oczekiwania.
  const showFilter = years.length > 0 || year !== 'all';
  const options: SelectOption<YearFilter>[] = yearFilterValues(years, year).map((value) => ({
    value,
    label: value === 'all' ? t.leaderboard.allTime : value,
  }));

  return (
    <section className="profile__section" aria-labelledby={headingId}>
      <div className="player-stats__head">
        <h3 id={headingId} className="profile__section-title">
          {text.title}
        </h3>
        {showFilter ? (
          <Select
            label={text.yearLabel}
            hideLabel
            appearance="pill"
            leadingIcon="calendar"
            options={options}
            value={year}
            onChange={setYear}
          />
        ) : null}
      </div>
      {data === undefined ? (
        <QueryStatus isError={stats.isError} onRetry={() => void stats.refetch()} />
      ) : data === null || (data.plays === 0 && year === 'all') ? (
        <EmptyState icon="trophy" title={text.pendingTitle} helper={text.pendingHelper} />
      ) : data.plays === 0 ? (
        <EmptyState
          icon="calendar"
          title={format(text.emptyYearTitle, { year })}
          helper={text.emptyYearHelper}
        />
      ) : (
        <StatsBody stats={data} timeZone={timeZone} />
      )}
    </section>
  );
}

function StatsBody({
  stats,
  timeZone,
}: {
  readonly stats: PlayerStats;
  readonly timeZone: string;
}) {
  const rate = winRate(stats.wins, stats.plays);
  const tiles: readonly (readonly [string, string | number])[] = [
    [text.meetings, stats.meetings],
    [text.plays, stats.plays],
    [text.wins, stats.wins],
    [text.winRate, rate === null ? text.none : format(text.percent, { n: rate })],
    [text.points, stats.points],
    [text.streakRecord, stats.streak_record],
    [text.streakCurrent, stats.streak_current],
  ];
  const places: readonly (readonly [string, number | null])[] = [
    [t.leaderboard.tabs.points, stats.places.points],
    [t.leaderboard.tabs.wins, stats.places.wins],
    [t.leaderboard.tabs.streak, stats.places.streak],
  ];
  return (
    <>
      <dl className="player-stats" aria-label={text.countersLabel}>
        {tiles.map(([label, value]) => (
          <div key={label} className="player-stats__tile">
            <dt className="player-stats__label">{label}</dt>
            <dd className="player-stats__value">{value}</dd>
          </div>
        ))}
      </dl>
      <h4 className="player-stats__subhead">{text.placesTitle}</h4>
      <dl className="player-stats player-stats--places">
        {places.map(([label, place]) => (
          <div key={label} className="player-stats__tile">
            <dt className="player-stats__label">{label}</dt>
            <dd className="player-stats__value">
              {place === null ? (
                <>
                  <span aria-hidden="true">–</span>
                  <span className="sr-only">{text.noPlace}</span>
                </>
              ) : (
                format(text.place, { place })
              )}
            </dd>
          </div>
        ))}
      </dl>
      <div className="player-stats__games">
        <GameTile label={text.favoriteGame} game={stats.favorite_game} empty={text.none} />
        <GameTile
          label={text.bestGame}
          game={stats.best_game}
          empty={format(text.bestGameEmpty, { n: BEST_GAME_MIN_PLAYS })}
          showRate
        />
      </div>
      <h4 className="player-stats__subhead">{text.recentTitle}</h4>
      <Tray label={text.recentTitle} className="player-stats__recent">
        {stats.recent_plays.map((play) => {
          const date = shortMeetingDate(play.starts_at, timeZone);
          return (
            <ListRow
              key={play.play_id}
              leading={
                <span
                  className="rank"
                  aria-label={format(t.leaderboard.place, { place: play.place })}
                >
                  {play.place}
                </span>
              }
              title={play.game_title}
              meta={
                <PopupLink
                  to={{ kind: 'meeting', id: play.meeting_id }}
                  className="player-stats__meeting"
                  aria-label={format(text.meetingLink, { title: play.meeting_title, date })}
                >
                  {format(text.meetingMeta, { title: play.meeting_title, date })}
                </PopupLink>
              }
              trailing={
                <span className="score">
                  {play.points}
                  <span className="score__unit">{text.pointsUnit}</span>
                </span>
              }
            />
          );
        })}
      </Tray>
    </>
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
    </div>
  );
}
