import { createUniqueId, For, Match, Show, Switch, useContext } from 'solid-js';
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
import { QueryBoundary } from '../popups/QueryStatus';
import { createQuery } from '../lib/query';
import { EmptyState, Icon } from '../ui';
import { playerRecordsQuery, type PlayerRecord } from './playerRecordsData';

const text = t.profile.records;

/**
 * Records tab: every base game of the collection with its cover and the player's best value of
 * the deciding category (like the game record), filtered by games only. A game without a result
 * shows „–”; a record equal to the club record gets the club stamp on the cover.
 */
export function PlayerRecordsSection(props: {
  readonly profileId: string;
  /** Only `games` is used: records are always from the whole history. */
  readonly filters: LeaderboardFilters;
  readonly onFilters: (filters: LeaderboardFilters) => void;
}) {
  const auth = useContext(AuthContext);
  const records = createQuery(() =>
    playerRecordsQuery(auth.client, props.profileId, { ...NO_FILTERS, games: props.filters.games }),
  );
  const club = createClub();
  const timeZone = () => club.current()?.timezone ?? FALLBACK_TIMEZONE;

  return (
    <div class="profile-tab">
      <FilterBar
        filters={props.filters}
        onChange={props.onFilters}
        label={text.filtersLabel}
        gamesOnly
      />
      <QueryBoundary>
        <Switch
          fallback={
            <ul class="records" aria-label={text.listLabel}>
              <For each={records()} keyed={(record) => record.game_id}>
                {(record) => (
                  <li>
                    <RecordCard record={record()} timeZone={timeZone()} />
                  </li>
                )}
              </For>
            </ul>
          }
        >
          <Match when={records().length === 0 && !hasFilters(props.filters)}>
            <EmptyState icon="dice" title={text.noGamesTitle} helper={text.noGamesHelper} />
          </Match>
          <Match when={records().length === 0}>
            <EmptyState icon="trophy" title={text.emptyTitle} helper={text.emptyHelper} />
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
        <p class="record__value">
          {formatScore(props.record.value ?? 0)}
          <Show when={props.record.dir === 'asc'}>
            <span class="record__dir">{text.lowerBetter}</span>
          </Show>
        </p>
      </Show>
      <Show when={played() && expansions().length > 0}>
        <div class="record__expansions">
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
        </div>
      </Show>
    </article>
  );
}

/**
 * Club record stamp pressed onto the cover: a red ring with the text around and the trophy in
 * the middle; everything else is transparent, and a noise mask wears the ink like a real stamp.
 */
function ClubRecordStamp() {
  const id = createUniqueId();
  // The text path is a full circle (radius 35): `textLength` spreads the text around it.
  const ringLength = 2 * Math.PI * 35;
  return (
    <svg class="record-stamp" viewBox="0 0 100 100" role="img" aria-label={text.clubRecord}>
      <defs>
        <path id={`${id}-ring`} d="M15 50a35 35 0 1 1 70 0a35 35 0 1 1 -70 0" />
        <filter id={`${id}-ink`}>
          <feTurbulence type="fractalNoise" baseFrequency="1.1" numOctaves="2" seed="7" />
          <feColorMatrix values="0 0 0 0 0 0 0 0 0 0 0 0 0 0 0 -1.3 0 0 0 1.35" />
          <feComposite in="SourceGraphic" operator="in" />
        </filter>
      </defs>
      <g filter={`url(#${id}-ink)`}>
        <circle cx="50" cy="50" r="46" class="record-stamp__line" />
        <circle cx="50" cy="50" r="25" class="record-stamp__line" />
        <text class="record-stamp__text" aria-hidden="true">
          <textPath
            href={`#${id}-ring`}
            // Solid's SVG types lack `textLength` and `lengthAdjust`: set them on the element.
            ref={(el) => {
              el.setAttribute('textLength', String(ringLength - 4));
              el.setAttribute('lengthAdjust', 'spacing');
            }}
          >
            {text.stamp}
          </textPath>
        </text>
        <Icon name="trophy" x={34} y={34} size={32} />
      </g>
    </svg>
  );
}
