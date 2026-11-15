import { useMutation, useQueryClient } from '@tanstack/react-query';
import { useId, useState, type FormEvent } from 'react';
import { useAuth } from '../auth/authContext';
import type { OwnProfile } from '../auth/useOwnProfile';
import { FALLBACK_TIMEZONE } from '../club/timezones';
import { useClub } from '../hub/club';
import { format, t } from '../i18n';
import { usePopups } from '../popups/popupContext';
import { PopupModal } from '../popups/PopupModal';
import { QueryStatus } from '../popups/QueryStatus';
import { ProfileAvatar } from '../profile/ProfileAvatar';
import { fullName, useMembers, type Profile } from '../profile/profiles';
import { Badge, Banner, Button, Checkbox, Select, TextField, Tray, useToast } from '../ui';
import { TIME_SLOTS, todayIn } from './datetime';
import {
  emptyMeetingForm,
  hasErrors,
  MEETING_TITLE_MAX,
  meetingFormFrom,
  setAllParticipants,
  toggleParticipant,
  validateMeetingForm,
  type MeetingFormValues,
} from './form';
import {
  MeetingError,
  meetingsKey,
  saveMeeting,
  useMeeting,
  useMeetingPlayers,
  type Meeting,
} from './meetings';
import './meetings.css';

const form = t.meetings.form;
/** Wartość listy „Prowadzący” oznaczająca administratora (`host_id` = NULL). */
const ADMIN_HOST = 'admin';

/** „Zaplanuj spotkanie” (PLAN-1, PLAN-2), opcjonalnie z wypełnioną datą (CAL-3). */
export function AddMeetingPopup({
  me,
  date,
}: {
  readonly me: OwnProfile;
  readonly date?: string | undefined;
}) {
  return <MeetingFormLoader me={me} meeting={null} date={date} />;
}

/**
 * „Edytuj spotkanie” (PLAN-3, PLAN-4). Zaplanowane: wszystkie pola. W trakcie: dopisanie
 * uczestnika i zmiana prowadzącego. Zakończone i nieistniejące mają czytelny stan.
 */
export function EditMeetingPopup({ id, me }: { readonly id: string; readonly me: OwnProfile }) {
  const { client } = useAuth();
  const meeting = useMeeting(client, id);
  if (!meeting.isSuccess) {
    return (
      <PopupModal title={form.editTitle}>
        <QueryStatus isError={meeting.isError} onRetry={() => void meeting.refetch()} />
      </PopupModal>
    );
  }
  if (!meeting.data) {
    return (
      <PopupModal title={form.notFoundTitle}>
        <p className="meeting-form__state">{form.notFoundBody}</p>
      </PopupModal>
    );
  }
  if (meeting.data.status === 'finished') {
    return (
      <PopupModal title={form.finishedTitle}>
        <p className="meeting-form__state">{form.finishedBody}</p>
      </PopupModal>
    );
  }
  return <MeetingFormLoader me={me} meeting={meeting.data} />;
}

interface LoaderProps {
  readonly me: OwnProfile;
  readonly meeting: Meeting | null;
  readonly date?: string | undefined;
}

/** Strefa klubu, członkowie i (w trakcie) gracze z partiami, zanim pokażemy formularz. */
function MeetingFormLoader({ me, meeting, date }: LoaderProps) {
  const { client } = useAuth();
  const club = useClub(client);
  const members = useMembers(client);
  const inProgress = meeting?.status === 'in_progress';
  const players = useMeetingPlayers(client, meeting?.id ?? '', inProgress);
  const title = meeting ? form.editTitle : form.addTitle;

  if (!club.isSuccess || !members.isSuccess || (inProgress && !players.isSuccess)) {
    const failed = club.isError || members.isError || players.isError;
    return (
      <PopupModal title={title}>
        <QueryStatus
          isError={failed}
          onRetry={() => {
            void club.refetch();
            void members.refetch();
            if (inProgress) void players.refetch();
          }}
        />
      </PopupModal>
    );
  }
  // Bez klubu nie ma strefy czasowej; widżety (i ten formularz) są dopiero po założeniu.
  const timeZone = club.data?.timezone ?? FALLBACK_TIMEZONE;
  return (
    <MeetingForm
      me={me}
      meeting={meeting}
      timeZone={timeZone}
      members={members.data}
      locked={players.data ?? new Set()}
      date={date}
    />
  );
}

