import { createMemo, For, Show } from 'solid-js';
import { format, formatNumber, plural, t } from '../i18n';
import { shortMeetingDate } from '../meetings/datetime';
import { fullName, type Profile } from '../profile/profileQueries';
import { PopupLink } from '../popups/PopupLink';
import { QueryBoundary } from '../popups/QueryStatus';
import { ProfileAvatar } from '../profile/ProfileAvatar';
import { ProfileLink } from '../profile/ProfileLink';
import { createAllProfiles } from '../profile/profiles';
import { EmptyState, Icon, ListRow, Tray } from '../ui';
import { createGameStats } from './gameData';
import { formatScore, type GameRecord, type GameStats } from './gameStatsData';

const text = t.games.details.stats;

/**
 * Statystyki gry w szczegółach gry (GAME-10, GAME-11): liczba partii, najczęstszy zwycięzca,
 * średni wynik zwycięzcy, rekord gry (wszyscy rekordziści przy równej wartości, Q25; kto
 * i kiedy, z linkiem do spotkania) i ranking graczy w grze (wygrane, punkty). Datę ostatniej
 * partii pokazuje nagłówek szczegółów gry.
 */
export function GameStatsSection(props: {
  readonly gameId: string;
  readonly title: string;
  readonly timeZone: string;
}) {
  const stats = createGameStats(() => props.gameId);
  const profiles = createAllProfiles();
  const headingId = () => `${props.gameId}-stats`;
  /** Statystyki z profilami (oba zapytania czekają pod `<QueryBoundary>`); bez partii `null`. */
  const body = createMemo(() => {
    const data = stats();
    const people = profiles();
    return data?.play_count ? { data, people } : null;
  });
  return (
    <section class="meeting-view__section" aria-labelledby={headingId()}>
      <div class="meeting-view__head-row">
        <h3 id={headingId()} class="meeting-view__head">
          {text.title}
        </h3>
      </div>
      <QueryBoundary>
        <Show
          when={body()}
          fallback={<EmptyState icon="trophy" title={text.emptyTitle} helper={text.empty} />}
        >
          {(shown) => (
            <StatsBody
              stats={shown().data}
              profiles={shown().people}
              title={props.title}
              timeZone={props.timeZone}
            />
          )}
        </Show>
      </QueryBoundary>
    </section>
  );
}

function StatsBody(props: {
  readonly stats: GameStats;
  readonly profiles: ReadonlyMap<string, Profile>;
  readonly title: string;
  readonly timeZone: string;
}) {
  const name = (id: string) => {
    const person = props.profiles.get(id);
    return person ? fullName(person) : t.meetings.plays.unknownPlayer;
  };
  const topWins = () => props.stats.top_winners[0]?.wins ?? 0;
  return (
    <>
      <dl class="game-stats">
        <div class="game-stats__tile">
          <dt class="game-stats__label">{text.plays}</dt>
          <dd class="game-stats__value">{props.stats.play_count}</dd>
        </div>
        <div class="game-stats__tile game-stats__tile--wide">
          <dt class="game-stats__label">{text.topWinner}</dt>
          <dd class="game-stats__value">
            {props.stats.top_winners.length > 0
              ? props.stats.top_winners.map((winner) => name(winner.profile_id)).join(', ')
              : text.none}
            <Show when={topWins() > 0}>
              <span class="game-stats__sub game-stats__sub--block">
                {plural(topWins(), text.topWins)}
              </span>
            </Show>
          </dd>
        </div>
        <div class="game-stats__tile">
          <dt class="game-stats__label">{text.winnerAverage}</dt>
          <dd class="game-stats__value">
            {props.stats.winner_average !== null
              ? formatScore(props.stats.winner_average, 1)
              : text.none}
          </dd>
        </div>
      </dl>
      <RecordBlock
        record={props.stats.record}
        profiles={props.profiles}
        timeZone={props.timeZone}
      />
      <h4 class="meeting-view__head">{text.ranking}</h4>
      <Tray label={format(text.rankingLabel, { title: props.title })}>
        <For each={props.stats.ranking} keyed={(entry) => entry.profile_id}>
          {(entry) => {
            const person = () => props.profiles.get(entry().profile_id);
            const label = () => name(entry().profile_id);
            return (
              <ListRow
                muted={entry().deleted}
                leading={
                  <>
                    <span class="rank">{entry().place}</span>
                    <Show when={person()}>
                      {(shown) => (
                        <ProfileLink id={shown().id} name={label()}>
                          <ProfileAvatar profile={shown()} size={36} decorative />
                        </ProfileLink>
                      )}
                    </Show>
                  </>
                }
                title={entry().deleted ? `${label()} ${text.removed}` : label()}
                meta={format(text.rankingMeta, {
                  plays: plural(entry().plays, text.rankingPlays),
                  wins: plural(entry().wins, text.wins),
                })}
                trailing={
                  <span class="score">
                    {formatNumber(entry().points)}
                    <span class="score__unit">{text.points}</span>
                  </span>
                }
              />
            );
          }}
        </For>
      </Tray>
    </>
  );
}

function RecordBlock(props: {
  readonly record: GameRecord | null;
  readonly profiles: ReadonlyMap<string, Profile>;
  readonly timeZone: string;
}) {
  return (
    <div class="game-record">
      <span class="game-record__icon" aria-hidden="true">
        <Icon name="trophy" size={20} />
      </span>
      <div class="game-record__body">
        <span class="game-stats__label">{text.record}</span>
        <Show when={props.record} fallback={<p class="game-stats__sub">{text.recordEmpty}</p>}>
          {(record) => (
            <>
              <p class="game-record__value">
                {formatScore(record().value)}
                <Show when={record().dir === 'asc'}>
                  <span class="game-record__dir">{text.recordAsc}</span>
                </Show>
              </p>
              <ul class="game-record__holders">
                <For each={record().holders} keyed={(holder) => holder.profile_id}>
                  {(holder) => {
                    const person = () => props.profiles.get(holder().profile_id);
                    const name = () => {
                      const shown = person();
                      return shown ? fullName(shown) : t.meetings.plays.unknownPlayer;
                    };
                    const date = () => shortMeetingDate(holder().starts_at, props.timeZone);
                    return (
                      <li class="game-record__holder">
                        <Show when={person()}>
                          {(shown) => <ProfileAvatar profile={shown()} size={24} decorative />}
                        </Show>
                        <PopupLink
                          to={{ kind: 'meeting', id: holder().meeting_id }}
                          aria-label={format(text.recordMeeting, { name: name(), date: date() })}
                        >
                          {format(text.recordHolder, { name: name(), date: date() })}
                        </PopupLink>
                        <Show when={(holder().expansions?.length ?? 0) > 0}>
                          <span class="game-record__expansions">
                            {format(text.recordExpansions, {
                              titles: (holder().expansions ?? [])
                                .map((expansion) => expansion.title)
                                .join(', '),
                            })}
                          </span>
                        </Show>
                      </li>
                    );
                  }}
                </For>
              </ul>
            </>
          )}
        </Show>
      </div>
    </div>
  );
}
