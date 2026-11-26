import {
  action,
  createMemo,
  createOptimistic,
  createSignal,
  createUniqueId,
  flush,
  For,
  Match,
  Show,
  Switch,
  useContext,
} from 'solid-js';
import type { OwnProfile } from '../auth/ownProfile';
import { FALLBACK_TIMEZONE } from '../club/timezones';
import { format, t } from '../i18n';
import { fullName, type Profile } from '../profile/profileQueries';
import { createClub } from '../club/clubData';
import { AuthContext } from '../auth/authContext';
import { PopupsContext } from '../popups/popupContext';
import { QueryClientContext } from '../lib/queryClient';
import { ToastContext } from '../ui/toastContext';
import { PopupModal } from '../popups/PopupModal';
import { QueryBoundary } from '../popups/QueryStatus';
import { ProfileAvatar } from '../profile/ProfileAvatar';
import { createMembers } from '../profile/profiles';
import type { AsyncQuery } from '../lib/query';
import { Badge, Banner, Button, Checkbox, IconButton, Select, TextField, Tray } from '../ui';
import { duplicateDateOptions, type DateOptionValue } from './dateOptions';
import { dateOptionValues } from './dateVoting';
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
import { createMeeting, createMeetingDateOptions, createMeetingPlayers } from './meetingData';
import { MeetingError, meetingsKey, saveMeeting, type Meeting } from './meetings';
import './meetings.css';

const form = t.meetings.form;
/** Wartość listy „Prowadzący” oznaczająca administratora (`host_id` = NULL). */
const ADMIN_HOST = 'admin';
const NO_PLAYERS: ReadonlySet<string> = new Set();
/** Wartości bez błędów: tło do sprawdzenia jednego pola. */
const NEUTRAL_VALUES: MeetingFormValues = {
  title: '-',
  date: '2000-01-01',
  time: '00:00',
  participants: ['-'],
  hostId: null,
  dateVoting: false,
  dateOptions: [],
};
/** „Zaplanuj spotkanie”, opcjonalnie z wypełnioną datą. */
export function AddMeetingPopup(props: {
  readonly me: OwnProfile;
  readonly date?: string | undefined;
}) {
  return <MeetingFormPopup me={props.me} meeting={undefined} date={props.date} />;
}

/**
 * „Edytuj spotkanie”. Zaplanowane: wszystkie pola. W trakcie: dopisanie
 * uczestnika i zmiana prowadzącego. Zakończone i nieistniejące mają czytelny stan.
 */
export function EditMeetingPopup(props: { readonly id: string; readonly me: OwnProfile }) {
  const meeting = createMeeting(() => props.id);
  return <MeetingFormPopup me={props.me} meeting={meeting} />;
}

interface PopupProps {
  readonly me: OwnProfile;
  /** Zapytanie spotkania edycji (dane `null`: nie ma takiego); `undefined` = nowe spotkanie. */
  readonly meeting: AsyncQuery<Meeting | null> | undefined;
  readonly date?: string | undefined;
}

/** Stan formularza ustalony raz, z pierwszych wczytanych danych. */
interface FormStart {
  /** Id nowego spotkania od razu: ponowienie po błędzie sieci nie zaplanuje drugiego. */
  readonly id: string;
  readonly original: MeetingFormValues | null;
  readonly values: MeetingFormValues;
}

/**
 * Formularz spotkania: tytuł, data
 * i godzina w strefie klubu, uczestnicy z aktywnych członków (bez limitu) i opcjonalny
 * prowadzący spośród uczestników innych niż admin. Zapis to jedno RPC `save_meeting`.
 * Jedno okno na wczytywanie (strefa klubu, członkowie, w trakcie gracze z partiami, propozycje
 * terminu), formularz, „Nie znaleziono” i „Zakończone”: fokus ustawiony przez `PopupHost`
 * zostaje na oknie po wczytaniu danych.
 */
