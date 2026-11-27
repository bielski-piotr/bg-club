import type { JSX } from '@solidjs/web';
import { Show } from 'solid-js';
import { FALLBACK_TIMEZONE } from '../club/timezones';
import { format, t } from '../i18n';
import { datesValue, gamesValue } from './filterLabels';
import {
  hasDateFilter,
  hasFilters,
  NO_FILTERS,
  withDates,
  withGames,
  type LeaderboardFilters,
} from './filters';
import { todayIn } from '../meetings/datetime';
import { createClub } from '../club/clubData';
import { Button } from '../ui/Button';
import { createSlot } from '../ui/dom';
import { DateRangeCalendar } from './DateRangeCalendar';
import { FilterPopover } from './FilterPopover';
import { GameFilterPanel } from './GameFilter';
import { createGamesPrefetch, createGameTitles } from './gameTitles';

/** Panel gier: kolekcja wczytywana przy otwarciu panelu; stany listy pokazuje sam panel. */
function GamesPanel(props: {
  readonly selected: readonly string[];
  readonly onChange: (games: readonly string[]) => void;
}) {
  const { games } = createGameTitles(() => true);
  return (
    <GameFilterPanel
      games={games.current()}
      failed={games.state()?.isError === true && games.current() === undefined}
      selected={props.selected}
      onChange={(next) => props.onChange(next)}
    />
  );
}

export interface FilterBarProps {
  readonly filters: LeaderboardFilters;
  readonly onChange: (filters: LeaderboardFilters) => void;
  /** Dodatkowa akcja na końcu paska (np. „Remisy”). */
  readonly extra?: JSX.Element | undefined;
  /** Nazwa grupy filtrów dla czytników ekranu; domyślnie „Filtry rankingu”. */
  readonly label?: string | undefined;
}

/**
 * Pasek filtrów rankingu (widżet, popup, profil): zakres dat w kalendarzu, gry
 * z okładkami i autouzupełnianiem oraz „Wyczyść filtry” (wszystkie gry, cała historia).
 */
export function FilterBar(props: FilterBarProps) {
  const text = t.leaderboard.filters;
  const club = createClub();
  const today = () => todayIn(club.current()?.timezone ?? FALLBACK_TIMEZONE);
  const { titles } = createGameTitles(() => props.filters.games.length > 0);
  const dates = () => datesValue(props.filters);
  const gamesText = () => gamesValue(props.filters, titles());
  const extra = createSlot(() => props.extra);
  const prefetchGames = createGamesPrefetch();

  return (
    <div class="lb-filters" role="group" aria-label={props.label ?? text.label}>
      <FilterPopover
        label={text.dates}
        triggerLabel={format(text.datesLabel, { value: dates() })}
        value={dates()}
        icon="calendar"
        active={hasDateFilter(props.filters)}
        clearLabel={text.clearDates}
        onClear={() => props.onChange(withDates(props.filters, null, null))}
      >
        <DateRangeCalendar
          from={props.filters.from}
          to={props.filters.to}
          today={today()}
          onChange={(from, to) => props.onChange(withDates(props.filters, from, to))}
        />
      </FilterPopover>
      <FilterPopover
        label={text.games}
        triggerLabel={format(text.gamesLabel, { value: gamesText() })}
        value={gamesText()}
        icon="dice"
        active={props.filters.games.length > 0}
        clearLabel={text.clearGames}
        onClear={() => props.onChange(withGames(props.filters, []))}
        onIntent={prefetchGames}
      >
        <GamesPanel
          selected={props.filters.games}
          onChange={(next) => props.onChange(withGames(props.filters, next))}
        />
      </FilterPopover>
      <Show when={hasFilters(props.filters)}>
        <Button
          size="sm"
          variant="secondary"
          icon="undo"
          class="lb-filters__reset"
          aria-label={text.resetLabel}
          onClick={() => props.onChange(NO_FILTERS)}
        >
          {text.reset}
        </Button>
      </Show>
      <Show when={extra()}>
        <div class="lb-filters__extra">{extra()}</div>
      </Show>
    </div>
  );
}
