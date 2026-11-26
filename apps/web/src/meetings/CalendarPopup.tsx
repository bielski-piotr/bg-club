/** @jsxImportSource @solidjs/web */
import {
  createMemo,
  createSignal,
  createUniqueId,
  For,
  Match,
  Show,
  Switch,
  untrack,
  useContext,
} from 'solid-js';
import { FALLBACK_TIMEZONE } from '../club/timezones';
import { format, plural, t } from '../i18n';
import { createClub } from '../solid/club';
import { PopupsContext } from '../solid/context';
import { PopupLink } from '../solid/popups/PopupLink';
import { PopupModal } from '../solid/popups/PopupModal';
import { QueryStatus } from '../solid/popups/QueryStatus';
import { Button, Icon, IconButton, Tray } from '../solid/ui';
import { ariaBool } from '../solid/ui/dom';
import {
  dayNumber,
  groupByDay,
  inMonth,
  longDayLabel,
  monthGrid,
  monthLabel,
  monthOf,
  shiftMonth,
  weekdayTime,
  type GridDay,
  type YearMonth,
} from './calendar';
import { localDateTime, longMeetingDate, todayIn } from './datetime';
import { createCalendarMonth } from './meetingData';
import { MeetingStatusChip, MiniDateTile } from './MeetingParts';
import type { MeetingOverview } from './overview';
import './calendar.css';

/**
 * Kalendarz spotkań (CAL-1…CAL-3, DS §15.1). Desktop: siatka miesiąca z chipami spotkań
 * w kolorach statusu. Telefon: kompaktowa siatka i agenda miesiąca (CAL-2). Dni i „dziś” liczą
 * się w strefie klubu (NFR-10). Administrator planuje przyciskiem w nagłówku albo klikając
 * pusty dzień od dziś (data wypełniona, CAL-3). Jedno okno na wczytywanie klubu i kalendarz.
 */
export function CalendarPopup(props: { readonly isAdmin: boolean }) {
  const popups = useContext(PopupsContext);
  const club = createClub();
  const text = t.meetings.calendar;

  return (
    <PopupModal
      title={text.title}
      width={880}
      class="calendar-modal"
      actions={
        <Show when={props.isAdmin}>
          <Button
            size="sm"
            icon="plus"
            aria-label={text.plan}
            onClick={() => popups.open({ kind: 'add-meeting' })}
          >
            <span class="calendar-plan__long">{text.plan}</span>
            <span class="calendar-plan__short">{text.planShort}</span>
          </Button>
        </Show>
      }
    >
      <Show
        when={!club().isPending && !(club().isError && club().data === undefined)}
        fallback={<QueryStatus isError={!club().isPending} onRetry={() => void club().refetch()} />}
      >
        <CalendarBody
          isAdmin={props.isAdmin}
          timeZone={club().data?.timezone ?? FALLBACK_TIMEZONE}
        />
      </Show>
    </PopupModal>
  );
}

