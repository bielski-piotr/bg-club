import { useState } from 'react';
import { useAuth } from '../auth/authContext';
import { FALLBACK_TIMEZONE } from '../club/timezones';
import { useClub } from '../hub/club';
import { format, plural, t } from '../i18n';
import { formatMeetingDate } from '../meetings/datetime';
import { SheetThumbnail } from '../meetings/MeetingPlays';
import { usePopups } from '../popups/popupContext';
import { PopupModal } from '../popups/PopupModal';
import { QueryStatus } from '../popups/QueryStatus';
import { useGameSheets, type GallerySheet } from '../sheets/sheets';
import { EmptyState } from '../ui';
import { GameCover } from './GameCover';
import { useGame } from './games';
import { playersLabel } from './labels';
import '../sheets/sheets.css';

const text = t.games.details;

/**
 * Szczegóły gry (GAME-10, DS „Kolekcja / Szczegóły gry”): okładka, dane gry i galeria
 * wszystkich oderwanych karteczek tej gry od najnowszej. Kliknięcie karteczki otwiera ją
 * w powiększeniu z wynikami i linkiem do spotkania (`sheet/<uuid>`). Statystyki gry dochodzą
 * w zadaniu [035].
 */
export function GameDetailsPopup({ id }: { readonly id: string; readonly isAdmin: boolean }) {
  const { client } = useAuth();
  const game = useGame(client, id);
  const sheets = useGameSheets(client, id);
  const club = useClub(client);
  const timeZone = club.data?.timezone ?? FALLBACK_TIMEZONE;

  if (game.isSuccess && game.data === null) {
    return (
      <PopupModal title={text.notFoundTitle}>
        <p className="meeting-form__state">{text.notFoundBody}</p>
      </PopupModal>
    );
  }
  if (!game.data) {
    return (
      <PopupModal title={t.games.collection.title} width={880}>
        <QueryStatus isError={game.isError} onRetry={() => void game.refetch()} />
      </PopupModal>
    );
  }
  const data = game.data;
  const headingId = `${data.id}-sheets`;
  return (
    <PopupModal title={data.title} width={880}>
      <div className="game-details">
        <div className="game-details__head">
          <GameCover
            id={data.id}
            title={data.title}
            coverPath={data.cover_path}
            size="large"
            className="game-details__cover"
          />
          <div className="game-details__facts">
            <p className="game-details__fact">{playersLabel(data)}</p>
            <p className="game-details__fact game-details__fact--muted">
              {data.last_played_at
                ? format(text.lastPlayed, {
                    date: formatMeetingDate(data.last_played_at, timeZone),
                  })
                : text.neverPlayed}
            </p>
          </div>
        </div>
        <section className="meeting-view__section" aria-labelledby={headingId}>
          <div className="meeting-view__head-row">
            <h3 id={headingId} className="meeting-view__head">
              {text.gallery}
            </h3>
            {sheets.data ? (
              <span className="meeting-view__note">{plural(sheets.data.length, text.count)}</span>
            ) : null}
          </div>
          {!sheets.data ? (
            <QueryStatus isError={sheets.isError} onRetry={() => void sheets.refetch()} />
          ) : sheets.data.length === 0 ? (
            <EmptyState icon="pad" title={text.galleryEmptyTitle} helper={text.galleryEmpty} />
          ) : (
            <ul
              className="sheet-gallery"
              aria-label={format(text.galleryLabel, { title: data.title })}
            >
              {sheets.data.map((sheet) => (
                <li key={sheet.id}>
                  <GalleryItem sheet={sheet} gameId={data.id} timeZone={timeZone} />
                </li>
              ))}
            </ul>
          )}
        </section>
      </div>
    </PopupModal>
  );
}

function GalleryItem({
  sheet,
  gameId,
  timeZone,
}: {
  readonly sheet: GallerySheet;
  readonly gameId: string;
  readonly timeZone: string;
}) {
  const { open } = usePopups();
  const [failed, setFailed] = useState(false);
  const date = formatMeetingDate(sheet.saved_at, timeZone);
  return (
    <button
      type="button"
      className="sheet-gallery__item"
      aria-label={format(text.sheet, { date })}
      onClick={() => open({ kind: 'sheet', id: sheet.id })}
    >
      <span className="sheet-gallery__frame" aria-hidden="true">
        {sheet.image_url && !failed ? (
          <img
            className="sheet-gallery__img"
            src={sheet.image_url}
            alt=""
            loading="lazy"
            onError={() => setFailed(true)}
          />
        ) : (
          <SheetThumbnail gameId={gameId} className="sheet-gallery__placeholder" />
        )}
      </span>
      <span className="sheet-gallery__caption" aria-hidden="true">
        {sheet.meeting_title
          ? format(text.sheetMeeting, {
              date: date.split(' · ')[0] ?? date,
              meeting: sheet.meeting_title,
            })
          : date}
      </span>
    </button>
  );
}
