import { useId, useMemo, useState } from 'react';
import { useAuth } from '../auth/authContext';
import { FALLBACK_TIMEZONE } from '../club/timezones';
import { useClub } from '../hub/club';
import { format, plural, t } from '../i18n';
import { usePopups } from '../popups/popupContext';
import { PopupLink } from '../popups/PopupLink';
import { PopupModal } from '../popups/PopupModal';
import { QueryStatus } from '../popups/QueryStatus';
import { Button, Icon, IconButton, Tray } from '../ui';
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
import { MeetingStatusChip, MiniDateTile } from './MeetingParts';
import { useCalendarMonth, type MeetingOverview } from './overview';
import './calendar.css';

/**
 * Kalendarz spotkań. Desktop: siatka miesiąca z chipami spotkań
 * w kolorach statusu. Telefon: kompaktowa siatka i agenda miesiąca. Dni i „dziś” liczą
 * się w strefie klubu. Administrator planuje przyciskiem w nagłówku albo klikając
 * pusty dzień od dziś (data wypełniona).
 */
export function CalendarPopup({ isAdmin }: { readonly isAdmin: boolean }) {
  const { client } = useAuth();
  const { open } = usePopups();
  const club = useClub(client);
  const text = t.meetings.calendar;

  const actions = isAdmin ? (
    <Button
      size="sm"
      icon="plus"
      aria-label={text.plan}
      onClick={() => open({ kind: 'add-meeting' })}
    >
      <span className="calendar-plan__long">{text.plan}</span>
      <span className="calendar-plan__short">{text.planShort}</span>
    </Button>
  ) : undefined;

  return (
    <PopupModal title={text.title} width={880} actions={actions} className="calendar-modal">
      {club.isPending ? (
        <QueryStatus isError={false} onRetry={() => void club.refetch()} />
      ) : club.isError && club.data === undefined ? (
        <QueryStatus isError onRetry={() => void club.refetch()} />
      ) : (
        <CalendarBody isAdmin={isAdmin} timeZone={club.data?.timezone ?? FALLBACK_TIMEZONE} />
      )}
    </PopupModal>
  );
}

