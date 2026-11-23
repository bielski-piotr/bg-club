import { useState } from 'react';
import { useAuth } from '../auth/authContext';
import { FALLBACK_TIMEZONE } from '../club/timezones';
import { GameCover } from '../games/GameCover';
import { formatScore } from '../games/gameStatsData';
import { useClub } from '../hub/club';
import { format, t } from '../i18n';
import { FilterBar } from '../leaderboard/FilterBar';
import { hasFilters, NO_FILTERS, type LeaderboardFilters } from '../leaderboard/filters';
import { shortMeetingDate } from '../meetings/datetime';
import { PopupLink } from '../popups/PopupLink';
import { QueryStatus } from '../popups/QueryStatus';
import { EmptyState, Icon, Select, type SelectOption } from '../ui';
import { cx } from '../ui/cx';
import {
  usePlayerRecords,
  visibleRecords,
  type PlayerRecord,
  type RecordsView,
} from './playerRecordsData';

const text = t.profile.records;

const VIEWS: readonly RecordsView[] = ['all', 'played', 'club'];

/**
 * Rekordy osobiste w profilu (PRD USR-4): każda gra kolekcji z okładką i najlepszym wynikiem
 * gracza w kategorii decydującej (jak rekord gry, GAME-11). Gra bez wyniku pokazuje „–”, a rekord
 * równy rekordowi klubu dostaje pieczątkę „Rekord klubu”. Filtry dat i gier jak w rankingu oraz
 * widok: wszystkie gry, tylko z wynikiem, tylko rekordy klubu.
 */
export function PlayerRecordsSection({ profileId }: { readonly profileId: string }) {
  const { client } = useAuth();
  const [filters, setFilters] = useState<LeaderboardFilters>(NO_FILTERS);
  const [view, setView] = useState<RecordsView>('all');
  const records = usePlayerRecords(client, profileId, filters);
  const club = useClub(client);
  const timeZone = club.data?.timezone ?? FALLBACK_TIMEZONE;
  const headingId = `${profileId}-records`;
  const data = records.data;
  const shown = data ? visibleRecords(data, view) : undefined;
  const options: SelectOption<RecordsView>[] = VIEWS.map((value) => ({
    value,
    label: text.views[value],
  }));
  const noGames = data !== undefined && data.length === 0 && !hasFilters(filters);

  return (
    <section className="profile__section" aria-labelledby={headingId}>
      <div className="player-stats__head">
        <h3 id={headingId} className="profile__section-title">
          {text.title}
        </h3>
        {noGames ? null : (
          <Select
            label={text.viewLabel}
            hideLabel
            appearance="pill"
            leadingIcon="trophy"
            options={options}
            value={view}
            onChange={setView}
          />
        )}
      </div>
      {noGames ? null : (
        <FilterBar filters={filters} onChange={setFilters} label={text.filtersLabel} />
      )}
      {shown === undefined ? (
        <QueryStatus isError={records.isError} onRetry={() => void records.refetch()} />
      ) : noGames ? (
        <EmptyState icon="dice" title={text.noGamesTitle} helper={text.noGamesHelper} />
      ) : shown.length === 0 ? (
        <EmptyState icon="trophy" title={text.emptyTitle} helper={text.emptyHelper} />
      ) : (
        <ul className="records" aria-label={text.listLabel}>
          {shown.map((record) => (
            <li key={record.game_id}>
              <RecordCard record={record} timeZone={timeZone} />
            </li>
          ))}
        </ul>
      )}
    </section>
  );
}

function RecordCard({
  record,
  timeZone,
}: {
  readonly record: PlayerRecord;
  readonly timeZone: string;
}) {
  const played = record.value !== null;
  const date = record.starts_at ? shortMeetingDate(record.starts_at, timeZone) : null;
  return (
    <article
      className={cx('record', !played && 'record--empty', record.club_record && 'record--club')}
      data-game={record.game_id}
      data-club-record={record.club_record ? 'true' : 'false'}
    >
      <div className="record__cover">
        <GameCover
          id={record.game_id}
          title={record.title}
          coverPath={record.cover_path}
          size="large"
        />
        {record.club_record ? (
          <span className="record__stamp">
            <Icon name="trophy" />
            {text.clubRecord}
          </span>
        ) : null}
      </div>
      <PopupLink
        to={{ kind: 'game', id: record.game_id }}
        className="record__title"
        aria-label={format(text.gameLink, { title: record.title })}
      >
        {record.title}
      </PopupLink>
      {played ? (
        <p className="record__value">
          {formatScore(record.value ?? 0)}
          {record.dir === 'asc' ? <span className="record__dir">{text.lowerBetter}</span> : null}
        </p>
      ) : (
        <p className="record__value record__value--empty">
          <span aria-hidden="true">{text.noValueShort}</span>
          <span className="sr-only">{text.noValue}</span>
        </p>
      )}
      {played && record.meeting_id && date ? (
        <PopupLink
          to={{ kind: 'meeting', id: record.meeting_id }}
          className="record__meeting"
          aria-label={format(text.meetingLink, { title: record.meeting_title ?? '', date })}
        >
          {format(text.meetingMeta, { date, title: record.meeting_title ?? '' })}
        </PopupLink>
      ) : null}
    </article>
  );
}
