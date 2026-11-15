import { useAuth } from '../auth/authContext';
import { GameCover } from '../games/GameCover';
import { format, t } from '../i18n';
import { QueryStatus } from '../popups/QueryStatus';
import { ProfileAvatar } from '../profile/ProfileAvatar';
import { ProfileLink } from '../profile/ProfileLink';
import { avatarPerson, fullName, useAllProfiles, type Profile } from '../profile/profiles';
import { AvatarStack, Icon, paletteColor, paletteIndex } from '../ui';
import { cx } from '../ui/cx';
import { localDateTime } from './datetime';
import { WinnersLine } from './MeetingParts';
import type { Meeting } from './meetings';
import {
  playsProgressLabel,
  playSubtitle,
  sortedResults,
  splitPlays,
  useMeetingPlays,
  type MeetingPlay,
} from './plays';

const text = t.meetings.plays;

/**
 * Partie trwającego i zakończonego spotkania (VIEW-3, DS §15 „Play card”, „Live play card”):
 * najpierw partie w toku, potem zapisane w kolejności rozegrania, z graczami, miejscami,
 * wynikami i punktami do rankingu.
 *
 * `onOpenPlay` podłącza szczegóły partii i powiększenie karteczki z historii (E4); bez niego
 * karta nie jest klikalna.
 */
export function MeetingPlaysSection({
  meeting,
  timeZone,
  winners,
  onOpenPlay,
}: {
  readonly meeting: Meeting;
  readonly timeZone: string;
  /** Zwycięzcy spotkania (MTG-3) nad listą partii; puste = bez wiersza. */
  readonly winners?: readonly string[] | undefined;
  readonly onOpenPlay?: ((play: MeetingPlay) => void) | undefined;
}) {
  const { client } = useAuth();
  const plays = useMeetingPlays(client, meeting.id);
  const profiles = useAllProfiles(client);
  const headingId = `${meeting.id}-plays`;
  const split = plays.data ? splitPlays(plays.data) : null;
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
          {winners && winners.length > 0 ? (
            <WinnersLine winners={winners} profiles={profiles.data} className="play-winners" />
          ) : null}
          {split.drafts.length > 0 ? (
            <ul className="play-list" aria-label={text.liveLabel}>
              {split.drafts.map((play) => (
                <li key={play.id}>
                  <LivePlayCard play={play} timeZone={timeZone} profiles={profiles.data} />
                </li>
              ))}
            </ul>
          ) : null}
          {split.saved.length > 0 ? (
            <ol className="play-list" aria-label={text.savedLabel}>
              {split.saved.map((play, index) => (
                <li key={play.id}>
                  <PlayCard
                    play={play}
                    index={index}
                    timeZone={timeZone}
                    profiles={profiles.data}
                    onOpen={onOpenPlay ? () => onOpenPlay(play) : undefined}
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

/** Miniatura oderwanej karteczki (DS §15 „Score-sheet thumbnail”) w kolorze gry. */
export function SheetThumbnail({
  gameId,
  small = false,
}: {
  readonly gameId: string;
  readonly small?: boolean;
}) {
  return (
    <span className={cx('play-sheet', small && 'play-sheet--small')} aria-hidden="true">
      <span
        className="play-sheet__band"
        style={{ background: paletteColor(paletteIndex(gameId)) }}
      />
      <span className="play-sheet__line" />
      <span className="play-sheet__line" />
      <span className="play-sheet__line" />
      <span className="play-sheet__line" />
    </span>
  );
}

function PlayCard({
  play,
  index,
  timeZone,
  profiles,
  onOpen,
}: {
  readonly play: MeetingPlay;
  readonly index: number;
  readonly timeZone: string;
  readonly profiles: ReadonlyMap<string, Profile>;
  readonly onOpen: (() => void) | undefined;
}) {
  const title = play.game.title;
  const head = (
    <>
      <SheetThumbnail gameId={play.game.id} />
      <span className="play-card__text">
        <span className="play-card__title">{title}</span>
        <span className="play-card__sub">{playSubtitle(play, index, timeZone)}</span>
      </span>
    </>
  );
  return (
    <article className="play-card" aria-label={title}>
      {onOpen ? (
        <button
          type="button"
          className="play-card__head play-card__head--button"
          aria-label={format(text.sheet, { title })}
          onClick={onOpen}
        >
          {head}
          <Icon name="chevron-right" className="play-card__chevron" />
        </button>
      ) : (
        <div className="play-card__head">{head}</div>
      )}
      <ol className="play-results" aria-label={format(text.resultsLabel, { title })}>
        {sortedResults(play).map((result) => {
          const person = profiles.get(result.profile_id);
          const first = result.place === 1;
          return (
            <li
              key={result.profile_id}
              className={cx('play-result', first && 'play-result--first')}
            >
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
    </article>
  );
}

/**
 * Partia w toku (DS §15 „Live play card”): gra, od kiedy trwa i gracze. Powrót do notesu
 * i porzucenie partii dochodzą razem z notesem partii (RUN-2, E4).
 */
function LivePlayCard({
  play,
  timeZone,
  profiles,
}: {
  readonly play: MeetingPlay;
  readonly timeZone: string;
  readonly profiles: ReadonlyMap<string, Profile>;
}) {
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
          <span className="play-card__live">
            {format(text.liveSince, { time: localDateTime(play.started_at, timeZone).time })}
          </span>
        </span>
        {players.length > 0 ? (
          <AvatarStack people={players} size={28} max={4} showOverflow />
        ) : null}
      </div>
    </article>
  );
}
