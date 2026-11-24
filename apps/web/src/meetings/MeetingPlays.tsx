import { useState } from 'react';
import { useAuth } from '../auth/authContext';
import { GameCover } from '../games/GameCover';
import { useGameTitles } from '../games/games';
import { format, t } from '../i18n';
import { usePopups } from '../popups/popupContext';
import { QueryStatus } from '../popups/QueryStatus';
import { ProfileAvatar } from '../profile/ProfileAvatar';
import { ProfileLink } from '../profile/ProfileLink';
import { avatarPerson, fullName, useAllProfiles, type Profile } from '../profile/profiles';
import { AvatarStack, Button, Icon, paletteColor, paletteIndex } from '../ui';
import { cx } from '../ui/cx';
import { useSheetImageUrl } from '../sheets/sheets';
import '../sheets/sheets.css';
import { localDateTime } from './datetime';
import { RecordBadge } from './MeetingParts';
import type { Meeting } from './meetings';
import { topRecord, useMeetingRecords, type PlayRecords } from './records';
import {
  playsProgressLabel,
  sortedResults,
  splitPlays,
  useMeetingPlays,
  type MeetingPlay,
} from './plays';

const text = t.meetings.plays;

/**
 * Partie trwającego i zakończonego spotkania (VIEW-3): najpierw partie w toku (DS §15 „Live play
 * card”), potem zapisane w kolejności rozegrania jako same karteczki z notesu (PAD-6), jak
 * galeria gry. Kliknięcie otwiera karteczkę w powiększeniu z wynikami, czasem partii
 * i rekordami (`sheet/<uuid>`; tam admin usuwa partię, VIEW-6). Karteczka z rekordem klubu
 * albo osobistym ma znacznik. `runner` (admin albo prowadzący) dostaje przy partiach w toku
 * „Wróć do notesu” i „Porzuć” (PAD-4, PAD-8); pozostali widzą tylko, że partia trwa (PAD-9).
 * Wyniki i zmiany w rankingu są w podsumowaniu spotkania.
 */
export function MeetingPlaysSection({
  meeting,
  timeZone,
  runner = false,
}: {
  readonly meeting: Meeting;
  readonly timeZone: string;
  readonly runner?: boolean | undefined;
}) {
  const { client } = useAuth();
  const { open } = usePopups();
  const plays = useMeetingPlays(client, meeting.id);
  const profiles = useAllProfiles(client);
  const split = plays.data ? splitPlays(plays.data) : null;
  const records = useMeetingRecords(client, meeting.id, (split?.saved.length ?? 0) > 0);
  // Dodatki partii (także usunięte później z kolekcji) po tytułach.
  const expansionTitles = useGameTitles(
    client,
    (plays.data ?? []).flatMap((play) => play.expansion_ids ?? []),
  );
  const expansionsOf = (play: MeetingPlay) => {
    const ids = play.expansion_ids ?? [];
    if (ids.length === 0) return undefined;
    const names = ids
      .map((id) => expansionTitles.data?.get(id))
      .filter((name): name is string => name !== undefined)
      .sort((a, b) => a.localeCompare(b, 'pl'));
    return names.length > 0 ? format(text.withExpansions, { titles: names.join(', ') }) : undefined;
  };
  const headingId = `${meeting.id}-plays`;
  return (
    <section className="meeting-view__section" aria-labelledby={headingId}>
      <div className="meeting-view__head-row">
        <h3 id={headingId} className="meeting-view__head">
          {t.meetings.view.plays}
        </h3>
        {split ? (
          <span className="meeting-view__note">
            {playsProgressLabel(split.saved.length, split.drafts.length)}
          </span>
        ) : null}
      </div>
      {!split || !profiles.data ? (
        <QueryStatus
          isError={plays.isError || profiles.isError}
          onRetry={() => {
            if (plays.isError) void plays.refetch();
            if (profiles.isError) void profiles.refetch();
          }}
        />
      ) : split.saved.length === 0 && split.drafts.length === 0 ? (
        <p className="meeting-form__state">
          {meeting.status === 'in_progress' ? text.emptyInProgress : t.meetings.view.noPlays}
        </p>
      ) : (
        <>
          {split.drafts.length > 0 ? (
            <ul className="play-list" aria-label={text.liveLabel}>
              {split.drafts.map((play) => (
                <li key={play.id}>
                  <LivePlayCard
                    play={play}
                    expansions={expansionsOf(play)}
                    timeZone={timeZone}
                    profiles={profiles.data}
                    canRun={runner && meeting.status === 'in_progress'}
                  />
                </li>
              ))}
            </ul>
          ) : null}
          {split.saved.length > 0 ? (
            <ol className="sheet-gallery meeting-sheets" aria-label={text.savedLabel}>
              {split.saved.map((play, index) => (
                <li key={play.id}>
                  <PlaySheet
                    play={play}
                    expansions={expansionsOf(play)}
                    index={index}
                    timeZone={timeZone}
                    records={records.data?.get(play.id)}
                    onOpen={() => open({ kind: 'sheet', id: play.id })}
                  />
                </li>
              ))}
            </ol>
          ) : null}
        </>
      )}
    </section>
  );
}

