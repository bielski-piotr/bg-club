import { For, Show, useContext } from 'solid-js';
import { plural, t } from '../i18n';
import { PopupsContext } from '../popups/popupContext';
import { PopupLink } from '../popups/PopupLink';
import { QueryBoundary } from '../popups/QueryStatus';
import { Banner, Button, Card, EmptyState, Icon, Skeleton, Spinner, Tray } from '../ui';
import { GameCover } from './GameCover';
import { createCollectionWidget } from './gameData';
import { playersLabel } from './labels';

/**
 * Widżet kolekcji: kilka gier w kolejności (ostatnio grane,
 * potem ostatnio dodane). Pierwsza ma dużą okładkę, kolejne są wierszami tacy z miniaturą.
 * „Zobacz więcej” otwiera popup kolekcji; pusty stan administratora ma „Dodaj grę”.
 */
export function CollectionWidget(props: { readonly isAdmin: boolean }) {
  const popups = useContext(PopupsContext);
  const collection = createCollectionWidget();
  // Nagłówek karty jest widoczny od razu: licznik i link pojawiają się, gdy dane są w cache.
  const data = () => collection.current();
  /** Gry poza pierwszą: czeka na dane pod `<QueryBoundary>`. */
  const rest = () => collection().games.slice(1);

  return (
    <Card
      title={t.hub.collection.title}
      count={data() ? plural(data()?.total ?? 0, t.games.count) : undefined}
      action={
        <Show when={(data()?.total ?? 0) > 0}>
          <PopupLink to={{ kind: 'games' }} class="text-link">
            <span>{t.ui.seeMore}</span>
            <Icon name="chevron-right" />
          </PopupLink>
        </Show>
      }
    >
      <QueryBoundary
        loading={
          <div class="collection-widget__loading">
            <Skeleton width={148} height={148} radius={18} />
            <Spinner label={t.hub.collection.loading} class="sr-only" />
          </div>
        }
        error={(retry) => (
          <Banner
            variant="error"
            class="collection-widget__error"
            action={
              <Button size="sm" variant="secondary" icon="refresh" onClick={retry}>
                {t.hub.retry}
              </Button>
            }
          >
            {t.hub.loadError}
          </Banner>
        )}
      >
        <Show
          when={collection().games[0]}
          fallback={
            <EmptyState
              icon="dice"
              title={t.hub.collection.emptyTitle}
              helper={
                props.isAdmin ? t.hub.collection.emptyHelperAdmin : t.hub.collection.emptyHelper
              }
              action={
                <Show when={props.isAdmin}>
                  <Button icon="plus" fullWidth onClick={() => popups.open({ kind: 'add-game' })}>
                    {t.hub.collection.add}
                  </Button>
                </Show>
              }
            />
          }
        >
          {(game) => (
            <div class="collection-widget">
              <PopupLink to={{ kind: 'games' }} class="collection-widget__featured">
                <GameCover
                  id={game().id}
                  title={game().title}
                  coverPath={game().cover_path}
                  size="large"
                  class="collection-widget__cover"
                  unavailable={!game().available}
                />
                <span class="collection-widget__text">
                  <span class="collection-widget__title">{game().title}</span>
                  <span class="collection-widget__meta">{playersLabel(game())}</span>
                </span>
              </PopupLink>
              <Show when={rest().length > 0}>
                <Tray label={t.hub.collection.listLabel}>
                  <For each={rest()} keyed={(item) => item.id}>
                    {(item) => (
                      <li class="tray__item">
                        <PopupLink
                          to={{ kind: 'games' }}
                          class="row row--54 row--interactive collection-widget__row"
                        >
                          <span class="row__leading">
                            <GameCover
                              id={item().id}
                              title={item().title}
                              coverPath={item().cover_path}
                              size="thumb"
                              unavailable={!item().available}
                            />
                          </span>
                          <span class="row__text">
                            <span class="row__title">{item().title}</span>
                            <span class="row__meta">{playersLabel(item())}</span>
                          </span>
                          <Icon name="chevron-right" class="row__chevron" />
                        </PopupLink>
                      </li>
                    )}
                  </For>
                </Tray>
              </Show>
            </div>
          )}
        </Show>
      </QueryBoundary>
    </Card>
  );
}
