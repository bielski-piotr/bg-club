/** @jsxImportSource @solidjs/web */
import { captureArtifact, expectNoDiagnostics } from '@solidjs/diagnostics';
import { fireEvent, within } from '@solidjs/testing-library';
import { QueryClient } from '@tanstack/query-core';
import { flush } from 'solid-js';
import { describe, expect, it, vi } from 'vitest';
import type { AuthContextValue } from '../auth/authContext';
import { clubKey } from '../club/club';
import { meetingRecordsKey } from '../meetings/records';
import type { PopupApi, PopupLevel } from '../popups/popupContext';
import { allProfilesKey, type Profile } from '../profile/profileQueries';
import { SheetPopup } from '../sheets/SheetPopup';
import { gameSheetsKey, sheetKey, type SavedSheet } from '../sheets/sheets';
import { SheetZoom } from '../sheets/SheetZoom';
import { renderSolid } from '../solid/testing';
import { CollectionPopup } from './CollectionPopup';
import { CollectionWidget } from './CollectionWidget';
import { DeleteGameDialog } from './DeleteGameDialog';
import { GameDetailsPopup } from './GameDetailsPopup';
import { AddGamePopup, EditGamePopup } from './GameFormPopup';
import { collectionWidgetKey, expansionsKey, gameKey, gameSearchKey, type Game } from './games';
import { gameStatsKey, type GameStats } from './gameStatsData';

/*
 * Obszar Kolekcja, gry i karteczki w Solid (etap 5a, docs/solidjs-2-migration.md). Zachowanie
 * w hubie sprawdzają `src/hub/Collection.test.tsx` i e2e (`games.spec.ts`, `game-stats.spec.ts`,
 * `sheet-history.spec.ts`); tu bramka bez kodów diagnostyki Solid dla renderu i interakcji
 * (skill agent-loops, pętla 1). Dane są fikcyjne.
 */

const id = (group: string, n: number) =>
  `00000000-0000-4000-${group}-${String(n).padStart(12, '0')}`;

const ME: Profile = {
  id: id('a000', 1),
  hook: 'ada-testowa-a001',
  first_name: 'Ada',
  last_name: 'Testowa',
  role: 'admin',
  avatar_path: null,
  deleted_at: null,
};

function game(n: number, title: string, extra: Partial<Game> = {}): Game {
  return {
    id: id('b000', n),
    title,
    cover_path: null,
    min_players: 2,
    max_players: 4,
    placement_points: [10, 6, 4, 2],
    complexity: 2,
    created_at: '2026-10-01T12:00:00Z',
    last_played_at: '2026-11-06T19:00:00Z',
    base_game_id: null,
    cover_source_path: null,
    cover_crop: null,
    play_count: null,
    available: true,
    ...extra,
  };
}

const AZUL = game(1, 'Azul');
const ROOT = game(2, 'Root', { available: false, last_played_at: null, complexity: null });
const EXPANSION = game(3, 'Azul: Dodatek', { base_game_id: AZUL.id, play_count: 2 });
const GAMES = [AZUL, ROOT];

const STATS: GameStats = {
  play_count: 2,
  last_played_at: '2026-11-06T19:00:00Z',
  top_winners: [{ profile_id: ME.id, wins: 2 }],
  record: {
    value: 88,
    dir: 'desc',
    holders: [
      {
        profile_id: ME.id,
        play_id: id('c000', 1),
        meeting_id: id('d000', 1),
        starts_at: '2026-11-06T18:00:00Z',
        expansions: [{ id: EXPANSION.id, title: EXPANSION.title }],
      },
    ],
  },
  winner_average: 80.25,
  ranking: [{ place: 1, profile_id: ME.id, deleted: false, wins: 2, points: 20, plays: 2 }],
};