/**
 * Miniatura oderwanej karteczki (DS §15 „Score-sheet thumbnail”): obraz karteczki z pismem
 * (PAD-6), a bez obrazu (np. przerwany upload) albo przed jego wczytaniem kartka w kolorze gry.
 */
export function SheetThumbnail({
  gameId,
  imagePath = null,
  imageUrl,
  small = false,
  className,
}: {
  readonly gameId: string;
  readonly imagePath?: string | null | undefined;
  /** Gotowy podpisany adres (galeria podpisuje wszystkie obrazy jednym żądaniem). */
  readonly imageUrl?: string | null | undefined;
  readonly small?: boolean;
  readonly className?: string | undefined;
}) {
  const signed = useSheetImageUrl(imageUrl === undefined ? imagePath : null).data;
  const url = imageUrl === undefined ? signed : (imageUrl ?? undefined);
  const [failed, setFailed] = useState<string | undefined>(undefined);
  const showImage = url !== undefined && url !== failed;
  return (
    <span
      className={cx(
        'play-sheet',
        small && 'play-sheet--small',
        showImage && 'play-sheet--image',
        className,
      )}
      aria-hidden="true"
    >
      {showImage ? (
        <img
          className="play-sheet__img"
          src={url}
          alt=""
          loading="lazy"
          onError={() => setFailed(url)}
        />
      ) : (
        <>
          <span
            className="play-sheet__band"
            style={{ background: paletteColor(paletteIndex(gameId)) }}
          />
          <span className="play-sheet__line" />
          <span className="play-sheet__line" />
          <span className="play-sheet__line" />
          <span className="play-sheet__line" />
        </>
      )}
    </span>
  );
}

/** Wiersze wyników partii (DS §15 „Play card”): miejsce, awatar, imię, wynik i punkty. */
export function PlayResultRows({
  play,
  profiles,
  label,
  records,
}: {
  readonly play: Pick<MeetingPlay, 'results'>;
  readonly profiles: ReadonlyMap<string, Profile>;
  readonly label: string;
  /** Rekordy ustanowione w partii (gracz → rodzaj) do oznaczenia przy wyniku. */
  readonly records?: PlayRecords | undefined;
}) {
  return (
    <ol className="play-results" aria-label={label}>
      {sortedResults(play).map((result) => {
        const person = profiles.get(result.profile_id);
        const first = result.place === 1;
        return (
          <li key={result.profile_id} className={cx('play-result', first && 'play-result--first')}>
            <span className="play-result__place">
              <span aria-hidden="true">
                {result.place !== null ? format(text.place, { n: result.place }) : ''}
              </span>
              {result.place !== null ? (
                <span className="sr-only">{format(text.placeLabel, { n: result.place })}</span>
              ) : null}
            </span>
            {person ? (
              <ProfileLink id={person.id} name={fullName(person)}>
                <ProfileAvatar profile={person} size={24} decorative />
              </ProfileLink>
            ) : null}
            <span className="play-result__name">
              {person ? fullName(person) : text.unknownPlayer}
            </span>
            {records?.get(result.profile_id) ? (
              <RecordBadge kind={records.get(result.profile_id) ?? 'personal'} />
            ) : null}
            <span className="play-result__score">
              <span aria-hidden="true">{result.ranking_value ?? ''}</span>
              {result.ranking_value !== null ? (
                <span className="sr-only">{format(text.score, { n: result.ranking_value })}</span>
              ) : null}
            </span>
            <span
              className={cx(
                'play-result__points',
                result.points === 0 && 'play-result__points--zero',
              )}
            >
              <span aria-hidden="true">
                {result.points !== null ? format(text.points, { n: result.points }) : ''}
              </span>
              {result.points !== null ? (
                <span className="sr-only">{format(text.pointsLabel, { n: result.points })}</span>
              ) : null}
            </span>
          </li>
        );
      })}
    </ol>
  );
}

