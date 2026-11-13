import { useEffect, useState } from 'react';
import { useAuth } from '../auth/authContext';
import { format, plural, t } from '../i18n';
import { usePopups } from '../popups/popupContext';
import { PopupModal } from '../popups/PopupModal';
import { QueryStatus } from '../popups/QueryStatus';
import { Button, EmptyState, Icon, Menu, SearchField } from '../ui';
import { GameCover } from './GameCover';
import { playersLabel } from './labels';
import { useGameSearch, type Game } from './games';
import './games.css';

const text = t.games.collection;

/** Przerwa w pisaniu, po której idzie zapytanie do bazy (bez zapytania na każdy znak). */
export const SEARCH_DELAY_MS = 200;

/** Wartość po `delay` ms bez zmian; pusta (wyczyszczenie pola) od razu. */
function useDebounced(value: string, delay: number): string {
  const [debounced, setDebounced] = useState(value);
  useEffect(() => {
    const timer = window.setTimeout(() => setDebounced(value), value === '' ? 0 : delay);
    return () => window.clearTimeout(timer);
  }, [value, delay]);
  return debounced;
}

/**
 * Popup kolekcji (PRD GAME-2, GAME-3, DS „Kolekcja / Popup”): siatka okładek aktywnych gier
 * z wyszukiwaniem po tytule filtrowanym na bieżąco (zapytanie po krótkiej przerwie w pisaniu).
 * Porównanie bez wielkości liter i polskich znaków robi baza (`search_games`, unaccent). Administrator ma „Dodaj grę”, a przy każdej grze
 * menu z „Edytuj” i „Usuń”; formularz otwiera się w tym samym stosie, ze strzałką „wstecz”.
 */
export function CollectionPopup({ isAdmin }: { readonly isAdmin: boolean }) {
  const { client } = useAuth();
  const { open } = usePopups();
  const [query, setQuery] = useState('');
  const deferredQuery = useDebounced(query.trim(), SEARCH_DELAY_MS);
  const all = useGameSearch(client, '');
  const results = useGameSearch(client, deferredQuery);
  const searching = deferredQuery !== '';
  const shown = searching ? results.data : all.data;
  const count = all.data ? plural(all.data.length, t.games.count) : undefined;

  const actions = isAdmin ? (
    // Na telefonie krótka etykieta „Dodaj” (DS §7); nazwa dostępna jest zawsze pełna.
    <Button size="sm" icon="plus" aria-label={text.add} onClick={() => open({ kind: 'add-game' })}>
      <span className="games-add__long">{text.add}</span>
      <span className="games-add__short">{text.addShort}</span>
    </Button>
  ) : undefined;

  const status = searching ? results : all;
  return (
    <PopupModal title={text.title} count={count} actions={actions}>
      {all.isSuccess ? (
        <>
          <SearchField
            label={text.searchLabel}
            placeholder={text.searchPlaceholder}
            value={query}
            onValueChange={setQuery}
            className="games-search"
          />
          <p className="sr-only" role="status">
            {searching && results.isSuccess ? plural(results.data.length, text.results) : ''}
          </p>
          {shown === undefined ? (
            <div className="games-body">
              <QueryStatus isError={status.isError} onRetry={() => void status.refetch()} />
            </div>
          ) : shown.length > 0 ? (
            <ul
              className="game-grid games-body"
              aria-label={text.listLabel}
              aria-busy={results.isFetching && results.isPlaceholderData ? true : undefined}
            >
              {shown.map((game) => (
                <GameTile key={game.id} game={game} isAdmin={isAdmin} />
              ))}
            </ul>
          ) : (
            <div className="games-body">
              <EmptyState
                icon={searching ? 'search' : 'dice'}
                title={
                  searching
                    ? format(text.noResultsTitle, { query: deferredQuery })
                    : text.emptyTitle
                }
                helper={
                  searching
                    ? text.noResultsHelper
                    : isAdmin
                      ? text.emptyHelperAdmin
                      : text.emptyHelper
                }
              />
            </div>
          )}
        </>
      ) : (
        <QueryStatus isError={all.isError} onRetry={() => void all.refetch()} />
      )}
    </PopupModal>
  );
}

function GameTile({ game, isAdmin }: { readonly game: Game; readonly isAdmin: boolean }) {
  const { open } = usePopups();
  return (
    <li className="game-tile">
      <div className="game-tile__cover">
        <GameCover id={game.id} title={game.title} coverPath={game.cover_path} size="large" />
        {isAdmin ? (
          <Menu
            label={format(text.actions, { title: game.title })}
            align="end"
            className="game-tile__menu"
            items={[
              {
                id: 'edit',
                label: text.edit,
                icon: 'pencil',
                onSelect: () => open({ kind: 'edit-game', id: game.id }),
              },
              {
                id: 'delete',
                label: text.delete,
                icon: 'trash',
                destructive: true,
                onSelect: () => open({ kind: 'delete-game', id: game.id }),
              },
            ]}
            trigger={(props) => (
              <button
                type="button"
                {...props}
                className="icon-btn icon-btn--32 game-tile__more"
                aria-label={format(text.actions, { title: game.title })}
                title={format(text.actions, { title: game.title })}
              >
                <Icon name="more" />
              </button>
            )}
          />
        ) : null}
      </div>
      <p className="game-tile__title">{game.title}</p>
      <p className="game-tile__meta">{playersLabel(game)}</p>
    </li>
  );
}
