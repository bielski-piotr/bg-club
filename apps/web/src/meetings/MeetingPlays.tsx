import { createMemo, For, Match, Show, Switch, useContext } from 'solid-js';
import { createGameTitlesById } from '../games/gameData';
import { GameCover } from '../games/GameCover';
import { format, t } from '../i18n';
import { avatarPerson, type Profile } from '../profile/profileQueries';
import { PopupsContext } from '../popups/popupContext';
import { QueryStatus } from '../popups/QueryStatus';
import { createAllProfiles } from '../profile/profiles';
import { AvatarStack, Button, Icon } from '../ui';
import '../sheets/sheets.css';
import { localDateTime } from './datetime';
import { createMeetingPlays, createMeetingRecords } from './meetingData';
import { SheetThumbnail } from './MeetingParts';
import type { Meeting } from './meetings';
import { topRecord, type PlayRecords } from './records';
import { playsProgressLabel, sortedResults, splitPlays, type MeetingPlay } from './plays';

const text = t.meetings.plays;

/**
 * Partie trwającego i zakończonego spotkania (VIEW-3): najpierw partie w toku (DS §15 „Live play
 * card”), potem zapisane w kolejności rozegrania jako same karteczki z notesu (PAD-6), jak
 * galeria gry. Kliknięcie otwiera karteczkę w powiększeniu z wynikami, czasem partii
 * i rekordami (`sheet/<uuid>`; tam admin usuwa partię, VIEW-6). Karteczka z rekordem klubu
 * albo osobistym ma znacznik. `runner` (admin albo prowadzący) dostaje przy partiach w toku
 * „Wróć do notesu” i „Porzuć” (PAD-4, PAD-8); pozostali widzą tylko, że partia trwa (PAD-9).
 * Wyniki i zmiany w rankingu są w podsumowaniu spotkania. Miniatura karteczki i wiersze wyników
 * są w `MeetingParts`.
 */
export function MeetingPlaysSection(props: {
  readonly meeting: Meeting;
  readonly timeZone: string;
  readonly runner?: boolean | undefined;
}) {
  const popups = useContext(PopupsContext);
  const plays = createMeetingPlays(() => props.meeting.id);
  const profiles = createAllProfiles();
  const split = createMemo(() => {
    const list = plays().data;
    return list ? splitPlays(list) : undefined;
  });
  const records = createMeetingRecords(
    () => props.meeting.id,
    () => (split()?.saved.length ?? 0) > 0,
  );
  // Dodatki partii (także usunięte później z kolekcji) po tytułach.
  const expansionTitles = createGameTitlesById(() =>
    (plays().data ?? []).flatMap((play) => play.expansion_ids ?? []),
  );
  const expansionsOf = (play: MeetingPlay) => {
    const ids = play.expansion_ids ?? [];
    if (ids.length === 0) return undefined;
    const names = ids
      .map((id) => expansionTitles().data?.get(id))
      .filter((name): name is string => name !== undefined)
      .sort((a, b) => a.localeCompare(b, 'pl'));
    return names.length > 0 ? format(text.withExpansions, { titles: names.join(', ') }) : undefined;
  };
  const headingId = () => `${props.meeting.id}-plays`;
  const drafts = () => split()?.drafts ?? [];
  const saved = () => split()?.saved ?? [];
  return (
    <section class="meeting-view__section" aria-labelledby={headingId()}>
      <div class="meeting-view__head-row">
        <h3 id={headingId()} class="meeting-view__head">
          {t.meetings.view.plays}
        </h3>
        <Show when={split()}>
          {(current) => (
            <span class="meeting-view__note">
              {playsProgressLabel(current().saved.length, current().drafts.length)}
            </span>
          )}
        </Show>
      </div>
      <Switch>
        <Match when={!split() || !profiles().data}>
          <QueryStatus
            isError={plays().isError || profiles().isError}
            onRetry={() => {
              if (plays().isError) void plays().refetch();
              if (profiles().isError) void profiles().refetch();
            }}
          />
        </Match>
        <Match when={saved().length === 0 && drafts().length === 0}>
          <p class="meeting-form__state">
            {props.meeting.status === 'in_progress'
              ? text.emptyInProgress
              : t.meetings.view.noPlays}
          </p>
        </Match>
        <Match when={profiles().data}>
          {(people) => (
            <>
              <Show when={drafts().length > 0}>
                <ul class="play-list" aria-label={text.liveLabel}>
                  <For each={drafts()} keyed={(play) => play.id}>
                    {(play) => (
                      <li>
                        <LivePlayCard
                          play={play()}
                          expansions={expansionsOf(play())}
                          timeZone={props.timeZone}
                          profiles={people()}
                          canRun={!!props.runner && props.meeting.status === 'in_progress'}
                        />
                      </li>
                    )}
                  </For>
                </ul>
              </Show>
              <Show when={saved().length > 0}>
                <ol class="sheet-gallery meeting-sheets" aria-label={text.savedLabel}>
                  <For each={saved()} keyed={(play) => play.id}>
                    {(play, index) => (
                      <li>
                        <PlaySheet
                          play={play()}
                          expansions={expansionsOf(play())}
                          index={index()}
                          timeZone={props.timeZone}
                          records={records().data?.get(play().id)}
                          onOpen={() => popups.open({ kind: 'sheet', id: play().id })}
                        />
                      </li>
                    )}
                  </For>
                </ol>
              </Show>
            </>
          )}
        </Match>
      </Switch>
    </section>
  );
}

