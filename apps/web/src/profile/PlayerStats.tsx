import { createMemo, For, Show, useContext } from 'solid-js';
import { ClubLogo } from '../club/ClubLogo';
import { createClub, createCoverUrl } from '../club/clubData';
import { format, formatNumber, plural, t } from '../i18n';
import { NO_FILTERS, type LeaderboardFilters } from '../leaderboard/filters';
import { AuthContext } from '../auth/authContext';
import { GameCover } from '../games/GameCover';
import { FilterBar } from '../leaderboard/FilterBar';
import { PopupLink } from '../popups/PopupLink';
import { QueryBoundary } from '../popups/QueryStatus';
import { createQuery } from '../lib/query';
import { EmptyState } from '../ui';
import { SectionSkeleton } from './SectionSkeleton';
import { playerStatsQuery, winRate, type PlayerGame, type PlayerStats } from './playerStatsData';

const text = t.profile.stats;

function createPlayerStats(profileId: () => string, filters: () => LeaderboardFilters) {
  const auth = useContext(AuthContext);
  return createQuery(() => playerStatsQuery(auth.client, profileId(), filters()));
}

/** Zero plays in the whole history: there is nothing to count yet. */
function PendingStats() {
  return <EmptyState icon="trophy" title={text.pendingTitle} helper={text.pendingHelper} />;
}

/**
 * Profile section: the club and the player's standing in it from the whole history: points and
 * place in the points leaderboard, wins and place in the wins leaderboard, the current and the
 * longest win streak. A removed member has no places.
 */
export function ProfileSummary(props: { readonly profileId: string }) {
  const stats = createPlayerStats(
    () => props.profileId,
    () => NO_FILTERS,
  );
  const club = createClub();
  const logo = createCoverUrl(() => club.current()?.logo_path ?? null);
  return (
    <div class="profile-summary">
      <Show when={club.current()}>
        {(current) => (
          <div class="profile-summary__club">
            <ClubLogo name={current().name} src={logo.current()} size={56} />
            <p class="profile-summary__club-name">{current().name}</p>
          </div>
        )}
      </Show>
      <QueryBoundary loading={<SectionSkeleton />}>
        <Show when={stats()}>
          {(data) => (
            <Show when={data().plays > 0} fallback={<PendingStats />}>
              <ul class="profile-summary__card" aria-label={text.summaryLabel}>
                <li class="profile-summary__row">
                  <span class="profile-summary__value">
                    <span class="sr-only">{text.pointsLabel}: </span>
                    {format(text.points, { n: formatNumber(data().points) })}
                  </span>
                  <Place place={data().places.points} />
                </li>
                <li class="profile-summary__row">
                  <span class="profile-summary__value">
                    <span class="sr-only">{text.winsLabel}: </span>
                    {plural(data().wins_total, text.winsCount)}
                  </span>
                  <Place place={data().places.wins} />
                </li>
                <li class="profile-summary__row">
                  <span class="profile-summary__value">
                    {format(text.streak, { n: data().streak_current })}
                  </span>
                  <span class="profile-summary__place">
                    {format(text.streakRecord, { n: data().streak_record })}
                  </span>
                </li>
              </ul>
            </Show>
          )}
        </Show>
      </QueryBoundary>
    </div>
  );
}

function Place(props: { readonly place: number | null }) {
  return (
    <span class="profile-summary__place">
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
    </span>
  );
}

/**
 * Stats section: the stats with the leaderboard filters (date range in the club's time zone and
 * games): meetings, plays, wins and win rate; next to them, from the whole history, the favorite
 * game (most plays) and the best game (most wins).
 */
export function PlayerStatsSection(props: {
  readonly profileId: string;
  readonly filters: LeaderboardFilters;
  readonly onFilters: (filters: LeaderboardFilters) => void;
}) {
  const stats = createPlayerStats(
    () => props.profileId,
    () => props.filters,
  );
  return (
    <div class="profile-tab">
      <FilterBar filters={props.filters} onChange={props.onFilters} label={text.filtersLabel} />
      <QueryBoundary loading={<SectionSkeleton />}>
        <Show when={stats()}>
          {(data) => (
            // Without a favorite game there is no play in the whole history yet.
            <Show when={data().favorite_game} fallback={<PendingStats />}>
              <Show
                when={data().plays > 0}
                fallback={
                  <EmptyState
                    icon="calendar"
                    title={text.emptyFilteredTitle}
                    helper={text.emptyFilteredHelper}
                  />
                }
              >
                <Counters stats={data()} />
              </Show>
              <section
                class="player-stats__favorites"
                aria-labelledby={`${props.profileId}-favorites`}
              >
                <h3 id={`${props.profileId}-favorites`} class="player-stats__subhead">
                  {text.favoritesTitle}
                </h3>
                <div class="player-stats__games">
                  <GameTile
                    label={text.favoriteGame}
                    game={data().favorite_game}
                    meta={(game) => plural(game.plays, text.playsCount)}
                  />
                  <GameTile
                    label={text.bestGame}
                    game={data().best_game}
                    meta={(game) => plural(game.wins, text.winsCount)}
                  />
                </div>
              </section>
            </Show>
          )}
        </Show>
      </QueryBoundary>
    </div>
  );
}

function Counters(props: { readonly stats: PlayerStats }) {
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
  return (
    <dl class="player-stats" aria-label={text.countersLabel}>
      <For each={tiles()}>
        {([label, value]) => (
          <div class="player-stats__tile">
            <dt class="player-stats__label">{label}</dt>
            <dd class="player-stats__value">{value}</dd>
          </div>
        )}
      </For>
    </dl>
  );
}
function GameTile(props: {
  readonly label: string;
  readonly game: PlayerGame | null;
  /** The one number shown under the title: plays of the favorite, wins of the best game. */
  readonly meta: (game: PlayerGame) => string;
}) {
  return (
    <Show
      when={props.game}
      fallback={
        <div class="player-game player-game--empty">
          <span class="player-stats__label">{props.label}</span>
          <span class="player-stats__sub">{text.none}</span>
        </div>
      }
    >
      {(game) => (
        // Opens the game popup for now; it will be replaced by the full game view.
        <PopupLink
          to={{ kind: 'game', id: game().game_id }}
          class="player-game"
          aria-label={format(text.gameLink, { label: props.label, title: game().title })}
        >
          <GameCover
            id={game().game_id}
            title={game().title}
            coverPath={game().cover_path}
            size="large"
            class="player-game__cover"
          />
          <span class="player-game__text">
            <span class="player-stats__label">{props.label}</span>
            <span class="player-game__title">{game().title}</span>
            <span class="player-stats__sub">{props.meta(game())}</span>
          </span>
        </PopupLink>
      )}
    </Show>
  );
}
