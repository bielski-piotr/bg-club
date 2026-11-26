import {
  action,
  createMemo,
  createOptimistic,
  createSignal,
  For,
  Show,
  flush,
  untrack,
  useContext,
} from 'solid-js';
import type { OwnProfile } from '../auth/ownProfile';
import { format, t } from '../i18n';
import { avatarPerson, type Profile } from '../profile/profileQueries';
import { AuthContext } from '../auth/authContext';
import { QueryClientContext } from '../lib/queryClient';
import { ToastContext } from '../ui/toastContext';
import { QueryBoundary } from '../popups/QueryStatus';
import { AvatarStack, Badge, Button, Icon, Select, TextField, Tray } from '../ui';
import { ariaBool } from '../ui/dom';
import {
  castDateVote,
  DateVotingError,
  leadingDateOptions,
  meetingDateOptionsKey,
  proposeMeetingDate,
  withdrawDateVote,
  type DateOption,
} from './dateVoting';
import {
  DEFAULT_TIME,
  formatMeetingDate,
  localDateTime,
  longMeetingDate,
  TIME_SLOTS,
  todayIn,
} from './datetime';
import { createDateDecision, createMeetingDateOptions, type DateDecision } from './meetingData';
import { meetingsKey, type Meeting } from './meetings';
import { votesLabel } from './voting';

const text = t.meetings.dateVoting;

/**
 * Głosowanie na termin (zaplanowane spotkanie z włączonym głosowaniem albo propozycjami):
 * terminy od najwcześniejszego z głosującymi, przełącznik głosu i „Zaproponuj termin” dla
 * uczestników przy otwartym głosowaniu (bez limitu propozycji), a dla administratora „Wybierz”
 * (termin spotkania, zamyka głosowanie) i ponowne otwarcie. Głosy są opinią: termin spotkania
 * nie musi być tym z największą liczbą głosów.
 */
export function DateVotingSection(props: {
  readonly meeting: Meeting;
  readonly me: OwnProfile;
  readonly members: readonly Profile[];
  readonly timeZone: string;
}) {
  const options = createMeetingDateOptions(() => props.meeting.id);
  const decision = createDateDecision();
  const isAdmin = () => props.me.role === 'admin';
  const canVote = () =>
    props.meeting.date_voting_open && props.meeting.participants.includes(props.me.id);
  const canPropose = () => props.meeting.date_voting_open && (canVote() || isAdmin());
  const headingId = () => `${props.meeting.id}-date-voting`;
  // Bez głosowania i bez propozycji sekcji nie ma (termin podał administrator). Sekcja zależy od
  // danych w cache (bez czekania), lista czeka pod `<QueryBoundary>`.
  const visible = () => {
    const data = options.current();
    if (!props.meeting.date_voting_open && data?.length === 0) return false;
    return data !== undefined || options.state()?.isError === true;
  };
  /** Propozycje: czekają na dane pod `<QueryBoundary>`. */
  const list = createMemo(() => options() ?? []);
  const leading = createMemo(() => leadingDateOptions(list()));
  /** Decyzja w toku (który termin albo ponowne otwarcie); cofa się po jej zakończeniu. */
  const [pending, setPending] = createOptimistic<DateDecision | undefined>(undefined);
  const decide = action(function* (next: DateDecision) {
    setPending(next);
    yield decision.run(next);
  });

  return (
    <Show when={visible()}>
      <section class="meeting-view__section" aria-labelledby={headingId()}>
        <h3 id={headingId()} class="meeting-view__head">
          {text.title}
        </h3>
        <p class="meeting-form__hint meeting-view__intro">
          {!props.meeting.date_voting_open
            ? text.introClosed
            : props.meeting.participants.includes(props.me.id)
              ? text.intro
              : text.notParticipant}
        </p>
        <QueryBoundary>
          <Show when={list().length > 0} fallback={<p class="meeting-form__state">{text.empty}</p>}>
            <Tray label={text.listLabel} class="vote-list">
              <For each={list()} keyed={(option) => option.id}>
                {(option) => (
                  <DateOptionItem
                    option={option()}
                    meeting={props.meeting}
                    me={props.me}
                    members={props.members}
                    timeZone={props.timeZone}
                    canVote={canVote()}
                    leading={leading().has(option().id)}
                    onChoose={
                      isAdmin()
                        ? () =>
                            void decide({
                              kind: 'decide',
                              meetingId: props.meeting.id,
                              optionId: option().id,
                            })
                        : undefined
                    }
                    choosing={(() => {
                      const current = pending();
                      return current?.kind === 'decide' && current.optionId === option().id;
                    })()}
                  />
                )}
              </For>
            </Tray>
          </Show>
        </QueryBoundary>
        <Show when={canPropose()}>
          <ProposeDate meeting={props.meeting} timeZone={props.timeZone} />
        </Show>
        <Show when={isAdmin()}>
          <div class="date-voting__admin">
            <Show
              when={!props.meeting.date_voting_open}
              fallback={<p class="meeting-form__hint">{text.adminNote}</p>}
            >
              <Button
                size="sm"
                variant="secondary"
                icon="refresh"
                loading={pending()?.kind === 'reopen'}
                onClick={() => void decide({ kind: 'reopen', meetingId: props.meeting.id })}
              >
                {text.reopen}
              </Button>
            </Show>
          </div>
        </Show>
      </section>
    </Show>
  );
}

