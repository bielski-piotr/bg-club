import { t } from '../i18n';
import { ProfileAvatar } from '../profile/ProfileAvatar';
import type { Profile } from '../profile/profiles';
import { Icon, StatusChip } from '../ui';
import { dateTile } from './datetime';
import type { Meeting } from './meetings';

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