/** Zapisana partia jako karteczka z notesu: gra, numer i godzina zapisu, znacznik rekordu. */
function PlaySheet(props: {
  readonly play: MeetingPlay;
  /** „z dodatkami: …” albo brak (partia bez dodatków). */
  readonly expansions?: string | undefined;
  readonly index: number;
  readonly timeZone: string;
  readonly records: PlayRecords | undefined;
  readonly onOpen: () => void;
}) {
  const time = () =>
    localDateTime(props.play.saved_at ?? props.play.started_at, props.timeZone).time;
  const record = () => topRecord(props.records);
  return (
    <button
      type="button"
      class="sheet-gallery__item"
      aria-label={
        format(text.sheetLabel, {
          n: props.index + 1,
          title: props.play.game.title,
          time: time(),
        }) +
        (props.expansions ? ` ${props.expansions}` : '') +
        (record()
          ? `. ${record() === 'club' ? text.clubRecordLabel : text.personalRecordLabel}`
          : '')
      }
      onClick={() => props.onOpen()}
    >
      <span class="sheet-gallery__frame" aria-hidden="true">
        <SheetThumbnail
          gameId={props.play.game.id}
          imagePath={props.play.sheet_image_path}
          class="sheet-gallery__sheet"
        />
        <Show when={record()}>
          {(kind) => (
            <span class={['meeting-sheets__record', `meeting-sheets__record--${kind()}`]}>
              <Icon name="trophy" size={14} />
            </span>
          )}
        </Show>
      </span>
      <span class="sheet-gallery__caption meeting-sheets__caption" aria-hidden="true">
        <span class="meeting-sheets__title">{props.play.game.title}</span>
        <Show when={props.expansions}>
          <span class="meeting-sheets__expansions">{props.expansions}</span>
        </Show>
        <span>{format(text.sheetCaption, { n: props.index + 1, time: time() })}</span>
      </span>
    </button>
  );
}

/**
 * Partia w toku (DS §15 „Live play card”): gra, od kiedy trwa i gracze. Admin i prowadzący
 * wracają do notesu (także na innym urządzeniu, PAD-4) albo porzucają partię (PAD-8).
 */
function LivePlayCard(props: {
  readonly play: MeetingPlay;
  readonly expansions?: string | undefined;
  readonly timeZone: string;
  readonly profiles: ReadonlyMap<string, Profile>;
  readonly canRun: boolean;
}) {
  const popups = useContext(PopupsContext);
  const live = t.meetings.play;
  const players = createMemo(() =>
    sortedResults(props.play).flatMap((result) => {
      const person = props.profiles.get(result.profile_id);
      return person ? [avatarPerson(person)] : [];
    }),
  );
  return (
    <article class="play-card play-card--live" aria-label={props.play.game.title}>
      <div class="play-card__head">
        <GameCover
          id={props.play.game.id}
          title={props.play.game.title}
          coverPath={props.play.game.cover_path}
          size="thumb"
          class="play-card__cover"
        />
        <span class="play-card__text">
          <span class="play-card__title">{props.play.game.title}</span>
          <Show when={props.expansions}>
            <span class="play-card__expansions">{props.expansions}</span>
          </Show>
          <span class="play-card__live">
            {format(text.liveSince, {
              time: localDateTime(props.play.started_at, props.timeZone).time,
            })}
          </span>
        </span>
        <Show when={players().length > 0}>
          <AvatarStack people={players()} size={28} max={4} showOverflow />
        </Show>
      </div>
      <Show when={props.canRun}>
        <div class="play-card__actions">
          <Button
            size="sm"
            icon="pad"
            class="play-card__resume"
            aria-label={format(live.backToPadLabel, { title: props.play.game.title })}
            onClick={() => popups.open({ kind: 'play', id: props.play.id })}
          >
            {live.backToPad}
          </Button>
          <Button
            size="sm"
            variant="secondary"
            class="play-card__discard"
            aria-label={format(live.discardLabel, { title: props.play.game.title })}
            onClick={() => popups.open({ kind: 'discard-play', id: props.play.id })}
          >
            {live.discard}
          </Button>
        </div>
      </Show>
    </article>
  );
}
