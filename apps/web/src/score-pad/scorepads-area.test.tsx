import type { ScorePadEditorStatus } from '@bg-club/score-pad';
import { captureArtifact, expectNoDiagnostics } from '@solidjs/diagnostics';
import { fireEvent, within } from '@solidjs/testing-library';
import { QueryClient } from '@tanstack/query-core';
import { flush } from 'solid-js';
import { describe, expect, it, vi } from 'vitest';
import type { AuthContextValue } from '../auth/authContext';
import { gameKey, gameSearchKey, gamesKey, type Game } from '../games/games';
import type { PopupApi, PopupLevel } from '../popups/popupContext';
import { renderWithProviders } from '../test/render';
import { AreaPanel, AreaToolbar } from './AreaStep';
import { CategoriesPanel, CategoriesToolbar } from './CategoriesStep';
import { ManualTieControls } from './ManualTieControls';
import { MappingPanel, MappingToolbar } from './MappingStep';
import { PhotoStep } from './PhotoStep';
import { DeleteScorepadDialog, MoveScorepadPopup, RenameScorepadDialog } from './ScorepadDialogs';
import { gameScorepadsKey, scorepadKey, type Scorepad } from './scorepads';
import { ScorepadsPopup } from './ScorepadsPopup';

/*
 * Obszar Notesy. Zachowanie sprawdzają `src/hub/Scorepads.test.tsx` (lista i dialogi w hubie), `ScorepadWizard.test.tsx`
 * (kreator) i `ScorePadView.test.tsx` (notes i edytor); tu bramka bez kodów diagnostyki Solid
 * dla renderu i interakcji paneli kreatora, listy i dialogów (skill agent-loops, pętla 1).
 */

const EMPTY: ScorePadEditorStatus = {
  step: 1,
  busy: false,
  photo: false,
  photoUrl: '',
  area: false,
  fields: 'Dodaj kategorię z punktami.',
  sheetUrl: '',
  seats: 0,
  lines: [],
  settings: {
    name: 'Mój notes',
    tape: '#161a2b',
    mode: 'full',
    points: 4,
    smoothing: false,
    strength: 4,
    size: { w: 10.5, h: 14.8 },
    binding: 'top',
    canUndo: false,
  },
  mapping: {
    mode: 'rects',
    players: 'cols',
    seats: 1,
    categories: 0,
    rows: 0,
    labels: 1,
    maxLabels: 3,
    activeSeat: 0,
    activeCategory: 0,
    selected: 0,
    canDuplicate: false,
    canUndo: false,
    hasContent: false,
    problem: 'Narysuj na kartce pole pierwszej kategorii.',
    zoomed: false,
  },
  categories: {
    view: 'lines',
    active: 0,
    lines: [],
    ranking: { line: '__total', dir: 'desc', tiebreak: [] },
    explicit: false,
    issues: [{ code: 'names-count', path: 'lines' }],
    zoomed: false,
  },
  dirty: false,
  openFailed: false,
  zoom: { level: 1, max: 8 },
};
const PHOTO = { ...EMPTY, photo: true, photoUrl: 'data:image/jpeg;base64,x', area: true };
const READY: ScorePadEditorStatus = {
  ...PHOTO,
  step: 3,
  fields: null,
  mapping: { ...EMPTY.mapping, mode: 'table', seats: 4, categories: 2, problem: null },
  seats: 4,
  lines: [
    { label: 'Gracze', kind: 'names' },
    { label: 'Ptaki', kind: 'input' },
  ],
  categories: { ...EMPTY.categories, issues: [] },
};

const GAME: Game = {
  id: '00000000-0000-4000-b000-000000000001',
  title: 'Azul',
  cover_path: null,
  min_players: 2,
  max_players: 4,
  placement_points: [10, 6, 4, 2],
  complexity: 2,
  created_at: '2026-10-01T12:00:00Z',
  last_played_at: null,
  base_game_id: null,
  cover_source_path: null,
  cover_crop: null,
  play_count: null,
  available: true,
};
const EXPANSION: Game = {
  ...GAME,
  id: '00000000-0000-4000-b000-000000000002',
  title: 'Azul: Dodatek',
  base_game_id: GAME.id,
};
const PAD: Scorepad = {
  id: '00000000-0000-4000-c000-000000000001',
  game_id: GAME.id,
  name: 'Turniejowy',
  created_at: '2026-10-02T12:00:00Z',
  current: {
    id: '00000000-0000-4000-d000-000000000001',
    version: 2,
    image_path: null,
    player_slots: 3,
    created_at: '2026-10-03T12:00:00Z',
  },
};