function MeetingFormPopup(props: PopupProps) {
  const auth = useContext(AuthContext);
  const queryClient = useContext(QueryClientContext);
  const toast = useContext(ToastContext);
  const popups = useContext(PopupsContext);
  const formId = createUniqueId();
  const newId = crypto.randomUUID();

  const club = createClub();
  const members = createMembers();
  const creating = () => !props.meeting;
  /** Spotkanie edycji z cache (bez czekania): `undefined` w trakcie wczytywania, `null` = brak. */
  const meeting = (): Meeting | null | undefined =>
    props.meeting ? props.meeting.current() : null;
  const inProgress = () => meeting()?.status === 'in_progress';
  const players = createMeetingPlayers(() => meeting()?.id ?? '', inProgress);
  // Propozycje terminu zmienia się tylko w zaplanowanym spotkaniu.
  const planned = () => meeting()?.status === 'planned';
  const options = createMeetingDateOptions(() => meeting()?.id ?? '', planned);

  /** Etap okna (tytuł, stopka) z danych w cache: spotkanie edycji, potem dane formularza. */
  const phase = createMemo(() => {
    const current = meeting();
    if (current === undefined) return 'meeting';
    if (!creating() && !current) return 'notFound';
    if (current?.status === 'finished') return 'finished';
    if (
      club.current() === undefined ||
      members.current() === undefined ||
      (inProgress() && players.current() === undefined) ||
      (planned() && options.current() === undefined)
    ) {
      return 'loading';
    }
    return 'form';
  });
  /**
   * Treść okna: czeka pod `<QueryBoundary>` na spotkanie edycji, a dla formularza na strefę
   * klubu, członków, w trakcie graczy z partiami i propozycje terminu.
   */
  const content = createMemo(() => {
    const current = props.meeting ? props.meeting() : null;
    if (props.meeting && !current) return 'notFound';
    if (current?.status === 'finished') return 'finished';
    club();
    members();
    if (current?.status === 'in_progress') players();
    if (current?.status === 'planned') options();
    return 'form';
  });
  // Bez klubu nie ma strefy czasowej; widżety (i ten formularz) są dopiero po założeniu.
  const timeZone = () => club.current()?.timezone ?? FALLBACK_TIMEZONE;
  const memberList = (): readonly Profile[] => members.current() ?? [];
  /** Uczestnicy z partią w spotkaniu w trakcie: nie da się ich odznaczyć. */
  const locked = () => players.current() ?? NO_PLAYERS;

  let first: FormStart | undefined;
  const start = createMemo(() => {
    if (first || phase() !== 'form') return first;
    const current = meeting();
    const zone = timeZone();
    const original = current
      ? meetingFormFrom(
          current,
          zone,
          planned() ? dateOptionValues(options.current() ?? [], zone) : [],
        )
      : null;
    first = {
      id: current?.id ?? newId,
      original,
      values: original ?? emptyMeetingForm(zone, props.me.id, props.date),
    };
    return first;
  });
  const [values, setValues] = createSignal<MeetingFormValues>(
    () => start()?.values ?? emptyMeetingForm(FALLBACK_TIMEZONE, '', undefined),
  );
  // Pola osobno: wpis w jednym polu nie przelicza wszystkich odczytów formularza (listy godzin,
  // wiersze uczestników).
  const title = createMemo(() => values().title);
  const date = createMemo(() => values().date);
  const time = createMemo(() => values().time);
  const participants = createMemo(() => values().participants);
  const hostId = createMemo(() => values().hostId);
  const dateVoting = createMemo(() => values().dateVoting);
  const dateOptions = createMemo(() => values().dateOptions);
  const [showErrors, setShowErrors] = createSignal(false);
  const [titleTouched, setTitleTouched] = createSignal(false);
  const [saveError, setSaveError] = createSignal<string | undefined>(undefined);

  // Błąd każdego pola z jego własnych wartości (te same reguły co `validateMeetingForm`, reszta
  // pól neutralna): wpis w jednym polu nie przelicza komunikatów pozostałych.
  const check = (part: Partial<MeetingFormValues>) =>
    validateMeetingForm(
      { ...NEUTRAL_VALUES, ...part },
      {
        timeZone: timeZone(),
        creating: creating(),
      },
    );
  const errors = {
    title: () => check({ title: title() }).title,
    date: () => check({ date: date(), time: time() }).date,
    time: () => check({ time: time() }).time,
    participants: () => check({ participants: participants() }).participants,
    dateOptions: () => check({ dateOptions: dateOptions() }).dateOptions,
  };
  const invalid = () =>
    hasErrors({
      title: errors.title(),
      date: errors.date(),
      time: errors.time(),
      participants: errors.participants(),
      dateOptions: errors.dateOptions(),
    });

  const [saving, setSaving] = createOptimistic(false);
  const save = action(function* () {
    setSaving(true);
    try {
      yield saveMeeting(auth.client, {
        id: start()?.id ?? newId,
        values: values(),
        original: start()?.original ?? null,
      });
    } catch (error) {
      const reason = error instanceof MeetingError ? error.reason : 'save';
      // Stan spotkania zmienił się gdzie indziej (rozpoczęte, usunięte): odświeżamy dane.
      if (reason !== 'save') void queryClient.invalidateQueries({ queryKey: meetingsKey });
      setSaveError(t.meetings.errors[reason]);
      return;
    }
    void queryClient.invalidateQueries({ queryKey: meetingsKey });
    toast.show(
      creating()
        ? t.meetings.toasts.created
        : format(t.meetings.toasts.updated, { title: values().title.trim() }),
      'success',
    );
    popups.back();
  });

  const memberIds = createMemo(() => memberList().map((member) => member.id));
  const selected = () => memberIds().filter((memberId) => participants().includes(memberId)).length;
  const allSelected = () => selected() === memberIds().length;
  const hostOptions = createMemo(() => [
    { value: ADMIN_HOST, label: format(form.hostAdmin, { name: fullName(props.me) }) },
    ...memberList()
      .filter((member) => member.role !== 'admin' && participants().includes(member.id))
      .map((member) => ({ value: member.id, label: fullName(member) })),
  ]);
  const timeOptions = createMemo(() => {
    const current = time();
    return (
      TIME_SLOTS.includes(current) || current === '' ? TIME_SLOTS : [...TIME_SLOTS, current].sort()
    ).map((slot) => ({ value: slot, label: slot }));
  });

  const titleMessage = () => {
    const error = errors.title();
    if (!(showErrors() || titleTouched()) || !error) return undefined;
    return error === 'required'
      ? form.errors.titleRequired
      : format(form.errors.titleTooLong, { max: MEETING_TITLE_MAX });
  };
  const dateMessage = () => {
    const error = errors.date();
    if (!showErrors() || !error) return undefined;
    return error === 'required' ? form.errors.dateRequired : form.errors.datePast;
  };
  const dateOptionsMessage = () => {
    const error = errors.dateOptions();
    if (!showErrors() || !error) return undefined;
    return error === 'incomplete'
      ? form.errors.dateOptionsIncomplete
      : form.errors.dateOptionsDuplicate;
  };

  const submit = (event: SubmitEvent) => {
    event.preventDefault();
    // Wpis z tego samego zadania (autouzupełnianie + Enter) widać dopiero po flushu.
    flush();
    setShowErrors(true);
    setSaveError(undefined);
    if (invalid() || saving()) return;
    void save();
  };

  const popupTitle = () => {
    if (phase() === 'notFound') return form.notFoundTitle;
    if (phase() === 'finished') return form.finishedTitle;
    return creating() ? form.addTitle : form.editTitle;
  };

  return (
    <PopupModal
      title={popupTitle()}
      footer={
        <Show when={phase() === 'form'}>
          <Button variant="secondary" onClick={() => popups.back()}>
            {form.cancel}
          </Button>
          <Button type="submit" form={formId} loading={saving()}>
            {creating() ? form.create : form.save}
          </Button>
        </Show>
      }
    >
      <QueryBoundary>
        <Switch>
          <Match when={content() === 'notFound'}>
            <p class="meeting-form__state">{form.notFoundBody}</p>
          </Match>
          <Match when={content() === 'finished'}>
            <p class="meeting-form__state">{form.finishedBody}</p>
          </Match>
          <Match when={content() === 'form'}>
            <form id={formId} class="meeting-form" novalidate onSubmit={submit}>
              <Show when={saveError()}>
                {(message) => <Banner variant="error">{message()}</Banner>}
              </Show>
              <Show when={showErrors() && invalid() && !saveError()}>
                <Banner variant="error">{form.errors.invalid}</Banner>
              </Show>
              <Show when={inProgress()}>
                <Banner variant="info">{form.inProgressNote}</Banner>
              </Show>

              <TextField
                label={form.titleLabel}
                placeholder={form.titlePlaceholder}
                value={title()}
                autocomplete="off"
                required
                disabled={inProgress()}
                error={titleMessage()}
                onInput={(event) => {
                  const text = event.currentTarget.value;
                  setValues((current) => ({ ...current, title: text }));
                }}
                onBlur={(event) => {
                  // Wartość z pola: wpis z tego samego zadania sygnał pokaże dopiero po flushu.
                  if (event.currentTarget.value !== '') setTitleTouched(true);
                }}
              />

              <div class="meeting-form__when">
                <TextField
                  label={form.dateLabel}
                  type="date"
                  value={date()}
                  min={creating() ? todayIn(timeZone()) : undefined}
                  required
                  disabled={inProgress()}
                  error={dateMessage()}
                  onInput={(event) => {
                    const date = event.currentTarget.value;
                    setValues((current) => ({ ...current, date }));
                  }}
                />
                <Select
                  label={form.timeLabel}
                  options={timeOptions()}
                  value={time() === '' ? null : time()}
                  disabled={inProgress()}
                  leadingIcon="clock"
                  error={showErrors() && errors.time() ? form.errors.timeRequired : undefined}
                  onChange={(time) => setValues((current) => ({ ...current, time }))}
                />
              </div>
              <p class="meeting-form__hint">
                {format(form.timezoneHint, { timezone: timeZone() })}
              </p>

              <fieldset class="meeting-form__group">
                <legend class="meeting-form__label">{form.participantsLegend}</legend>
                <div class="meeting-form__label-row">
                  <span class="meeting-form__count" aria-live="polite">
                    {format(form.selectedCount, { n: selected(), total: memberIds().length })}
                  </span>
                  <button
                    type="button"
                    class="meeting-form__link"
                    onClick={() => {
                      const all = !allSelected();
                      setValues((current) =>
                        setAllParticipants(current, memberIds(), all, locked()),
                      );
                    }}
                  >
                    {allSelected() ? form.clearAll : form.selectAll}
                  </button>
                </div>
                <Tray label={form.participantsLegend} class="meeting-form__members">
                  <For each={memberList()} keyed={(member) => member.id}>
                    {(member) => {
                      const hasPlay = () => locked().has(member().id);
                      const checked = () => participants().includes(member().id);
                      return (
                        <li class="tray__item">
                          <Checkbox
                            class="row meeting-member"
                            checked={checked()}
                            disabled={hasPlay() && checked()}
                            onCheckedChange={(next) =>
                              setValues((current) => toggleParticipant(current, member().id, next))
                            }
                            label={
                              <span class="meeting-member__body">
                                <ProfileAvatar profile={member()} size={36} decorative />
                                <span class="meeting-member__name">{fullName(member())}</span>
                                <span class="meeting-member__badges">
                                  <Show when={member().role === 'admin'}>
                                    <Badge tone="accent">{t.ui.adminBadge}</Badge>
                                  </Show>
                                  <Show when={member().id === props.me.id}>
                                    <Badge tone="ink">{t.ui.youBadge}</Badge>
                                  </Show>
                                  <Show when={hasPlay()}>
                                    <Badge tone="neutral">{form.hasPlay}</Badge>
                                  </Show>
                                </span>
                              </span>
                            }
                          />
                        </li>
                      );
                    }}
                  </For>
                </Tray>
                <Show when={showErrors() && errors.participants()}>
                  <p class="meeting-form__error" role="alert">
                    {form.errors.participantsRequired}
                  </p>
                </Show>
              </fieldset>

              <Select
                label={form.hostLabel}
                options={hostOptions()}
                value={hostId() ?? ADMIN_HOST}
                hint={form.hostHint}
                onChange={(value) =>
                  setValues((current) => ({
                    ...current,
                    hostId: value === ADMIN_HOST ? null : value,
                  }))
                }
              />

              <Show when={!inProgress()}>
                <DateOptionsField
                  enabled={dateVoting()}
                  values={dateOptions()}
                  minDate={creating() ? todayIn(timeZone()) : undefined}
                  error={dateOptionsMessage()}
                  onToggle={(dateVoting) => setValues((current) => ({ ...current, dateVoting }))}
                  onAdd={() => setValues((current) => addDateOption(current))}
                  onChange={(index, change) =>
                    setValues((current) => updateDateOption(current, index, change))
                  }
                  onRemove={(index) => setValues((current) => removeDateOption(current, index))}
                />
              </Show>

              <Show when={creating()}>
                <p class="meeting-form__hint">{form.votingNote}</p>
              </Show>
            </form>
          </Match>
        </Switch>
      </QueryBoundary>
    </PopupModal>
  );
}

