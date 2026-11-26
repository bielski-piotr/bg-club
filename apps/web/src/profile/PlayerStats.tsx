import { createMemo, createSignal, For, Show, useContext } from 'solid-js';
import { FALLBACK_TIMEZONE } from '../club/timezones';
import { format, formatNumber, plural, t } from '../i18n';
import { NO_FILTERS, type LeaderboardFilters } from '../leaderboard/filters';
import { shortMeetingDate } from '../meetings/datetime';
import { createClub } from '../club/clubData';
import { AuthContext } from '../auth/authContext';
import { GameCover } from '../games/GameCover';
import { FilterBar } from '../leaderboard/FilterBar';
import { PopupLink } from '../popups/PopupLink';
import { QueryBoundary } from '../popups/QueryStatus';
import { createQuery } from '../lib/query';
import { EmptyState, ListRow, Tray } from '../ui';
import {
  BEST_GAME_MIN_PLAYS,
  playerStatsQuery,
  winRate,
  type PlayerGame,
  type PlayerStats,
} from './playerStatsData';

const text = t.profile.stats;

/**
 * Statystyki gracza w profilu w grupach:
 * - **Statystyki profilu** z tymi samymi filtrami co ranking (zakres dat w strefie klubu i gry):
 *   spotkania, partie, wygrane, % wygranych;
 * - **Leaderboard** z całej historii: miejsce i punkty, miejsce i zwycięstwa, obecna i najwyższa
 *   seria;
 * - **Ulubione** z całej historii: ulubiona (najwięcej partii) i najlepsza gra;
 * - **Ostatnie spotkania**: 5 ostatnich spotkań z partiami gracza z linkami.
 * Usunięty członek ma te same statystyki z historii, tylko bez miejsc w rankingach.
 */
export function PlayerStatsSection(props: { readonly profileId: string }) {
  const auth = useContext(AuthContext);
  const [filters, setFilters] = createSignal<LeaderboardFilters>(NO_FILTERS);
  const stats = createQuery(() => playerStatsQuery(auth.client, props.profileId, filters()));
  const club = createClub();
  const timeZone = () => club.current()?.timezone ?? FALLBACK_TIMEZONE;
  const headingId = () => `${props.profileId}-stats`;
  /** Statystyki z historią partii; czekają na dane pod `<QueryBoundary>`. */
  const withHistory = () => {
    const data = stats();
    return data && data.recent_meetings.length > 0 ? data : undefined;
  };

  return (
    <section class="profile__section" aria-labelledby={headingId()}>
      <h3 id={headingId()} class="profile__section-title">
        {text.title}
      </h3>
      <QueryBoundary>
        <Show
          when={withHistory()}
          fallback={
            // Bez żadnej partii w historii filtry nie mają sensu: zostaje stan oczekiwania.
            <EmptyState icon="trophy" title={text.pendingTitle} helper={text.pendingHelper} />
          }
        >
          {(data) => (
            <StatsBody
              headingId={headingId()}
              stats={data()}
              timeZone={timeZone()}
              filters={filters()}
              onFilters={setFilters}
            />
          )}
        </Show>
      </QueryBoundary>
    </section>
  );
}

