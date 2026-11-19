import type { ScorePadFile } from '@bg-club/score-pad';
import { useQuery } from '@tanstack/react-query';
import { useMemo, useState } from 'react';
import { useAuth } from '../auth/authContext';
import { FALLBACK_TIMEZONE } from '../club/timezones';
import { useClub } from '../hub/club';
import { format, t } from '../i18n';
import { formatMeetingDate } from '../meetings/datetime';
import { PlayResultRows, SheetThumbnail } from '../meetings/MeetingPlays';
import { usePopups } from '../popups/popupContext';
import { PopupModal } from '../popups/PopupModal';
import { QueryStatus } from '../popups/QueryStatus';
import { useAllProfiles } from '../profile/profiles';
import { ScorePadView } from '../score-pad/ScorePadView';
import { loadVersionTemplate, versionTemplateKey } from '../score-pad/scorepads';
import { Banner, Button, Icon } from '../ui';
import { useSavedSheet, useSheetImageUrl, type SavedSheet } from './sheets';
import './sheets.css';

const text = t.sheets;

/**
 * Zapisana karteczka partii: obraz
 * oderwanej karteczki w powiększeniu, wyniki graczy i link do spotkania. „Pokaż w 3D” rysuje
 * karteczkę od nowa z zapisanych wpisów i wersji szablonu z chwili rozpoczęcia partii, w notesie
 * tylko do odczytu. Edycja i usunięcie gry albo notesu niczego tu nie zmieniają.
 */
export function SheetPopup({
  id,
  isAdmin = false,
}: {
  readonly id: string;
  /** Admin może stąd usunąć partię (potwierdzenie `play/<uuid>/delete`). */
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
  const { open } = usePopups();
  const [view3d, setView3d] = useState(false);
  const date = formatMeetingDate(sheet.saved_at, timeZone);
  return (
    <div className="sheet-view">
      <div className="sheet-view__main">
        {view3d ? (
          <SheetPad sheet={sheet} />
        ) : (
          <SheetImage sheet={sheet} label={format(text.image, { title: sheet.game.title, date })} />
        )}
        <div className="sheet-view__toggle">
          <Button
            size="sm"
            variant="secondary"
            icon={view3d ? undefined : 'pad'}
            aria-pressed={view3d}
            onClick={() => setView3d((value) => !value)}
          >
            {view3d ? text.showImage : text.show3d}
          </Button>
          {view3d ? <p className="sheet-view__hint">{text.readOnly}</p> : null}
        </div>
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
        </p>
        <section className="meeting-view__section" aria-labelledby={`${sheet.id}-results`}>
          <h3 id={`${sheet.id}-results`} className="meeting-view__head">
            {text.results}
          </h3>
          <PlayResultRows
            play={sheet}
            profiles={profiles}
            label={format(text.resultsLabel, { title: sheet.game.title })}
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

/** Powiększony obraz karteczki; bez obrazu (przerwany upload) kartka zastępcza z wyjaśnieniem. */
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
        <p className="sheet-view__hint">{sheet.sheet ? text.noImage : text.noSheet}</p>
      </div>
    );
  }
  return (
    <div className="sheet-view__stage">
      <img className="sheet-view__img" src={url} alt={label} onError={() => setFailed(url)} />
    </div>
  );
}

/** Karteczka narysowana od nowa w notesie 3D tylko do odczytu. */
function SheetPad({ sheet }: { readonly sheet: SavedSheet }) {
  const { client } = useAuth();
  const template = useQuery({
    queryKey: versionTemplateKey(sheet.scorepad_version_id),
    staleTime: Infinity,
    // Zdjęcie szablonu ma kilka MB: po zamknięciu podglądu nie trzymamy go w pamięci.
    gcTime: 0,
    enabled: sheet.sheet !== null,
    queryFn: () =>
      loadVersionTemplate(
        client,
        sheet.scorepad_version_id,
        sheet.scorepad_name || sheet.game.title,
      ),
  });
  const config = useMemo<ScorePadFile | null>(
    () =>
      template.data && sheet.sheet
        ? {
            format: 'score-pad',
            version: 2,
            template: template.data,
            active: template.data.id,
            sheet: sheet.sheet,
          }
        : null,
    [template.data, sheet.sheet],
  );
  if (!sheet.sheet) {
    return (
      <div className="sheet-view__stage sheet-view__stage--empty">
        <p className="sheet-view__hint">{text.noSheet}</p>
      </div>
    );
  }
  if (template.isError) {
    return (
      <div className="sheet-view__stage sheet-view__stage--empty">
        <Banner variant="error">{text.padError}</Banner>
        <Button size="sm" variant="secondary" onClick={() => void template.refetch()}>
          {text.retry}
        </Button>
      </div>
    );
  }
  return config ? (
    <ScorePadView
      config={config}
      controls={false}
      help={false}
      tear={false}
      summary={false}
      readOnly
      className="sheet-view__pad"
    />
  ) : (
    <div className="sheet-view__stage sheet-view__stage--loading" aria-busy="true" />
  );
}
