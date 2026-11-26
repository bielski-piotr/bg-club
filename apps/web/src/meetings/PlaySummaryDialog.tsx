import {
  manualTieGroups,
  resolveManualTies,
  type RankedPlayer,
  type ScoringTemplate,
} from '@bg-club/scoring';
import { createMemo, createSignal, For, onSettled, Show } from 'solid-js';
import { format, formatNumber, t } from '../i18n';
import { fullName, type Profile } from '../profile/profileQueries';
import { ManualTieControls } from '../score-pad/ManualTieControls';
import { ProfileAvatar } from '../profile/ProfileAvatar';
import { Banner, Button, Dialog } from '../ui';
import { createRecordPreview } from './meetingData';
import { PlayTimes, RecordBadge } from './MeetingParts';
import { playSummary, type PlaySeats, type PlaySaveFailure, type PlaySummary } from './playSave';

const text = t.meetings.play.summary;

export interface PlaySummaryDialogProps {
  readonly title: string;
  /** Partia w toku: podgląd rekordów (porównanie z zapisanymi partiami gry). */
  readonly playId: string;
  /** Początek partii; koniec to chwila oderwania karteczki (zapis). */
  readonly startedAt: string;
  readonly timeZone: string;
  /** `null`: kartki nie da się zapisać (wyniki nie pasują do partii). */
  readonly summary: PlaySummary | null;
  readonly profiles: ReadonlyMap<string, Profile>;
  readonly saving: boolean;
  readonly failure: PlaySaveFailure | null;
  /** Wraca do kartki (kartka wraca na wierzch notesu). */
  readonly onCancel: () => void;
  readonly onConfirm: (summary: PlaySummary) => void;
  readonly manual?:
    | {
        readonly template: ScoringTemplate;
        readonly ranked: readonly RankedPlayer[];
        readonly play: PlaySeats;
      }
    | undefined;
}

/**
 * Podsumowanie oderwanej karteczki (PAD-5): godzina rozpoczęcia, zakończenia (oderwanie
 * karteczki) i czas trwania, miejsca, wyniki kategorii decydującej z oznaczeniem rekordu klubu
 * albo osobistego oraz punkty leaderboardu (podgląd z tej samej reguły co w bazie). „Zapisz partię” kończy partię,
 * „Wróć do kartki”, Esc i tło kładą kartkę z powrotem na notes.
 */
