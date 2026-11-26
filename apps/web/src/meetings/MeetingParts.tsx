/** @jsxImportSource @solidjs/web */
import { createMemo, createSignal, For, Show } from 'solid-js';
import { format, t } from '../i18n';
import { dateTile, durationLabel, localDateTime } from './datetime';
import type { Meeting } from './meetings';
import { sortedResults, type MeetingPlay } from './plays';
import type { PlayRecords, RecordKind } from './records';
import { fullName, type Profile } from '../profile/profileQueries';
import { createSheetImageUrl } from '../sheets/sheetData';
import { paletteColor, paletteIndex } from '../ui/avatarUtils';
import { ProfileAvatar } from '../solid/profile/ProfileAvatar';
import { ProfileLink } from '../solid/profile/ProfileLink';
import { Badge, Icon, StatusChip } from '../solid/ui';
import type { ClassValue } from '../solid/ui/dom';
import '../sheets/sheets.css';

/*
 * Wspólne elementy spotkań (DS §15.1, §15 „Play card”): mini kafelek daty, chip statusu,
 * zwycięzcy, miniatura karteczki, wyniki partii, rekordy i czasy partii. Używają ich też
 * kolekcja i karteczki.
 */

const text = t.meetings.plays;

/**
 * Miniatura oderwanej karteczki (DS §15 „Score-sheet thumbnail”): obraz karteczki z pismem
 * (PAD-6), a bez obrazu (np. przerwany upload) albo przed jego wczytaniem kartka w kolorze gry.
 */
export function SheetThumbnail(props: {
  readonly gameId: string;
  readonly imagePath?: string | null | undefined;
  /** Gotowy podpisany adres (galeria podpisuje wszystkie obrazy jednym żądaniem). */
  readonly imageUrl?: string | null | undefined;
  readonly small?: boolean | undefined;
  readonly class?: ClassValue;
}) {
  const signed = createSheetImageUrl(() =>
    props.imageUrl === undefined ? (props.imagePath ?? null) : null,
  );
  const [failed, setFailed] = createSignal<string | undefined>(undefined);
  const url = () => {
    const value = props.imageUrl === undefined ? signed().data : (props.imageUrl ?? undefined);
    return value !== undefined && value !== failed() ? value : undefined;
  };
  return (
    <span
      class={[
        'play-sheet',
        { 'play-sheet--small': !!props.small, 'play-sheet--image': !!url() },
        props.class,
      ]}
      aria-hidden="true"
    >
      <Show
        when={url()}
        fallback={
          <>
            <span
              class="play-sheet__band"
              style={{ background: paletteColor(paletteIndex(props.gameId)) }}
            />
            <span class="play-sheet__line" />
            <span class="play-sheet__line" />
            <span class="play-sheet__line" />
            <span class="play-sheet__line" />
          </>
        }
      >
        {(src) => (
          <img
            class="play-sheet__img"
            src={src()}
            alt=""
            loading="lazy"
            onError={() => setFailed(src())}
          />
        )}
      </Show>
    </span>
  );
}

/** Oznaczenie rekordu przy wyniku gracza: rekord klubu (akcent) albo osobisty. */
export function RecordBadge(props: { readonly kind: RecordKind }) {
  return (
    <Badge tone={props.kind === 'club' ? 'accent' : 'success'} class="record-badge">
      <Icon name="trophy" size={12} />
      {props.kind === 'club' ? text.clubRecord : text.personalRecord}
    </Badge>
  );
}

/** Wiersze wyników partii (DS §15 „Play card”): miejsce, awatar, imię, wynik i punkty. */
export function PlayResultRows(props: {
  readonly play: Pick<MeetingPlay, 'results'>;
  readonly profiles: ReadonlyMap<string, Profile>;
  readonly label: string;
  /** Rekordy ustanowione w partii (gracz → rodzaj) do oznaczenia przy wyniku. */
  readonly records?: PlayRecords | undefined;
}) {
  return (
    <ol class="play-results" aria-label={props.label}>
      <For each={sortedResults(props.play)} keyed={(result) => result.profile_id}>
        {(result) => {
          const person = () => props.profiles.get(result().profile_id);
          const record = () => props.records?.get(result().profile_id);
          return (
            <li class={['play-result', { 'play-result--first': result().place === 1 }]}>
              <span class="play-result__place">
                <span aria-hidden="true">
                  {result().place !== null ? format(text.place, { n: result().place ?? 0 }) : ''}
                </span>
                <Show when={result().place}>
                  {(place) => (
                    <span class="sr-only">{format(text.placeLabel, { n: place() })}</span>
                  )}
                </Show>
              </span>
              <Show when={person()}>
                {(shown) => (
                  <ProfileLink id={shown().id} name={fullName(shown())}>
                    <ProfileAvatar profile={shown()} size={24} decorative />
                  </ProfileLink>
                )}
              </Show>
              <span class="play-result__name">
                {person() ? fullName(person() as Profile) : text.unknownPlayer}
              </span>
              <Show when={record()}>{(kind) => <RecordBadge kind={kind()} />}</Show>
              <span class="play-result__score">
                <span aria-hidden="true">{result().ranking_value ?? ''}</span>
                <Show when={result().ranking_value !== null}>
                  <span class="sr-only">
                    {format(text.score, { n: result().ranking_value ?? 0 })}
                  </span>
                </Show>
              </span>
              <span
                class={[
                  'play-result__points',
                  { 'play-result__points--zero': result().points === 0 },
                ]}
              >
                <span aria-hidden="true">
                  {result().points !== null ? format(text.points, { n: result().points ?? 0 }) : ''}
                </span>
                <Show when={result().points !== null}>
                  <span class="sr-only">
                    {format(text.pointsLabel, { n: result().points ?? 0 })}
                  </span>
                </Show>
              </span>
            </li>
          );
        }}
      </For>
    </ol>
  );
}