interface FormProps {
  readonly me: OwnProfile;
  readonly meeting: Meeting | null;
  readonly timeZone: string;
  readonly members: readonly Profile[];
  /** Uczestnicy z partią w spotkaniu w trakcie: nie da się ich odznaczyć (PLAN-4). */
  readonly locked: ReadonlySet<string>;
  readonly date?: string | undefined;
}

/**
 * Formularz spotkania (PLAN-1, DS §15 „Member selection row”, „Time dropdown”): tytuł, data
 * i godzina w strefie klubu, uczestnicy z aktywnych członków (bez limitu, Q12) i opcjonalny
 * prowadzący spośród uczestników innych niż admin. Zapis to jedno RPC `save_meeting`.
 */
function MeetingForm({ me, meeting, timeZone, members, locked, date }: FormProps) {
  const { client } = useAuth();
  const queryClient = useQueryClient();
  const toast = useToast();
  const { back } = usePopups();
  const formId = useId();
  const creating = meeting === null;
  const inProgress = meeting?.status === 'in_progress';
  // Id nowego spotkania od razu: ponowienie po błędzie sieci nie zaplanuje drugiego.
  const [id] = useState(() => meeting?.id ?? crypto.randomUUID());
  const [original] = useState(() => (meeting ? meetingFormFrom(meeting, timeZone) : null));
  const [values, setValues] = useState<MeetingFormValues>(
    () => original ?? emptyMeetingForm(timeZone, me.id, date),
  );
  const [showErrors, setShowErrors] = useState(false);
  const [titleTouched, setTitleTouched] = useState(false);
  const [saveError, setSaveError] = useState<string | undefined>(undefined);

  const errors = validateMeetingForm(values, { timeZone, creating });
  const invalid = hasErrors(errors);

  const save = useMutation({
    mutationFn: () => saveMeeting(client, { id, values, original }),
    onSuccess: () => {
      void queryClient.invalidateQueries({ queryKey: meetingsKey });
      toast.show(
        creating
          ? t.meetings.toasts.created
          : format(t.meetings.toasts.updated, { title: values.title.trim() }),
        'success',
      );
      back();
    },
    onError: (error) => {
      const reason = error instanceof MeetingError ? error.reason : 'save';
      // Stan spotkania zmienił się gdzie indziej (rozpoczęte, usunięte): odświeżamy dane.
      if (reason !== 'save') void queryClient.invalidateQueries({ queryKey: meetingsKey });
      setSaveError(t.meetings.errors[reason]);
    },
  });

  const memberIds = members.map((member) => member.id);
  const selected = memberIds.filter((memberId) => values.participants.includes(memberId)).length;
  const allSelected = selected === memberIds.length;
  const hostOptions = [
    { value: ADMIN_HOST, label: format(form.hostAdmin, { name: fullName(me) }) },
    ...members
      .filter((member) => member.role !== 'admin' && values.participants.includes(member.id))
      .map((member) => ({ value: member.id, label: fullName(member) })),
  ];
  const timeOptions = (
    TIME_SLOTS.includes(values.time) || values.time === ''
      ? TIME_SLOTS
      : [...TIME_SLOTS, values.time].sort()
  ).map((slot) => ({ value: slot, label: slot }));

  const titleMessage =
    (showErrors || titleTouched) && errors.title
      ? errors.title === 'required'
        ? form.errors.titleRequired
        : format(form.errors.titleTooLong, { max: MEETING_TITLE_MAX })
      : undefined;
  const dateMessage =
    showErrors && errors.date
      ? errors.date === 'required'
        ? form.errors.dateRequired
        : form.errors.datePast
      : undefined;

  const submit = (event: FormEvent) => {
    event.preventDefault();
    setShowErrors(true);
    setSaveError(undefined);
    if (invalid || save.isPending) return;
    save.mutate();
  };

  return (
    <PopupModal
      title={creating ? form.addTitle : form.editTitle}
      footer={
        <>
          <Button variant="secondary" onClick={back}>
            {form.cancel}
          </Button>
          <Button type="submit" form={formId} loading={save.isPending}>
            {creating ? form.create : form.save}
          </Button>
        </>
      }
    >
      <form id={formId} className="meeting-form" noValidate onSubmit={submit}>
        {saveError ? <Banner variant="error">{saveError}</Banner> : null}
        {showErrors && invalid && !saveError ? (
          <Banner variant="error">{form.errors.invalid}</Banner>
        ) : null}
        {inProgress ? <Banner variant="info">{form.inProgressNote}</Banner> : null}

        <TextField
          label={form.titleLabel}
          placeholder={form.titlePlaceholder}
          value={values.title}
          autoComplete="off"
          required
          disabled={inProgress}
          error={titleMessage}
          onChange={(event) => {
            const title = event.target.value;
            setValues((current) => ({ ...current, title }));
          }}
          onBlur={() => values.title !== '' && setTitleTouched(true)}
        />

        <div className="meeting-form__when">
          <TextField
            label={form.dateLabel}
            type="date"
            value={values.date}
            min={creating ? todayIn(timeZone) : undefined}
            required
            disabled={inProgress}
            error={dateMessage}
            onChange={(event) => {
              const value = event.target.value;
              setValues((current) => ({ ...current, date: value }));
            }}
          />
          <Select
            label={form.timeLabel}
            options={timeOptions}
            value={values.time === '' ? null : values.time}
            disabled={inProgress}
            leadingIcon="clock"
            error={showErrors && errors.time ? form.errors.timeRequired : undefined}
            onChange={(time) => setValues((current) => ({ ...current, time }))}
          />
        </div>
        <p className="meeting-form__hint">{format(form.timezoneHint, { timezone: timeZone })}</p>

        <fieldset className="meeting-form__group">
          <legend className="meeting-form__label">{form.participantsLegend}</legend>
          <div className="meeting-form__label-row">
            <span className="meeting-form__count" aria-live="polite">
              {format(form.selectedCount, { n: selected, total: memberIds.length })}
            </span>
            <button
              type="button"
              className="meeting-form__link"
              onClick={() =>
                setValues((current) => setAllParticipants(current, memberIds, !allSelected, locked))
              }
            >
              {allSelected ? form.clearAll : form.selectAll}
            </button>
          </div>
          <Tray label={form.participantsLegend} className="meeting-form__members">
            {members.map((member) => {
              const hasPlay = locked.has(member.id);
              const checked = values.participants.includes(member.id);
              return (
                <li key={member.id} className="tray__item">
                  <Checkbox
                    className="row meeting-member"
                    checked={checked}
                    disabled={hasPlay && checked}
                    onCheckedChange={(next) =>
                      setValues((current) => toggleParticipant(current, member.id, next))
                    }
                    label={
                      <span className="meeting-member__body">
                        <ProfileAvatar profile={member} size={36} decorative />
                        <span className="meeting-member__name">{fullName(member)}</span>
                        <span className="meeting-member__badges">
                          {member.role === 'admin' ? (
                            <Badge tone="accent">{t.ui.adminBadge}</Badge>
                          ) : null}
                          {member.id === me.id ? <Badge tone="ink">{t.ui.youBadge}</Badge> : null}
                          {hasPlay ? <Badge tone="neutral">{form.hasPlay}</Badge> : null}
                        </span>
                      </span>
                    }
                  />
                </li>
              );
            })}
          </Tray>
          {showErrors && errors.participants ? (
            <p className="meeting-form__error" role="alert">
              {form.errors.participantsRequired}
            </p>
          ) : null}
        </fieldset>

        <Select
          label={form.hostLabel}
          options={hostOptions}
          value={values.hostId ?? ADMIN_HOST}
          hint={form.hostHint}
          onChange={(value) =>
            setValues((current) => ({ ...current, hostId: value === ADMIN_HOST ? null : value }))
          }
        />

        {creating ? <p className="meeting-form__hint">{form.votingNote}</p> : null}
      </form>
    </PopupModal>
  );
}
