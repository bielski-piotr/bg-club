import { useState } from 'react';
import { useAuth } from '../auth/authContext';
import { format, formatNumber, t } from '../i18n';
import { gamesValue } from '../leaderboard/filterLabels';
import { FilterPopover } from '../leaderboard/FilterPopover';
import { GameFilterPanel } from '../leaderboard/GameFilter';
import { NO_FILTERS, normalizeGames } from '../leaderboard/filters';
import { QueryStatus } from '../popups/QueryStatus';
import { ProfileAvatar } from '../react-shared/ProfileAvatar';
import { ProfileLink } from '../react-shared/ProfileLink';
import { fullName, useAllProfiles } from '../react-shared/profiles';
import { cx } from '../ui/cx';
import { splitPlays, useMeetingPlays } from './plays';
import {
  meetingGames,
  placeChange,
  placeChangeLabel,
  pointsBreakdown,
  useMeetingSummary,
} from './summary';
import '../leaderboard/leaderboard.css';

const text = t.meetings.summary;

/**
 * Podsumowanie spotkania: tabela zmian w rankingu punktów (miejsce po spotkaniu ze zmianą,
 * gracz z rozbiciem punktów na gry, punkty zdobyte na spotkaniu i suma). Filtr gier działa
 * jak filtr gier rankingu, ale ma tylko gry rozegrane na tym spotkaniu: tabela pokazuje wtedy
 * ranking i punkty tylko z wybranych gier. Bez zapisanych partii sekcji nie ma (pusty stan
 * pokazuje sekcja „Partie”).
 */
export function MeetingSummarySection({ meetingId }: { readonly meetingId: string }) {
  const { client } = useAuth();
  const [games, setGames] = useState<readonly string[]>([]);
  const plays = useMeetingPlays(client, meetingId);
  const summary = useMeetingSummary(client, meetingId, games);
  const profiles = useAllProfiles(client);
  const headingId = `${meetingId}-summary`;
  const played = plays.data ? meetingGames(splitPlays(plays.data).saved) : [];
  // Sekcja pojawia się dopiero z danymi (albo błędem): spotkanie bez zapisanych partii nie ma
  // podsumowania, więc nagłówek z ładowaniem tylko by mignął.
  if (plays.data && played.length === 0) return null;
  if (!summary.isError && !profiles.isError && (!summary.data || !profiles.data)) return null;
  const titles = new Map(played.map((game) => [game.id, game.title] as const));
  const gamesText = gamesValue({ ...NO_FILTERS, games }, titles);
  return (
    <section className="meeting-view__section" aria-labelledby={headingId}>
      <div className="meeting-view__head-row">
        <h3 id={headingId} className="meeting-view__head">
          {text.title}
        </h3>
        <span className="meeting-view__note">{text.note}</span>
      </div>
      {played.length > 1 || games.length > 0 ? (
        <div
          className="lb-filters meeting-summary__filters"
          role="group"
          aria-label={text.filtersLabel}
        >
          <FilterPopover
            label={t.leaderboard.filters.games}
            triggerLabel={format(t.leaderboard.filters.gamesLabel, { value: gamesText })}
            value={gamesText}
            icon="dice"
            active={games.length > 0}
            clearLabel={t.leaderboard.filters.clearGames}
            onClear={() => setGames([])}
          >
            <GameFilterPanel
              games={played}
              failed={false}
              selected={games}
              onChange={(next) => setGames(normalizeGames(next))}
            />
          </FilterPopover>
        </div>
      ) : null}
      {!summary.data || !profiles.data ? (
        <QueryStatus
          isError={summary.isError || profiles.isError}
          onRetry={() => {
            if (summary.isError) void summary.refetch();
            if (profiles.isError) void profiles.refetch();
          }}
        />
      ) : (
        <div className={cx('meeting-summary', summary.isPlaceholderData && 'is-stale')}>
          <table className="meeting-changes" aria-label={text.label}>
            <thead>
              <tr>
                <th scope="col" className="meeting-changes__place">
                  {text.colPlace}
                </th>
                <th scope="col" className="meeting-changes__player">
                  {text.colPlayer}
                </th>
                <th scope="col" className="meeting-changes__num">
                  {text.colPoints}
                </th>
                <th scope="col" className="meeting-changes__num">
                  {text.colTotal}
                </th>
              </tr>
            </thead>
            <tbody>
              {summary.data.map((entry) => {
                const person = profiles.data.get(entry.profile_id);
                const name = person ? fullName(person) : t.meetings.plays.unknownPlayer;
                const change = placeChange(entry);
                const changeText = placeChangeLabel(change);
                return (
                  <tr
                    key={entry.profile_id}
                    className={cx('meeting-changes__row', entry.deleted && 'is-muted')}
                  >
                    <td className="meeting-changes__place">
                      <span className="meeting-changes__place-n" aria-hidden="true">
                        {format(text.place, { n: entry.place_after })}
                      </span>
                      <span
                        className={cx(
                          'meeting-changes__move',
                          `meeting-changes__move--${change.kind}`,
                        )}
                        aria-hidden="true"
                      >
                        {changeText.short}
                      </span>
                      <span className="sr-only">
                        {format(text.placeAfterLabel, { n: entry.place_after })}, {changeText.long}
                      </span>
                    </td>
                    <td className="meeting-changes__player">
                      <span className="meeting-changes__who">
                        {person ? (
                          <ProfileLink id={person.id} name={name}>
                            <ProfileAvatar profile={person} size={28} decorative />
                          </ProfileLink>
                        ) : null}
                        <span className="meeting-changes__text">
                          <span className="meeting-changes__name">{name}</span>
                          <span className="meeting-changes__breakdown">
                            {pointsBreakdown(entry.games)}
                          </span>
                        </span>
                      </span>
                    </td>
                    <td className="meeting-changes__num meeting-changes__gained">
                      <span aria-hidden="true">{format(text.gained, { n: entry.points })}</span>
                      <span className="sr-only">
                        {format(text.pointsLabel, { n: entry.points })}
                      </span>
                    </td>
                    <td className="meeting-changes__num">
                      <span aria-hidden="true">{formatNumber(entry.total_after)}</span>
                      <span className="sr-only">
                        {format(text.totalLabel, { n: entry.total_after })}
                      </span>
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      )}
    </section>
  );
}
