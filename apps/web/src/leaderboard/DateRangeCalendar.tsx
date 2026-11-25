/** @jsxImportSource @solidjs/web */
import { createMemo, createSignal, For, Match, Switch, untrack } from 'solid-js';
import { format, t } from '../i18n';
import { monthName, pickDay, shortMonthName, YEARS_PAGE, yearsPageStart } from './rangeCalendar';
import {
  dayNumber,
  longDayLabel,
  monthGrid,
  monthOf,
  shiftMonth,
  type YearMonth,
} from '../meetings/calendar';
import { ariaBool } from '../solid/ui/dom';
import { IconButton } from '../solid/ui/Button';

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
export function DateRangeCalendar(props: DateRangeCalendarProps) {
  const text = t.leaderboard.calendar;
  // Miesiąc startowy wynika z wybranego zakresu (albo dziś), potem tylko nawigacja zmienia go
  // lokalnie: świadomie jednorazowy odczyt. Pochodny sygnał wracałby do miesiąca `from` przy
  // każdym wyborze dnia (kliknięcie dnia z sąsiedniego miesiąca nie przełączyłoby widoku).
  const [month, setMonth] = createSignal<YearMonth>(
    untrack(() => monthOf(props.from ?? props.to ?? props.today)),
  );
  const [view, setView] = createSignal<View>('days');
  const [yearsStart, setYearsStart] = createSignal(() => yearsPageStart(month().year));
  const [anchor, setAnchor] = createSignal<string | null>(null);
  const [hover, setHover] = createSignal<string | null>(null);

  // Podgląd zakresu od kotwicy do dnia pod kursorem, zanim padnie drugie kliknięcie.
  const range = createMemo(() => {
    const start = anchor();
    if (start === null) return { start: props.from, end: props.to };
    const end = hover() ?? start;
    return end < start ? { start: end, end: start } : { start, end };
  });

  const choose = (date: string) => {
    const next = pickDay(anchor(), date);
    setAnchor(next.anchor);
    setMonth(monthOf(date));
    props.onChange(next.start, next.end);
  };

  const hint = () =>
    anchor() !== null ? text.pickEnd : props.from !== null ? text.picked : text.pickStart;
  const showYears = () => {
    setYearsStart(yearsPageStart(month().year));
    setView('years');
  };

  return (
    <div class="range-calendar" role="group" aria-label={text.label}>
      <div class="range-calendar__bar">
        <Switch>
          <Match when={view() === 'days'}>
            <IconButton
              icon="chevron-left"
              label={text.previous}
              onClick={() => setMonth((m) => shiftMonth(m, -1))}
            />
            <div class="range-calendar__title">
              <button
                type="button"
                class="range-calendar__switch"
                aria-label={format(text.chooseMonth, { month: monthName(month()) })}
                onClick={() => setView('months')}
              >
                {monthName(month())}
              </button>
              <button
                type="button"
                class="range-calendar__switch tnum"
                aria-label={format(text.chooseYear, { year: String(month().year) })}
                onClick={showYears}
              >
                {month().year}
              </button>
            </div>
            <IconButton
              icon="chevron-right"
              label={text.next}
              onClick={() => setMonth((m) => shiftMonth(m, 1))}
            />
          </Match>
          <Match when={view() === 'months'}>
            <IconButton
              icon="chevron-left"
              label={text.previousYear}
              onClick={() => setMonth((m) => ({ ...m, year: m.year - 1 }))}
            />
            <div class="range-calendar__title">
              <button
                type="button"
                class="range-calendar__switch tnum"
                aria-label={format(text.chooseYear, { year: String(month().year) })}
                onClick={showYears}
              >
                {month().year}
              </button>
            </div>
            <IconButton
              icon="chevron-right"
              label={text.nextYear}
              onClick={() => setMonth((m) => ({ ...m, year: m.year + 1 }))}
            />
          </Match>
          <Match when={view() === 'years'}>
            <IconButton
              icon="chevron-left"
              label={text.previousYears}
              onClick={() => setYearsStart((y) => y - YEARS_PAGE)}
            />
            <span class="range-calendar__heading tnum">
              {yearsStart()}–{yearsStart() + YEARS_PAGE - 1}
            </span>
            <IconButton
              icon="chevron-right"
              label={text.nextYears}
              onClick={() => setYearsStart((y) => y + YEARS_PAGE)}
            />
          </Match>
        </Switch>
      </div>

      <Switch>
        <Match when={view() === 'days'}>
          <div class="range-calendar__days" onPointerLeave={() => setHover(null)}>
            <div class="range-calendar__weekdays" aria-hidden="true">
              <For each={t.meetings.calendar.weekdays}>{(day) => <span>{day}</span>}</For>
            </div>
            <For each={monthGrid(month())}>
              {(week) => (
                <div class="range-calendar__week">
                  <For each={week}>
                    {(day) => {
                      const inside = () => {
                        const { start, end } = range();
                        return start !== null && end !== null && day.date > start && day.date < end;
                      };
                      const isStart = () => day.date === range().start;
                      const isEnd = () => day.date === range().end;
                      return (
                        <button
                          type="button"
                          class={[
                            'range-calendar__day tnum',
                            {
                              'range-calendar__day--outside': !day.inMonth,
                              'range-calendar__day--today': day.date === props.today,
                              'range-calendar__day--inside': inside(),
                              'range-calendar__day--start': isStart(),
                              'range-calendar__day--end': isEnd(),
                            },
                          ]}
                          aria-label={`${longDayLabel(day.date)}${day.date === props.today ? `, ${text.today}` : ''}`}
                          aria-pressed={ariaBool(isStart() || isEnd() || inside())}
                          onPointerEnter={() => setHover(day.date)}
                          onFocus={() => setHover(day.date)}
                          onClick={() => choose(day.date)}
                        >
                          {dayNumber(day.date)}
                        </button>
                      );
                    }}
                  </For>
                </div>
              )}
            </For>
          </div>
        </Match>
        <Match when={view() === 'months'}>
          <div
            class="range-calendar__grid"
            role="group"
            aria-label={format(text.monthsLabel, { year: String(month().year) })}
          >
            <For each={Array.from({ length: 12 }, (_, i) => i + 1)}>
              {(m) => (
                <button
                  type="button"
                  class={[
                    'range-calendar__cell',
                    { 'range-calendar__cell--current': m === month().month },
                  ]}
                  aria-pressed={ariaBool(m === month().month)}
                  aria-label={monthName({ year: month().year, month: m })}
                  onClick={() => {
                    setMonth({ year: month().year, month: m });
                    setView('days');
                  }}
                >
                  {shortMonthName(m)}
                </button>
              )}
            </For>
          </div>
        </Match>
        <Match when={view() === 'years'}>
          <div
            class="range-calendar__grid"
            role="group"
            aria-label={format(text.yearsLabel, {
              from: String(yearsStart()),
              to: String(yearsStart() + YEARS_PAGE - 1),
            })}
          >
            <For each={Array.from({ length: YEARS_PAGE }, (_, i) => yearsStart() + i)}>
              {(year) => (
                <button
                  type="button"
                  class={[
                    'range-calendar__cell tnum',
                    { 'range-calendar__cell--current': year === month().year },
                  ]}
                  aria-pressed={ariaBool(year === month().year)}
                  onClick={() => {
                    setMonth({ year, month: month().month });
                    setView('days');
                  }}
                >
                  {year}
                </button>
              )}
            </For>
          </div>
        </Match>
      </Switch>
      <p class="range-calendar__hint" aria-live="polite">
        {hint()}
      </p>
    </div>
  );
}