function CalendarBody({ isAdmin, timeZone }: { isAdmin: boolean; timeZone: string }) {
  const { client } = useAuth();
  const { open } = usePopups();
  const text = t.meetings.calendar;
  const today = todayIn(timeZone);
  const [month, setMonth] = useState<YearMonth>(() => monthOf(today));
  const meetings = useCalendarMonth(client, month);
  const weeks = useMemo(() => monthGrid(month), [month]);
  const byDay = useMemo(() => groupByDay(meetings.data ?? [], timeZone), [meetings.data, timeZone]);
  const inThisMonth = useMemo(
    () => [...byDay.entries()].filter(([date]) => inMonth(date, month)).flatMap(([, list]) => list),
    [byDay, month],
  );
  const label = monthLabel(month);
  const agendaId = useId();
  const canPlan = (day: GridDay) =>
    // Dopiero gdy wiadomo, które dni są zajęte (nie w trakcie wczytywania ani po błędzie).
    isAdmin && meetings.isSuccess && day.inMonth && day.date >= today && !byDay.has(day.date);
  const plan = (date: string) => open({ kind: 'add-meeting', date });

  return (
    <div className="calendar">
      <div className="calendar__bar">
        <div className="calendar__heading">
          <h3 className="calendar__month" aria-live="polite">
            {label}
          </h3>
          {meetings.isSuccess ? (
            <span className="calendar__count">{plural(inThisMonth.length, text.count)}</span>
          ) : null}
        </div>
        <div className="calendar__nav">
          <Button
            size="sm"
            variant="secondary"
            className="calendar__today"
            onClick={() => setMonth(monthOf(today))}
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

      {meetings.isError ? (
        <div className="calendar__status">
          <QueryStatus isError onRetry={() => void meetings.refetch()} />
        </div>
      ) : null}

      {/* Desktop (≥ 768 px): siatka z chipami spotkań. */}
      <div
        className="calendar__grid calendar__grid--full"
        role="group"
        aria-label={format(text.gridLabel, { month: label })}
        aria-busy={meetings.isPending}
      >
        <div className="calendar__weekdays" aria-hidden="true">
          {text.weekdays.map((day) => (
            <span key={day}>{day}</span>
          ))}
        </div>
        {weeks.map((week) => (
          <div key={week[0]?.date} className="calendar__week">
            {week.map((day) => (
              <DayCell
                key={day.date}
                day={day}
                today={today}
                meetings={byDay.get(day.date) ?? []}
                timeZone={timeZone}
                onPlan={canPlan(day) ? () => plan(day.date) : undefined}
              />
            ))}
          </div>
        ))}
      </div>

      {/* Telefon: kompaktowa siatka, pod nią agenda. */}
      <div
        className="calendar__grid calendar__grid--compact"
        role="group"
        aria-label={format(text.gridLabel, { month: label })}
        aria-busy={meetings.isPending}
      >
        <div className="calendar__weekdays" aria-hidden="true">
          {text.weekdays.map((day) => (
            <span key={day}>{day}</span>
          ))}
        </div>
        {weeks.map((week) => (
          <div key={week[0]?.date} className="calendar__week">
            {week.map((day) => (
              <CompactDay
                key={day.date}
                day={day}
                today={today}
                meetings={byDay.get(day.date) ?? []}
                onPlan={canPlan(day) ? () => plan(day.date) : undefined}
              />
            ))}
          </div>
        ))}
      </div>

      <div className="calendar__footer">
        <Legend />
        {isAdmin ? (
          <p className="calendar__hint">
            <span className="calendar__hint--pointer">{text.hint}</span>
            <span className="calendar__hint--touch">{text.hintTouch}</span>
          </p>
        ) : null}
      </div>

      <section className="calendar__agenda" aria-labelledby={agendaId}>
        <div className="calendar__agenda-head">
          <h3 id={agendaId} className="calendar__agenda-title">
            {text.agendaTitle}
          </h3>
          {meetings.isSuccess ? (
            <span className="calendar__count">{plural(inThisMonth.length, text.count)}</span>
          ) : null}
        </div>
        {meetings.isSuccess && inThisMonth.length === 0 ? (
          <p className="calendar__agenda-empty">{text.agendaEmpty}</p>
        ) : (
          <Tray label={text.agendaLabel} className="calendar__agenda-list">
            {inThisMonth.map((meeting) => (
              <li key={meeting.id} className="tray__item">
                <AgendaRow meeting={meeting} timeZone={timeZone} />
              </li>
            ))}
          </Tray>
        )}
      </section>
    </div>
  );
}

/** Kafelek dnia na desktopie. */
function DayCell({
  day,
  today,
  meetings,
  timeZone,
  onPlan,
}: {
  day: GridDay;
  today: string;
  meetings: readonly MeetingOverview[];
  timeZone: string;
  onPlan: (() => void) | undefined;
}) {
  const text = t.meetings.calendar;
  const className = [
    'calendar-day',
    day.inMonth ? 'calendar-day--in-month' : 'calendar-day--other',
    day.date === today && 'calendar-day--today',
    day.date < today && 'calendar-day--past',
    onPlan && 'calendar-day--plannable',
  ]
    .filter(Boolean)
    .join(' ');
  const number = (
    <span className="calendar-day__number tnum" aria-hidden="true">
      {dayNumber(day.date)}
    </span>
  );
  if (onPlan) {
    return (
      <button
        type="button"
        className={className}
        aria-label={format(text.planDayLabel, { date: dayLabel(day.date, today) })}
        onClick={onPlan}
      >
        {number}
        <span className="calendar-day__plan" aria-hidden="true">
          <Icon name="plus" size={14} />
          {text.planDay}
        </span>
      </button>
    );
  }
  return (
    <div className={className}>
      {number}
      {meetings.length > 0 ? (
        <ul className="calendar-day__chips">
          {meetings.map((meeting) => (
            <li key={meeting.id}>
              <PopupLink
                to={{ kind: 'meeting', id: meeting.id }}
                className={`calendar-chip calendar-chip--${meeting.status}`}
              >
                <span className="calendar-chip__title">{meeting.title}</span>
                <span className="calendar-chip__time tnum">
                  <span aria-hidden="true">{localDateTime(meeting.starts_at, timeZone).time}</span>
                  <span className="sr-only">
                    {longMeetingDate(meeting.starts_at, timeZone)}, {statusLabel(meeting)}
                  </span>
                </span>
              </PopupLink>
            </li>
          ))}
        </ul>
      ) : null}
    </div>
  );
}