/** „Zaproponuj termin”: data i godzina w strefie klubu; proponujący od razu na nią głosuje. */
function ProposeDate(props: { readonly meeting: Meeting; readonly timeZone: string }) {
  const auth = useContext(AuthContext);
  const queryClient = useContext(QueryClientContext);
  const toast = useContext(ToastContext);
  const today = () => todayIn(props.timeZone);
  // Wartość startowa jednorazowo z terminu spotkania.
  const [value, setValue] = createSignal(
    untrack(() => {
      const start = localDateTime(props.meeting.starts_at, props.timeZone);
      return { date: start.date, time: start.time || DEFAULT_TIME };
    }),
  );
  const [proposing, setProposing] = createOptimistic(false);
  const propose = action(function* () {
    setProposing(true);
    let failed = false;
    try {
      yield proposeMeetingDate(auth.client, props.meeting.id, value());
    } catch (error) {
      failed = true;
      toast.show(text.errors[error instanceof DateVotingError ? error.reason : 'save'], 'error');
    }
    if (!failed) toast.show(text.proposed, 'success');
    yield queryClient.invalidateQueries({
      queryKey: failed ? meetingsKey : meetingDateOptionsKey(props.meeting.id),
    });
  });
  const slots = createMemo(() => {
    const time = value().time;
    return TIME_SLOTS.includes(time) ? TIME_SLOTS : [...TIME_SLOTS, time].sort();
  });
  const submit = (event: SubmitEvent) => {
    event.preventDefault();
    // Wpis z tego samego zadania (autouzupełnianie + Enter) widać dopiero po flushu.
    flush();
    const current = value();
    if (current.date === '' || current.time === '' || proposing()) return;
    void propose();
  };
  return (
    <form class="date-propose" aria-label={text.proposeLegend} onSubmit={submit}>
      <TextField
        label={text.proposeDate}
        type="date"
        value={value().date}
        min={today()}
        required
        onInput={(event) => {
          const date = event.currentTarget.value;
          setValue((current) => ({ ...current, date }));
        }}
      />
      <Select
        label={text.proposeTime}
        options={slots().map((slot) => ({ value: slot, label: slot }))}
        value={value().time}
        leadingIcon="clock"
        onChange={(time) => setValue((current) => ({ ...current, time }))}
      />
      <Button
        type="submit"
        size="sm"
        variant="secondary"
        icon="plus"
        class="date-propose__submit"
        loading={proposing()}
        disabled={value().date === ''}
      >
        {text.propose}
      </Button>
    </form>
  );
}

