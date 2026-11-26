/** @jsxImportSource @solidjs/web */
import { For, Match, Show, Switch, useContext } from 'solid-js';
import { FALLBACK_TIMEZONE } from '../club/timezones';
import { format, plural, t } from '../i18n';
import { formatMeetingDate } from '../meetings/datetime';
import type { PopupRoute } from '../popups/routes';
import { createGameSheets } from '../sheets/sheetData';
import type { GallerySheet } from '../sheets/sheets';
import { createClub } from '../solid/club';
import { PopupsContext } from '../solid/context';
import { SheetThumbnail } from '../solid/meetings/MeetingParts';
import { PopupLink } from '../solid/popups/PopupLink';
import { PopupModal } from '../solid/popups/PopupModal';
import { QueryStatus } from '../solid/popups/QueryStatus';
import { Button, EmptyState, Icon, ListRow, Menu, Tray } from '../solid/ui';
import { GameCover } from './GameCover';
import { GameStatsSection } from './GameStats';
import { createExpansions, createGame, createGameVoteTotal } from './gameData';
import type { Game } from './games';
import { playersLabel } from './labels';
import '../sheets/sheets.css';

const text = t.games.details;

/**
 * Szczegóły gry (GAME-10, DS „Kolekcja / Szczegóły gry”): okładka, dane gry i galeria
 * wszystkich oderwanych karteczek tej gry od najnowszej. Kliknięcie karteczki otwiera ją
 * w powiększeniu z wynikami i linkiem do spotkania (`sheet/<uuid>`). Statystyki gry (GAME-11)
 * są między danymi gry a galerią.
 */
export function GameDetailsPopup(props: { readonly id: string; readonly isAdmin?: boolean }) {
  const game = createGame(() => props.id);
  const club = createClub();
  const timeZone = () => club().data?.timezone ?? FALLBACK_TIMEZONE;
  const data = () => game().data ?? undefined;
  const notFound = () => game().isSuccess && game().data === null;

  // Jedno okno na wszystkie stany (wczytywanie, gra, dodatek, brak gry): fokus, który
  // `PopupHost` ustawił na oknie przy otwarciu, zostaje na nim po wczytaniu danych.
  return (
    <PopupModal
      title={notFound() ? text.notFoundTitle : (data()?.title ?? t.games.collection.title)}
      width={notFound() ? undefined : 880}
      actions={
        <Show when={props.isAdmin && data()}>{(shown) => <GameActions game={shown()} />}</Show>
      }
    >
      <Switch>
        <Match when={notFound()}>
          <p class="meeting-form__state">{text.notFoundBody}</p>
        </Match>
        <Match when={data()}>
          {(shown) => (
            <Show
              when={shown().base_game_id === null}
              fallback={<ExpansionDetails expansion={shown()} timeZone={timeZone()} />}
            >
              <BaseGameDetails
                game={shown()}
                isAdmin={props.isAdmin ?? false}
                timeZone={timeZone()}
              />
            </Show>
          )}
        </Match>
        <Match when={true}>
          <QueryStatus isError={game().isError} onRetry={() => void game().refetch()} />
        </Match>
      </Switch>
    </PopupModal>
  );
}

/** Akcje administratora w nagłówku widoku gry albo dodatku. */
function GameActions(props: { readonly game: Game }) {
  const popups = useContext(PopupsContext);
  const label = () => format(t.games.collection.actions, { title: props.game.title });
  const go = (route: () => PopupRoute) => () => popups.open(route());
  return (
    <Menu
      label={label()}
      align="end"
      items={[
        {
          id: 'edit',
          label: text.edit,
          icon: 'pencil',
          onSelect: go(() => ({ kind: 'edit-game', id: props.game.id })),
        },
        {
          id: 'scorepads',
          label: text.scorepads,
          icon: 'pad',
          onSelect: go(() => ({ kind: 'scorepads', gameId: props.game.id })),
        },
        ...(props.game.base_game_id !== null
          ? []
          : [
              {
                id: 'add-expansion',
                label: text.addExpansion,
                icon: 'plus' as const,
                onSelect: go(() => ({ kind: 'add-expansion', baseId: props.game.id })),
              },
            ]),
        {
          id: 'delete',
          label: text.delete,
          icon: 'trash',
          destructive: true,
          onSelect: go(() => ({ kind: 'delete-game', id: props.game.id })),
        },
      ]}
      trigger={(trigger) => (
        <button
          type="button"
          {...trigger}
          class="icon-btn icon-btn--32"
          aria-label={label()}
          title={label()}
        >
          <Icon name="more" />
        </button>
      )}
    />
  );
}