/** Dzień kompaktowej siatki (telefon): kółko 36, dzień ze spotkaniem w kolorze statusu. */
function CompactDay({
  day,
  today,
  meetings,
  onPlan,
}: {
  day: GridDay;
  today: string;
  meetings: readonly MeetingOverview[];
  onPlan: (() => void) | undefined;
}) {
  const text = t.meetings.calendar;
  // Telefon pokazuje tylko dni miesiąca (agenda też): sąsiednie są pustymi polami siatki.
  if (!day.inMonth) return <span className="calendar-dot calendar-dot--other" />;
  const first = meetings[0];
  const className = [
    'calendar-dot',
    day.date === today && 'calendar-dot--today',
    day.date < today && 'calendar-dot--past',
    first && `calendar-dot--${first.status}`,
  ]
    .filter(Boolean)
    .join(' ');
  const number = (
    <span className="calendar-dot__circle tnum" aria-hidden="true">
      {dayNumber(day.date)}
    </span>
  );
  const date = dayLabel(day.date, today);
  if (first && meetings.length === 1) {
    return (
      <PopupLink
        to={{ kind: 'meeting', id: first.id }}
        className={className}
        aria-label={format(text.dayMeetings, { date, meetings: first.title })}
      >
        {number}
      </PopupLink>
    );
  }
  if (first) {
    // Kilka spotkań jednego dnia: przejście do ich wierszy w agendzie pod siatką.
    return (
      <button
        type="button"
        className={className}
        aria-label={format(text.dayMeetings, {
          date,
          meetings: meetings.map((meeting) => meeting.title).join(', '),
        })}
        onClick={() => {
          const row = document.getElementById(agendaRowId(first.id));
          row?.scrollIntoView({ block: 'nearest', behavior: 'smooth' });
          row?.focus({ preventScroll: true });
        }}
      >
        {number}
        <span className="calendar-dot__more" aria-hidden="true" />
      </button>
    );
  }
  if (onPlan) {
    return (
      <button
        type="button"
        className={`${className} calendar-dot--plannable`}
        aria-label={format(text.planDayLabel, { date })}
        onClick={onPlan}
      >
        {number}
      </button>
    );
  }
  return <span className={className}>{number}</span>;
}

function agendaRowId(id: string): string {
  return `calendar-agenda-${id}`;
}

/** Wiersz agendy. */
function AgendaRow({ meeting, timeZone }: { meeting: MeetingOverview; timeZone: string }) {
  const finished = meeting.status === 'finished';
  const meta = finished
    ? `${weekdayTime(meeting.starts_at, timeZone)} · ${plural(meeting.playCount, t.hub.timeline.plays)}`
    : `${weekdayTime(meeting.starts_at, timeZone)} · ${plural(meeting.participants.length, t.hub.meeting.participants)}`;
  return (
    <PopupLink
      id={agendaRowId(meeting.id)}
      to={{ kind: 'meeting', id: meeting.id }}
      className="agenda-row"
    >
      <MiniDateTile meeting={meeting} timeZone={timeZone} />
      <span className="agenda-row__text">
        <span className="agenda-row__title">{meeting.title}</span>
        <span className="sr-only">{longMeetingDate(meeting.starts_at, timeZone)}</span>
        <span className="agenda-row__meta">{meta}</span>
        <span className="agenda-row__chip">
          <MeetingStatusChip meeting={meeting} />
        </span>
      </span>
      <Icon name="chevron-right" className="row__chevron" />
    </PopupLink>
  );
}

function Legend() {
  const legend = t.meetings.calendar.legend;
  return (
    <ul className="calendar-legend" aria-label={t.meetings.calendar.legendLabel}>
      <li>
        <span className="calendar-legend__swatch calendar-legend__swatch--planned" />
        {legend.planned}
      </li>
      <li>
        <span className="calendar-legend__swatch calendar-legend__swatch--in_progress" />
        {legend.inProgress}
      </li>
      <li>
        <span className="calendar-legend__swatch calendar-legend__swatch--finished" />
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