/** Początek, koniec i czas trwania partii (podsumowanie przed zapisem i zapisana karteczka). */
export function PlayTimes(props: {
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
  return (
    <dl class="play-times" aria-label={props.labels.timesLabel}>
      <div class="play-times__item">
        <dt>{props.labels.started}</dt>
        <dd>{localDateTime(props.startedAt, props.timeZone).time}</dd>
      </div>
      <div class="play-times__item">
        <dt>{props.labels.ended}</dt>
        <dd>{localDateTime(props.endedAt, props.timeZone).time}</dd>
      </div>
      <div class="play-times__item">
        <dt>{props.labels.duration}</dt>
        <dd>
          {durationLabel(props.startedAt, props.endedAt, {
            hours: text.durationHours,
            minutes: text.durationMinutes,
          })}
        </dd>
      </div>
    </dl>
  );
}

/** Mini kafelek daty 44×48: nadchodzące akcentowe, zakończone szare. */
export function MiniDateTile(props: { readonly meeting: Meeting; readonly timeZone: string }) {
  const tile = createMemo(() => dateTile(props.meeting.starts_at, props.timeZone));
  return (
    <span
      class={
        props.meeting.status === 'finished'
          ? 'mini-tile mini-tile--past'
          : 'mini-tile mini-tile--upcoming'
      }
      aria-hidden="true"
    >
      <span class="mini-tile__month">{tile().month}</span>
      <span class="mini-tile__day">{tile().day}</span>
    </span>
  );
}

/**
 * Chip stanu spotkania (DS §11, §15.1 „Agenda row”): głosowanie otwarte, gry wybrane,
 * w trakcie albo zakończone. `short`: „Trwa” zamiast „W trakcie” (widżet Spotkanie, DS §15).
 */
export function MeetingStatusChip(props: {
  readonly meeting: Meeting;
  readonly short?: boolean | undefined;
}) {
  const status = t.meetings.status;
  const chip = createMemo((): { tone: 'neutral' | 'success' | 'accent'; label: string } => {
    const meeting = props.meeting;
    if (meeting.status === 'finished') return { tone: 'neutral', label: status.finished };
    if (meeting.status === 'in_progress') {
      return { tone: 'success', label: props.short ? status.inProgress : status.inProgressLong };
    }
    return meeting.voting_open
      ? { tone: 'accent', label: status.votingOpen }
      : { tone: 'neutral', label: status.gamesChosen };
  });
  return <StatusChip tone={chip().tone}>{chip().label}</StatusChip>;
}

/**
 * Zwycięzcy (DS §15.1 „Timeline row”): puchar, stos awatarów 20/6 i imiona. Bez czasownika,
 * więc tekst nie zależy od rodzaju gramatycznego. Nieznane profile są pomijane.
 */
export function WinnersLine(props: {
  readonly winners: readonly string[];
  readonly profiles: ReadonlyMap<string, Profile> | undefined;
  readonly class?: string | undefined;
}) {
  const people = createMemo(() =>
    props.winners
      .map((id) => props.profiles?.get(id))
      .filter((profile): profile is Profile => profile !== undefined),
  );
  return (
    <Show when={people().length > 0}>
      <span class={props.class ? `winners ${props.class}` : 'winners'}>
        <Icon name="trophy" size={14} class="winners__icon" />
        <span class="winners__stack" aria-hidden="true">
          <For each={people().slice(0, 4)} keyed={(person) => person.id}>
            {(person) => <ProfileAvatar profile={person()} size={20} ring="white" decorative />}
          </For>
        </span>
        <span class="winners__names">
          <span class="sr-only">{t.hub.timeline.winners} </span>
          {people()
            .map((person) => person.first_name)
            .join(', ')}
        </span>
      </span>
    </Show>
  );
}
