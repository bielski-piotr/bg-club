import { useState } from 'react';
import { useAuth } from '../auth/authContext';
import { format, plural, t } from '../i18n';
import { PopupModal } from '../popups/PopupModal';
import type { Profile } from '../profile/profiles';
import { Banner, Button, EmptyState, Select, Tabs, type SelectOption } from '../ui';
import { LeaderboardBoard } from './LeaderboardBoard';
import {
  filterYear,
  useLeaderboardYears,
  type LeaderboardKind,
  type YearFilter,
} from './leaderboard';
import { kindTabs, useBoardData } from './board';
import { BoardError, BoardLoading } from './BoardStatus';

/**
 * Pełny ranking (LB-3, LB-4, DS §7): te same zakładki i podium co widżet, pełna lista oraz filtr
 * roku („Cała historia” domyślnie albo rok w strefie klubu, NFR-10). Lata pochodzą z
 * `leaderboard_years()`, więc lista zawiera tylko lata z zapisanymi partiami.
 */
export function LeaderboardPopup({
  me,
  tab = 'points',
}: {
  readonly me: Profile;
  readonly tab?: LeaderboardKind | undefined;
}) {
  const { client } = useAuth();
  const [kind, setKind] = useState<LeaderboardKind>(tab);
  const [year, setYear] = useState<YearFilter>('all');
  const years = useLeaderboardYears(client);
  const { entries, profiles, failed, retry } = useBoardData(kind, filterYear(year));
  const text = t.leaderboard;
  const options: SelectOption<YearFilter>[] = [
    { value: 'all', label: text.allTime },
    ...(years.data ?? []).map((y) => ({ value: `${y}` as const, label: String(y) })),
  ];
  // Wybrany rok, który zniknął z listy (np. po usunięciu jego jedynej partii), zostaje widoczny.
  if (year !== 'all' && !options.some((option) => option.value === year)) {
    options.push({ value: year, label: year });
  }
  const count = entries ? plural(entries.length, text.count) : undefined;

  return (
    <PopupModal title={text.title} count={count} width={560} className="leaderboard-modal">
      <div className="leaderboard-controls">
        <Tabs label={text.tabsLabel} items={kindTabs} value={kind} onChange={setKind} />
        <Select
          label={text.yearLabel}
          hideLabel
          appearance="pill"
          leadingIcon="calendar"
          options={options}
          value={year}
          onChange={setYear}
        />
      </div>
      {years.isError ? (
        <Banner
          variant="error"
          className="leaderboard-years-error"
          action={
            <Button
              size="sm"
              variant="secondary"
              icon="refresh"
              onClick={() => void years.refetch()}
            >
              {t.hub.retry}
            </Button>
          }
        >
          {text.yearsError}
        </Banner>
      ) : null}
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
              title={
                year === 'all' ? t.leaderboard.emptyTitle : format(text.emptyYearTitle, { year })
              }
              helper={year === 'all' ? t.leaderboard.emptyHelper : text.emptyYearHelper}
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
