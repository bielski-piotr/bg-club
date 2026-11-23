import { useState } from 'react';
import { format, t } from '../i18n';
import {
  dayNumber,
  longDayLabel,
  monthGrid,
  monthOf,
  shiftMonth,
  type YearMonth,
} from '../meetings/calendar';
import { IconButton } from '../ui';
import { monthName, pickDay, shortMonthName, YEARS_PAGE, yearsPageStart } from './rangeCalendar';
import { cx } from '../ui/cx';

type View = 'days' | 'months' | 'years';

export interface DateRangeCalendarProps {
  readonly from: string | null;
  readonly to: string | null;
  /** Dziś w strefie klubu (`RRRR-MM-DD`). */
  readonly today: string;
  readonly onChange: (from: string, to: string) => void;
}

/**
 * Kalendarz zakresu dat (filtr rankingu). Pierwsze kliknięcie wybiera jeden dzień, drugie
 * kończy zakres. Dzień sąsiedniego miesiąca przełącza kalendarz na ten miesiąc. Nazwa miesiąca
 * i rok w nagłówku otwierają szybki wybór miesiąca i roku.
 */
export function DateRangeCalendar({ from, to, today, onChange }: DateRangeCalendarProps) {
  const text = t.leaderboard.calendar;
  const [month, setMonth] = useState<YearMonth>(() => monthOf(from ?? to ?? today));
  const [view, setView] = useState<View>('days');
  const [yearsStart, setYearsStart] = useState(() => yearsPageStart(month.year));
  const [anchor, setAnchor] = useState<string | null>(null);
  const [hover, setHover] = useState<string | null>(null);

  // Podgląd zakresu od kotwicy do dnia pod kursorem, zanim padnie drugie kliknięcie.
  const previewEnd = anchor !== null ? (hover ?? anchor) : null;
  const rangeStart =
    anchor !== null && previewEnd !== null ? (previewEnd < anchor ? previewEnd : anchor) : from;
  const rangeEnd =
    anchor !== null && previewEnd !== null ? (previewEnd < anchor ? anchor : previewEnd) : to;

  const choose = (date: string) => {
    const next = pickDay(anchor, date);
    setAnchor(next.anchor);
    setMonth(monthOf(date));
    onChange(next.start, next.end);
  };

  const hint = anchor !== null ? text.pickEnd : from !== null ? text.picked : text.pickStart;

  return (
    <div className="range-calendar" role="group" aria-label={text.label}>
      <div className="range-calendar__bar">
        {view === 'days' ? (
          <>
            <IconButton
              icon="chevron-left"
              label={text.previous}
              onClick={() => setMonth((m) => shiftMonth(m, -1))}
            />
            <div className="range-calendar__title">
              <button
                type="button"
                className="range-calendar__switch"
                aria-label={format(text.chooseMonth, { month: monthName(month) })}
                onClick={() => setView('months')}
              >
                {monthName(month)}
              </button>
              <button
                type="button"
                className="range-calendar__switch tnum"
                aria-label={format(text.chooseYear, { year: String(month.year) })}
                onClick={() => {
                  setYearsStart(yearsPageStart(month.year));
                  setView('years');
                }}
              >
                {month.year}
              </button>
            </div>
            <IconButton
              icon="chevron-right"
              label={text.next}
              onClick={() => setMonth((m) => shiftMonth(m, 1))}
            />
          </>
        ) : view === 'months' ? (
          <>
            <IconButton
              icon="chevron-left"
              label={text.previousYear}
              onClick={() => setMonth((m) => ({ ...m, year: m.year - 1 }))}
            />
            <div className="range-calendar__title">
              <button
                type="button"
                className="range-calendar__switch tnum"
                aria-label={format(text.chooseYear, { year: String(month.year) })}
                onClick={() => {
                  setYearsStart(yearsPageStart(month.year));
                  setView('years');
                }}
              >
                {month.year}
              </button>
            </div>
            <IconButton
              icon="chevron-right"
              label={text.nextYear}
              onClick={() => setMonth((m) => ({ ...m, year: m.year + 1 }))}
            />
          </>
        ) : (
          <>
            <IconButton
              icon="chevron-left"
              label={text.previousYears}
              onClick={() => setYearsStart((y) => y - YEARS_PAGE)}
            />
            <span className="range-calendar__heading tnum">
              {yearsStart}–{yearsStart + YEARS_PAGE - 1}
            </span>
            <IconButton
              icon="chevron-right"
              label={text.nextYears}
              onClick={() => setYearsStart((y) => y + YEARS_PAGE)}
            />
          </>
        )}
      </div>

      {view === 'days' ? (
        <div className="range-calendar__days" onPointerLeave={() => setHover(null)}>
          <div className="range-calendar__weekdays" aria-hidden="true">
            {t.meetings.calendar.weekdays.map((day) => (
              <span key={day}>{day}</span>
            ))}
          </div>
          {monthGrid(month).map((week) => (
            <div key={week[0]?.date} className="range-calendar__week">
              {week.map((day) => {
                const edge = day.date === rangeStart || day.date === rangeEnd;
                const inside =
                  rangeStart !== null &&
                  rangeEnd !== null &&
                  day.date > rangeStart &&
                  day.date < rangeEnd;
                const chosen = edge || inside;
                return (
                  <button
                    key={day.date}
                    type="button"
                    className={cx(
                      'range-calendar__day tnum',
                      !day.inMonth && 'range-calendar__day--outside',
                      day.date === today && 'range-calendar__day--today',
                      inside && 'range-calendar__day--inside',
                      day.date === rangeStart && 'range-calendar__day--start',
                      day.date === rangeEnd && 'range-calendar__day--end',
                    )}
                    aria-label={`${longDayLabel(day.date)}${day.date === today ? `, ${text.today}` : ''}`}
                    aria-pressed={chosen}
                    onPointerEnter={() => setHover(day.date)}
                    onFocus={() => setHover(day.date)}
                    onClick={() => choose(day.date)}
                  >
                    {dayNumber(day.date)}
                  </button>
                );
              })}
            </div>
          ))}
        </div>
      ) : view === 'months' ? (
        <div
          className="range-calendar__grid"
          role="group"
          aria-label={format(text.monthsLabel, { year: String(month.year) })}
        >
          {Array.from({ length: 12 }, (_, i) => i + 1).map((m) => (
            <button
              key={m}
              type="button"
              className={cx(
                'range-calendar__cell',
                m === month.month && 'range-calendar__cell--current',
              )}
              aria-pressed={m === month.month}
              aria-label={monthName({ year: month.year, month: m })}
              onClick={() => {
                setMonth({ year: month.year, month: m });
                setView('days');
              }}
            >
              {shortMonthName(m)}
            </button>
          ))}
        </div>
      ) : (
        <div
          className="range-calendar__grid"
          role="group"
          aria-label={format(text.yearsLabel, {
            from: String(yearsStart),
            to: String(yearsStart + YEARS_PAGE - 1),
          })}
        >
          {Array.from({ length: YEARS_PAGE }, (_, i) => yearsStart + i).map((year) => (
            <button
              key={year}
              type="button"
              className={cx(
                'range-calendar__cell tnum',
                year === month.year && 'range-calendar__cell--current',
              )}
              aria-pressed={year === month.year}
              onClick={() => {
                setMonth({ year, month: month.month });
                setView('days');
              }}
            >
              {year}
            </button>
          ))}
        </div>
      )}
      <p className="range-calendar__hint" aria-live="polite">
        {hint}
      </p>
    </div>
  );
}
