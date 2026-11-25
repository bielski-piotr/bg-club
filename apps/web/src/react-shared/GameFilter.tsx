import { useId, useMemo, useState, type KeyboardEvent } from 'react';
import type { Game } from '../games/games';
import { t } from '../i18n';
import { Icon } from '../ui';
import { gameOptions, type GameOption } from '../leaderboard/gameOptions';
import { cx } from '../ui/cx';
import '../ui/Choice.css';

export interface GameFilterPanelProps {
  readonly games: readonly Pick<Game, 'id' | 'title'>[] | undefined;
  readonly failed: boolean;
  readonly selected: readonly string[];
  readonly onChange: (games: readonly string[]) => void;
}

/**
 * Wyszukiwarka gier z autouzupełnianiem (combobox + lista wielokrotnego wyboru). Strzałki
 * przesuwają podświetlenie, Enter zaznacza albo odznacza grę; kliknięcie działa tak samo.
 */
export function GameFilterPanel({ games, failed, selected, onChange }: GameFilterPanelProps) {
  const text = t.leaderboard.filters;
  const id = useId();
  const [query, setQuery] = useState('');
  const [active, setActive] = useState(0);
  const options = useMemo(
    () => gameOptions(games ?? [], selected, query),
    [games, selected, query],
  );
  const chosen = new Set(selected);
  const optionId = (index: number) => `${id}-opt-${index}`;

  const toggle = (option: GameOption | undefined) => {
    if (!option) return;
    onChange(
      chosen.has(option.id) ? selected.filter((g) => g !== option.id) : [...selected, option.id],
    );
  };

  const onKeyDown = (event: KeyboardEvent<HTMLInputElement>) => {
    if (event.key === 'ArrowDown' || event.key === 'ArrowUp') {
      event.preventDefault();
      const delta = event.key === 'ArrowDown' ? 1 : -1;
      setActive((index) => Math.max(0, Math.min(options.length - 1, index + delta)));
    } else if (event.key === 'Enter') {
      event.preventDefault();
      toggle(options[active]);
    }
  };

  return (
    <div className="game-filter">
      <div className="select__search">
        <Icon name="search" className="select__search-icon" />
        <input
          data-autofocus
          type="text"
          role="combobox"
          className="select__search-control"
          aria-label={text.gamesSearch}
          aria-expanded="true"
          aria-controls={`${id}-list`}
          aria-autocomplete="list"
          aria-activedescendant={options[active] ? optionId(active) : undefined}
          placeholder={text.gamesSearch}
          autoComplete="off"
          spellCheck={false}
          value={query}
          onChange={(event) => {
            setQuery(event.target.value);
            setActive(0);
          }}
          onKeyDown={onKeyDown}
        />
      </div>
      <ul
        id={`${id}-list`}
        role="listbox"
        aria-multiselectable="true"
        aria-label={text.games}
        className="select__options game-filter__options"
      >
        {failed ? (
          <li className="menu__empty" role="presentation">
            {text.gamesError}
          </li>
        ) : options.length === 0 ? (
          <li className="menu__empty" role="presentation">
            {games ? text.gamesEmpty : text.gamesLoading}
          </li>
        ) : (
          options.map((option, index) => {
            const on = chosen.has(option.id);
            return (
              <li
                key={option.id}
                id={optionId(index)}
                role="option"
                aria-selected={on}
                className={cx(
                  'menu__item',
                  on && 'menu__item--selected',
                  index === active && 'menu__item--active',
                )}
                onPointerMove={() => setActive(index)}
                onPointerDown={(event) => event.preventDefault()}
                onClick={() => {
                  setActive(index);
                  toggle(option);
                }}
              >
                <span
                  className={cx('checkbox game-filter__check', on && 'game-filter__check--on')}
                  aria-hidden="true"
                >
                  <Icon name="check" size={14} />
                </span>
                <span className="menu__label">{option.title}</span>
              </li>
            );
          })
        )}
      </ul>
    </div>
  );
}
