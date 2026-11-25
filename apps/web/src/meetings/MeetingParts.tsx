import { t } from '../i18n';
import { ProfileAvatar } from '../react-shared/ProfileAvatar';
import type { Profile } from '../react-shared/profiles';
import { Badge, Icon, StatusChip } from '../ui';
import { dateTile, durationLabel, localDateTime } from './datetime';
import type { Meeting } from './meetings';
import type { RecordKind } from './records';

/**
 * Wspólne elementy timeline, kalendarza i popupu spotkania (DS §15.1): mini kafelek daty,
 * chip statusu i wiersz zwycięzców.
 */

/** Mini kafelek daty 44×48: nadchodzące akcentowe, zakończone szare. */
export function MiniDateTile({ meeting, timeZone }: { meeting: Meeting; timeZone: string }) {
  const tile = dateTile(meeting.starts_at, timeZone);
  return (
    <span
      className={
        meeting.status === 'finished'
          ? 'mini-tile mini-tile--past'
          : 'mini-tile mini-tile--upcoming'
      }
      aria-hidden="true"
    >
      <span className="mini-tile__month">{tile.month}</span>
      <span className="mini-tile__day">{tile.day}</span>
    </span>
  );
}

/**
 * Chip stanu spotkania (DS §11, §15.1 „Agenda row”): głosowanie otwarte, gry wybrane,
 * w trakcie albo zakończone. `short`: „Trwa” zamiast „W trakcie” (widżet Spotkanie, DS §15).
 */
export function MeetingStatusChip({
  meeting,
  short = false,
}: {
  meeting: Meeting;
  short?: boolean;
}) {
  const status = t.meetings.status;
  if (meeting.status === 'finished')
    return <StatusChip tone="neutral">{status.finished}</StatusChip>;
  if (meeting.status === 'in_progress') {
    return (
      <StatusChip tone="success">{short ? status.inProgress : status.inProgressLong}</StatusChip>
    );
  }
  return meeting.voting_open ? (
    <StatusChip tone="accent">{status.votingOpen}</StatusChip>
  ) : (
    <StatusChip tone="neutral">{status.gamesChosen}</StatusChip>
  );
}

/**
 * Zwycięzcy (DS §15.1 „Timeline row”): puchar, stos awatarów 20/6 i imiona. Bez czasownika,
 * więc tekst nie zależy od rodzaju gramatycznego. Nieznane profile są pomijane.
 */
export function WinnersLine({
  winners,
  profiles,
  className,
}: {
  winners: readonly string[];
  profiles: ReadonlyMap<string, Profile> | undefined;
  className?: string;
}) {
  const people = winners
    .map((id) => profiles?.get(id))
    .filter((profile): profile is Profile => profile !== undefined);
  if (people.length === 0) return null;
  const names = people.map((person) => person.first_name).join(', ');
  return (
    <span className={className ? `winners ${className}` : 'winners'}>
      <Icon name="trophy" size={14} className="winners__icon" />
      <span className="winners__stack" aria-hidden="true">
        {people.slice(0, 4).map((person) => (
          <ProfileAvatar key={person.id} profile={person} size={20} ring="white" decorative />
        ))}
      </span>
      <span className="winners__names">
        <span className="sr-only">{t.hub.timeline.winners} </span>
        {names}
      </span>
    </span>
  );
}

/** Oznaczenie rekordu przy wyniku gracza: rekord klubu (akcent) albo osobisty. */
export function RecordBadge({ kind }: { kind: RecordKind }) {
  const text = t.meetings.plays;
  return (
    <Badge tone={kind === 'club' ? 'accent' : 'success'} className="record-badge">
      <Icon name="trophy" size={12} />
      {kind === 'club' ? text.clubRecord : text.personalRecord}
    </Badge>
  );
}

/** Początek, koniec i czas trwania partii (podsumowanie przed zapisem i zapisana karteczka). */
export function PlayTimes({
  startedAt,
  endedAt,
  timeZone,
  labels,
}: {
  readonly startedAt: string;
  readonly endedAt: string | Date;
  readonly timeZone: string;
  readonly labels: {
    readonly timesLabel: string;
    readonly started: string;
    readonly ended: string;
    readonly duration: string;
  };
}) {
  const plays = t.meetings.plays;
  return (
    <dl className="play-times" aria-label={labels.timesLabel}>
      <div className="play-times__item">
        <dt>{labels.started}</dt>
        <dd>{localDateTime(startedAt, timeZone).time}</dd>
      </div>
      <div className="play-times__item">
        <dt>{labels.ended}</dt>
        <dd>{localDateTime(endedAt, timeZone).time}</dd>
      </div>
      <div className="play-times__item">
        <dt>{labels.duration}</dt>
        <dd>
          {durationLabel(startedAt, endedAt, {
            hours: plays.durationHours,
            minutes: plays.durationMinutes,
          })}
        </dd>
      </div>
    </dl>
  );
}
