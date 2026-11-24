import { useAuth } from '../auth/authContext';
import { FALLBACK_TIMEZONE } from '../club/timezones';
import { useClub } from '../hub/club';
import { format, plural, t } from '../i18n';
import { formatMeetingDate } from '../meetings/datetime';
import { SheetThumbnail } from '../meetings/MeetingPlays';
import { usePopups } from '../popups/popupContext';
import { PopupLink } from '../popups/PopupLink';
import type { PopupRoute } from '../popups/routes';
import { PopupModal } from '../popups/PopupModal';
import { QueryStatus } from '../popups/QueryStatus';
import { useGameSheets, type GallerySheet } from '../sheets/sheets';
import { Button, EmptyState, Icon, ListRow, Menu, Tray } from '../ui';
import { GameCover } from './GameCover';
import { GameStatsSection } from './GameStats';
import { useExpansions, useGame, type Game } from './games';
import { useGameVoteTotal } from './gameVoteTotal';
import { playersLabel } from './labels';
import '../sheets/sheets.css';

const text = t.games.details;

/**
 * Szczegóły gry (GAME-10, DS „Kolekcja / Szczegóły gry”): okładka, dane gry i galeria
 * wszystkich oderwanych karteczek tej gry od najnowszej. Kliknięcie karteczki otwiera ją
 * w powiększeniu z wynikami i linkiem do spotkania (`sheet/<uuid>`). Statystyki gry (GAME-11)
 * są między danymi gry a galerią.
 */
export function GameDetailsPopup({
  id,
  isAdmin = false,
}: {
  readonly id: string;
  readonly isAdmin?: boolean;
}) {
  const { client } = useAuth();
  const game = useGame(client, id);
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
  if (game.data.base_game_id !== null) {
    return <ExpansionDetails expansion={game.data} isAdmin={isAdmin} timeZone={timeZone} />;
  }
  return <BaseGameDetails game={game.data} isAdmin={isAdmin} timeZone={timeZone} />;
}

/** Akcje administratora w nagłówku widoku gry albo dodatku. */
function GameActions({ game }: { readonly game: Game }) {
  const { open } = usePopups();
  const expansion = game.base_game_id !== null;
  const label = format(t.games.collection.actions, { title: game.title });
  const go = (route: PopupRoute) => () => open(route);
  return (
    <Menu
      label={label}
      align="end"
      items={[
        {
          id: 'edit',
          label: text.edit,
          icon: 'pencil',
          onSelect: go({ kind: 'edit-game', id: game.id }),
        },
        {
          id: 'scorepads',
          label: text.scorepads,
          icon: 'pad',
          onSelect: go({ kind: 'scorepads', gameId: game.id }),
        },
        ...(expansion
          ? []
          : [
              {
                id: 'add-expansion',
                label: text.addExpansion,
                icon: 'plus' as const,
                onSelect: go({ kind: 'add-expansion', baseId: game.id }),
              },
            ]),
        {
          id: 'delete',
          label: text.delete,
          icon: 'trash',
          destructive: true,
          onSelect: go({ kind: 'delete-game', id: game.id }),
        },
      ]}
      trigger={(props) => (
        <button
          type="button"
          {...props}
          className="icon-btn icon-btn--32"
          aria-label={label}
          title={label}
        >
          <Icon name="more" />
        </button>
      )}
    />
  );
}