function DateOptionItem(props: {
  readonly option: DateOption;
  readonly meeting: Meeting;
  readonly me: OwnProfile;
  readonly members: readonly Profile[];
  readonly timeZone: string;
  readonly canVote: boolean;
  readonly leading: boolean;
  readonly onChoose: (() => void) | undefined;
  readonly choosing: boolean;
}) {
  const auth = useContext(AuthContext);
  const queryClient = useContext(QueryClientContext);
  const toast = useContext(ToastContext);
  const date = () => formatMeetingDate(props.option.starts_at, props.timeZone);
  const mineNow = () => props.option.voters.includes(props.me.id);
  const voters = createMemo(() =>
    props.option.voters.flatMap((id) => {
      const member = props.members.find((m) => m.id === id);
      return member ? [avatarPerson(member)] : [];
    }),
  );
  const chosen = () =>
    new Date(props.option.starts_at).getTime() === new Date(props.meeting.starts_at).getTime();
  /** Głos w toku (oczekiwany stan przełącznika); cofa się po zakończeniu akcji. */
  const [voting, setVoting] = createOptimistic<boolean | undefined>(undefined);
  const toggle = action(function* (on: boolean) {
    setVoting(on);
    const target = {
      meetingId: props.meeting.id,
      optionId: props.option.id,
      profileId: props.me.id,
    };
    let failed = false;
    try {
      yield on ? castDateVote(auth.client, target) : withdrawDateVote(auth.client, target);
    } catch (error) {
      failed = true;
      toast.show(text.errors[error instanceof DateVotingError ? error.reason : 'save'], 'error');
    }
    if (!failed) toast.show(on ? t.meetings.toasts.voted : t.meetings.toasts.withdrawn, 'success');
    // Jak głos na grę: akcja trwa do odświeżenia, a po błędzie odświeżamy też spotkanie.
    yield queryClient.invalidateQueries({
      queryKey: failed ? meetingsKey : meetingDateOptionsKey(props.meeting.id),
    });
  });
  const mine = () => voting() ?? mineNow();
  const choosable = () => !!props.onChoose && (!chosen() || props.meeting.date_voting_open);
  return (
    <li class="tray__item">
      <div class={['row row--64 vote-row date-row', { 'date-row--chosen': chosen() }]}>
        <span class="date-row__icon" aria-hidden="true">
          <Icon name="calendar" />
        </span>
        <span class="vote-row__body">
          <span class="vote-row__name">
            <span aria-hidden="true">{date()}</span>
            <span class="sr-only">{longMeetingDate(props.option.starts_at, props.timeZone)}</span>
          </span>
          <span class="vote-row__meta">
            <Show when={voters().length > 0}>
              <AvatarStack people={voters().slice(0, 5)} size={20} />
            </Show>
            <span>{votesLabel(props.option.voters.length)}</span>
            <Show when={chosen()}>
              <Badge tone="success">{text.chosen}</Badge>
            </Show>
            <Show when={props.leading && !chosen()}>
              <Badge tone="accent">{text.leading}</Badge>
            </Show>
          </span>
        </span>
        <Show when={props.canVote || choosable()}>
          <span class="date-row__actions">
            <Show when={props.canVote}>
              <button
                type="button"
                class={['vote-toggle', { 'vote-toggle--on': mine() }]}
                aria-pressed={ariaBool(mine())}
                aria-label={format(mine() ? text.voteOff : text.voteOn, { date: date() })}
                disabled={voting() !== undefined}
                onClick={() => void toggle(!mineNow())}
              >
                <Show when={mine()}>
                  <Icon name="check" size={14} />
                </Show>
                <span aria-hidden="true">{mine() ? text.voted : text.vote}</span>
              </button>
            </Show>
            <Show when={choosable()}>
              <Button
                size="sm"
                variant="secondary"
                loading={props.choosing}
                aria-label={format(text.chooseLabel, { date: date() })}
                onClick={() => props.onChoose?.()}
              >
                {text.choose}
              </Button>
            </Show>
          </span>
        </Show>
      </div>
    </li>
  );
}
