import { createMemo, createSignal, Match, Show, Switch, untrack } from 'solid-js';
import { plural, t } from '../i18n';
import type { Profile } from '../profile/profileQueries';
import { PopupModal } from '../popups/PopupModal';
import { EmptyState, Tabs } from '../ui';
import { ariaBool } from '../ui/dom';
import { BoardError, BoardLoading } from './BoardStatus';
import { FilterBar } from './FilterBar';
import { LeaderboardBoard } from './LeaderboardBoard';
import { TiesLink } from './TiesPopup';
import { createBoardData, kindTabs } from './board';
import { hasFilters, NO_FILTERS, type LeaderboardFilters } from './filters';
import type { LeaderboardKind } from './leaderboard';
import { tieGroups } from './ties';

/**
 * Pełny ranking (LB-3, LB-4, DS §7): te same zakładki, filtry i podium co widżet oraz pełna
 * lista. Filtry startowe (z widżetu albo adresu) można dalej zmieniać i czyścić; zakres dat
 * liczy się w strefie klubu (NFR-10).
 */
export function LeaderboardPopup(props: {
  readonly me: Profile;
  readonly tab?: LeaderboardKind | undefined;
  readonly filters?: LeaderboardFilters | undefined;
}) {
  // Zakładka i filtry z adresu są tylko wartościami startowymi (świadomie jednorazowy odczyt):
  // odświeżenie propsów przez hosta nie cofa wyboru użytkownika.
  const [kind, setKind] = createSignal<LeaderboardKind>(untrack(() => props.tab ?? 'points'));
  const [filters, setFilters] = createSignal<LeaderboardFilters>(
    untrack(() => props.filters ?? NO_FILTERS),
  );
  const board = createBoardData(kind, filters);
  const text = t.leaderboard;
  const count = () => {
    const entries = board.entries();
    return entries ? plural(entries.length, text.count) : undefined;
  };
  const filtered = () => hasFilters(filters());
  const ties = createMemo(() => {
    const entries = board.entries();
    return !!entries && tieGroups(entries).length > 0;
  });

  return (
    <PopupModal title={text.title} count={count()} width={560} class="leaderboard-modal">
      <div class="leaderboard-controls">
        <Tabs label={text.tabsLabel} items={kindTabs} value={kind()} onChange={setKind} />
        <FilterBar
          filters={filters()}
          onChange={setFilters}
          extra={
            <Show when={ties()}>
              <TiesLink kind={kind()} filters={filters()} />
            </Show>
          }
        />
      </div>
      <div aria-busy={ariaBool(!board.entries())}>
        <Switch fallback={<BoardLoading />}>
          <Match when={board.failed()}>
            <div class="leaderboard">
              <BoardError onRetry={board.retry} />
            </div>
          </Match>
          <Match when={board.entries()?.length === 0 && board.profiles()}>
            <div class="leaderboard">
              <EmptyState
                icon="trophy"
                title={filtered() ? text.emptyFilteredTitle : text.emptyTitle}
                helper={filtered() ? text.emptyFilteredHelper : text.emptyHelper}
              />
            </div>
          </Match>
          <Match when={board.entries() && board.profiles()}>
            <LeaderboardBoard
              entries={board.entries() ?? []}
              kind={kind()}
              meId={props.me.id}
              profiles={board.profiles() ?? new Map()}
              variant="popup"
            />
          </Match>
        </Switch>
      </div>
    </PopupModal>
  );
}