function CalendarBody(props: { readonly isAdmin: boolean; readonly timeZone: string }) {
  const popups = useContext(PopupsContext);
  const text = t.meetings.calendar;
  const today = createMemo(() => todayIn(props.timeZone));
  // Miesiąc startowy jednorazowo z dzisiejszej daty (jak `useState` w React).
  const [month, setMonth] = createSignal<YearMonth>(untrack(() => monthOf(today())));
  const meetings = createCalendarMonth(month);
  const weeks = createMemo(() => monthGrid(month()));
  const byDay = createMemo(() => groupByDay(meetings().data ?? [], props.timeZone));
  const inThisMonth = createMemo(() =>
    [...byDay().entries()].filter(([date]) => inMonth(date, month())).flatMap(([, list]) => list),
  );
  const label = createMemo(() => monthLabel(month()));
  const agendaId = createUniqueId();
  const canPlan = (day: GridDay) =>
    // Dopiero gdy wiadomo, które dni są zajęte (nie w trakcie wczytywania ani po błędzie).
    props.isAdmin &&
    meetings().isSuccess &&
    day.inMonth &&
    day.date >= today() &&
    !byDay().has(day.date);
  const plan = (date: string) => popups.open({ kind: 'add-meeting', date });
  const dayMeetings = (day: GridDay) => byDay().get(day.date) ?? [];

  return (
    <div class="calendar">
      <div class="calendar__bar">
        <div class="calendar__heading">
          <h3 class="calendar__month" aria-live="polite">
            {label()}
          </h3>
          <Show when={meetings().isSuccess}>
            <span class="calendar__count">{plural(inThisMonth().length, text.count)}</span>
          </Show>
        </div>
        <div class="calendar__nav">
          <Button
            size="sm"
            variant="secondary"
            class="calendar__today"
            onClick={() => setMonth(monthOf(today()))}
          >
            {text.today}
          </Button>
          <IconButton
            icon="chevron-left"
            label={text.previous}
            onClick={() => setMonth((current) => shiftMonth(current, -1))}
          />
          <IconButton
            icon="chevron-right"
            label={text.next}
            onClick={() => setMonth((current) => shiftMonth(current, 1))}
          />
        </div>
      </div>

      <Show when={meetings().isError}>
        <div class="calendar__status">
          <QueryStatus isError onRetry={() => void meetings().refetch()} />
        </div>
      </Show>

      {/* Desktop (≥ 768 px): siatka z chipami spotkań. */}
      <div
        class="calendar__grid calendar__grid--full"
        role="group"
        aria-label={format(text.gridLabel, { month: label() })}
        aria-busy={ariaBool(meetings().isPending)}
      >
        <div class="calendar__weekdays" aria-hidden="true">
          <For each={text.weekdays}>{(day) => <span>{day}</span>}</For>
        </div>
        <For each={weeks()} keyed={(week) => week[0]?.date}>
          {(week) => (
            <div class="calendar__week">
              <For each={week()} keyed={(day) => day.date}>
                {(day) => (
                  <DayCell
                    day={day()}
                    today={today()}
                    meetings={dayMeetings(day())}
                    timeZone={props.timeZone}
                    onPlan={canPlan(day()) ? () => plan(day().date) : undefined}
                  />
                )}
              </For>
            </div>
          )}
        </For>
      </div>

      {/* Telefon: kompaktowa siatka (CAL-2), pod nią agenda. */}
      <div
        class="calendar__grid calendar__grid--compact"
        role="group"
        aria-label={format(text.gridLabel, { month: label() })}
        aria-busy={ariaBool(meetings().isPending)}
      >
        <div class="calendar__weekdays" aria-hidden="true">
          <For each={text.weekdays}>{(day) => <span>{day}</span>}</For>
        </div>
        <For each={weeks()} keyed={(week) => week[0]?.date}>
          {(week) => (
            <div class="calendar__week">
              <For each={week()} keyed={(day) => day.date}>
                {(day) => (
                  <CompactDay
                    day={day()}
                    today={today()}
                    meetings={dayMeetings(day())}
                    onPlan={canPlan(day()) ? () => plan(day().date) : undefined}
                  />
                )}
              </For>
            </div>
          )}
        </For>
      </div>

      <div class="calendar__footer">
        <Legend />
        <Show when={props.isAdmin}>
          <p class="calendar__hint">
            <span class="calendar__hint--pointer">{text.hint}</span>
            <span class="calendar__hint--touch">{text.hintTouch}</span>
          </p>
        </Show>
      </div>

      <section class="calendar__agenda" aria-labelledby={agendaId}>
        <div class="calendar__agenda-head">
          <h3 id={agendaId} class="calendar__agenda-title">
            {text.agendaTitle}
          </h3>
          <Show when={meetings().isSuccess}>
            <span class="calendar__count">{plural(inThisMonth().length, text.count)}</span>
          </Show>
        </div>
        <Show
          when={!(meetings().isSuccess && inThisMonth().length === 0)}
          fallback={<p class="calendar__agenda-empty">{text.agendaEmpty}</p>}
        >
          <Tray label={text.agendaLabel} class="calendar__agenda-list">
            <For each={inThisMonth()} keyed={(meeting) => meeting.id}>
              {(meeting) => (
                <li class="tray__item">
                  <AgendaRow meeting={meeting()} timeZone={props.timeZone} />
                </li>
              )}
            </For>
          </Tray>
        </Show>
      </section>
    </div>
  );
}

