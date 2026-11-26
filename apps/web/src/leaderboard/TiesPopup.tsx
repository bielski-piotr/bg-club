import { createMemo, For, Match, Show, Switch } from 'solid-js';
import { FALLBACK_TIMEZONE } from '../club/timezones';
import { format, formatNumber, plural, t } from '../i18n';
import { shortMeetingDate } from '../meetings/datetime';
import { fullName, type Profile } from '../profile/profileQueries';
import { createClub } from '../club/clubData';
import { PopupLink } from '../popups/PopupLink';
import { PopupModal } from '../popups/PopupModal';
import { Badge, EmptyState, Icon } from '../ui';
import { ariaBool } from '../ui/dom';
import { BoardError, BoardLoading } from './BoardStatus';
import { createBoardData } from './board';
import { datesValue, gamesValue } from './filterLabels';
import { hasDateFilter, hasFilters, NO_FILTERS, type LeaderboardFilters } from './filters';
import { createGameTitles } from './gameTitles';
import type { LeaderboardEntry, LeaderboardKind } from './leaderboard';
import { tieGroups, type TieCriterion, type TieGroup } from './ties';

/** Link „Remisy” do szczegółów rozstrzygnięcia dla bieżącej zakładki i filtrów. */
export function TiesLink(props: {
  readonly kind: LeaderboardKind;
  readonly filters: LeaderboardFilters;
}) {
  const text = t.leaderboard.ties;
  return (
    <PopupLink
      to={{
        kind: 'leaderboard-ties',
        tab: props.kind,
        ...(hasFilters(props.filters) ? { filters: props.filters } : {}),
      }}
      class="select__pill lb-ties-link"
      aria-label={`${text.button}: ${text.buttonLabel.toLocaleLowerCase('pl-PL')}`}
    >
      <Icon name="info" class="select__lead" />
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
export function TiesPopup(props: {
  readonly me: Profile;
  readonly tab: LeaderboardKind;
  readonly filters?: LeaderboardFilters | undefined;
}) {
  const filters = () => props.filters ?? NO_FILTERS;
  const club = createClub();
  const timeZone = () => club().data?.timezone ?? FALLBACK_TIMEZONE;
  const board = createBoardData(() => props.tab, filters);
  const { titles } = createGameTitles(() => filters().games.length > 0);
  const text = t.leaderboard.ties;
  const groups = createMemo(() => {
    const entries = board.entries();
    return entries ? tieGroups(entries) : undefined;
  });
  const applied = () =>
    [
      t.leaderboard.tabs[props.tab],
      ...(hasDateFilter(filters()) ? [datesValue(filters())] : []),
      ...(filters().games.length > 0 ? [gamesValue(filters(), titles())] : []),
    ].join(' · ');

  return (
    <PopupModal title={text.title} width={560} class="ties-modal">
      <div class="ties">
        <p class="ties__applied">{format(text.filtered, { filters: applied() })}</p>
        <p class="ties__intro">{text.intro}</p>
        <ol class="ties__rules">
          <For each={text.rules}>{(rule) => <li>{rule}</li>}</For>
        </ol>
        <div aria-busy={ariaBool(!board.entries())}>
          <Switch
            fallback={
              <For
                each={groups() ?? []}
                keyed={(group) => group.members[0]?.entry.profile_id ?? ''}
              >
                {(group) => (
                  <TieGroupList
                    group={group()}
                    kind={props.tab}
                    meId={props.me.id}
                    timeZone={timeZone()}
                  />
                )}
              </For>
            }
          >
            <Match when={board.failed()}>
              <BoardError onRetry={board.retry} />
            </Match>
            <Match when={!groups()}>
              <BoardLoading />
            </Match>
            <Match when={groups()?.length === 0}>
              <EmptyState icon="check" title={text.none} />
            </Match>
          </Switch>
        </div>
      </div>
    </PopupModal>
  );
}

function TieGroupList(props: {
  readonly group: TieGroup;
  readonly kind: LeaderboardKind;
  readonly meId: string;
  readonly timeZone: string;
}) {
  const text = t.leaderboard.ties;
  const range = createMemo(() => {
    const first = props.group.members[0]?.entry.place ?? 0;
    const last = props.group.members.at(-1)?.entry.place ?? first;
    return { first, last, value: unit(props.kind, props.group.value) };
  });
  return (
    <section
      class="ties__group"
      aria-label={format(text.groupLabel, {
        value: range().value,
        from: range().first,
        to: range().last,
      })}
    >
      <h3 class="ties__group-title">
        {format(text.group, { value: range().value })}
        <span class="ties__group-places tnum">
          {format(text.places, { from: range().first, to: range().last })}
        </span>
      </h3>
      <ol class="ties__list">
        <For each={props.group.members} keyed={(member) => member.entry.profile_id}>
          {(member, index) => {
            const note = () => {
              const { decidedBy } = member();
              const next = props.group.members[index() + 1]?.entry;
              return decidedBy && next
                ? format(text.decided, { name: fullName(next), reason: text.reasons[decidedBy] })
                : undefined;
            };
            return (
              <TieItem
                entry={member().entry}
                me={member().entry.profile_id === props.meId}
                decisive={member().decidedBy}
                note={note()}
                timeZone={props.timeZone}
              />
            );
          }}
        </For>
      </ol>
    </section>
  );
}

function TieItem(props: {
  readonly entry: LeaderboardEntry;
  readonly me: boolean;
  readonly decisive: TieCriterion | null;
  readonly note: string | undefined;
  readonly timeZone: string;
}) {
  const text = t.leaderboard.ties;
  const fact = (criterion: TieCriterion) => [
    'ties__fact',
    { 'ties__fact--decisive': criterion === props.decisive },
  ];
  return (
    <li class={['ties__item', { 'ties__item--me': props.me }]}>
      <div class={['ties__player', { 'ties__player--decisive': props.decisive === 'name' }]}>
        <span class="ties__place tnum">{props.entry.place}.</span>
        <span class="ties__name">{fullName(props.entry)}</span>
        <Show when={props.me}>
          <Badge tone="accent">{t.ui.youBadge}</Badge>
        </Show>
      </div>
      <dl class="ties__facts">
        <div class={fact('reached')}>
          <dt>{text.reached}</dt>
          <dd>
            <Show
              when={props.entry.reached_meeting_id && props.entry.reached_at ? props.entry : null}
              fallback={<span class="ties__muted">{text.notReached}</span>}
            >
              {(entry) => (
                <PopupLink
                  to={{ kind: 'meeting', id: entry().reached_meeting_id ?? '' }}
                  class="text-link ties__meeting"
                >
                  <span>{entry().reached_meeting_title}</span>
                  <span class="ties__meeting-date tnum">
                    {shortMeetingDate(entry().reached_at ?? '', props.timeZone)}
                  </span>
                </PopupLink>
              )}
            </Show>
          </dd>
        </div>
        <div class={fact('points')}>
          <dt>{text.meetingPoints}</dt>
          <dd class="tnum">
            {props.entry.reached_points === null ? '–' : formatNumber(props.entry.reached_points)}
          </dd>
        </div>
        <div class={fact('wins')}>
          <dt>{text.wins}</dt>
          <dd class="tnum">{props.entry.wins}</dd>
        </div>
      </dl>
      <Show when={props.note}>
        <p class="ties__note">
          <Icon name="chevron-down" size={14} />
          {props.note}
        </p>
      </Show>
    </li>
  );
}
