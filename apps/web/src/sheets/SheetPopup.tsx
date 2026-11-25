import { useState } from 'react';
import { useAuth } from '../auth/authContext';
import { FALLBACK_TIMEZONE } from '../club/timezones';
import { useGameTitles } from '../games/games';
import { useClub } from '../hub/club';
import { format, t } from '../i18n';
import { formatMeetingDate } from '../meetings/datetime';
import { PlayTimes } from '../meetings/MeetingParts';
import { PlayResultRows, SheetThumbnail } from '../meetings/MeetingPlays';
import { useMeetingRecords } from '../meetings/records';
import { usePopups } from '../popups/popupContext';
import { PopupModal } from '../popups/PopupModal';
import { QueryStatus } from '../popups/QueryStatus';
import { useAllProfiles } from '../react-shared/profiles';
import { Button, Icon } from '../ui';
import { SheetZoom } from './SheetZoom';
import { useSavedSheet, useSheetImageUrl, type SavedSheet } from './sheets';
import './sheets.css';

const text = t.sheets;

/**
 * Zapisana karteczka partii (PAD-6, GAME-10, VIEW-3, DS „Kolekcja / Karteczka”): obraz
 * oderwanej karteczki z powiększaniem (kółko, szczypanie, przyciski), czas partii (początek,
 * koniec, czas trwania), wyniki graczy z rekordami klubu i osobistymi ustanowionymi w tej partii
 * i link do spotkania. Edycja i usunięcie gry albo notesu niczego tu nie zmieniają (GAME-9).
 */
export function SheetPopup({
  id,
  isAdmin = false,
}: {
  readonly id: string;
  /** Admin może stąd usunąć partię (VIEW-6, potwierdzenie `play/<uuid>/delete`). */
  readonly isAdmin?: boolean | undefined;
}) {
  const { client } = useAuth();
  const sheet = useSavedSheet(client, id);
  const profiles = useAllProfiles(client);
  const club = useClub(client);

  if (sheet.isSuccess && sheet.data === null) {
    return (
      <PopupModal title={text.goneTitle}>
        <p className="meeting-form__state">{text.gone}</p>
      </PopupModal>
    );
  }
  if (!sheet.data || !profiles.data) {
    return (
      <PopupModal title={text.loading} width={880}>
        <QueryStatus
          isError={sheet.isError || profiles.isError}
          onRetry={() => {
            if (sheet.isError) void sheet.refetch();
            if (profiles.isError) void profiles.refetch();
          }}
        />
      </PopupModal>
    );
  }
  const data = sheet.data;
  const timeZone = club.data?.timezone ?? FALLBACK_TIMEZONE;
  return (
    <PopupModal title={data.game.title} width={880}>
      <SheetView sheet={data} profiles={profiles.data} timeZone={timeZone} isAdmin={isAdmin} />
    </PopupModal>
  );
}

function SheetView({
  sheet,
  profiles,
  timeZone,
  isAdmin,
}: {
  readonly sheet: SavedSheet;
  readonly profiles: Parameters<typeof PlayResultRows>[0]['profiles'];
  readonly timeZone: string;
  readonly isAdmin: boolean;
}) {
  const { client } = useAuth();
  const { open } = usePopups();
  const records = useMeetingRecords(client, sheet.meeting.id).data?.get(sheet.id);
  const expansions = useGameTitles(client, sheet.expansion_ids);
  const date = formatMeetingDate(sheet.saved_at, timeZone);
  return (
    <div className="sheet-view">
      <div className="sheet-view__main">
        <SheetImage sheet={sheet} label={format(text.image, { title: sheet.game.title, date })} />
      </div>
      <div className="sheet-view__side">
        <p className="sheet-view__meta">
          {format(text.played, { date })}
          {sheet.scorepad_name ? (
            <>
              <br />
              {format(text.scorepad, { name: sheet.scorepad_name })}
            </>
          ) : null}
          {expansions.data && sheet.expansion_ids.length > 0 ? (
            <>
              <br />
              {format(text.expansions, {
                titles: sheet.expansion_ids
                  .map((id) => expansions.data.get(id) ?? '')
                  .filter((title) => title !== '')
                  .sort((a, b) => a.localeCompare(b, 'pl'))
                  .join(', '),
              })}
            </>
          ) : null}
        </p>
        <PlayTimes
          startedAt={sheet.started_at}
          endedAt={sheet.saved_at}
          timeZone={timeZone}
          labels={text}
        />
        <section className="meeting-view__section" aria-labelledby={`${sheet.id}-results`}>
          <h3 id={`${sheet.id}-results`} className="meeting-view__head">
            {text.results}
          </h3>
          <PlayResultRows
            play={sheet}
            profiles={profiles}
            label={format(text.resultsLabel, { title: sheet.game.title })}
            records={records}
          />
        </section>
        <button
          type="button"
          className="sheet-view__meeting"
          aria-label={format(text.meetingLabel, { title: sheet.meeting.title })}
          onClick={() => open({ kind: 'meeting', id: sheet.meeting.id })}
        >
          <span className="sheet-view__meeting-icon" aria-hidden="true">
            <Icon name="calendar" />
          </span>
          <span className="sheet-view__meeting-text">
            <span className="sheet-view__meeting-title">{sheet.meeting.title || text.meeting}</span>
            <span className="sheet-view__meeting-sub">
              {format(text.meetingSub, {
                date: formatMeetingDate(sheet.meeting.starts_at, timeZone).replace(' · ', ', '),
              })}
            </span>
          </span>
          <Icon name="chevron-right" className="sheet-view__chevron" />
        </button>
        {isAdmin ? (
          <Button
            size="sm"
            variant="secondary"
            icon="trash"
            className="sheet-view__delete"
            onClick={() => open({ kind: 'delete-play', id: sheet.id })}
          >
            {t.meetings.plays.delete}
          </Button>
        ) : null}
      </div>
    </div>
  );
}

/** Obraz karteczki z powiększaniem; bez obrazu (przerwany upload) kartka zastępcza z wyjaśnieniem. */
function SheetImage({ sheet, label }: { readonly sheet: SavedSheet; readonly label: string }) {
  const signed = useSheetImageUrl(sheet.sheet_image_path);
  const url = signed.data;
  const [failed, setFailed] = useState<string | undefined>(undefined);
  // Bez adresu (np. plik usunięty, błąd Storage) karteczka zastępcza zamiast wczytywania.
  if (sheet.sheet_image_path && url === undefined && !signed.isError) {
    return <div className="sheet-view__stage sheet-view__stage--loading" aria-busy="true" />;
  }
  if (!url || url === failed) {
    return (
      <div className="sheet-view__stage sheet-view__stage--empty">
        <SheetThumbnail gameId={sheet.game.id} className="sheet-view__placeholder" />
        <p className="sheet-view__hint">{text.noImage}</p>
      </div>
    );
  }
  return <SheetZoom key={url} src={url} alt={label} onError={() => setFailed(url)} />;
}