/** Kafelek dnia na desktopie (DS §15.1 „Calendar day cell”). */
function DayCell(props: {
  readonly day: GridDay;
  readonly today: string;
  readonly meetings: readonly MeetingOverview[];
  readonly timeZone: string;
  readonly onPlan: (() => void) | undefined;
}) {
  const text = t.meetings.calendar;
  const classes = () => [
    'calendar-day',
    props.day.inMonth ? 'calendar-day--in-month' : 'calendar-day--other',
    {
      'calendar-day--today': props.day.date === props.today,
      'calendar-day--past': props.day.date < props.today,
      'calendar-day--plannable': !!props.onPlan,
    },
  ];
  const number = () => (
    <span class="calendar-day__number tnum" aria-hidden="true">
      {dayNumber(props.day.date)}
    </span>
  );
  return (
    <Show
      when={props.onPlan}
      fallback={
        <div class={classes()}>
          {number()}
          <Show when={props.meetings.length > 0}>
            <ul class="calendar-day__chips">
              <For each={props.meetings} keyed={(meeting) => meeting.id}>
                {(meeting) => (
                  <li>
                    <PopupLink
                      to={{ kind: 'meeting', id: meeting().id }}
                      class={`calendar-chip calendar-chip--${meeting().status}`}
                    >
                      <span class="calendar-chip__title">{meeting().title}</span>
                      <span class="calendar-chip__time tnum">
                        <span aria-hidden="true">
                          {localDateTime(meeting().starts_at, props.timeZone).time}
                        </span>
                        <span class="sr-only">
                          {longMeetingDate(meeting().starts_at, props.timeZone)},{' '}
                          {statusLabel(meeting())}
                        </span>
                      </span>
                    </PopupLink>
                  </li>
                )}
              </For>
            </ul>
          </Show>
        </div>
      }
    >
      <button
        type="button"
        class={classes()}
        aria-label={format(text.planDayLabel, { date: dayLabel(props.day.date, props.today) })}
        onClick={() => props.onPlan?.()}
      >
        {number()}
        <span class="calendar-day__plan" aria-hidden="true">
          <Icon name="plus" size={14} />
          {text.planDay}
        </span>
      </button>
    </Show>
  );
}

