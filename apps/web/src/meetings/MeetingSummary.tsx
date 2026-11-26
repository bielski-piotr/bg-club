import { createMemo, createSignal, For, Show } from 'solid-js';
import { format, formatNumber, t } from '../i18n';
import { gamesValue } from '../leaderboard/filterLabels';
import { FilterPopover } from '../leaderboard/FilterPopover';
import { NO_FILTERS, normalizeGames } from '../leaderboard/filters';
import { GameFilterPanel } from '../leaderboard/GameFilter';
import { fullName } from '../profile/profileQueries';
import { QueryBoundary } from '../popups/QueryStatus';
import { ProfileAvatar } from '../profile/ProfileAvatar';
import { ProfileLink } from '../profile/ProfileLink';
import { createAllProfiles } from '../profile/profiles';
import { createMeetingPlays, createMeetingSummary } from './meetingData';
import { splitPlays } from './plays';
import { meetingGames, placeChange, placeChangeLabel, pointsBreakdown } from './summary';
import '../leaderboard/leaderboard.css';

const text = t.meetings.summary;

/**
 * Podsumowanie spotkania: tabela zmian w rankingu punktów (miejsce po spotkaniu ze zmianą,
 * gracz z rozbiciem punktów na gry, punkty zdobyte na spotkaniu i suma). Filtr gier działa
 * jak filtr gier rankingu, ale ma tylko gry rozegrane na tym spotkaniu: tabela pokazuje wtedy
 * ranking i punkty tylko z wybranych gier. Bez zapisanych partii sekcji nie ma (pusty stan
 * pokazuje sekcja „Partie”).
 */
export function MeetingSummarySection(props: { readonly meetingId: string }) {
  const [games, setGames] = createSignal<readonly string[]>([]);
  const plays = createMeetingPlays(() => props.meetingId);
  const summary = createMeetingSummary(() => props.meetingId, games);
  const profiles = createAllProfiles();
  const headingId = () => `${props.meetingId}-summary`;
  const played = createMemo(() => {
    const list = plays.current();
    return list ? meetingGames(splitPlays(list).saved) : [];
  });
  // Sekcja pojawia się dopiero z danymi (albo błędem): spotkanie bez zapisanych partii nie ma
  // podsumowania, więc nagłówek z ładowaniem tylko by mignął. Decyzja czyta cache bez czekania,
  // tabela czeka pod `<QueryBoundary>` (błąd: baner z ponowieniem pod nagłówkiem).
  const visible = () => {
    if (plays.current() && played().length === 0) return false;
    return (
      !!summary.state()?.isError ||
      !!profiles.state()?.isError ||
      (!!summary.current() && !!profiles.current())
    );
  };
  const gamesText = () =>
    gamesValue(
      { ...NO_FILTERS, games: games() },
      new Map(played().map((game) => [game.id, game.title] as const)),
    );
  return (
    <Show when={visible()}>
      <section class="meeting-view__section" aria-labelledby={headingId()}>
        <div class="meeting-view__head-row">
          <h3 id={headingId()} class="meeting-view__head">
            {text.title}
          </h3>
          <span class="meeting-view__note">{text.note}</span>
        </div>
        <Show when={played().length > 1 || games().length > 0}>
          <div
            class="lb-filters meeting-summary__filters"
            role="group"
            aria-label={text.filtersLabel}
          >
            <FilterPopover
              label={t.leaderboard.filters.games}
              triggerLabel={format(t.leaderboard.filters.gamesLabel, { value: gamesText() })}
              value={gamesText()}
              icon="dice"
              active={games().length > 0}
              clearLabel={t.leaderboard.filters.clearGames}
              onClear={() => setGames([])}
            >
              <GameFilterPanel
                games={played()}
                failed={false}
                selected={games()}
                onChange={(next) => setGames(normalizeGames(next))}
              />
            </FilterPopover>
          </div>
        </Show>
        <QueryBoundary>
          <div class={['meeting-summary', { 'is-stale': !!summary.state()?.isPlaceholderData }]}>
            <table class="meeting-changes" aria-label={text.label}>
              <thead>
                <tr>
                  <th scope="col" class="meeting-changes__place">
                    {text.colPlace}
                  </th>
                  <th scope="col" class="meeting-changes__player">
                    {text.colPlayer}
                  </th>
                  <th scope="col" class="meeting-changes__num">
                    {text.colPoints}
                  </th>
                  <th scope="col" class="meeting-changes__num">
                    {text.colTotal}
                  </th>
                </tr>
              </thead>
              <tbody>
                <For each={summary()} keyed={(entry) => entry.profile_id}>
                  {(entry) => {
                    const person = () => profiles().get(entry().profile_id);
                    const name = () => {
                      const shown = person();
                      return shown ? fullName(shown) : t.meetings.plays.unknownPlayer;
                    };
                    const change = () => placeChange(entry());
                    const changeText = () => placeChangeLabel(change());
                    return (
                      <tr class={['meeting-changes__row', { 'is-muted': entry().deleted }]}>
                        <td class="meeting-changes__place">
                          <span class="meeting-changes__place-n" aria-hidden="true">
                            {format(text.place, { n: entry().place_after })}
                          </span>
                          <span
                            class={[
                              'meeting-changes__move',
                              `meeting-changes__move--${change().kind}`,
                            ]}
                            aria-hidden="true"
                          >
                            {changeText().short}
                          </span>
                          <span class="sr-only">
                            {format(text.placeAfterLabel, { n: entry().place_after })},{' '}
                            {changeText().long}
                          </span>
                        </td>
                        <td class="meeting-changes__player">
                          <span class="meeting-changes__who">
                            <Show when={person()}>
                              {(shown) => (
                                <ProfileLink id={shown().id} name={name()}>
                                  <ProfileAvatar profile={shown()} size={28} decorative />
                                </ProfileLink>
                              )}
                            </Show>
                            <span class="meeting-changes__text">
                              <span class="meeting-changes__name">{name()}</span>
                              <span class="meeting-changes__breakdown">
                                {pointsBreakdown(entry().games)}
                              </span>
                            </span>
                          </span>
                        </td>
                        <td class="meeting-changes__num meeting-changes__gained">
                          <span aria-hidden="true">
                            {format(text.gained, { n: entry().points })}
                          </span>
                          <span class="sr-only">
                            {format(text.pointsLabel, { n: entry().points })}
                          </span>
                        </td>
                        <td class="meeting-changes__num">
                          <span aria-hidden="true">{formatNumber(entry().total_after)}</span>
                          <span class="sr-only">
                            {format(text.totalLabel, { n: entry().total_after })}
                          </span>
                        </td>
                      </tr>
                    );
                  }}
                </For>
              </tbody>
            </table>
          </div>
        </QueryBoundary>
      </section>
    </Show>
  );
}
