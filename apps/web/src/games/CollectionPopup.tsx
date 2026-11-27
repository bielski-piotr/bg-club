import { createMemo, createSignal, For, Show, useContext } from 'solid-js';
import { format, plural, t } from '../i18n';
import { PopupsContext } from '../popups/popupContext';
import { PopupModal } from '../popups/PopupModal';
import { PopupLoadError, PopupLoading, QueryBoundary } from '../popups/QueryStatus';
import { Button, createChunks, EmptyState, Icon, Menu, SearchField, ShowMore } from '../ui';
import { ariaTrue } from '../ui/dom';
import { createDebounced, SEARCH_DELAY_MS } from '../ui/search';
import { GameCover } from './GameCover';
import { createGameSearch } from './gameData';
import type { Game } from './games';
import { playersLabel } from './labels';
import './games.css';

const text = t.games.collection;

/**
 * Popup kolekcji: siatka okładek aktywnych gier
 * z wyszukiwaniem po tytule filtrowanym na bieżąco (zapytanie po krótkiej przerwie w pisaniu).
 * Porównanie bez wielkości liter i polskich znaków robi baza (`search_games`, unaccent).
 * Administrator ma „Dodaj grę”, a przy każdej grze menu z „Edytuj”, „Notesy”, „Dodaj
 * dodatek” i „Usuń”. Dodatków nie ma w kolekcji; formularz otwiera się w tym samym stosie,
 * strzałką „wstecz”.
 */
export function CollectionPopup(props: { readonly isAdmin: boolean }) {
  const popups = useContext(PopupsContext);
  const [query, setQuery] = createSignal('');
  const deferredQuery = createDebounced(() => query().trim(), SEARCH_DELAY_MS);
  const all = createGameSearch(() => '');
  const results = createGameSearch(deferredQuery);
  const searching = () => deferredQuery() !== '';
  /** Widoczne gry: czekają na dane pod `<QueryBoundary>`. */
  const shown = createMemo(() => (searching() ? results() : all()) ?? []);
  const chunks = createChunks(shown, deferredQuery);
  const count = () => {
    const games = all.current();
    return games ? plural(games.length, t.games.count) : undefined;
  };
  /** Liczba wyników dla czytnika ekranu, bez czekania na dane. */
  const announcement = () => {
    const found = results.state();
    return searching() && found?.isSuccess ? plural(found.data?.length ?? 0, text.results) : '';
  };
  const busy = () => {
    const found = results.state();
    return !!found?.isFetching && found.isPlaceholderData;
  };

  return (
    <PopupModal
      title={text.title}
      count={count()}
      actions={
        <Show when={props.isAdmin}>
          {/* Na telefonie krótka etykieta „Dodaj”; nazwa dostępna jest zawsze pełna. */}
          <Button
            size="sm"
            icon="plus"
            aria-label={text.add}
            onClick={() => popups.open({ kind: 'add-game' })}
          >
            <span class="games-add__long">{text.add}</span>
            <span class="games-add__short">{text.addShort}</span>
          </Button>
        </Show>
      }
    >
      <QueryBoundary>
        {/* Wyszukiwarka pojawia się po wczytaniu całej kolekcji. */}
        <Show when={all()}>
          <SearchField
            label={text.searchLabel}
            placeholder={text.searchPlaceholder}
            value={query()}
            onValueChange={setQuery}
            class="games-search"
          />
          <p class="sr-only" role="status">
            {announcement()}
          </p>
          <QueryBoundary
            loading={
              <div class="games-body">
                <PopupLoading />
              </div>
            }
            error={(retry) => (
              <div class="games-body">
                <PopupLoadError onRetry={retry} />
              </div>
            )}
          >
            <Show
              when={shown().length > 0}
              fallback={
                <div class="games-body">
                  <EmptyState
                    icon={searching() ? 'search' : 'dice'}
                    title={
                      searching()
                        ? format(text.noResultsTitle, { query: deferredQuery() })
                        : text.emptyTitle
                    }
                    helper={
                      searching()
                        ? text.noResultsHelper
                        : props.isAdmin
                          ? text.emptyHelperAdmin
                          : text.emptyHelper
                    }
                  />
                </div>
              }
            >
              <ul
                class="game-grid games-body"
                aria-label={text.listLabel}
                aria-busy={ariaTrue(busy())}
              >
                <For each={chunks.visible()} keyed={(game) => game.id}>
                  {(game, index) => (
                    <GameTile
                      game={game()}
                      isAdmin={props.isAdmin}
                      chunkStart={chunks.chunkStart(index())}
                    />
                  )}
                </For>
              </ul>
              <ShowMore hidden={chunks.hidden()} onClick={chunks.showMore} />
            </Show>
          </QueryBoundary>
        </Show>
      </QueryBoundary>
    </PopupModal>
  );
}

function GameTile(props: {
  readonly game: Game;
  readonly isAdmin: boolean;
  readonly chunkStart?: string | undefined;
}) {
  const popups = useContext(PopupsContext);
  const actions = () => format(text.actions, { title: props.game.title });
  return (
    <li
      class={['game-tile', { 'game-tile--unavailable': !props.game.available }]}
      data-chunk-start={props.chunkStart}
    >
      <div class="game-tile__cover">
        <button
          type="button"
          class="game-tile__open"
          aria-label={format(props.game.available ? text.details : text.detailsUnavailable, {
            title: props.game.title,
          })}
          onClick={() => popups.open({ kind: 'game', id: props.game.id })}
        >
          <GameCover
            id={props.game.id}
            title={props.game.title}
            coverPath={props.game.cover_path}
            size="large"
            unavailable={!props.game.available}
          />
        </button>
        <Show when={props.isAdmin}>
          <Menu
            label={actions()}
            align="end"
            class="game-tile__menu"
            items={[
              {
                id: 'edit',
                label: text.edit,
                icon: 'pencil',
                onSelect: () => popups.open({ kind: 'edit-game', id: props.game.id }),
              },
              {
                id: 'scorepads',
                label: text.scorepads,
                icon: 'pad',
                onSelect: () => popups.open({ kind: 'scorepads', gameId: props.game.id }),
              },
              {
                id: 'add-expansion',
                label: text.addExpansion,
                icon: 'plus',
                onSelect: () => popups.open({ kind: 'add-expansion', baseId: props.game.id }),
              },
              {
                id: 'delete',
                label: text.delete,
                icon: 'trash',
                destructive: true,
                onSelect: () => popups.open({ kind: 'delete-game', id: props.game.id }),
              },
            ]}
            trigger={(trigger) => (
              <button
                type="button"
                {...trigger}
                class="icon-btn icon-btn--32 game-tile__more"
                aria-label={actions()}
                title={actions()}
              >
                <Icon name="more" />
              </button>
            )}
          />
        </Show>
      </div>
      <p class="game-tile__title">{props.game.title}</p>
      <p class="game-tile__meta">{playersLabel(props.game)}</p>
    </li>
  );
}