/** Dzień kompaktowej siatki (telefon): kółko 36, dzień ze spotkaniem w kolorze statusu. */
function CompactDay(props: {
  readonly day: GridDay;
  readonly today: string;
  readonly meetings: readonly MeetingOverview[];
  readonly onPlan: (() => void) | undefined;
}) {
  const text = t.meetings.calendar;
  const first = () => props.meetings[0];
  const classes = () => {
    const meeting = first();
    return [
      'calendar-dot',
      {
        'calendar-dot--today': props.day.date === props.today,
        'calendar-dot--past': props.day.date < props.today,
      },
      meeting ? `calendar-dot--${meeting.status}` : undefined,
    ];
  };
  const number = () => (
    <span class="calendar-dot__circle tnum" aria-hidden="true">
      {dayNumber(props.day.date)}
    </span>
  );
  const date = () => dayLabel(props.day.date, props.today);
  return (
    <Switch fallback={<span class={classes()}>{number()}</span>}>
      {/* Telefon pokazuje tylko dni miesiąca (agenda też): sąsiednie są pustymi polami siatki. */}
      <Match when={!props.day.inMonth}>
        <span class="calendar-dot calendar-dot--other" />
      </Match>
      <Match when={props.meetings.length === 1 && first()}>
        {(meeting) => (
          <PopupLink
            to={{ kind: 'meeting', id: meeting().id }}
            class={classes()}
            aria-label={format(text.dayMeetings, { date: date(), meetings: meeting().title })}
          >
            {number()}
          </PopupLink>
        )}
      </Match>
      <Match when={first()}>
        {(meeting) => (
          // Kilka spotkań jednego dnia: przejście do ich wierszy w agendzie pod siatką.
          <button
            type="button"
            class={classes()}
            aria-label={format(text.dayMeetings, {
              date: date(),
              meetings: props.meetings.map((each) => each.title).join(', '),
            })}
            onClick={() => {
              const row = document.getElementById(agendaRowId(meeting().id));
              row?.scrollIntoView({ block: 'nearest', behavior: 'smooth' });
              row?.focus({ preventScroll: true });
            }}
          >
            {number()}
            <span class="calendar-dot__more" aria-hidden="true" />
          </button>
        )}
      </Match>
      <Match when={props.onPlan}>
        <button
          type="button"
          class={[...classes(), 'calendar-dot--plannable']}
          aria-label={format(text.planDayLabel, { date: date() })}
          onClick={() => props.onPlan?.()}
        >
          {number()}
        </button>
      </Match>
    </Switch>
  );
}

function agendaRowId(id: string): string {
  return `calendar-agenda-${id}`;
}

/** Wiersz agendy (DS §15.1 „Agenda row”). */
function AgendaRow(props: { readonly meeting: MeetingOverview; readonly timeZone: string }) {
  const meta = () => {
    const when = weekdayTime(props.meeting.starts_at, props.timeZone);
    return props.meeting.status === 'finished'
      ? `${when} · ${plural(props.meeting.playCount, t.hub.timeline.plays)}`
      : `${when} · ${plural(props.meeting.participants.length, t.hub.meeting.participants)}`;
  };
  return (
    <PopupLink
      id={agendaRowId(props.meeting.id)}
      to={{ kind: 'meeting', id: props.meeting.id }}
      class="agenda-row"
    >
      <MiniDateTile meeting={props.meeting} timeZone={props.timeZone} />
      <span class="agenda-row__text">
        <span class="agenda-row__title">{props.meeting.title}</span>
        <span class="sr-only">{longMeetingDate(props.meeting.starts_at, props.timeZone)}</span>
        <span class="agenda-row__meta">{meta()}</span>
        <span class="agenda-row__chip">
          <MeetingStatusChip meeting={props.meeting} />
        </span>
      </span>
      <Icon name="chevron-right" class="row__chevron" />
    </PopupLink>
  );
}

function Legend() {
  const legend = t.meetings.calendar.legend;
  return (
    <ul class="calendar-legend" aria-label={t.meetings.calendar.legendLabel}>
      <li>
        <span class="calendar-legend__swatch calendar-legend__swatch--planned" />
        {legend.planned}
      </li>
      <li>
        <span class="calendar-legend__swatch calendar-legend__swatch--in_progress" />
        {legend.inProgress}
      </li>
      <li>
        <span class="calendar-legend__swatch calendar-legend__swatch--finished" />
        {legend.finished}
      </li>
    </ul>
  );
}

function dayLabel(date: string, today: string): string {
  const label = longDayLabel(date);
  return date === today ? `${label} ${t.meetings.calendar.todaySuffix}` : label;
}

function statusLabel(meeting: MeetingOverview): string {
  const legend = t.meetings.calendar.legend;
  if (meeting.status === 'finished') return legend.finished;
  return meeting.status === 'in_progress' ? legend.inProgress : legend.planned;
}
