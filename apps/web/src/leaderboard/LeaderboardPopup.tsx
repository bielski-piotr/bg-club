import { useState } from 'react';
import { plural, t } from '../i18n';
import { PopupModal } from '../popups/PopupModal';
import type { Profile } from '../profile/profiles';
import { EmptyState, Tabs } from '../ui';
import { LeaderboardBoard } from './LeaderboardBoard';
import { FilterBar } from './FilterBar';
import { TiesLink } from './TiesPopup';
import { kindTabs, useBoardData } from './board';
import { BoardError, BoardLoading } from './BoardStatus';
import { hasFilters, NO_FILTERS, type LeaderboardFilters } from './filters';
import type { LeaderboardKind } from './leaderboard';
import { tieGroups } from './ties';

/**
 * Pełny ranking (LB-3, LB-4, DS §7): te same zakładki, filtry i podium co widżet oraz pełna
 * lista. Filtry startowe (z widżetu albo adresu) można dalej zmieniać i czyścić; zakres dat
 * liczy się w strefie klubu (NFR-10).
 */
export function LeaderboardPopup({
  me,
  tab = 'points',
  filters: initialFilters = NO_FILTERS,
}: {
  readonly me: Profile;
  readonly tab?: LeaderboardKind | undefined;
  readonly filters?: LeaderboardFilters | undefined;
}) {
  const [kind, setKind] = useState<LeaderboardKind>(tab);
  const [filters, setFilters] = useState<LeaderboardFilters>(initialFilters);
  const { entries, profiles, failed, retry } = useBoardData(kind, filters);
  const text = t.leaderboard;
  const count = entries ? plural(entries.length, text.count) : undefined;
  const filtered = hasFilters(filters);

  return (
    <PopupModal title={text.title} count={count} width={560} className="leaderboard-modal">
      <div className="leaderboard-controls">
        <Tabs label={text.tabsLabel} items={kindTabs} value={kind} onChange={setKind} />
        <FilterBar
          filters={filters}
          onChange={setFilters}
          extra={
            entries && tieGroups(entries).length > 0 ? (
              <TiesLink kind={kind} filters={filters} />
            ) : undefined
          }
        />
      </div>
      <div aria-busy={!entries}>
        {failed ? (
          <div className="leaderboard">
            <BoardError onRetry={retry} />
          </div>
        ) : !entries || !profiles ? (
          <BoardLoading />
        ) : entries.length === 0 ? (
          <div className="leaderboard">
            <EmptyState
              icon="trophy"
              title={filtered ? text.emptyFilteredTitle : text.emptyTitle}
              helper={filtered ? text.emptyFilteredHelper : text.emptyHelper}
            />
          </div>
        ) : (
          <LeaderboardBoard
            entries={entries}
            kind={kind}
            meId={me.id}
            profiles={profiles}
            variant="popup"
          />
        )}
      </div>
    </PopupModal>
  );
}