const SHEET: SavedSheet = {
  id: id('c000', 1),
  started_at: '2026-11-06T18:00:00Z',
  saved_at: '2026-11-06T19:10:00Z',
  sheet: null,
  sheet_image_path: null,
  scorepad_version_id: id('e000', 1),
  scorepad_name: 'Podstawowy',
  game: { id: AZUL.id, title: AZUL.title, cover_path: null },
  meeting: { id: id('d000', 1), title: 'Wieczór', starts_at: '2026-11-06T17:00:00Z' },
  results: [
    { profile_id: ME.id, seat: 0, ranking_value: 88, place: 1, points: 10, is_win: true },
    { profile_id: id('a000', 9), seat: 1, ranking_value: 70, place: 2, points: 6, is_win: false },
  ],
  expansion_ids: [],
};

function host() {
  const queryClient = new QueryClient({ defaultOptions: { queries: { staleTime: Infinity } } });
  queryClient.setQueryData(collectionWidgetKey, { games: GAMES, total: GAMES.length });
  queryClient.setQueryData(gameSearchKey(''), GAMES);
  for (const each of [AZUL, ROOT, EXPANSION]) queryClient.setQueryData(gameKey(each.id), each);
  queryClient.setQueryData(expansionsKey(AZUL.id), [EXPANSION]);
  queryClient.setQueryData(gameStatsKey(AZUL.id), STATS);
  queryClient.setQueryData(gameSheetsKey(AZUL.id), [
    {
      id: SHEET.id,
      saved_at: SHEET.saved_at,
      sheet_image_path: null,
      image_url: null,
      meeting_title: 'Wieczór',
      winners: [ME.id],
    },
  ]);
  queryClient.setQueryData(sheetKey(SHEET.id), SHEET);
  queryClient.setQueryData(
    meetingRecordsKey(SHEET.meeting.id),
    new Map([[SHEET.id, new Map([[ME.id, 'club']])]]),
  );
  queryClient.setQueryData(allProfilesKey, new Map([[ME.id, ME]]));
  queryClient.setQueryData(clubKey, { name: 'Klub', logo_path: null, timezone: 'Europe/Warsaw' });
  const rpc = vi.fn((name: string) => {
    const data = name === 'search_games' ? [AZUL] : name === 'game_vote_total' ? 3 : null;
    const result = Promise.resolve({ data, error: null });
    return Object.assign(result, { select: () => result });
  });
  const popups: PopupApi = {
    stack: [{ kind: 'games' }],
    open: vi.fn(),
    back: vi.fn(),
    backBy: vi.fn(),
    replace: vi.fn(),
    closeAll: vi.fn(),
    hrefFor: () => '/?p=x',
  };
  const popupLevel: PopupLevel = {
    level: 0,
    covered: false,
    onBack: undefined,
    onClose: vi.fn(),
    onScrimClick: vi.fn(),
  };
  const auth = {
    client: { rpc },
    state: { status: 'signedIn', session: { user: { id: ME.id } } },
    signOut: vi.fn(async () => undefined),
  } as unknown as AuthContextValue;
  return {
    queryClient,
    auth,
    popups,
    popupLevel,
    popupGuards: { set: vi.fn() },
    toast: { show: vi.fn(() => 1), dismiss: vi.fn() },
  };
}

const settle = async () => {
  await Promise.resolve();
  flush();
};