/** Data ostatniej partii albo „jeszcze nie grana”. */
function LastPlayed(props: { readonly game: Game; readonly timeZone: string }) {
  return (
    <p class="game-details__fact game-details__fact--muted">
      {props.game.last_played_at
        ? format(text.lastPlayed, {
            date: formatMeetingDate(props.game.last_played_at, props.timeZone),
          })
        : text.neverPlayed}
    </p>
  );
}

function BaseGameDetails(props: {
  readonly game: Game;
  readonly isAdmin: boolean;
  readonly timeZone: string;
}) {
  const votes = createGameVoteTotal(() => props.game.id);
  const sheets = createGameSheets(() => props.game.id);
  const headingId = () => `${props.game.id}-sheets`;
  return (
    <div class="game-details">
      <div class="game-details__head">
        <GameCover
          id={props.game.id}
          title={props.game.title}
          coverPath={props.game.cover_path}
          size="large"
          class="game-details__cover"
        />
        <div class="game-details__facts">
          <p class="game-details__fact">{playersLabel(props.game)}</p>
          <Show when={props.game.complexity !== null}>
            <p class="game-details__fact">
              {format(text.complexity, { n: props.game.complexity ?? 0 })}
            </p>
          </Show>
          <LastPlayed game={props.game} timeZone={props.timeZone} />
          <Switch>
            <Match when={votes().isError || votes().data === undefined}>
              <QueryStatus isError={votes().isError} onRetry={() => void votes().refetch()} />
            </Match>
            <Match when={votes().data != null}>
              <p class="game-details__fact" aria-live="polite">
                {format(text.voteTotal, { count: votes().data ?? 0 })}
              </p>
            </Match>
          </Switch>
        </div>
      </div>
      <ExpansionsSection game={props.game} isAdmin={props.isAdmin} />
      <GameStatsSection gameId={props.game.id} title={props.game.title} timeZone={props.timeZone} />
      <section class="meeting-view__section" aria-labelledby={headingId()}>
        <div class="meeting-view__head-row">
          <h3 id={headingId()} class="meeting-view__head">
            {text.gallery}
          </h3>
          <Show when={sheets().data}>
            {(list) => <span class="meeting-view__note">{plural(list().length, text.count)}</span>}
          </Show>
        </div>
        <Switch>
          <Match when={!sheets().data}>
            <QueryStatus isError={sheets().isError} onRetry={() => void sheets().refetch()} />
          </Match>
          <Match when={sheets().data?.length === 0}>
            <EmptyState icon="pad" title={text.galleryEmptyTitle} helper={text.galleryEmpty} />
          </Match>
          <Match when={true}>
            <ul
              class="sheet-gallery"
              aria-label={format(text.galleryLabel, { title: props.game.title })}
            >
              <For each={sheets().data ?? []} keyed={(sheet) => sheet.id}>
                {(sheet) => (
                  <li>
                    <GalleryItem sheet={sheet()} gameId={props.game.id} timeZone={props.timeZone} />
                  </li>
                )}
              </For>
            </ul>
          </Match>
        </Switch>
      </section>
    </div>
  );
}

/**
 * Dodatki gry podstawowej: tylko tutaj (nie ma ich w kolekcji, filtrach ani głosowaniu).
 * Wiersz otwiera widok dodatku z liczbą partii, notesami i akcjami administratora.
 */
