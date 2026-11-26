/** @jsxImportSource @solidjs/web */
import { createSignal, For, Show } from 'solid-js';
import { format, t } from '../../i18n';
import { durationLabel, localDateTime } from '../../meetings/datetime';
import { sortedResults, type MeetingPlay } from '../../meetings/plays';
import type { PlayRecords, RecordKind } from '../../meetings/records';
import { fullName, type Profile } from '../../profile/profileQueries';
import { createSheetImageUrl } from '../../sheets/sheetData';
import { paletteColor, paletteIndex } from '../../ui/avatarUtils';
import { ProfileAvatar } from '../profile/ProfileAvatar';
import { ProfileLink } from '../profile/ProfileLink';
import { Badge, Icon } from '../ui';
import type { ClassValue } from '../ui/dom';
import '../../sheets/sheets.css';

/*
 * Wersje Solid elementów spotkań, których używają obszary już w Solid (kolekcja, karteczka),
 * dopóki spotkania są w React (etap 6, docs/solidjs-2-migration.md). Ten sam DOM co
 * `meetings/MeetingParts.tsx` i `meetings/MeetingPlays.tsx`.
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
