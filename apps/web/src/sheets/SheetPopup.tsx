import { createSignal, Match, Show, Switch, useContext } from 'solid-js';
import { FALLBACK_TIMEZONE } from '../club/timezones';
import { createGameTitlesById } from '../games/gameData';
import { format, t } from '../i18n';
import { formatMeetingDate } from '../meetings/datetime';
import type { Profile } from '../profile/profileQueries';
import { createClub } from '../club/clubData';
import { PopupsContext } from '../popups/popupContext';
import { PlayResultRows, PlayTimes, SheetThumbnail } from '../meetings/MeetingParts';
import { createMeetingRecords } from '../meetings/meetingData';
import { PopupModal } from '../popups/PopupModal';
import { QueryBoundary } from '../popups/QueryStatus';
import { createAllProfiles } from '../profile/profiles';
import { Button, Icon } from '../ui';
import { createSavedSheet, createSheetImageUrl } from './sheetData';
import { SheetZoom } from './SheetZoom';
import type { SavedSheet } from './sheets';
import './sheets.css';

const text = t.sheets;

/**
 * Zapisana karteczka partii: obraz
 * oderwanej karteczki z powiększaniem (kółko, szczypanie, przyciski), czas partii (początek,
 * koniec, czas trwania), wyniki graczy z rekordami klubu i osobistymi ustanowionymi w tej partii
 * i link do spotkania. Edycja i usunięcie gry albo notesu niczego tu nie zmieniają.
 */
export function SheetPopup(props: {
  readonly id: string;
  /** Admin może stąd usunąć partię (potwierdzenie `play/<uuid>/delete`). */
  readonly isAdmin?: boolean | undefined;
}) {
  const sheet = createSavedSheet(() => props.id);
  const profiles = createAllProfiles();
  const club = createClub();
  // Okno (tytuł, „brak partii”) zależy od danych w cache bez czekania.
  const gone = () => sheet.current() === null;
  const ready = () => (profiles.current() ? (sheet.current() ?? undefined) : undefined);
  const timeZone = () => club.current()?.timezone ?? FALLBACK_TIMEZONE;

  // Jedno okno na wszystkie stany (wczytywanie, karteczka, brak partii): fokus z `PopupHost`
  // zostaje na oknie po wczytaniu danych.
  return (
    <PopupModal
      title={gone() ? text.goneTitle : (ready()?.game.title ?? text.loading)}
      width={gone() ? undefined : 880}
    >
      <Show when={!gone()} fallback={<p class="meeting-form__state">{text.gone}</p>}>
        <QueryBoundary>
          <Show when={sheet()}>
            {(shown) => (
              <SheetView
                sheet={shown()}
                profiles={profiles()}
                timeZone={timeZone()}
                isAdmin={props.isAdmin ?? false}
              />
            )}
          </Show>
        </QueryBoundary>
      </Show>
    </PopupModal>
  );
}

function SheetView(props: {
  readonly sheet: SavedSheet;
  readonly profiles: ReadonlyMap<string, Profile>;
  readonly timeZone: string;
  readonly isAdmin: boolean;
}) {
  const popups = useContext(PopupsContext);
  const records = createMeetingRecords(() => props.sheet.meeting.id);
  const expansions = createGameTitlesById(() => props.sheet.expansion_ids);
  const date = () => formatMeetingDate(props.sheet.saved_at, props.timeZone);
  const expansionTitles = () => {
    const titles = expansions.current();
    if (!titles || props.sheet.expansion_ids.length === 0) return undefined;
    return props.sheet.expansion_ids
      .map((id) => titles.get(id) ?? '')
      .filter((title) => title !== '')
      .sort((a, b) => a.localeCompare(b, 'pl'))
      .join(', ');
  };
  const resultsId = () => `${props.sheet.id}-results`;
  return (
    <div class="sheet-view">
      <div class="sheet-view__main">
        <SheetImage
          sheet={props.sheet}
          label={format(text.image, { title: props.sheet.game.title, date: date() })}
        />
      </div>
      <div class="sheet-view__side">
        <p class="sheet-view__meta">
          {format(text.played, { date: date() })}
          <Show when={props.sheet.scorepad_name}>
            <br />
            {format(text.scorepad, { name: props.sheet.scorepad_name })}
          </Show>
          <Show when={expansionTitles() !== undefined}>
            <br />
            {format(text.expansions, { titles: expansionTitles() ?? '' })}
          </Show>
        </p>
        <PlayTimes
          startedAt={props.sheet.started_at}
          endedAt={props.sheet.saved_at}
          timeZone={props.timeZone}
          labels={text}
        />
        <section class="meeting-view__section" aria-labelledby={resultsId()}>
          <h3 id={resultsId()} class="meeting-view__head">
            {text.results}
          </h3>
          <PlayResultRows
            play={props.sheet}
            profiles={props.profiles}
            label={format(text.resultsLabel, { title: props.sheet.game.title })}
            records={records.current()?.get(props.sheet.id)}
          />
        </section>
        <button
          type="button"
          class="sheet-view__meeting"
          aria-label={format(text.meetingLabel, { title: props.sheet.meeting.title })}
          onClick={() => popups.open({ kind: 'meeting', id: props.sheet.meeting.id })}
        >
          <span class="sheet-view__meeting-icon" aria-hidden="true">
            <Icon name="calendar" />
          </span>
          <span class="sheet-view__meeting-text">
            <span class="sheet-view__meeting-title">
              {props.sheet.meeting.title || text.meeting}
            </span>
            <span class="sheet-view__meeting-sub">
              {format(text.meetingSub, {
                date: formatMeetingDate(props.sheet.meeting.starts_at, props.timeZone).replace(
                  ' · ',
                  ', ',
                ),
              })}
            </span>
          </span>
          <Icon name="chevron-right" class="sheet-view__chevron" />
        </button>
        <Show when={props.isAdmin}>
          <Button
            size="sm"
            variant="secondary"
            icon="trash"
            class="sheet-view__delete"
            onClick={() => popups.open({ kind: 'delete-play', id: props.sheet.id })}
          >
            {t.meetings.plays.delete}
          </Button>
        </Show>
      </div>
    </div>
  );
}

/** Obraz karteczki z powiększaniem; bez obrazu (przerwany upload) kartka zastępcza z wyjaśnieniem. */
function SheetImage(props: { readonly sheet: SavedSheet; readonly label: string }) {
  const signed = createSheetImageUrl(() => props.sheet.sheet_image_path);
  const [failed, setFailed] = createSignal<string | undefined>(undefined);
  // Bez adresu (np. plik usunięty, błąd Storage) karteczka zastępcza zamiast wczytywania.
  const loading = () =>
    !!props.sheet.sheet_image_path && signed.current() === undefined && !signed.state()?.isError;
  const url = () => {
    const value = signed.current();
    return value && value !== failed() ? value : undefined;
  };
  return (
    <Switch>
      <Match when={loading()}>
        <div class="sheet-view__stage sheet-view__stage--loading" aria-busy="true" />
      </Match>
      <Match when={url()} keyed>
        {(src) => <SheetZoom src={src} alt={props.label} onError={() => setFailed(src)} />}
      </Match>
      <Match when={true}>
        <div class="sheet-view__stage sheet-view__stage--empty">
          <SheetThumbnail gameId={props.sheet.game.id} class="sheet-view__placeholder" />
          <p class="sheet-view__hint">{text.noImage}</p>
        </div>
      </Match>
    </Switch>
  );
}
