import { useEffect, useId, useRef } from 'react';
import { useAuth } from '../auth/authContext';
import { FALLBACK_TIMEZONE } from '../club/timezones';
import { useClub } from '../hub/club';
import { plural, t } from '../i18n';
import { usePopupLevel, usePopups } from '../popups/popupContext';
import { PopupModal } from '../popups/PopupModal';
import { QueryStatus } from '../popups/QueryStatus';
import { ProfileAvatar } from '../profile/ProfileAvatar';
import { fullName, useAllProfiles, type Profile } from '../profile/profiles';
import { Badge, EmptyState, Icon, Menu, MetaChip, Tray } from '../ui';
import { localDateTime, longMeetingDate } from './datetime';
import { MeetingStatusChip, WinnersLine } from './MeetingParts';
import { useMeetingOverview, type MeetingOverview } from './overview';
import './calendar.css';

/**
 * Popup spotkania otwierany z timeline, kalendarza i agendy (MTG-3, CAL-1): status, termin
 * w strefie klubu, uczestnicy z oznaczeniami oraz liczba partii i zwycięzcy. Administrator ma
 * menu „Edytuj / Usuń spotkanie”. Głosowanie i przebieg spotkania dochodzą w [024], [026].
 */
export function MeetingPopup({ id, me }: { readonly id: string; readonly me: Profile }) {
  const { client } = useAuth();
  const query = useMeetingOverview(client, id);
  const club = useClub(client);
  const profiles = useAllProfiles(client);
  const meeting = query.data;
  const isAdmin = me.role === 'admin';
  useCloseWhenDeleted(meeting);

  if (query.isSuccess && !meeting) {
    return (
      <PopupModal title={t.meetings.form.notFoundTitle}>
        <EmptyState
          icon="calendar"
          title={t.meetings.form.notFoundTitle}
          helper={t.meetings.form.notFoundBody}
        />
      </PopupModal>
    );
  }

  return (
    <PopupModal
      title={meeting?.title ?? t.meetings.view.loading}
      actions={
        meeting && isAdmin && hasActions(meeting) ? <MeetingMenu meeting={meeting} /> : undefined
      }
    >
      {meeting && profiles.data && (club.isSuccess || club.isError) ? (
        <MeetingDetails
          meeting={meeting}
          me={me}
          timeZone={club.data?.timezone ?? FALLBACK_TIMEZONE}
          profiles={profiles.data}
        />
      ) : (
        <QueryStatus
          isError={query.isError || profiles.isError}
          onRetry={() => {
            if (query.isError) void query.refetch();
            if (profiles.isError) void profiles.refetch();
          }}
        />
      )}
    </PopupModal>
  );
}

/**
 * Spotkanie usunięte z menu tego popupu: po zamknięciu potwierdzenia popup jest znów na górze,
 * a odświeżone dane mówią, że spotkania nie ma, więc zamyka się sam zamiast pokazywać
 * „Nie znaleziono”. Popup otwarty ze starego linku (spotkania nie było od początku) zostaje.
 */
function useCloseWhenDeleted(meeting: MeetingOverview | null | undefined) {
  const { back } = usePopups();
  const { covered } = usePopupLevel();
  const seen = useRef(false);
  useEffect(() => {
    if (meeting) {
      seen.current = true;
    } else if (meeting === null && seen.current && !covered) {
      seen.current = false;
      back();
    }
  }, [meeting, covered, back]);
}

/** Edycja: zaplanowane i trwające (PLAN-3, PLAN-4). */
function canEdit(meeting: MeetingOverview): boolean {
  return meeting.status !== 'finished';
}

/** Usunięcie: nie trwające i bez zapisanych partii (PLAN-3, PLAN-5, Q4). */
function canDelete(meeting: MeetingOverview): boolean {
  return meeting.status !== 'in_progress' && meeting.playCount === 0;
}

function hasActions(meeting: MeetingOverview): boolean {
  return canEdit(meeting) || canDelete(meeting);
}

