import { createMemo, createSignal, Show } from 'solid-js';
import { t } from '../i18n';
import type { Profile } from '../profile/profileQueries';
import { PopupLink } from '../popups/PopupLink';
import { Card, EmptyState, Icon, Tabs } from '../ui';
import { BoardBoundary } from './BoardStatus';
import { FilterBar } from './FilterBar';
import { LeaderboardBoard } from './LeaderboardBoard';
import { TiesLink } from './TiesPopup';
import { createBoardData, kindTabs } from './board';
import { hasFilters, NO_FILTERS, type LeaderboardFilters } from './filters';
import type { LeaderboardKind } from './leaderboard';
import { tieGroups } from './ties';

/**
 * Widżet rankingu: zakładki Punkty / Wygrane, filtry dat i gier, podium
 * i miejsca 4–7. „Zobacz więcej” otwiera popup na tej samej zakładce i z tymi samymi filtrami,
 * „Remisy” — szczegóły rozstrzygnięcia równych wyników. Bez zapisanych partii pusty stan bez
 * CTA; klasyfikowani są wszyscy z ≥ 1 partią, więc pusty ranking jest pusty
 * wszystkich zakładkach naraz.
 */
export function RankingWidget(props: { readonly me: Profile }) {
  const [kind, setKind] = createSignal<LeaderboardKind>('points');
  const [filters, setFilters] = createSignal<LeaderboardFilters>(NO_FILTERS);
  const board = createBoardData(kind, filters);
  const filtered = () => hasFilters(filters());
  // Nagłówek, zakładki i filtry są widoczne od razu: czytają dane z cache bez czekania.
  const empty = () => board.entries.current()?.length === 0;
  const ties = createMemo(() => {
    const entries = board.entries.current();
    return !!entries && tieGroups(entries).length > 0;
  });

  return (
    <Card
      title={t.leaderboard.title}
      action={
        <Show when={board.entries.current() && !empty()}>
          <PopupLink
            to={{ kind: 'leaderboard', tab: kind(), ...(filtered() ? { filters: filters() } : {}) }}
            class="text-link"
            aria-label={t.leaderboard.seeMore}
          >
            <span>{t.ui.seeMore}</span>
            <Icon name="chevron-right" />
          </PopupLink>
        </Show>
      }
    >
      <Show
        when={!(empty() && !filtered())}
        fallback={
          <EmptyState
            icon="trophy"
            title={t.leaderboard.emptyTitle}
            helper={t.leaderboard.emptyHelper}
          />
        }
      >
        <Tabs
          label={t.leaderboard.tabsLabel}
          items={kindTabs}
          value={kind()}
          onChange={setKind}
          class="leaderboard-tabs"
        >
          {(current) => (
            <>
              <FilterBar
                filters={filters()}
                onChange={setFilters}
                extra={
                  <Show when={ties()}>
                    <TiesLink kind={current} filters={filters()} />
                  </Show>
                }
              />
              <BoardBoundary on={current}>
                <Show
                  when={board.entries().length > 0}
                  fallback={
                    <div class="leaderboard">
                      <EmptyState
                        icon="trophy"
                        title={t.leaderboard.emptyFilteredTitle}
                        helper={t.leaderboard.emptyFilteredHelper}
                      />
                    </div>
                  }
                >
                  <LeaderboardBoard
                    entries={board.entries()}
                    kind={current}
                    meId={props.me.id}
                    profiles={board.profiles()}
                    variant="widget"
                  />
                </Show>
              </BoardBoundary>
            </>
          )}
        </Tabs>
      </Show>
    </Card>
  );
}