function BaseGameDetails({
  game: data,
  isAdmin,
  timeZone,
}: {
  readonly game: Game;
  readonly isAdmin: boolean;
  readonly timeZone: string;
}) {
  const { client } = useAuth();
  const votes = useGameVoteTotal(client, data.id);
  const sheets = useGameSheets(client, data.id);
  const headingId = `${data.id}-sheets`;
  return (
    <PopupModal
      title={data.title}
      width={880}
      actions={isAdmin ? <GameActions game={data} /> : undefined}
    >
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
            {data.complexity !== null ? (
              <p className="game-details__fact">
                {format(text.complexity, { n: data.complexity })}
              </p>
            ) : null}
            <p className="game-details__fact game-details__fact--muted">
              {data.last_played_at
                ? format(text.lastPlayed, {
                    date: formatMeetingDate(data.last_played_at, timeZone),
                  })
                : text.neverPlayed}
            </p>
            {votes.isError || votes.data === undefined ? (
              <QueryStatus isError={votes.isError} onRetry={() => void votes.refetch()} />
            ) : votes.data !== null ? (
              <p className="game-details__fact" aria-live="polite">
                {format(text.voteTotal, { count: votes.data })}
              </p>
            ) : null}
          </div>
        </div>
        <ExpansionsSection game={data} isAdmin={isAdmin} />
        <GameStatsSection gameId={data.id} title={data.title} timeZone={timeZone} />
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

/**
 * Dodatki gry podstawowej: tylko tutaj (nie ma ich w kolekcji, filtrach ani głosowaniu).
 * Wiersz otwiera widok dodatku z liczbą partii, notesami i akcjami administratora.
 */
function ExpansionsSection({ game, isAdmin }: { readonly game: Game; readonly isAdmin: boolean }) {
  const { client } = useAuth();
  const { open } = usePopups();
  const expansions = useExpansions(client, game.id);
  const headingId = `${game.id}-expansions`;
  const list = expansions.data ?? [];
  if (expansions.isSuccess && list.length === 0 && !isAdmin) return null;
  return (
    <section className="meeting-view__section" aria-labelledby={headingId}>
      <div className="meeting-view__head-row">
        <h3 id={headingId} className="meeting-view__head">
          {text.expansions}
        </h3>
        {expansions.data ? (
          <span className="meeting-view__note">{plural(list.length, text.expansionCount)}</span>
        ) : null}
        {isAdmin ? (
          <Button
            size="sm"
            variant="secondary"
            icon="plus"
            onClick={() => open({ kind: 'add-expansion', baseId: game.id })}
          >
            {text.addExpansion}
          </Button>
        ) : null}
      </div>
      {!expansions.data ? (
        <QueryStatus isError={expansions.isError} onRetry={() => void expansions.refetch()} />
      ) : list.length === 0 ? (
        <p className="meeting-view__note">{text.expansionsEmpty}</p>
      ) : (
        <Tray
          label={format(text.expansionsLabel, { title: game.title })}
          className="expansion-list"
        >
          {list.map((expansion) => (
            <ListRow
              key={expansion.id}
              leading={
                <GameCover
                  id={expansion.id}
                  title={expansion.title}
                  coverPath={expansion.cover_path}
                  size="thumb"
                />
              }
              title={expansion.title}
              meta={`${playersLabel(expansion)} · ${plural(expansion.play_count ?? 0, text.count)}`}
              onClick={() => open({ kind: 'game', id: expansion.id })}
            />
          ))}
        </Tray>
      )}
    </section>
  );
}

/**
 * Widok dodatku: okładka, gra podstawowa, liczba graczy, skomplikowanie i liczba rozegranych
 * partii (dodatki nie mają własnych rankingów ani rekordów: wyniki trafiają do gry podstawowej).
 */
function ExpansionDetails({
  expansion,
  isAdmin,
  timeZone,
}: {
  readonly expansion: Game;
  readonly isAdmin: boolean;
  readonly timeZone: string;
}) {
  const { client } = useAuth();
  const base = useGame(client, expansion.base_game_id ?? '');
  return (
    <PopupModal
      title={expansion.title}
      width={880}
      actions={isAdmin ? <GameActions game={expansion} /> : undefined}
    >
      <div className="game-details">
        <div className="game-details__head">
          <GameCover
            id={expansion.id}
            title={expansion.title}
            coverPath={expansion.cover_path}
            size="large"
            className="game-details__cover"
          />
          <div className="game-details__facts">
            <p className="game-details__fact game-details__fact--muted">{text.expansionBadge}</p>
            {base.data ? (
              <p className="game-details__base">
                <PopupLink to={{ kind: 'game', id: base.data.id }}>
                  {format(text.expansionOf, { title: base.data.title })}
                </PopupLink>
              </p>
            ) : null}
            <p className="game-details__fact">{playersLabel(expansion)}</p>
            {expansion.complexity !== null ? (
              <p className="game-details__fact">
                {format(text.complexity, { n: expansion.complexity })}
              </p>
            ) : null}
            <p className="game-details__fact">
              {format(text.expansionPlays, { count: expansion.play_count ?? 0 })}
            </p>
            <p className="game-details__fact game-details__fact--muted">
              {expansion.last_played_at
                ? format(text.lastPlayed, {
                    date: formatMeetingDate(expansion.last_played_at, timeZone),
                  })
                : text.neverPlayed}
            </p>
          </div>
        </div>
        <p className="meeting-view__note">{text.expansionNote}</p>
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
  const date = formatMeetingDate(sheet.saved_at, timeZone);
  return (
    <button
      type="button"
      className="sheet-gallery__item"
      aria-label={format(text.sheet, { date })}
      onClick={() => open({ kind: 'sheet', id: sheet.id })}
    >
      <span className="sheet-gallery__frame" aria-hidden="true">
        <SheetThumbnail
          gameId={gameId}
          imageUrl={sheet.image_url}
          className="sheet-gallery__sheet"
        />
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
