import { createMemo, createSignal, createUniqueId, For, Match, Switch } from 'solid-js';
import type { Game } from '../games/games';
import { t } from '../i18n';
import { gameOptions, type GameOption } from './gameOptions';
import { ariaBool } from '../ui/dom';
import { Icon } from '../ui/Icon';
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
export function GameFilterPanel(props: GameFilterPanelProps) {
  const text = t.leaderboard.filters;
  const id = createUniqueId();
  const [query, setQuery] = createSignal('');
  const [active, setActive] = createSignal(0);
  const options = createMemo(() => gameOptions(props.games ?? [], props.selected, query()));
  const chosen = createMemo(() => new Set(props.selected));
  const optionId = (index: number) => `${id}-opt-${index}`;

  const toggle = (option: GameOption | undefined) => {
    if (!option) return;
    props.onChange(
      chosen().has(option.id)
        ? props.selected.filter((g) => g !== option.id)
        : [...props.selected, option.id],
    );
  };

  const onKeyDown = (event: KeyboardEvent) => {
    if (event.key === 'ArrowDown' || event.key === 'ArrowUp') {
      event.preventDefault();
      const delta = event.key === 'ArrowDown' ? 1 : -1;
      setActive((index) => Math.max(0, Math.min(options().length - 1, index + delta)));
    } else if (event.key === 'Enter') {
      event.preventDefault();
      toggle(options()[active()]);
    }
  };

  return (
    <div class="game-filter">
      <div class="select__search">
        <Icon name="search" class="select__search-icon" />
        <input
          data-autofocus="true"
          type="text"
          role="combobox"
          class="select__search-control"
          aria-label={text.gamesSearch}
          aria-expanded="true"
          aria-controls={`${id}-list`}
          aria-autocomplete="list"
          aria-activedescendant={options()[active()] ? optionId(active()) : undefined}
          placeholder={text.gamesSearch}
          autocomplete="off"
          spellcheck="false"
          value={query()}
          onInput={(event) => {
            setQuery(event.currentTarget.value);
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
        class="select__options game-filter__options"
      >
        <Switch
          fallback={
            <For each={options()} keyed={(option) => option.id}>
              {(option, index) => {
                const on = () => chosen().has(option().id);
                return (
                  <li
                    id={optionId(index())}
                    role="option"
                    aria-selected={ariaBool(on())}
                    class={[
                      'menu__item',
                      { 'menu__item--selected': on(), 'menu__item--active': index() === active() },
                    ]}
                    onPointerMove={() => setActive(index())}
                    onPointerDown={(event) => event.preventDefault()}
                    onClick={() => {
                      setActive(index());
                      toggle(option());
                    }}
                  >
                    <span
                      class={['checkbox game-filter__check', { 'game-filter__check--on': on() }]}
                      aria-hidden="true"
                    >
                      <Icon name="check" size={14} />
                    </span>
                    <span class="menu__label">{option().title}</span>
                  </li>
                );
              }}
            </For>
          }
        >
          <Match when={props.failed}>
            <li class="menu__empty" role="presentation">
              {text.gamesError}
            </li>
          </Match>
          <Match when={options().length === 0}>
            <li class="menu__empty" role="presentation">
              {props.games ? text.gamesEmpty : text.gamesLoading}
            </li>
          </Match>
        </Switch>
      </ul>
    </div>
  );
}
