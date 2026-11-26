import { createMemo, createSignal, Match, Show, Switch } from 'solid-js';
import { t } from '../i18n';
import type { Profile } from '../profile/profileQueries';
import { PopupLink } from '../popups/PopupLink';
import { Card, EmptyState, Icon, Tabs } from '../ui';
import { BoardError, BoardLoading } from './BoardStatus';
import { FilterBar } from './FilterBar';
import { LeaderboardBoard } from './LeaderboardBoard';
import { TiesLink } from './TiesPopup';
import { createBoardData, kindTabs } from './board';
import { hasFilters, NO_FILTERS, type LeaderboardFilters } from './filters';
import type { LeaderboardKind } from './leaderboard';
import { tieGroups } from './ties';

/**
 * Widżet rankingu (LB-1…LB-4, DS §6): zakładki Punkty / Wygrane, filtry dat i gier, podium
 * i miejsca 4–7. „Zobacz więcej” otwiera popup na tej samej zakładce i z tymi samymi filtrami,
 * „Remisy” — szczegóły rozstrzygnięcia równych wyników. Bez zapisanych partii pusty stan bez
 * CTA (CLUB-4); klasyfikowani są wszyscy z ≥ 1 partią, więc pusty ranking jest pusty we
 * wszystkich zakładkach naraz (LB-5).
 */
export function RankingWidget(props: { readonly me: Profile }) {
  const [kind, setKind] = createSignal<LeaderboardKind>('points');
  const [filters, setFilters] = createSignal<LeaderboardFilters>(NO_FILTERS);
  const board = createBoardData(kind, filters);
  const filtered = () => hasFilters(filters());
  const empty = () => board.entries()?.length === 0;
  const ties = createMemo(() => {
    const entries = board.entries();
    return !!entries && tieGroups(entries).length > 0;
  });

  return (
    <Card
      title={t.leaderboard.title}
      action={
        <Show when={board.entries() && !empty()}>
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
              <Switch fallback={<BoardLoading />}>
                <Match when={board.failed()}>
                  <BoardError onRetry={board.retry} />
                </Match>
                <Match when={board.entries()?.length === 0 && board.profiles()}>
                  <div class="leaderboard">
                    <EmptyState
                      icon="trophy"
                      title={t.leaderboard.emptyFilteredTitle}
                      helper={t.leaderboard.emptyFilteredHelper}
                    />
                  </div>
                </Match>
                <Match when={board.entries() && board.profiles()}>
                  <LeaderboardBoard
                    entries={board.entries() ?? []}
                    kind={current}
                    meId={props.me.id}
                    profiles={board.profiles() ?? new Map()}
                    variant="widget"
                  />
                </Match>
              </Switch>
            </>
          )}
        </Tabs>
      </Show>
    </Card>
  );
}
