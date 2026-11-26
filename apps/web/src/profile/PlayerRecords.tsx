import { createMemo, createSignal, For, Match, Show, Switch, useContext } from 'solid-js';
import { FALLBACK_TIMEZONE } from '../club/timezones';
import { formatScore } from '../games/gameStatsData';
import { format, t } from '../i18n';
import { hasFilters, NO_FILTERS, type LeaderboardFilters } from '../leaderboard/filters';
import { shortMeetingDate } from '../meetings/datetime';
import { createClub } from '../club/clubData';
import { AuthContext } from '../auth/authContext';
import { GameCover } from '../games/GameCover';
import { FilterBar } from '../leaderboard/FilterBar';
import { PopupLink } from '../popups/PopupLink';
import { QueryStatus } from '../popups/QueryStatus';
import { createQuery } from '../lib/query';
import { EmptyState, Icon, Select, type SelectOption } from '../ui';
import {
  playerRecordsQuery,
  visibleRecords,
  type PlayerRecord,
  type RecordsView,
} from './playerRecordsData';

const text = t.profile.records;

const VIEWS: readonly RecordsView[] = ['all', 'played', 'club'];
const OPTIONS: readonly SelectOption<RecordsView>[] = VIEWS.map((value) => ({
  value,
  label: text.views[value],
}));

/**
 * Rekordy osobiste w profilu (PRD USR-4): każda gra kolekcji z okładką i najlepszym wynikiem
 * gracza w kategorii decydującej (jak rekord gry, GAME-11). Gra bez wyniku pokazuje „–”, a rekord
 * równy rekordowi klubu dostaje pieczątkę „Rekord klubu”. Filtry dat i gier jak w rankingu oraz
 * widok: wszystkie gry, tylko z wynikiem, tylko rekordy klubu.
 */
export function PlayerRecordsSection(props: { readonly profileId: string }) {
  const auth = useContext(AuthContext);
  const [filters, setFilters] = createSignal<LeaderboardFilters>(NO_FILTERS);
  const [view, setView] = createSignal<RecordsView>('all');
  const records = createQuery(() => playerRecordsQuery(auth.client, props.profileId, filters()));
  const club = createClub();
  const timeZone = () => club().data?.timezone ?? FALLBACK_TIMEZONE;
  const headingId = () => `${props.profileId}-records`;
  const shown = createMemo(() => {
    const data = records().data;
    return data ? visibleRecords(data, view()) : undefined;
  });
  const noGames = () => {
    const data = records().data;
    return data !== undefined && data.length === 0 && !hasFilters(filters());
  };

  return (
    <section class="profile__section" aria-labelledby={headingId()}>
      <div class="player-stats__head">
        <h3 id={headingId()} class="profile__section-title">
          {text.title}
        </h3>
        <Show when={!noGames()}>
          <Select
            label={text.viewLabel}
            hideLabel
            appearance="pill"
            leadingIcon="trophy"
            options={OPTIONS}
            value={view()}
            onChange={setView}
          />
        </Show>
      </div>
      <Show when={!noGames()}>
        <FilterBar filters={filters()} onChange={setFilters} label={text.filtersLabel} />
      </Show>
      <Switch>
        <Match when={shown() === undefined}>
          <QueryStatus isError={records().isError} onRetry={() => void records().refetch()} />
        </Match>
        <Match when={noGames()}>
          <EmptyState icon="dice" title={text.noGamesTitle} helper={text.noGamesHelper} />
        </Match>
        <Match when={shown()?.length === 0}>
          <EmptyState icon="trophy" title={text.emptyTitle} helper={text.emptyHelper} />
        </Match>
        <Match when={shown()}>
          {(list) => (
            <ul class="records" aria-label={text.listLabel}>
              <For each={list()} keyed={(record) => record.game_id}>
                {(record) => (
                  <li>
                    <RecordCard record={record()} timeZone={timeZone()} />
                  </li>
                )}
              </For>
            </ul>
          )}
        </Match>
      </Switch>
    </section>
  );
}

function RecordCard(props: { readonly record: PlayerRecord; readonly timeZone: string }) {
  const played = () => props.record.value !== null;
  const date = () =>
    props.record.starts_at ? shortMeetingDate(props.record.starts_at, props.timeZone) : null;
  const expansions = () => props.record.expansions ?? [];
  return (
    <article
      class={['record', { 'record--empty': !played(), 'record--club': props.record.club_record }]}
      data-game={props.record.game_id}
      data-club-record={props.record.club_record ? 'true' : 'false'}
    >
      <div class="record__cover">
        <GameCover
          id={props.record.game_id}
          title={props.record.title}
          coverPath={props.record.cover_path}
          size="large"
        />
        <Show when={props.record.club_record}>
          <span class="record__stamp">
            <Icon name="trophy" />
            {text.clubRecord}
          </span>
        </Show>
      </div>
      <PopupLink
        to={{ kind: 'game', id: props.record.game_id }}
        class="record__title"
        aria-label={format(text.gameLink, { title: props.record.title })}
      >
        {props.record.title}
      </PopupLink>
      <Show
        when={played()}
        fallback={
          <p class="record__value record__value--empty">
            <span aria-hidden="true">{text.noValueShort}</span>
            <span class="sr-only">{text.noValue}</span>
          </p>
        }
      >
        <p class="record__value">
          {formatScore(props.record.value ?? 0)}
          <Show when={props.record.dir === 'asc'}>
            <span class="record__dir">{text.lowerBetter}</span>
          </Show>
        </p>
      </Show>
      <Show when={played() && props.record.meeting_id && date()}>
        <PopupLink
          to={{ kind: 'meeting', id: props.record.meeting_id ?? '' }}
          class="record__meeting"
          aria-label={format(text.meetingLink, {
            title: props.record.meeting_title ?? '',
            date: date() ?? '',
          })}
        >
          {format(text.meetingMeta, {
            date: date() ?? '',
            title: props.record.meeting_title ?? '',
          })}
        </PopupLink>
      </Show>
      <Show when={played() && expansions().length > 0}>
        <p class="record__expansions">
          {format(text.expansions, {
            titles: expansions()
              .map((expansion) => expansion.title)
              .join(', '),
          })}
        </p>
      </Show>
    </article>
  );
}