function ExpansionsSection(props: { readonly game: Game; readonly isAdmin: boolean }) {
  const popups = useContext(PopupsContext);
  const expansions = createExpansions(() => props.game.id);
  const headingId = () => `${props.game.id}-expansions`;
  const list = () => expansions().data ?? [];
  return (
    <Show when={!(expansions().isSuccess && list().length === 0 && !props.isAdmin)}>
      <section class="meeting-view__section" aria-labelledby={headingId()}>
        <div class="meeting-view__head-row">
          <h3 id={headingId()} class="meeting-view__head">
            {text.expansions}
          </h3>
          <Show when={expansions().data}>
            <span class="meeting-view__note">{plural(list().length, text.expansionCount)}</span>
          </Show>
          <Show when={props.isAdmin}>
            <Button
              size="sm"
              variant="secondary"
              icon="plus"
              onClick={() => popups.open({ kind: 'add-expansion', baseId: props.game.id })}
            >
              {text.addExpansion}
            </Button>
          </Show>
        </div>
        <Switch>
          <Match when={!expansions().data}>
            <QueryStatus
              isError={expansions().isError}
              onRetry={() => void expansions().refetch()}
            />
          </Match>
          <Match when={list().length === 0}>
            <p class="meeting-view__note">{text.expansionsEmpty}</p>
          </Match>
          <Match when={true}>
            <Tray
              label={format(text.expansionsLabel, { title: props.game.title })}
              class="expansion-list"
            >
              <For each={list()} keyed={(expansion) => expansion.id}>
                {(expansion) => (
                  <ListRow
                    leading={
                      <GameCover
                        id={expansion().id}
                        title={expansion().title}
                        coverPath={expansion().cover_path}
                        size="thumb"
                      />
                    }
                    title={expansion().title}
                    meta={`${playersLabel(expansion())} · ${plural(expansion().play_count ?? 0, text.count)}`}
                    onClick={() => popups.open({ kind: 'game', id: expansion().id })}
                  />
                )}
              </For>
            </Tray>
          </Match>
        </Switch>
      </section>
    </Show>
  );
}

/**
 * Widok dodatku: okładka, gra podstawowa, liczba graczy, skomplikowanie i liczba rozegranych
 * partii (dodatki nie mają własnych rankingów ani rekordów: wyniki trafiają do gry podstawowej).
 */
function ExpansionDetails(props: { readonly expansion: Game; readonly timeZone: string }) {
  const base = createGame(() => props.expansion.base_game_id ?? '');
  return (
    <div class="game-details">
      <div class="game-details__head">
        <GameCover
          id={props.expansion.id}
          title={props.expansion.title}
          coverPath={props.expansion.cover_path}
          size="large"
          class="game-details__cover"
        />
        <div class="game-details__facts">
          <p class="game-details__fact game-details__fact--muted">{text.expansionBadge}</p>
          <Show when={base().data}>
            {(shown) => (
              <p class="game-details__base">
                <PopupLink to={{ kind: 'game', id: shown().id }}>
                  {format(text.expansionOf, { title: shown().title })}
                </PopupLink>
              </p>
            )}
          </Show>
          <p class="game-details__fact">{playersLabel(props.expansion)}</p>
          <Show when={props.expansion.complexity !== null}>
            <p class="game-details__fact">
              {format(text.complexity, { n: props.expansion.complexity ?? 0 })}
            </p>
          </Show>
          <p class="game-details__fact">
            {format(text.expansionPlays, { count: props.expansion.play_count ?? 0 })}
          </p>
          <LastPlayed game={props.expansion} timeZone={props.timeZone} />
        </div>
      </div>
      <p class="meeting-view__note">{text.expansionNote}</p>
    </div>
  );
}

function GalleryItem(props: {
  readonly sheet: GallerySheet;
  readonly gameId: string;
  readonly timeZone: string;
}) {
  const popups = useContext(PopupsContext);
  const date = () => formatMeetingDate(props.sheet.saved_at, props.timeZone);
  return (
    <button
      type="button"
      class="sheet-gallery__item"
      aria-label={format(text.sheet, { date: date() })}
      onClick={() => popups.open({ kind: 'sheet', id: props.sheet.id })}
    >
      <span class="sheet-gallery__frame" aria-hidden="true">
        <SheetThumbnail
          gameId={props.gameId}
          imageUrl={props.sheet.image_url}
          class="sheet-gallery__sheet"
        />
      </span>
      <span class="sheet-gallery__caption" aria-hidden="true">
        {props.sheet.meeting_title
          ? format(text.sheetMeeting, {
              date: date().split(' · ')[0] ?? date(),
              meeting: props.sheet.meeting_title,
            })
          : date()}
      </span>
    </button>
  );
}