function host() {
  const queryClient = new QueryClient({ defaultOptions: { queries: { staleTime: Infinity } } });
  queryClient.setQueryData(gameKey(GAME.id), GAME);
  queryClient.setQueryData(gameScorepadsKey(GAME.id), [PAD]);
  queryClient.setQueryData(scorepadKey(PAD.id), PAD);
  queryClient.setQueryData(gameSearchKey(''), [GAME]);
  queryClient.setQueryData([...gamesKey, 'expansions', 'all'], [EXPANSION]);
  const popups: PopupApi = {
    stack: [{ kind: 'scorepads', gameId: GAME.id }],
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
    client: {},
    state: { status: 'signedIn', session: { user: { id: 'me' } } },
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

describe('obszar Notesy bez diagnostyki Solid', () => {
  it('lista notesów i dialogi zmiany nazwy, przeniesienia i usunięcia', async () => {
    const { artifact } = await captureArtifact(
      async () => {
        const list = renderWithProviders(() => <ScorepadsPopup gameId={GAME.id} isAdmin />, host());
        await settle();
        const dialog = within(list.container).getByRole('dialog');
        expect(dialog).toHaveTextContent('Turniejowy');
        fireEvent.click(within(dialog).getByRole('button', { name: /Akcje notesu/ }));
        await settle();
        expect(within(dialog).getAllByRole('menuitem').length).toBeGreaterThan(0);
        list.unmount();

        const rename = renderWithProviders(() => <RenameScorepadDialog id={PAD.id} />, host());
        await settle();
        const field = within(rename.container).getByLabelText('Nazwa notesu');
        expect(field).toHaveValue('Turniejowy');
        fireEvent.input(field, { target: { value: '' } });
        fireEvent.click(within(rename.container).getByRole('button', { name: 'Zapisz' }));
        await settle();
        expect(rename.container).toHaveTextContent('Wpisz nazwę notesu.');
        rename.unmount();

        const move = renderWithProviders(() => <MoveScorepadPopup id={PAD.id} />, host());
        await settle();
        fireEvent.click(within(move.container).getByRole('button', { name: /Gra albo dodatek/ }));
        await settle();
        fireEvent.click(within(move.container).getByRole('option', { name: /Dodatek/ }));
        await settle();
        expect(within(move.container).getByRole('button', { name: 'Przenieś' })).toBeEnabled();
        move.unmount();

        const remove = renderWithProviders(() => <DeleteScorepadDialog id={PAD.id} />, host());
        await settle();
        expect(remove.container).toHaveTextContent('Turniejowy');
        remove.unmount();
      },
      { scenario: 'scorepads-list-dialogs' },
    );
    expectNoDiagnostics(artifact);
  });

  it('panele kreatora: zdjęcie, obszar, mapowanie, kategorie, remisy', async () => {
    const { artifact } = await captureArtifact(
      async () => {
        const photo = renderWithProviders(
          () => (
            <PhotoStep
              photoUrl=""
              busy={false}
              editorState="ready"
              onRetryEditor={vi.fn()}
              error={undefined}
              notice="Wczytano"
              onFile={vi.fn()}
              onImport={vi.fn()}
            />
          ),
          host(),
        );
        await settle();
        expect(photo.container).toHaveTextContent('Wczytano');
        photo.unmount();

        const onArea = vi.fn();
        const area = renderWithProviders(
          () => (
            <div>
              <AreaToolbar
                canUndo={false}
                disabled={false}
                zoom={PHOTO.zoom}
                onRotate={vi.fn()}
                onUndo={vi.fn()}
                onZoom={vi.fn()}
              />
              <AreaPanel settings={PHOTO.settings} onChange={onArea} />
            </div>
          ),
          host(),
        );
        await settle();
        const name = within(area.container).getAllByRole('textbox')[0] as HTMLInputElement;
        fireEvent.focus(name);
        fireEvent.input(name, { target: { value: 'Nowy' } });
        await settle();
        expect(onArea).toHaveBeenCalled();
        area.unmount();

        const onMapping = vi.fn();
        const mapping = renderWithProviders(
          () => (
            <div>
              <MappingToolbar
                mapping={READY.mapping}
                zoom={READY.zoom}
                disabled={false}
                onAction={onMapping}
                onZoom={vi.fn()}
              />
              <MappingPanel
                mapping={READY.mapping}
                maxPlayers={4}
                onAction={onMapping}
                onModeChange={vi.fn()}
              />
            </div>
          ),
          host(),
        );
        await settle();
        expect(mapping.container.querySelector('.wizard-panel, .wizard-toolbar')).not.toBeNull();
        mapping.unmount();

        const categories = renderWithProviders(
          () => (
            <div>
              <CategoriesToolbar
                zoomed={false}
                zoom={READY.zoom}
                disabled={false}
                onAction={vi.fn()}
                onZoom={vi.fn()}
              />
              <CategoriesPanel
                categories={READY.categories}
                fieldsProblem={null}
                onAction={vi.fn()}
              />
            </div>
          ),
          host(),
        );
        await settle();
        categories.unmount();

        const onTies = vi.fn();
        const ties = renderWithProviders(
          () => (
            <ManualTieControls
              groups={[[0, 1]]}
              nameOf={(seat) => `Gracz ${seat + 1}`}
              onChange={onTies}
            />
          ),
          host(),
        );
        await settle();
        fireEvent.click(within(ties.container).getAllByRole('button')[1] as HTMLElement);
        await settle();
        fireEvent.click(within(ties.container).getByRole('option', { name: /2/ }));
        await settle();
        expect(onTies).toHaveBeenCalledWith([[[0], [1]]]);
        ties.unmount();
      },
      { scenario: 'scorepad-wizard-panels' },
    );
    expectNoDiagnostics(artifact);
  });
});
