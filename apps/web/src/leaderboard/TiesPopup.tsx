import { useAuth } from '../auth/authContext';
import { FALLBACK_TIMEZONE } from '../club/timezones';
import { useClub } from '../hub/club';
import { format, formatNumber, plural, t } from '../i18n';
import { shortMeetingDate } from '../meetings/datetime';
import { PopupLink } from '../popups/PopupLink';
import { PopupModal } from '../popups/PopupModal';
import { fullName, type Profile } from '../profile/profiles';
import { Badge, EmptyState, Icon } from '../ui';
import { cx } from '../ui/cx';
import { BoardError, BoardLoading } from './BoardStatus';
import { useBoardData } from './board';
import { datesValue, gamesValue, useGameTitles } from './filterLabels';
import { hasDateFilter, hasFilters, NO_FILTERS, type LeaderboardFilters } from './filters';
import type { LeaderboardEntry, LeaderboardKind } from './leaderboard';
import { tieGroups, type TieCriterion, type TieGroup } from './ties';

/** Link „Remisy” do szczegółów rozstrzygnięcia dla bieżącej zakładki i filtrów. */
export function TiesLink({
  kind,
  filters,
}: {
  readonly kind: LeaderboardKind;
  readonly filters: LeaderboardFilters;
}) {
  const text = t.leaderboard.ties;
  return (
    <PopupLink
      to={{ kind: 'leaderboard-ties', tab: kind, ...(hasFilters(filters) ? { filters } : {}) }}
      className="select__pill lb-ties-link"
      aria-label={`${text.button}: ${text.buttonLabel.toLocaleLowerCase('pl-PL')}`}
    >
      <Icon name="info" className="select__lead" />
      <span>{text.button}</span>
    </PopupLink>
  );
}

function unit(kind: LeaderboardKind, value: number) {
  return `${formatNumber(value)} ${plural(value, t.leaderboard.units[kind])}`;
}

/**
 * Jak rozstrzygnięto równe wyniki (ranking nie ma miejsc ex aequo): reguły po kolei i każda
 * grupa graczy z tym samym wynikiem z danymi kryteriów — spotkaniem osiągnięcia wyniku,
 * punktami na nim i liczbą wygranych — oraz kryterium, które ustawiło sąsiadów.
 */
export function TiesPopup({
  me,
  tab,
  filters = NO_FILTERS,
}: {
  readonly me: Profile;
  readonly tab: LeaderboardKind;
  readonly filters?: LeaderboardFilters | undefined;
}) {
  const { client } = useAuth();
  const club = useClub(client);
  const timeZone = club.data?.timezone ?? FALLBACK_TIMEZONE;
  const { entries, failed, retry } = useBoardData(tab, filters);
  const { titles } = useGameTitles(filters.games.length > 0);
  const text = t.leaderboard.ties;
  const groups = entries ? tieGroups(entries) : undefined;
  const applied = [
    t.leaderboard.tabs[tab],
    ...(hasDateFilter(filters) ? [datesValue(filters)] : []),
    ...(filters.games.length > 0 ? [gamesValue(filters, titles)] : []),
  ].join(' · ');

  return (
    <PopupModal title={text.title} width={560} className="ties-modal">
      <div className="ties">
        <p className="ties__applied">{format(text.filtered, { filters: applied })}</p>
        <p className="ties__intro">{text.intro}</p>
        <ol className="ties__rules">
          {text.rules.map((rule) => (
            <li key={rule}>{rule}</li>
          ))}
        </ol>
        <div aria-busy={!entries}>
          {failed ? (
            <BoardError onRetry={retry} />
          ) : !groups ? (
            <BoardLoading />
          ) : groups.length === 0 ? (
            <EmptyState icon="check" title={text.none} />
          ) : (
            groups.map((group) => (
              <TieGroupList
                key={group.members[0]?.entry.profile_id}
                group={group}
                kind={tab}
                meId={me.id}
                timeZone={timeZone}
              />
            ))
          )}
        </div>
      </div>
    </PopupModal>
  );
}

function TieGroupList({
  group,
  kind,
  meId,
  timeZone,
}: {
  readonly group: TieGroup;
  readonly kind: LeaderboardKind;
  readonly meId: string;
  readonly timeZone: string;
}) {
  const text = t.leaderboard.ties;
  const first = group.members[0]?.entry.place ?? 0;
  const last = group.members.at(-1)?.entry.place ?? first;
  const value = unit(kind, group.value);
  return (
    <section
      className="ties__group"
      aria-label={format(text.groupLabel, { value, from: first, to: last })}
    >
      <h3 className="ties__group-title">
        {format(text.group, { value })}
        <span className="ties__group-places tnum">
          {format(text.places, { from: first, to: last })}
        </span>
      </h3>
      <ol className="ties__list">
        {group.members.map(({ entry, decidedBy }, index) => {
          const next = group.members[index + 1]?.entry;
          return (
            <TieItem
              key={entry.profile_id}
              entry={entry}
              me={entry.profile_id === meId}
              decisive={decidedBy}
              note={
                decidedBy && next
                  ? format(text.decided, { name: fullName(next), reason: text.reasons[decidedBy] })
                  : undefined
              }
              timeZone={timeZone}
            />
          );
        })}
      </ol>
    </section>
  );
}

function TieItem({
  entry,
  me,
  decisive,
  note,
  timeZone,
}: {
  readonly entry: LeaderboardEntry;
  readonly me: boolean;
  readonly decisive: TieCriterion | null;
  readonly note: string | undefined;
  readonly timeZone: string;
}) {
  const text = t.leaderboard.ties;
  const fact = (criterion: TieCriterion) =>
    cx('ties__fact', criterion === decisive && 'ties__fact--decisive');
  return (
    <li className={cx('ties__item', me && 'ties__item--me')}>
      <div className={cx('ties__player', decisive === 'name' && 'ties__player--decisive')}>
        <span className="ties__place tnum">{entry.place}.</span>
        <span className="ties__name">{fullName(entry)}</span>
        {me ? <Badge tone="accent">{t.ui.youBadge}</Badge> : null}
      </div>
      <dl className="ties__facts">
        <div className={fact('reached')}>
          <dt>{text.reached}</dt>
          <dd>
            {entry.reached_meeting_id && entry.reached_at ? (
              <PopupLink
                to={{ kind: 'meeting', id: entry.reached_meeting_id }}
                className="text-link ties__meeting"
              >
                <span>{entry.reached_meeting_title}</span>
                <span className="ties__meeting-date tnum">
                  {shortMeetingDate(entry.reached_at, timeZone)}
                </span>
              </PopupLink>
            ) : (
              <span className="ties__muted">{text.notReached}</span>
            )}
          </dd>
        </div>
        <div className={fact('points')}>
          <dt>{text.meetingPoints}</dt>
          <dd className="tnum">
            {entry.reached_points === null ? '–' : formatNumber(entry.reached_points)}
          </dd>
        </div>
        <div className={fact('wins')}>
          <dt>{text.wins}</dt>
          <dd className="tnum">{entry.wins}</dd>
        </div>
      </dl>
      {note ? (
        <p className="ties__note">
          <Icon name="chevron-down" size={14} />
          {note}
        </p>
      ) : null}
    </li>
  );
}
