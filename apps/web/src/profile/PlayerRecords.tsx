import {
  createMemo,
  createSignal,
  createUniqueId,
  For,
  Match,
  Show,
  Switch,
  useContext,
} from 'solid-js';
import { FALLBACK_TIMEZONE } from '../club/timezones';
import { formatScore } from '../games/gameStatsData';
import { format, t } from '../i18n';
import { NO_FILTERS } from '../leaderboard/filters';
import { shortMeetingDate } from '../meetings/datetime';
import { createClub } from '../club/clubData';
import { AuthContext } from '../auth/authContext';
import { GameCover } from '../games/GameCover';
import { PopupLink } from '../popups/PopupLink';
import { QueryBoundary } from '../popups/QueryStatus';
import { createQuery } from '../lib/query';
import {
  createDebounced,
  EmptyState,
  Icon,
  normalizeSearch,
  SEARCH_DELAY_MS,
  SearchField,
} from '../ui';
import { playerRecordsQuery, type PlayerRecord } from './playerRecordsData';
import { SectionSkeleton } from './SectionSkeleton';

const text = t.profile.records;

/**
 * Records section: every base game of the collection with its cover and the player's best value
 * of the deciding category (like the game record) from the whole history, searched by title
 * (after a short pause in typing). A game without a result shows „–”; a record equal to the club
 * record gets the club stamp on the cover. Every card has the same size, with or without
 * a result, a meeting or expansions.
 */
export function PlayerRecordsSection(props: { readonly profileId: string }) {
  const auth = useContext(AuthContext);
  const records = createQuery(() => playerRecordsQuery(auth.client, props.profileId, NO_FILTERS));
  const club = createClub();
  const timeZone = () => club.current()?.timezone ?? FALLBACK_TIMEZONE;
  const [query, setQuery] = createSignal('');
  const needle = createDebounced(() => normalizeSearch(query()), SEARCH_DELAY_MS);
  const shown = createMemo(() => {
    const value = needle();
    const all = records();
    return value === '' ? all : all.filter((r) => normalizeSearch(r.title).includes(value));
  });

  return (
    <div class="profile-tab">
      <SearchField
        label={text.searchLabel}
        placeholder={text.searchPlaceholder}
        value={query()}
        onValueChange={setQuery}
        class="records__search"
      />
      <QueryBoundary loading={<SectionSkeleton />}>
        <Switch
          fallback={
            <ul class="records" aria-label={text.listLabel}>
              <For each={shown()} keyed={(record) => record.game_id}>
                {(record) => (
                  <li>
                    <RecordCard record={record()} timeZone={timeZone()} />
                  </li>
                )}
              </For>
            </ul>
          }
        >
          <Match when={records().length === 0}>
            <EmptyState icon="dice" title={text.noGamesTitle} helper={text.noGamesHelper} />
          </Match>
          <Match when={shown().length === 0}>
            <EmptyState
              icon="search"
              title={format(text.emptyTitle, { query: query().trim() })}
              helper={text.emptyHelper}
            />
          </Match>
        </Switch>
      </QueryBoundary>
    </div>
  );
}

function RecordCard(props: { readonly record: PlayerRecord; readonly timeZone: string }) {
  const played = () => props.record.value !== null;
  const expansions = () => props.record.expansions ?? [];
  return (
    <article
      class={['record', { 'record--empty': !played() }]}
      data-club-record={props.record.club_record ? 'true' : 'false'}
    >
      <div class="record__cover">
        <GameCover
          id={props.record.game_id}
          title={props.record.title}
          coverPath={props.record.cover_path}
          size="large"
        />
        <Show when={played() && props.record.club_record}>
          <ClubRecordStamp />
        </Show>
        <Show when={played() ? props.record.meeting_id : null}>
          {(meetingId) => (
            <PopupLink
              to={{ kind: 'meeting', id: meetingId() }}
              class="icon-btn icon-btn--32 hoverable record__meeting"
              aria-label={format(text.meetingLink, {
                title: props.record.meeting_title ?? '',
                date: props.record.starts_at
                  ? shortMeetingDate(props.record.starts_at, props.timeZone)
                  : '',
              })}
              title={props.record.meeting_title ?? undefined}
            >
              <Icon name="calendar" />
            </PopupLink>
          )}
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
        <p class="record__value">{formatScore(props.record.value ?? 0)}</p>
      </Show>
      <p class="record__dir">
        <Show when={played() && props.record.dir === 'asc'}>{text.lowerBetter}</Show>
      </p>
      {/* The row is always there (empty without expansions), so every card has the same height. */}
      <div class="record__expansions">
        <Show when={played() && expansions().length > 0}>
          <span class="record__plus" aria-hidden="true">
            +
          </span>
          <ul class="record__expansion-list" aria-label={text.expansionsLabel}>
            <For each={expansions()} keyed={(expansion) => expansion.id}>
              {(expansion) => (
                <li class="record__expansion" tabindex={0}>
                  <GameCover
                    id={expansion().id}
                    title={expansion().title}
                    coverPath={expansion().cover_path}
                    size="thumb"
                  />
                  <span class="record__tooltip" role="tooltip">
                    {expansion().title}
                  </span>
                </li>
              )}
            </For>
          </ul>
        </Show>
      </div>
    </article>
  );
}

/**
 * Club record stamp pressed onto the cover: a red double ring, „REKORD KLUBU” along the top arc,
 * stars along the bottom and the trophy in the middle; everything else is transparent.
 */
function ClubRecordStamp() {
  // Only letters, digits and hyphens: the ids are used in `href` fragments.
  const id = `stamp-${createUniqueId().replace(/[^\w-]/g, '')}`;
  return (
    <svg class="record-stamp" viewBox="0 0 100 100" role="img" aria-label={text.clubRecord}>
      <defs>
        {/* Top arc left to right (text upright on the outside), bottom arc left to right. */}
        <path id={`${id}-top`} d="M15 50a35 35 0 0 1 70 0" />
        <path id={`${id}-bottom`} d="M10 50a40 40 0 0 0 80 0" />
      </defs>
      <circle cx="50" cy="50" r="47.5" class="record-stamp__line" />
      <circle cx="50" cy="50" r="24" class="record-stamp__line record-stamp__line--thin" />
      <text class="record-stamp__text" aria-hidden="true">
        <textPath href={`#${id}-top`} startOffset="50%">
          {text.stamp}
        </textPath>
      </text>
      <text class="record-stamp__stars" aria-hidden="true">
        <textPath href={`#${id}-bottom`} startOffset="50%">
          ★ ★ ★
        </textPath>
      </text>
      <Icon name="trophy" x={36} y={36} size={28} stroke-width={2.4} />
    </svg>
  );
}