/** Zapisana partia jako karteczka z notesu: gra, numer i godzina zapisu, znacznik rekordu. */
function PlaySheet({
  play,
  expansions,
  index,
  timeZone,
  records,
  onOpen,
}: {
  readonly play: MeetingPlay;
  /** „z dodatkami: …” albo brak (partia bez dodatków). */
  readonly expansions?: string | undefined;
  readonly index: number;
  readonly timeZone: string;
  readonly records: PlayRecords | undefined;
  readonly onOpen: () => void;
}) {
  const title = play.game.title;
  const time = localDateTime(play.saved_at ?? play.started_at, timeZone).time;
  const record = topRecord(records);
  return (
    <button
      type="button"
      className="sheet-gallery__item"
      aria-label={
        format(text.sheetLabel, { n: index + 1, title, time }) +
        (expansions ? ` ${expansions}` : '') +
        (record ? `. ${record === 'club' ? text.clubRecordLabel : text.personalRecordLabel}` : '')
      }
      onClick={onOpen}
    >
      <span className="sheet-gallery__frame" aria-hidden="true">
        <SheetThumbnail
          gameId={play.game.id}
          imagePath={play.sheet_image_path}
          className="sheet-gallery__sheet"
        />
        {record ? (
          <span className={cx('meeting-sheets__record', `meeting-sheets__record--${record}`)}>
            <Icon name="trophy" size={14} />
          </span>
        ) : null}
      </span>
      <span className="sheet-gallery__caption meeting-sheets__caption" aria-hidden="true">
        <span className="meeting-sheets__title">{title}</span>
        {expansions ? <span className="meeting-sheets__expansions">{expansions}</span> : null}
        <span>{format(text.sheetCaption, { n: index + 1, time })}</span>
      </span>
    </button>
  );
}

/**
 * Partia w toku (DS §15 „Live play card”): gra, od kiedy trwa i gracze. Admin i prowadzący
 * wracają do notesu (także na innym urządzeniu, PAD-4) albo porzucają partię (PAD-8).
 */
function LivePlayCard({
  play,
  expansions,
  timeZone,
  profiles,
  canRun,
}: {
  readonly play: MeetingPlay;
  readonly expansions?: string | undefined;
  readonly timeZone: string;
  readonly profiles: ReadonlyMap<string, Profile>;
  readonly canRun: boolean;
}) {
  const { open } = usePopups();
  const live = t.meetings.play;
  const players = sortedResults(play).flatMap((result) => {
    const person = profiles.get(result.profile_id);
    return person ? [avatarPerson(person)] : [];
  });
  return (
    <article className="play-card play-card--live" aria-label={play.game.title}>
      <div className="play-card__head">
        <GameCover
          id={play.game.id}
          title={play.game.title}
          coverPath={play.game.cover_path}
          size="thumb"
          className="play-card__cover"
        />
        <span className="play-card__text">
          <span className="play-card__title">{play.game.title}</span>
          {expansions ? <span className="play-card__expansions">{expansions}</span> : null}
          <span className="play-card__live">
            {format(text.liveSince, { time: localDateTime(play.started_at, timeZone).time })}
          </span>
        </span>
        {players.length > 0 ? (
          <AvatarStack people={players} size={28} max={4} showOverflow />
        ) : null}
      </div>
      {canRun ? (
        <div className="play-card__actions">
          <Button
            size="sm"
            icon="pad"
            className="play-card__resume"
            aria-label={format(live.backToPadLabel, { title: play.game.title })}
            onClick={() => open({ kind: 'play', id: play.id })}
          >
            {live.backToPad}
          </Button>
          <Button
            size="sm"
            variant="secondary"
            className="play-card__discard"
            aria-label={format(live.discardLabel, { title: play.game.title })}
            onClick={() => open({ kind: 'discard-play', id: play.id })}
          >
            {live.discard}
          </Button>
        </div>
      ) : null}
    </article>
  );
}