export function PlaySummaryDialog(props: PlaySummaryDialogProps) {
  const [resolved, setResolved] = createSignal<readonly RankedPlayer[] | null>(null);
  const summary = createMemo(() => {
    const original = props.summary;
    const ties = resolved();
    const manual = props.manual;
    return original && ties && manual ? playSummary(manual.play, original.sheet, ties) : original;
  });
  const groups = createMemo(() => {
    const manual = props.manual;
    return manual ? manualTieGroups(manual.template, manual.ranked) : [];
  });
  // Koniec partii: chwila oderwania karteczki (otwarcia podsumowania).
  const endedAt = new Date();
  const records = createRecordPreview(
    () => props.playId,
    () => {
      const current = summary();
      return current
        ? current.rows.map((row) => ({ profileId: row.profileId, value: row.value }))
        : null;
    },
  );
  let cancelButton: HTMLButtonElement | undefined;
  // Fokus na „Wróć do kartki” po otwarciu (`autofocus` nie działa na wstawionym węźle).
  onSettled(() => {
    cancelButton?.focus();
  });
  const cancel = () => {
    if (!props.saving) props.onCancel();
  };
  const onKeyDown = (event: KeyboardEvent) => {
    if (event.key !== 'Escape') return;
    // Esc zamyka tylko podsumowanie, nie notes pod nim (PopupHost pomija obsłużone Esc).
    event.preventDefault();
    cancel();
  };
  // Zespół: wszyscy członkowie miejsca w notesie.
  const nameOf = (seat: number) => {
    const names = (props.summary?.rows ?? [])
      .filter((r) => r.seat === seat + 1)
      .map((r) => {
        const person = props.profiles.get(r.profileId);
        return person ? fullName(person) : t.meetings.plays.unknownPlayer;
      });
    return names.length > 0 ? names.join(', ') : t.meetings.plays.unknownPlayer;
  };
  return (
    <div class="play-summary" onKeyDown={onKeyDown}>
      <Dialog
        title={text.title}
        icon="tear-off"
        description={<p>{format(text.description, { title: props.title })}</p>}
        onScrimClick={cancel}
        footer={
          <>
            <Button
              ref={(el: HTMLButtonElement) => (cancelButton = el)}
              variant="secondary"
              disabled={props.saving}
              onClick={cancel}
            >
              {text.cancel}
            </Button>
            <Button
              loading={props.saving}
              disabled={!summary()}
              onClick={() => {
                const current = summary();
                if (current) props.onConfirm(current);
              }}
            >
              {text.submit}
            </Button>
          </>
        }
      >
        <Show when={props.summary && props.manual}>
          <ManualTieControls
            groups={groups()}
            disabled={props.saving}
            nameOf={nameOf}
            onChange={(decisions) => {
              const manual = props.manual;
              if (manual) setResolved(resolveManualTies(manual.template, manual.ranked, decisions));
            }}
          />
        </Show>
        <PlayTimes
          startedAt={props.startedAt}
          endedAt={endedAt}
          timeZone={props.timeZone}
          labels={text}
        />
        <Show when={summary()} fallback={<Banner variant="warning">{text.invalidSheet}</Banner>}>
          {(current) => (
            <ol
              class="play-summary__list"
              aria-label={format(text.listLabel, { title: props.title })}
            >
              <For each={current().rows} keyed={(row) => `${row.seat}-${row.profileId}`}>
                {(row) => {
                  const person = () => props.profiles.get(row().profileId);
                  const note = () =>
                    [row().win ? text.win : null, row().tied ? text.shared : null]
                      .filter(Boolean)
                      .join(' · ');
                  const record = () => records().data?.get(row().profileId);
                  return (
                    <li class={['play-summary__row', { 'is-first': row().win }]}>
                      <span class="play-summary__place">
                        <span aria-hidden="true">{format(text.place, { n: row().place })}</span>
                        <span class="sr-only">{format(text.placeLabel, { n: row().place })}</span>
                      </span>
                      <Show when={person()}>
                        {(found) => <ProfileAvatar profile={found()} size={36} decorative />}
                      </Show>
                      <span class="play-summary__player">
                        <span class="play-summary__name">
                          {person()
                            ? fullName(person() as Profile)
                            : t.meetings.plays.unknownPlayer}
                        </span>
                        <Show when={note()}>
                          <span class="play-summary__note">{note()}</span>
                        </Show>
                        <Show when={record()}>{(kind) => <RecordBadge kind={kind()} />}</Show>
                      </span>
                      <span class="play-summary__score">
                        <Show
                          when={row().value !== null}
                          fallback={<span class="play-summary__empty">{text.noValue}</span>}
                        >
                          <span aria-hidden="true">{formatNumber(row().value ?? 0)}</span>
                          <span class="sr-only">{format(text.score, { n: row().value ?? 0 })}</span>
                        </Show>
                        <Show when={row().points !== null}>
                          <span class="play-summary__points">
                            <span aria-hidden="true">
                              {format(text.points, { n: row().points ?? 0 })}
                            </span>
                            <span class="sr-only">
                              {format(text.pointsLabel, { n: row().points ?? 0 })}
                            </span>
                          </span>
                        </Show>
                      </span>
                    </li>
                  );
                }}
              </For>
            </ol>
          )}
        </Show>
        <Show when={props.failure}>
          {(failure) => <Banner variant="error">{text.errors[failure()]}</Banner>}
        </Show>
      </Dialog>
    </div>
  );
}