function MeetingMenu({ meeting }: { readonly meeting: MeetingOverview }) {
  const { open } = usePopups();
  const label = t.meetings.view.actions;
  return (
    <Menu
      label={label}
      align="end"
      items={[
        ...(!canEdit(meeting)
          ? []
          : [
              {
                id: 'edit',
                label: t.meetings.menu.edit,
                icon: 'pencil' as const,
                onSelect: () => open({ kind: 'edit-meeting', id: meeting.id }),
              },
            ]),
        ...(!canDelete(meeting)
          ? []
          : [
              {
                id: 'delete',
                label: t.meetings.menu.delete,
                icon: 'trash' as const,
                destructive: true,
                onSelect: () => open({ kind: 'delete-meeting', id: meeting.id }),
              },
            ]),
      ]}
      trigger={(props) => (
        <button
          type="button"
          {...props}
          className="icon-btn icon-btn--36"
          aria-label={label}
          title={label}
        >
          <Icon name="more" />
        </button>
      )}
    />
  );
}

function MeetingDetails({
  meeting,
  me,
  timeZone,
  profiles,
}: {
  readonly meeting: MeetingOverview;
  readonly me: Profile;
  readonly timeZone: string;
  readonly profiles: ReadonlyMap<string, Profile>;
}) {
  const view = t.meetings.view;
  const playsId = useId();
  const peopleId = useId();
  const when = localDateTime(meeting.starts_at, timeZone);
  const people = meeting.participants
    .map((id) => profiles.get(id))
    .filter((profile): profile is Profile => profile !== undefined)
    .sort((a, b) => fullName(a).localeCompare(fullName(b), 'pl') || a.id.localeCompare(b.id));
  const [year, month, day] = when.date.split('-');
  return (
    <div className="meeting-view">
      <div className="meeting-view__meta">
        <MeetingStatusChip meeting={meeting} />
        <MetaChip icon="calendar">
          <span aria-hidden="true">{`${day}.${month}.${year}`}</span>
          <span className="sr-only">{longMeetingDate(meeting.starts_at, timeZone)}</span>
        </MetaChip>
        <MetaChip icon="clock">
          <span className="tnum">{when.time}</span>
        </MetaChip>
      </div>

      {meeting.status === 'planned' ? null : (
        <section className="meeting-view__block" aria-labelledby={playsId}>
          <div className="meeting-view__head">
            <h3 id={playsId} className="meeting-view__title">
              {view.plays}
            </h3>
            <span className="meeting-view__note">
              {plural(meeting.playCount, t.hub.timeline.plays)}
            </span>
          </div>
          {meeting.playCount === 0 ? (
            <p className="meeting-view__empty">{view.noPlays}</p>
          ) : meeting.winners.length > 0 ? (
            <p className="meeting-view__winners">
              <WinnersLine winners={meeting.winners} profiles={profiles} />
            </p>
          ) : null}
        </section>
      )}

      <section className="meeting-view__block" aria-labelledby={peopleId}>
        <div className="meeting-view__head">
          <h3 id={peopleId} className="meeting-view__title">
            {view.participants}
          </h3>
          <span className="meeting-view__note">
            {plural(meeting.participants.length, t.hub.meeting.participants)}
          </span>
        </div>
        {people.length > 0 ? (
          <Tray label={view.participants} className="meeting-view__people">
            {people.map((person) => (
              <li key={person.id} className="tray__item">
                <div className="row meeting-view__person">
                  <ProfileAvatar profile={person} size={36} decorative />
                  <span className="row__text">
                    <span className="row__title">{fullName(person)}</span>
                  </span>
                  <span className="row__trailing">
                    {person.role === 'admin' ? (
                      <Badge tone="accent">{t.ui.adminBadge}</Badge>
                    ) : null}
                    {meeting.host_id === person.id ? (
                      <Badge tone="neutral">{view.hostBadge}</Badge>
                    ) : null}
                    {person.id === me.id ? <Badge tone="ink">{t.ui.youBadge}</Badge> : null}
                  </span>
                </div>
              </li>
            ))}
          </Tray>
        ) : null}
      </section>
    </div>
  );
}
