import { useState } from 'react';
import { t } from '../i18n';
import { PopupLink } from '../popups/PopupLink';
import type { Profile } from '../profile/profiles';
import { Card, EmptyState, Icon, Tabs } from '../ui';
import { BoardError, BoardLoading } from './BoardStatus';
import { LeaderboardBoard } from './LeaderboardBoard';
import { kindTabs, useBoardData } from './board';
import type { LeaderboardKind } from './leaderboard';

/**
 * Widżet rankingu: zakładki Punkty / Wygrane / Seria, podium i miejsca 4–7,
 * zawsze z całej historii. „Zobacz więcej” otwiera popup na tej samej zakładce. Bez
 * zapisanych partii pusty stan bez CTA; klasyfikowani są wszyscy z ≥ 1 partią, więc
 * pusty ranking jest pusty we wszystkich zakładkach naraz.
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