describe('obszar Kolekcja bez diagnostyki Solid', () => {
  it('widżet, popup z wyszukiwaniem i menu, szczegóły gry i dodatku, usuwanie', async () => {
    const { artifact } = await captureArtifact(
      async () => {
        const widget = renderSolid(() => <CollectionWidget isAdmin />, host());
        await settle();
        expect(within(widget.container).getByText('2 gry')).toBeInTheDocument();
        expect(within(widget.container).getAllByRole('link')).toHaveLength(3);
        widget.unmount();

        const popup = renderSolid(() => <CollectionPopup isAdmin />, host());
        await settle();
        const dialog = within(popup.container).getByRole('dialog');
        expect(within(dialog).getAllByRole('listitem')).toHaveLength(2);
        fireEvent.input(within(dialog).getByRole('searchbox'), { target: { value: 'az' } });
        await vi.waitFor(() => expect(within(dialog).getAllByRole('listitem')).toHaveLength(1));
        fireEvent.click(within(dialog).getByRole('button', { name: 'Akcje gry Azul' }));
        await settle();
        fireEvent.click(within(dialog).getByRole('menuitem', { name: 'Edytuj' }));
        await settle();
        popup.unmount();

        const details = renderSolid(() => <GameDetailsPopup id={AZUL.id} isAdmin />, host());
        await settle();
        const view = within(details.container).getByRole('dialog');
        expect(view).toHaveTextContent('Azul: Dodatek');
        expect(view).toHaveTextContent('80,3');
        await vi.waitFor(() => expect(view).toHaveTextContent('3'));
        details.unmount();

        const expansion = renderSolid(() => <GameDetailsPopup id={EXPANSION.id} />, host());
        await settle();
        expect(within(expansion.container).getByRole('dialog')).toHaveTextContent('Azul');
        expansion.unmount();

        const remove = renderSolid(() => <DeleteGameDialog id={ROOT.id} />, host());
        await settle();
        expect(within(remove.container).getByRole('dialog')).toHaveTextContent('Root');
        remove.unmount();
      },
      { scenario: 'games-area' },
    );
    expectNoDiagnostics(artifact);
  });

  it('formularz gry z walidacją, edytor okładki, karteczka z powiększeniem', async () => {
    const { artifact } = await captureArtifact(
      async () => {
        const add = renderSolid(() => <AddGamePopup />, host());
        await settle();
        const form = within(add.container).getByRole('dialog');
        fireEvent.input(within(form).getByLabelText('Tytuł'), { target: { value: 'Catan' } });
        fireEvent.input(within(form).getByLabelText('Skomplikowanie'), {
          target: { value: '2' },
        });
        await settle();
        fireEvent.keyDown(within(form).getAllByRole('spinbutton')[1] as HTMLElement, {
          key: 'ArrowUp',
        });
        await settle();
        expect(within(form).getAllByLabelText(/\. miejsce$/)).toHaveLength(5);
        fireEvent.input(within(form).getByLabelText('1. miejsce'), { target: { value: '-1' } });
        fireEvent.click(within(form).getByRole('button', { name: 'Zapisz' }));
        await settle();
        expect(within(form).getByText('Popraw zaznaczone pola.')).toBeInTheDocument();
        fireEvent.click(within(form).getByRole('button', { name: 'Dodaj okładkę' }));
        await settle();
        const cover = within(add.container).getByRole('dialog');
        expect(cover).toHaveTextContent('Wybierz plik');
        fireEvent.click(within(cover).getByRole('button', { name: 'Anuluj' }));
        await settle();
        expect(within(add.container).getByLabelText('Tytuł')).toHaveValue('Catan');
        add.unmount();

        const edit = renderSolid(() => <EditGamePopup id={ROOT.id} />, host());
        await settle();
        expect(within(edit.container).getByLabelText('Tytuł')).toHaveValue('Root');
        expect(within(edit.container).getByRole('switch', { name: 'Dostępna' })).toHaveAttribute(
          'aria-checked',
          'false',
        );
        edit.unmount();

        const sheet = renderSolid(() => <SheetPopup id={SHEET.id} isAdmin />, host());
        await settle();
        const card = within(sheet.container).getByRole('dialog');
        expect(card).toHaveTextContent('Wieczór');
        expect(card).toHaveTextContent('Rekord klubu');
        sheet.unmount();

        const zoom = renderSolid(() => <SheetZoom src="/s.png" alt="Karteczka" />, host());
        await settle();
        const stage = within(zoom.container).getByRole('group');
        fireEvent.keyDown(stage, { key: '+' });
        await settle();
        expect(zoom.container).toHaveTextContent('150%');
        fireEvent.keyDown(stage, { key: '0' });
        await settle();
        expect(zoom.container).toHaveTextContent('100%');
        zoom.unmount();
      },
      { scenario: 'games-form-sheets' },
    );
    expectNoDiagnostics(artifact);
  });
});
