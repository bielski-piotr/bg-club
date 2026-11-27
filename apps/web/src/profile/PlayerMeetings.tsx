import { For, Show, useContext } from 'solid-js';
import { AuthContext } from '../auth/authContext';
import { createClub } from '../club/clubData';
import { FALLBACK_TIMEZONE } from '../club/timezones';
import { format, formatNumber, plural, t } from '../i18n';
import { FilterBar } from '../leaderboard/FilterBar';
import { hasFilters, type LeaderboardFilters } from '../leaderboard/filters';
import { createQuery } from '../lib/query';
import { dateTile, longMeetingDate } from '../meetings/datetime';
import { PopupLink } from '../popups/PopupLink';
import { QueryBoundary } from '../popups/QueryStatus';
import { createChunks, EmptyState, ShowMore } from '../ui';
import { playerMeetingsQuery, type PlayerMeeting } from './playerMeetingsData';
import { SectionSkeleton } from './SectionSkeleton';
import '../meetings/meetings.css';

const text = t.profile.meetings;

/**
 * Meetings section: meetings where the player has saved plays, newest first, filtered by date range
 * and by the games played in them. Each row opens the meeting.
 */
export function PlayerMeetingsSection(props: {
  readonly profileId: string;
  readonly filters: LeaderboardFilters;
  readonly onFilters: (filters: LeaderboardFilters) => void;
}) {
  const auth = useContext(AuthContext);
  const meetings = createQuery(() =>
    playerMeetingsQuery(auth.client, props.profileId, props.filters),
  );
  const club = createClub();
  const timeZone = () => club.current()?.timezone ?? FALLBACK_TIMEZONE;
  const chunks = createChunks(
    () => meetings(),
    () => props.filters,
  );
  return (
    <div class="profile-tab">
      <FilterBar filters={props.filters} onChange={props.onFilters} label={text.filtersLabel} />
      <QueryBoundary loading={<SectionSkeleton />}>
        <Show
          when={meetings().length > 0}
          fallback={
            <EmptyState
              icon="calendar"
              title={hasFilters(props.filters) ? text.emptyFilteredTitle : text.emptyTitle}
              helper={hasFilters(props.filters) ? text.emptyFilteredHelper : text.emptyHelper}
            />
          }
        >
          <ul class="player-meetings" aria-label={text.listLabel}>
            <For each={chunks.visible()} keyed={(meeting) => meeting.meeting_id}>
              {(meeting, index) => (
                <li class="player-meetings__item" data-chunk-start={chunks.chunkStart(index())}>
                  <MeetingRow meeting={meeting()} timeZone={timeZone()} />
                </li>
              )}
            </For>
          </ul>
          <ShowMore hidden={chunks.hidden()} onClick={chunks.showMore} />
        </Show>
      </QueryBoundary>
    </div>
  );
}

/** The meeting (date, title, plays · wins) and, in its own tile, the points scored in it. */
function MeetingRow(props: { readonly meeting: PlayerMeeting; readonly timeZone: string }) {
  const tile = () => dateTile(props.meeting.starts_at, props.timeZone);
  return (
    <>
      <PopupLink to={{ kind: 'meeting', id: props.meeting.meeting_id }} class="player-meeting">
        <span class="meeting-tile" aria-hidden="true">
          <span class="meeting-tile__month">{tile().month}</span>
          <span class="meeting-tile__day">{tile().day}</span>
        </span>
        <span class="player-meeting__text">
          <span class="player-meeting__title">{props.meeting.title}</span>
          <span class="sr-only">{longMeetingDate(props.meeting.starts_at, props.timeZone)}</span>
          <span class="player-meeting__meta">
            {format(text.meta, {
              plays: plural(props.meeting.plays, t.profile.stats.playsCount),
              wins: plural(props.meeting.wins, t.profile.stats.winsCount),
            })}
          </span>
        </span>
      </PopupLink>
      <span class="score player-meeting__score">
        {formatNumber(props.meeting.points)}
        <span class="score__unit">{text.pointsUnit}</span>
      </span>
    </>
  );
}
