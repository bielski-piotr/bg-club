import type { ReactNode } from 'react';
import { useAuth } from '../auth/authContext';
import { FALLBACK_TIMEZONE } from '../club/timezones';
import { useClub } from '../hub/club';
import { format, t } from '../i18n';
import { todayIn } from '../meetings/datetime';
import { Button } from '../ui';
import { datesValue, gamesValue, useGameTitles } from './filterLabels';
import { DateRangeCalendar } from './DateRangeCalendar';
import { FilterPopover } from './FilterPopover';
import { GameFilterPanel } from './GameFilter';
import {
  hasDateFilter,
  hasFilters,
  NO_FILTERS,
  withDates,
  withGames,
  type LeaderboardFilters,
} from './filters';

/** Panel gier: kolekcja wczytywana przy otwarciu panelu. */
function GamesPanel({
  selected,
  onChange,
}: {
  readonly selected: readonly string[];
  readonly onChange: (games: readonly string[]) => void;
}) {
  const { games } = useGameTitles(true);
  return (
    <GameFilterPanel
      games={games.data}
      failed={games.isError && !games.data}
      selected={selected}
      onChange={onChange}
    />
  );
}

export interface FilterBarProps {
  readonly filters: LeaderboardFilters;
  readonly onChange: (filters: LeaderboardFilters) => void;
  /** Dodatkowa akcja na końcu paska (np. „Remisy”). */
  readonly extra?: ReactNode | undefined;
}

/**
 * Pasek filtrów rankingu (widżet i popup): zakres dat w kalendarzu, gry z autouzupełnianiem
 * i „Wyczyść filtry” (wszystkie gry, cała historia). Filtry działają osobno i razem; bez
 * filtrów kontrolki nie mają nic zaznaczonego.
 */
export function FilterBar({ filters, onChange, extra }: FilterBarProps) {
  const { client } = useAuth();
  const club = useClub(client);
  const today = todayIn(club.data?.timezone ?? FALLBACK_TIMEZONE);
  const { titles } = useGameTitles(filters.games.length > 0);
  const text = t.leaderboard.filters;
  const dates = datesValue(filters);
  const gamesText = gamesValue(filters, titles);

  return (
    <div className="lb-filters" role="group" aria-label={text.label}>
      <FilterPopover
        label={text.dates}
        triggerLabel={format(text.datesLabel, { value: dates })}
        value={dates}
        icon="calendar"
        active={hasDateFilter(filters)}
        clearLabel={text.clearDates}
        onClear={() => onChange(withDates(filters, null, null))}
      >
        <DateRangeCalendar
          from={filters.from}
          to={filters.to}
          today={today}
          onChange={(from, to) => onChange(withDates(filters, from, to))}
        />
      </FilterPopover>
      <FilterPopover
        label={text.games}
        triggerLabel={format(text.gamesLabel, { value: gamesText })}
        value={gamesText}
        icon="dice"
        active={filters.games.length > 0}
        clearLabel={text.clearGames}
        onClear={() => onChange(withGames(filters, []))}
      >
        <GamesPanel
          selected={filters.games}
          onChange={(next) => onChange(withGames(filters, next))}
        />
      </FilterPopover>
      {hasFilters(filters) ? (
        <Button
          size="sm"
          variant="secondary"
          icon="undo"
          className="lb-filters__reset"
          aria-label={text.resetLabel}
          onClick={() => onChange(NO_FILTERS)}
        >
          {text.reset}
        </Button>
      ) : null}
      {extra ? <div className="lb-filters__extra">{extra}</div> : null}
    </div>
  );
}
