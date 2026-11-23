import { useState } from 'react';
import { t } from '../i18n';
import { PopupLink } from '../popups/PopupLink';
import type { Profile } from '../profile/profiles';
import { Card, EmptyState, Icon, Tabs } from '../ui';
import { BoardError, BoardLoading } from './BoardStatus';
import { FilterBar } from './FilterBar';
import { LeaderboardBoard } from './LeaderboardBoard';
import { TiesLink } from './TiesPopup';
import { kindTabs, useBoardData } from './board';
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
export function RankingWidget({ me }: { readonly me: Profile }) {
  const [kind, setKind] = useState<LeaderboardKind>('points');
  const [filters, setFilters] = useState<LeaderboardFilters>(NO_FILTERS);
  const { entries, profiles, failed, retry } = useBoardData(kind, filters);
  const filtered = hasFilters(filters);
  const empty = entries !== undefined && entries.length === 0;
  const action =
    entries && !empty ? (
      <PopupLink
        to={{ kind: 'leaderboard', tab: kind, ...(filtered ? { filters } : {}) }}
        className="text-link"
        aria-label={t.leaderboard.seeMore}
      >
        <span>{t.ui.seeMore}</span>
        <Icon name="chevron-right" />
      </PopupLink>
    ) : undefined;

  return (
    <Card title={t.leaderboard.title} action={action}>
      {empty && !filtered ? (
        <EmptyState
          icon="trophy"
          title={t.leaderboard.emptyTitle}
          helper={t.leaderboard.emptyHelper}
        />
      ) : (
        <Tabs
          label={t.leaderboard.tabsLabel}
          items={kindTabs}
          value={kind}
          onChange={setKind}
          className="leaderboard-tabs"
        >
          {(current) => (
            <>
              <FilterBar
                filters={filters}
                onChange={setFilters}
                extra={
                  entries && tieGroups(entries).length > 0 ? (
                    <TiesLink kind={current} filters={filters} />
                  ) : undefined
                }
              />
              {failed ? (
                <BoardError onRetry={retry} />
              ) : entries && profiles ? (
                entries.length === 0 ? (
                  <div className="leaderboard">
                    <EmptyState
                      icon="trophy"
                      title={t.leaderboard.emptyFilteredTitle}
                      helper={t.leaderboard.emptyFilteredHelper}
                    />
                  </div>
                ) : (
                  <LeaderboardBoard
                    entries={entries}
                    kind={current}
                    meId={me.id}
                    profiles={profiles}
                    variant="widget"
                  />
                )
              ) : (
                <BoardLoading />
              )}
            </>
          )}
        </Tabs>
      )}
    </Card>
  );
}