function StatsBody(props: {
  readonly headingId: string;
  readonly stats: PlayerStats;
  readonly timeZone: string;
  readonly filters: LeaderboardFilters;
  readonly onFilters: (filters: LeaderboardFilters) => void;
}) {
  const tiles = createMemo(() => {
    const stats = props.stats;
    const rate = winRate(stats.wins, stats.plays);
    return [
      [text.meetings, stats.meetings],
      [text.plays, stats.plays],
      [text.wins, stats.wins],
      [text.winRate, rate === null ? text.none : format(text.percent, { n: rate })],
    ] as const;
  });
  const leaderboard = createMemo(() => {
    const stats = props.stats;
    return [
      { label: text.pointsPlace, place: stats.places.points },
      { label: text.points, value: formatNumber(stats.points) },
      { label: text.winsPlace, place: stats.places.wins },
      { label: text.winsTotal, value: stats.wins_total },
      { label: text.streakCurrent, value: stats.streak_current },
      { label: text.streakRecord, value: stats.streak_record },
    ];
  });
  const profileHeading = () => `${props.headingId}-profile`;
  const leaderboardHeading = () => `${props.headingId}-leaderboard`;
  const favoritesHeading = () => `${props.headingId}-favorites`;
  return (
    <>
      <div class="player-stats__group">
        <h4 id={profileHeading()} class="player-stats__subhead">
          {text.profileTitle}
        </h4>
        <FilterBar
          filters={props.filters}
          onChange={(next) => props.onFilters(next)}
          label={text.filtersLabel}
        />
        <Show
          when={props.stats.plays > 0}
          fallback={
            <EmptyState
              icon="calendar"
              title={text.emptyFilteredTitle}
              helper={text.emptyFilteredHelper}
            />
          }
        >
          <dl class="player-stats" aria-labelledby={profileHeading()}>
            <For each={tiles()}>
              {([label, value]) => (
                <div class="player-stats__tile">
                  <dt class="player-stats__label">{label}</dt>
                  <dd class="player-stats__value">{value}</dd>
                </div>
              )}
            </For>
          </dl>
        </Show>
      </div>

      <div class="player-stats__group">
        <div class="player-stats__head">
          <h4 id={leaderboardHeading()} class="player-stats__subhead">
            {text.leaderboardTitle}
          </h4>
          <span class="player-stats__hint">{text.leaderboardHint}</span>
        </div>
        <dl class="player-stats player-stats--pairs" aria-label={text.leaderboardLabel}>
          <For each={leaderboard()}>
            {(row) => (
              <div class="player-stats__tile">
                <dt class="player-stats__label">{row.label}</dt>
                <dd class="player-stats__value">
                  {'place' in row ? <Place place={row.place ?? null} /> : row.value}
                </dd>
              </div>
            )}
          </For>
        </dl>
      </div>

      <div class="player-stats__group">
        <div class="player-stats__head">
          <h4 id={favoritesHeading()} class="player-stats__subhead">
            {text.favoritesTitle}
          </h4>
          <span class="player-stats__hint">{text.leaderboardHint}</span>
        </div>
        <div class="player-stats__games" role="group" aria-label={text.favoritesLabel}>
          <GameTile label={text.favoriteGame} game={props.stats.favorite_game} empty={text.none} />
          <GameTile
            label={text.bestGame}
            game={props.stats.best_game}
            empty={format(text.bestGameEmpty, { n: BEST_GAME_MIN_PLAYS })}
            showRate
          />
        </div>
      </div>

      <div class="player-stats__group">
        <h4 class="player-stats__subhead">{text.recentTitle}</h4>
        <Tray label={text.recentTitle} class="player-stats__recent">
          <For each={props.stats.recent_meetings} keyed={(meeting) => meeting.meeting_id}>
            {(meeting) => {
              const date = () => shortMeetingDate(meeting().starts_at, props.timeZone);
              return (
                <ListRow
                  title={
                    <PopupLink
                      to={{ kind: 'meeting', id: meeting().meeting_id }}
                      class="player-stats__meeting"
                      aria-label={format(text.meetingLink, {
                        title: meeting().title,
                        date: date(),
                      })}
                    >
                      {meeting().title}
                    </PopupLink>
                  }
                  meta={format(text.recentMeta, {
                    date: date(),
                    plays: plural(meeting().plays, text.playsCount),
                    wins: plural(meeting().wins, text.winsCount),
                  })}
                  trailing={
                    <span class="score">
                      {formatNumber(meeting().points)}
                      <span class="score__unit">{text.pointsUnit}</span>
                    </span>
                  }
                />
              );
            }}
          </For>
        </Tray>
      </div>
    </>
  );
}

function Place(props: { readonly place: number | null }) {
  return (
    <Show
      when={props.place !== null}
      fallback={
        <>
          <span aria-hidden="true">–</span>
          <span class="sr-only">{text.noPlace}</span>
        </>
      }
    >
      {format(text.place, { place: props.place ?? 0 })}
    </Show>
  );
}

function GameTile(props: {
  readonly label: string;
  readonly game: PlayerGame | null;
  readonly empty: string;
  readonly showRate?: boolean;
}) {
  return (
    <div class="player-stats__tile player-stats__tile--game">
      <Show when={props.game}>
        {(game) => (
          <GameCover
            id={game().game_id}
            title={game().title}
            coverPath={game().cover_path}
            size="thumb"
          />
        )}
      </Show>
      <span class="player-stats__game-text">
        <span class="player-stats__label">{props.label}</span>
        <Show when={props.game} fallback={<span class="player-stats__sub">{props.empty}</span>}>
          {(game) => (
            <>
              <PopupLink to={{ kind: 'game', id: game().game_id }} class="player-stats__game">
                {game().title}
              </PopupLink>
              <span class="player-stats__sub">
                {props.showRate
                  ? format(text.bestGameMeta, {
                      rate: winRate(game().wins, game().plays) ?? 0,
                      plays: plural(game().plays, text.playsCount),
                    })
                  : format(text.favoriteGameMeta, {
                      plays: plural(game().plays, text.playsCount),
                      wins: plural(game().wins, text.winsCount),
                    })}
              </span>
            </>
          )}
        </Show>
      </span>
    </div>
  );
}