/**
 * Głosowanie na termin: przełącznik (uczestnicy proponują terminy i głosują) i własne propozycje
 * administratora, wiersze z datą i godziną (jak termin spotkania) i usunięciem, bez limitu.
 * Termin spotkania zostaje polem powyżej; propozycje są tylko pytaniem do uczestników.
 */
function DateOptionsField(props: {
  readonly enabled: boolean;
  readonly onToggle: (enabled: boolean) => void;
  readonly values: readonly DateOptionValue[];
  readonly minDate: string | undefined;
  readonly error: string | undefined;
  readonly onAdd: () => void;
  readonly onChange: (index: number, change: Partial<DateOptionValue>) => void;
  readonly onRemove: (index: number) => void;
}) {
  const duplicates = createMemo(() => duplicateDateOptions(props.values));
  const open = () => props.enabled || props.values.length > 0;
  return (
    <fieldset class="meeting-form__group">
      <legend class="meeting-form__label">{form.dateVotingLabel}</legend>
      <Checkbox
        class="row meeting-member"
        checked={props.enabled}
        onCheckedChange={(enabled) => props.onToggle(enabled)}
        label={<span class="meeting-member__name">{form.dateVotingLabel}</span>}
      />
      <p class="meeting-form__hint date-options__hint">{form.dateVotingHint}</p>
      <Show when={open()}>
        <p class="meeting-form__hint date-options__hint">{form.dateOptionsHint}</p>
      </Show>
      <Show when={props.values.length > 0}>
        <ol class="date-options" aria-label={form.dateOptionsLegend}>
          {/* Wiersze są pozycjami (propozycja 1…n), więc lista jest po indeksie. */}
          <For each={props.values} keyed={false}>
            {(option, index) => {
              const n = index + 1;
              const slots = () => {
                const time = option().time;
                return TIME_SLOTS.includes(time) || time === ''
                  ? TIME_SLOTS
                  : [...TIME_SLOTS, time].sort();
              };
              return (
                <li class="date-options__row">
                  <TextField
                    label={format(form.dateOptionDate, { n })}
                    type="date"
                    value={option().date}
                    min={props.minDate}
                    error={duplicates().has(index) ? form.errors.dateOptionsDuplicate : undefined}
                    onInput={(event) => props.onChange(index, { date: event.currentTarget.value })}
                  />
                  <Select
                    label={format(form.dateOptionTime, { n })}
                    options={slots().map((slot) => ({ value: slot, label: slot }))}
                    value={option().time === '' ? null : option().time}
                    leadingIcon="clock"
                    onChange={(time) => props.onChange(index, { time })}
                  />
                  <IconButton
                    icon="trash"
                    label={format(form.removeDateOption, { n })}
                    class="date-options__remove"
                    onClick={() => props.onRemove(index)}
                  />
                </li>
              );
            }}
          </For>
        </ol>
      </Show>
      <Show when={open()}>
        <Button size="sm" variant="secondary" icon="plus" onClick={() => props.onAdd()}>
          {form.addDateOption}
        </Button>
      </Show>
      <Show when={props.error}>
        {(message) => (
          <p class="meeting-form__error" role="alert">
            {message()}
          </p>
        )}
      </Show>
    </fieldset>
  );
}
