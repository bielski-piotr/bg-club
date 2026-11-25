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
import { ProfileAvatar } from '../react-shared/ProfileAvatar';
import { fullName, useMembers, type Profile } from '../react-shared/profiles';
import {
  Badge,
  Banner,
  Button,
  Checkbox,
  IconButton,
  Select,
  TextField,
  Tray,
  useToast,
} from '../ui';
import { duplicateDateOptions, type DateOptionValue } from './dateOptions';
import { dateOptionValues, useMeetingDateOptions } from './dateVoting';
import { TIME_SLOTS, todayIn } from './datetime';
import {
  addDateOption,
  emptyMeetingForm,
  hasErrors,
  MEETING_TITLE_MAX,
  meetingFormFrom,
  removeDateOption,
  setAllParticipants,
  toggleParticipant,
  updateDateOption,
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
  // Propozycje terminu zmienia się tylko w zaplanowanym spotkaniu.
  const planned = meeting?.status === 'planned';
  const options = useMeetingDateOptions(client, meeting?.id ?? '', planned);
  const title = meeting ? form.editTitle : form.addTitle;

  if (
    !club.isSuccess ||
    !members.isSuccess ||
    (inProgress && !players.isSuccess) ||
    (planned && !options.isSuccess)
  ) {
    const failed = club.isError || members.isError || players.isError || options.isError;
    return (
      <PopupModal title={title}>
        <QueryStatus
          isError={failed}
          onRetry={() => {
            void club.refetch();
            void members.refetch();
            if (inProgress) void players.refetch();
            if (planned) void options.refetch();
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
      dateOptions={planned ? dateOptionValues(options.data ?? [], timeZone) : []}
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
  /** Zapisane propozycje terminu (edycja zaplanowanego spotkania). */
  readonly dateOptions: readonly DateOptionValue[];
  readonly date?: string | undefined;
}

/**
 * Formularz spotkania (PLAN-1, DS §15 „Member selection row”, „Time dropdown”): tytuł, data
 * i godzina w strefie klubu, uczestnicy z aktywnych członków (bez limitu, Q12) i opcjonalny
 * prowadzący spośród uczestników innych niż admin. Zapis to jedno RPC `save_meeting`.
 */
function MeetingForm({ me, meeting, timeZone, members, locked, dateOptions, date }: FormProps) {
  const { client } = useAuth();
  const queryClient = useQueryClient();
  const toast = useToast();
  const { back } = usePopups();
  const formId = useId();
  const creating = meeting === null;
  const inProgress = meeting?.status === 'in_progress';
  // Id nowego spotkania od razu: ponowienie po błędzie sieci nie zaplanuje drugiego.
  const [id] = useState(() => meeting?.id ?? crypto.randomUUID());
  const [original] = useState(() =>
    meeting ? meetingFormFrom(meeting, timeZone, dateOptions) : null,
  );
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

        {inProgress ? null : (
          <DateOptionsField
            enabled={values.dateVoting}
            values={values.dateOptions}
            minDate={creating ? todayIn(timeZone) : undefined}
            error={
              showErrors && errors.dateOptions
                ? errors.dateOptions === 'incomplete'
                  ? form.errors.dateOptionsIncomplete
                  : form.errors.dateOptionsDuplicate
                : undefined
            }
            onToggle={(dateVoting) => setValues((current) => ({ ...current, dateVoting }))}
            onAdd={() => setValues((current) => addDateOption(current))}
            onChange={(index, change) =>
              setValues((current) => updateDateOption(current, index, change))
            }
            onRemove={(index) => setValues((current) => removeDateOption(current, index))}
          />
        )}

        {creating ? <p className="meeting-form__hint">{form.votingNote}</p> : null}
      </form>
    </PopupModal>
  );
}

/**
 * Głosowanie na termin: przełącznik (uczestnicy proponują terminy i głosują) i własne propozycje
 * administratora, wiersze z datą i godziną (jak termin spotkania) i usunięciem, bez limitu.
 * Termin spotkania zostaje polem powyżej; propozycje są tylko pytaniem do uczestników.
 */
function DateOptionsField({
  enabled,
  onToggle,
  values,
  minDate,
  error,
  onAdd,
  onChange,
  onRemove,
}: {
  readonly enabled: boolean;
  readonly onToggle: (enabled: boolean) => void;
  readonly values: readonly DateOptionValue[];
  readonly minDate: string | undefined;
  readonly error: string | undefined;
  readonly onAdd: () => void;
  readonly onChange: (index: number, change: Partial<DateOptionValue>) => void;
  readonly onRemove: (index: number) => void;
}) {
  const duplicates = duplicateDateOptions(values);
  return (
    <fieldset className="meeting-form__group">
      <legend className="meeting-form__label">{form.dateVotingLabel}</legend>
      <Checkbox
        className="row meeting-member"
        checked={enabled}
        onCheckedChange={onToggle}
        label={<span className="meeting-member__name">{form.dateVotingLabel}</span>}
      />
      <p className="meeting-form__hint date-options__hint">{form.dateVotingHint}</p>
      {enabled || values.length > 0 ? (
        <p className="meeting-form__hint date-options__hint">{form.dateOptionsHint}</p>
      ) : null}
      {values.length > 0 ? (
        <ol className="date-options" aria-label={form.dateOptionsLegend}>
          {values.map((option, index) => {
            const n = index + 1;
            const slots =
              TIME_SLOTS.includes(option.time) || option.time === ''
                ? TIME_SLOTS
                : [...TIME_SLOTS, option.time].sort();
            return (
              <li key={index} className="date-options__row">
                <TextField
                  label={format(form.dateOptionDate, { n })}
                  type="date"
                  value={option.date}
                  min={minDate}
                  error={duplicates.has(index) ? form.errors.dateOptionsDuplicate : undefined}
                  onChange={(event) => onChange(index, { date: event.target.value })}
                />
                <Select
                  label={format(form.dateOptionTime, { n })}
                  options={slots.map((slot) => ({ value: slot, label: slot }))}
                  value={option.time === '' ? null : option.time}
                  leadingIcon="clock"
                  onChange={(time) => onChange(index, { time })}
                />
                <IconButton
                  icon="trash"
                  label={format(form.removeDateOption, { n })}
                  className="date-options__remove"
                  onClick={() => onRemove(index)}
                />
              </li>
            );
          })}
        </ol>
      ) : null}
      {enabled || values.length > 0 ? (
        <Button size="sm" variant="secondary" icon="plus" onClick={onAdd}>
          {form.addDateOption}
        </Button>
      ) : null}
      {error ? (
        <p className="meeting-form__error" role="alert">
          {error}
        </p>
      ) : null}
    </fieldset>
  );
}
