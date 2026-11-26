import { For, Match, Show, Switch, createMemo } from 'solid-js';
import { FALLBACK_TIMEZONE } from '../club/timezones';
import { format, plural, t } from '../i18n';
import type { Profile } from '../profile/profileQueries';
import { createClub } from '../club/clubData';
import { PopupLink } from '../popups/PopupLink';
import { createAllProfiles } from '../profile/profiles';
import { Banner, Button, Card, EmptyState, Icon, Skeleton, Spinner } from '../ui';
import { shortDayLabel, weekdayTime } from './calendar';
import { longMeetingDate, todayIn } from './datetime';
import { createTimeline } from './meetingData';
import { MiniDateTile, WinnersLine } from './MeetingParts';
import type { MeetingOverview, Timeline } from './overview';
import './meetings.css';
import './calendar.css';

/**
 * Timeline (MTG-3, DS §15.1): najwyżej 2 najbliższe nadchodzące spotkania (od dalszego), divider
 * „Dziś” i najwyżej 4 ostatnie zakończone (od najnowszego), z datami w strefie klubu (NFR-10).
 * Zakończone mają liczbę partii i zwycięzców. Wiersz otwiera popup spotkania, a „Zobacz więcej”
 * kalendarz. Bez spotkań: pusty stan bez CTA (planowanie startuje z widżetu Spotkanie).
 */
export function TimelineWidget() {
  const timeline = createTimeline();
  const club = createClub();
  const profiles = createAllProfiles();
  const timeZone = () => club().data?.timezone ?? FALLBACK_TIMEZONE;
  const data = () => timeline().data;
  const empty = () => {
    const current = data();
    return current !== undefined && current.upcoming.length === 0 && current.finished.length === 0;
  };
  // Profile są potrzebne do zwycięzców; dane z cache'u mają pierwszeństwo przed błędem odświeżania.
  const failed = () => (timeline().isError && !data()) || (profiles().isError && !profiles().data);

  return (
    <Card
      title={t.hub.timeline.title}
      action={
        <Show when={data() && !empty()}>
          <PopupLink
            to={{ kind: 'calendar' }}
            class="text-link"
            aria-label={t.hub.timeline.seeMore}
          >
            <span>{t.ui.seeMore}</span>
            <Icon name="chevron-right" />
          </PopupLink>
        </Show>
      }
    >
      <Switch>
        <Match when={failed()}>
          <Banner
            variant="error"
            action={
              <Button
                size="sm"
                variant="secondary"
                icon="refresh"
                onClick={() => {
                  if (timeline().isError) void timeline().refetch();
                  if (profiles().isError) void profiles().refetch();
                }}
              >
                {t.hub.retry}
              </Button>
            }
          >
            {t.hub.loadError}
          </Banner>
        </Match>
        <Match when={!data() || (!empty() && (club().isPending || !profiles().data))}>
          <div class="members-widget__loading">
            <Skeleton width={240} height={48} radius={14} />
            <Spinner label={t.hub.timeline.loading} class="sr-only" />
          </div>
        </Match>
        <Match when={empty()}>
          <EmptyState
            icon="clock"
            title={t.hub.timeline.emptyTitle}
            helper={t.hub.timeline.emptyHelper}
          />
        </Match>
        <Match when={data()}>
          {(shown) => (
            <TimelineList timeline={shown()} timeZone={timeZone()} profiles={profiles().data} />
          )}
        </Match>
      </Switch>
    </Card>
  );
}

function TimelineList(props: {
  readonly timeline: Timeline;
  readonly timeZone: string;
  readonly profiles: ReadonlyMap<string, Profile> | undefined;
}) {
  const today = createMemo(() => todayIn(props.timeZone));
  const last = createMemo(() =>
    props.timeline.finished.length === 0 ? 'divider' : props.timeline.finished.at(-1)?.id,
  );
  return (
    <ol class="timeline" aria-label={t.hub.timeline.listLabel}>
      <For each={props.timeline.upcoming} keyed={(meeting) => meeting.id}>
        {(meeting) => <TimelineRow meeting={meeting()} timeZone={props.timeZone} last={false} />}
      </For>
      <li class={last() === 'divider' ? 'timeline__row timeline__row--last' : 'timeline__row'}>
        <span class="timeline__rail" aria-hidden="true">
          <span class="timeline__today-dot" />
          <span class="timeline__connector" />
        </span>
        <span class="timeline__divider">
          <span class="timeline__divider-label">
            {format(t.hub.timeline.today, { date: shortDayLabel(today()) })}
          </span>
          <span class="timeline__hairline" aria-hidden="true" />
        </span>
      </li>
      <For each={props.timeline.finished} keyed={(meeting) => meeting.id}>
        {(meeting) => (
          <TimelineRow
            meeting={meeting()}
            timeZone={props.timeZone}
            last={meeting().id === last()}
            profiles={props.profiles}
          />
        )}
      </For>
    </ol>
  );
}

function TimelineRow(props: {
  readonly meeting: MeetingOverview;
  readonly timeZone: string;
  readonly last: boolean;
  readonly profiles?: ReadonlyMap<string, Profile> | undefined;
}) {
  const finished = () => props.meeting.status === 'finished';
  const meta = () => {
    const people = plural(props.meeting.participants.length, t.hub.meeting.participants);
    return finished()
      ? `${people} · ${plural(props.meeting.playCount, t.hub.timeline.plays)}`
      : `${weekdayTime(props.meeting.starts_at, props.timeZone)} · ${people}`;
  };
  return (
    <li class={props.last ? 'timeline__row timeline__row--last' : 'timeline__row'}>
      <PopupLink to={{ kind: 'meeting', id: props.meeting.id }} class="timeline__link">
        <span class="timeline__rail">
          <MiniDateTile meeting={props.meeting} timeZone={props.timeZone} />
          <span class="timeline__connector" aria-hidden="true" />
        </span>
        <span class="timeline__content">
          <span class="timeline__title">{props.meeting.title}</span>
          <span class="sr-only">{longMeetingDate(props.meeting.starts_at, props.timeZone)}</span>
          <span class="timeline__meta">{meta()}</span>
          <Show when={finished()}>
            <WinnersLine
              winners={props.meeting.winners}
              profiles={props.profiles}
              class="timeline__winners"
            />
          </Show>
        </span>
        <span class="timeline__chevron" aria-hidden="true">
          <Icon name="chevron-right" />
        </span>
      </PopupLink>
    </li>
  );
}
