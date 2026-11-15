import { useState } from 'react';
import { t } from '../i18n';
import { PopupLink } from '../popups/PopupLink';
import type { Profile } from '../profile/profiles';
import { Banner, Button, Card, EmptyState, Icon, Skeleton, Spinner, Tabs } from '../ui';
import { LeaderboardBoard } from './LeaderboardBoard';
import { kindTabs, useBoardData } from './board';
import type { LeaderboardKind } from './leaderboard';

export function BoardError({ onRetry }: { readonly onRetry: () => void }) {
  return (
    <Banner
      variant="error"
      className="leaderboard-error"
      action={
        <Button size="sm" variant="secondary" icon="refresh" onClick={onRetry}>
          {t.hub.retry}
        </Button>
      }
    >
      {t.hub.loadError}
    </Banner>
  );
}

export function BoardLoading() {
  return (
    <div className="leaderboard leaderboard--loading">
      <Skeleton width={240} height={120} radius={14} />
      <Spinner label={t.leaderboard.loading} className="sr-only" />
    </div>
  );
}

/**
 * Widżet rankingu (LB-1…LB-3, DS §6): zakładki Punkty / Wygrane / Seria, podium i miejsca 4–7,
 * zawsze z całej historii (LB-4). „Zobacz więcej” otwiera popup na tej samej zakładce. Bez
 * zapisanych partii pusty stan bez CTA (CLUB-4); klasyfikowani są wszyscy z ≥ 1 partią, więc
 * pusty ranking jest pusty we wszystkich zakładkach naraz (LB-5).
 */
export function RankingWidget({ me }: { readonly me: Profile }) {
  const [kind, setKind] = useState<LeaderboardKind>('points');
  const { entries, profiles, failed, retry } = useBoardData(kind, null);
  const empty = entries !== undefined && entries.length === 0;
  const action =
    entries && !empty ? (
      <PopupLink
        to={{ kind: 'leaderboard', tab: kind }}
        className="text-link"
        aria-label={t.leaderboard.seeMore}
      >
        <span>{t.ui.seeMore}</span>
        <Icon name="chevron-right" />
      </PopupLink>
    ) : undefined;

  return (
    <Card title={t.leaderboard.title} action={action}>
      {empty ? (
        <EmptyState
          icon="trophy"
          title={t.hub.ranking.emptyTitle}
          helper={t.hub.ranking.emptyHelper}
        />
      ) : (
        <Tabs
          label={t.leaderboard.tabsLabel}
          items={kindTabs}
          value={kind}
          onChange={setKind}
          className="leaderboard-tabs"
        >
          {(current) =>
            failed ? (
              <BoardError onRetry={retry} />
            ) : entries && profiles ? (
              <LeaderboardBoard
                entries={entries}
                kind={current}
                meId={me.id}
                profiles={profiles}
                variant="widget"
              />
            ) : (
              <BoardLoading />
            )
          }
        </Tabs>
      )}
    </Card>
  );
}
