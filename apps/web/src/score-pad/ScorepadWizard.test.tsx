import type {
  ScorePadEditorArea,
  ScorePadEditorAreaPatch,
  ScorePadEditorCategoriesAction,
  ScorePadEditorCategory,
  ScorePadEditorMappingAction,
  ScorePadEditorStatus,
  ScorePadTemplate,
  ScorePadZoomAction,
} from '@bg-club/score-pad';
import type { SupabaseClient } from '@supabase/supabase-js';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { act, fireEvent, render, screen, waitFor, within } from '@testing-library/react';
import { useEffect, useImperativeHandle } from 'react';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { AuthContext, type AuthContextValue } from '../auth/authContext';
import type { Game } from '../games/games';
import { PopupHost } from '../popups/PopupHost';
import { PopupRouter } from '../popups/PopupRouter';
import { ToastProvider } from '../ui';
import type { ScorePadEditorViewProps } from './ScorePadEditorView';
import type { ScorePadViewProps } from './ScorePadView';
import { ScorepadWizard } from './ScorepadWizard';
import type * as Scorepads from './scorepads';
import type { Scorepad } from './scorepads';

/*
 * Kreator edytora notesu (PRD §5.5.2, EDT-1, EDT-9, DS §18, zadanie [016]): pięć kroków,
 * walidacja przejścia, powrót bez utraty danych, krok zdjęcia (plik, przeciągnięcie, schowek,
 * kamera, import `.json`) i ochrona przed utratą zmian. `<score-pad-editor>` jest atrapą
 * (jego tryb kreatora testuje pakiet), zapis w bazie też. Dane są fikcyjne.
 */

const GAME: Game = {
  id: '00000000-0000-4000-b000-000000000001',
  title: 'Żółwie Wyścigi',
  cover_path: null,
  complexity: 2,
  min_players: 2,
  max_players: 5,
  placement_points: [10, 6, 4, 2, 1],
  created_at: '2026-10-01T12:00:00Z',
  last_played_at: null,
  base_game_id: null,
  cover_source_path: null,
  cover_crop: null,
  play_count: null,
};

const TEMPLATE: ScorePadTemplate = {
  v: 2,
  id: 'n-plik',
  name: 'Z pliku',
  image: 'data:image/jpeg;base64,/9j/4AAQ',
  lines: [
    { id: 'names', label: 'Gracze', kind: 'names' },
    { id: 'a', label: 'Punkty', kind: 'input' },
  ],
};

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
    issues: [],
    zoomed: false,
  },
  dirty: false,
  openFailed: false,
  zoom: { level: 1, max: 8 },
};

/** Kategoria kroku 4 (EDT-13) w stanie edytora. */
function category(
  id: string,
  label: string,
  kind: ScorePadEditorCategory['kind'],
  extra: Partial<ScorePadEditorCategory> = {},
): ScorePadEditorCategory {
  return {
    id,
    label,
    kind,
    hint: '',
    range: 'range',
    min: 0,
    max: 50,
    step: 1,
    values: [],
    of: [],
    sumOptions: [],
    placed: true,
    team: false,
    ...extra,
  };
}
const MAPPED: Partial<ScorePadEditorStatus> = {
  fields: null,
  mapping: {
    ...EMPTY.mapping,
    mode: 'table',
    seats: 3,
    categories: 3,
    hasContent: true,
    problem: null,
  },
  seats: 3,
  lines: [
    { label: 'Gracze', kind: 'names' },
    { label: 'Ptaki', kind: 'input' },
    { label: 'Suma', kind: 'total' },
  ],
  categories: {
    ...EMPTY.categories,
    lines: [
      category('n', 'Gracze', 'names'),
      category('a', 'Ptaki', 'input'),
      category('s', 'Suma', 'total', { of: ['a'], sumOptions: ['a'] }),
    ],
    ranking: { line: 's', dir: 'desc', tiebreak: [] },
  },
  sheetUrl: 'data:image/jpeg;base64,sheet',
};

/** Atrapa `<score-pad-editor>`: stan, który kreator czyta, i wywołania z kreatora. */
const fake = vi.hoisted(() => ({
  status: null as ScorePadEditorStatus | null,
  emit: (() => undefined) as (status: ScorePadEditorStatus) => void,
  goStep: vi.fn(),
  setArea: vi.fn(),
  rotatePhoto: vi.fn(),
  undoArea: vi.fn(),
  zoom: vi.fn(),
  editMapping: vi.fn(),
  editCategories: vi.fn(),
  loadPhoto: vi.fn(),
  loadTemplate: vi.fn(),
  failPhoto: false,
  /** Szablon z `exportConfig` (domyślnie `TEMPLATE`). */
  exported: null as ScorePadTemplate | null,
}));

/** Atrapa notesu 3D `<score-pad>` w kroku 5 (WebGL testuje E2E): props i wywołania uchwytu. */
const padFake = vi.hoisted(() => ({
  props: null as ScorePadViewProps | null,
  sheet: null as unknown,
  setSheet: vi.fn(),
  tear: vi.fn(),
  resetView: vi.fn(),
}));

vi.mock('./ScorePadView', () => ({
  ScorePadView: function FakePad(props: ScorePadViewProps) {
    padFake.props = props;
    const { onReady, ref } = props;
    useEffect(() => {
      padFake.sheet = props.config?.sheet ?? null;
      onReady?.();
      // eslint-disable-next-line react-hooks/exhaustive-deps
    }, []);
    useImperativeHandle(ref, () => ({
      setSheet: (sheet) => {
        padFake.setSheet(sheet);
        padFake.sheet = sheet;
      },
      restoreSheet: () => false,
      tear: () => {
        padFake.tear();
        padFake.props?.onTear?.();
        padFake.props?.onSave?.({
          id: 'x',
          tpl: 't',
          tplName: 't',
          game: 1,
          at: '2026-11-14T12:00:00Z',
          players: [],
          winners: [],
          sheet: padFake.sheet as never,
          results: [],
          image: () => Promise.resolve(null),
        });
      },
      resetView: () => padFake.resetView(),
    }));
    return <div data-testid="pad" />;
  },
}));

function update(patch: Partial<ScorePadEditorStatus>) {
  fake.status = { ...(fake.status as ScorePadEditorStatus), ...patch };
  act(() => fake.emit(fake.status as ScorePadEditorStatus));
}

vi.mock('./ScorePadEditorView', () => ({
  ScorePadEditorView: function FakeEditor({
    template,
    onStatus,
    onLoadState,
    ref,
  }: ScorePadEditorViewProps) {
    useEffect(() => {
      fake.emit = (status) => onStatus?.(status);
      fake.status = template
        ? { ...EMPTY, ...MAPPED, photo: true, area: true, photoUrl: 'data:image/jpeg;base64,old' }
        : EMPTY;
      onLoadState?.('ready', () => undefined);
      onStatus?.(fake.status);
    }, [onStatus, onLoadState, template]);
    useImperativeHandle(ref, () => ({
      exportConfig: () => ({
        format: 'score-pad',
        version: 2,
        template: fake.exported ?? TEMPLATE,
      }),
      status: () => fake.status,
      loadPhoto: async (file: Blob) => {
        fake.loadPhoto(file);
        if (fake.failPhoto) throw Object.assign(new Error('image'), { reason: 'image' });
        update({ photo: true, area: true, photoUrl: 'data:image/jpeg;base64,new', dirty: true });
      },
      loadTemplate: async (value: ScorePadTemplate) => {
        fake.loadTemplate(value);
        update({ ...MAPPED, photo: true, area: true, photoUrl: 'data:,', dirty: true });
      },
      goStep: (step: 1 | 2 | 3 | 4) => {
        fake.goStep(step);
        update({ step });
      },
      setArea: (patch: ScorePadEditorAreaPatch) => {
        fake.setArea(patch);
        const settings = (fake.status as ScorePadEditorStatus).settings;
        update({
          settings: {
            ...settings,
            ...patch,
            size: { ...settings.size, ...patch.size },
            canUndo: true,
          } as ScorePadEditorArea,
        });
      },
      rotatePhoto: (dir: 1 | -1) => fake.rotatePhoto(dir),
      undoArea: () => fake.undoArea(),
      zoom: (by: ScorePadZoomAction) => fake.zoom(by),
      editMapping: (action: ScorePadEditorMappingAction) => {
        fake.editMapping(action);
        const current = (fake.status as ScorePadEditorStatus).mapping;
        if (action.type === 'mode')
          update({
            mapping: { ...current, mode: action.mode, hasContent: false, categories: 0 },
          });
      },
      editCategories: (action: ScorePadEditorCategoriesAction) => {
        fake.editCategories(action);
        const current = (fake.status as ScorePadEditorStatus).categories;
        if (action.type === 'view') update({ categories: { ...current, view: action.view } });
        if (action.type === 'select') update({ categories: { ...current, active: action.index } });
        if (action.type === 'ranking')
          update({ categories: { ...current, ranking: action.ranking, explicit: true } });
        if (action.type === 'update')
          update({
            categories: {
              ...current,
              active: action.index,
              lines: current.lines.map((line, index) =>
                index === action.index
                  ? ({ ...line, ...action.patch } as ScorePadEditorCategory)
                  : line,
              ),
            },
          });
      },
    }));
    return <div data-testid="editor" />;
  },
}));

const save = vi.hoisted(() => vi.fn());
vi.mock('./scorepads', async (original) => ({
  ...(await original<typeof Scorepads>()),
  saveScorepad: save,
}));

beforeEach(() => {
  fake.status = null;
  fake.failPhoto = false;
  fake.exported = null;
  padFake.props = null;
  padFake.setSheet.mockClear();
  padFake.tear.mockClear();
  padFake.resetView.mockClear();
  fake.setArea.mockClear();
  fake.rotatePhoto.mockClear();
  fake.undoArea.mockClear();
  fake.zoom.mockClear();
  fake.editMapping.mockClear();
  fake.editCategories.mockClear();
  save.mockReset();
  save.mockResolvedValue({ name: 'Z pliku', version: 1, playerSlots: 3 });
});

function renderWizard(pad: Scorepad | null = null, template?: ScorePadTemplate) {
  window.history.replaceState(null, '', `/?p=game/${GAME.id}/scorepads/new`);
  const auth = {
    client: {} as SupabaseClient,
    state: { status: 'signedIn', session: { user: { id: 'u' } } },
    signIn: vi.fn(),
    signOut: vi.fn(async () => undefined),
  } as unknown as AuthContextValue;
  render(
    <QueryClientProvider client={new QueryClient()}>
      <ToastProvider>
        <AuthContext.Provider value={auth}>
          <PopupRouter>
            <PopupHost
              fallbackFocusId="main"
              renderPopup={() => (
                <ScorepadWizard
                  game={GAME}
                  scorepadId="00000000-0000-4000-d000-000000000009"
                  pad={pad}
                  template={template}
                />
              )}
            >
              <main id="main" tabIndex={-1} />
            </PopupHost>
          </PopupRouter>
        </AuthContext.Provider>
      </ToastProvider>
    </QueryClientProvider>,
  );
  return screen.getByRole('dialog', { name: pad ? 'Edytuj notes' : 'Nowy notes' });
}

const photo = () => new File(['x'], 'kartka.jpg', { type: 'image/jpeg' });
const pill = (name: string | RegExp) =>
  within(screen.getByRole('navigation', { name: 'Kroki edytora notesu' })).getByRole('button', {
    name,
  });
const next = () => screen.getByRole('button', { name: 'Dalej' });

async function choosePhoto(dialog: HTMLElement) {
  fireEvent.change(within(dialog).getByLabelText('Wybierz plik'), {
    target: { files: [photo()] },
  });
  await waitFor(() => expect(next()).toBeEnabled());
}

describe('kreator edytora notesu', () => {
  it('pięć kroków; „Dalej” czeka na zdjęcie; mobilny pasek postępu', async () => {
    const dialog = renderWizard();
    const steps = within(screen.getByRole('navigation', { name: 'Kroki edytora notesu' }));
    expect(steps.getAllByRole('button').map((b) => b.textContent)).toEqual([
      '1.Zdjęcie',
      '2.Obszar kartki',
      '3.Mapowanie pól',
      '4.Kategorie',
      '5.Test i zapis',
    ]);
    expect(pill('1. Zdjęcie (bieżący)')).toHaveAttribute('aria-current', 'step');
    expect(pill(/Obszar kartki/)).toBeDisabled();
    expect(within(dialog).getByText('Krok 1 z 5')).toBeInTheDocument();
    expect(next()).toBeDisabled();
    expect(within(dialog).queryByRole('button', { name: 'Wstecz' })).not.toBeInTheDocument();
    expect(within(dialog).getByText('Dobre zdjęcie kartki')).toBeInTheDocument();

    await choosePhoto(dialog);
    expect(fake.loadPhoto).toHaveBeenCalledTimes(1);
    expect(within(dialog).getByRole('img', { name: 'Wczytane zdjęcie kartki' })).toHaveAttribute(
      'src',
      'data:image/jpeg;base64,new',
    );
    fireEvent.click(next());
    expect(within(dialog).getByText('Krok 2 z 5')).toBeInTheDocument();
    expect(fake.goStep).toHaveBeenLastCalledWith(2);
    expect(pill('Zdjęcie (ukończony)')).toBeEnabled();
  });

  it('walidacja przejścia i powrót bez utraty danych', async () => {
    const dialog = renderWizard();
    await choosePhoto(dialog);
    fireEvent.click(next());
    update({ area: false });
    expect(next()).toBeDisabled();
    expect(pill(/Mapowanie pól/)).toBeDisabled();
    update({ area: true });
    fireEvent.click(next());
    expect(fake.goStep).toHaveBeenLastCalledWith(3);
    update(MAPPED);
    fireEvent.click(next());
    // Krok 4: kategorie z kroku 3 na kartce edytora i w panelu.
    expect(fake.goStep).toHaveBeenLastCalledWith(4);
    expect(await within(dialog).findByText('Kategoria 1 z 3')).toBeInTheDocument();
    expect(within(dialog).getByRole('textbox', { name: 'Nazwa' })).toHaveValue('Gracze');

    // Wstecz do zdjęcia: dane zostają, wykonane kroki są dostępne z pigułek.
    fireEvent.click(pill('Zdjęcie (ukończony)'));
    expect(
      within(dialog).getByRole('img', { name: 'Wczytane zdjęcie kartki' }),
    ).toBeInTheDocument();
    expect(fake.loadPhoto).toHaveBeenCalledTimes(1);
    fireEvent.click(pill('Kategorie (ukończony)'));
    expect(within(dialog).getByText('Krok 4 z 5')).toBeInTheDocument();
    fireEvent.click(within(dialog).getByRole('button', { name: 'Wstecz' }));
    expect(within(dialog).getByText('Krok 3 z 5')).toBeInTheDocument();
  });

  it('zły plik zostaje w kroku 1 z komunikatem', async () => {
    const dialog = renderWizard();
    fireEvent.change(within(dialog).getByLabelText('Wybierz plik'), {
      target: { files: [new File(['%PDF'], 'a.pdf', { type: 'application/pdf' })] },
    });
    expect(await within(dialog).findByText(/Ten plik nie jest zdjęciem/)).toBeInTheDocument();
    expect(fake.loadPhoto).not.toHaveBeenCalled();
    fake.failPhoto = true;
    fireEvent.change(within(dialog).getByLabelText('Wybierz plik'), {
      target: { files: [photo()] },
    });
    expect(await within(dialog).findByText(/Nie udało się odczytać zdjęcia/)).toBeInTheDocument();
    expect(next()).toBeDisabled();
  });

  it('przeciągnięcie i wklejenie zdjęcia ze schowka', async () => {
    const dialog = renderWizard();
    const stage = within(dialog).getByText('Przeciągnij zdjęcie kartki').closest('.wizard-stage');
    const files = [photo()];
    fireEvent.dragEnter(stage as Element, { dataTransfer: { types: ['Files'], files } });
    expect(within(dialog).getByText('Upuść zdjęcie tutaj')).toBeInTheDocument();
    fireEvent.drop(stage as Element, { dataTransfer: { types: ['Files'], files } });
    await waitFor(() => expect(fake.loadPhoto).toHaveBeenCalledWith(files[0]));
    await waitFor(() => expect(next()).toBeEnabled());

    const pasted = photo();
    const event = new Event('paste', { bubbles: true, cancelable: true });
    Object.assign(event, {
      clipboardData: { items: [{ kind: 'file', type: 'image/jpeg', getAsFile: () => pasted }] },
    });
    // Po mapowaniu pól zastąpienie zdjęcia trzeba potwierdzić; tu jesteśmy jeszcze w kroku 1.
    act(() => {
      document.dispatchEvent(event);
    });
    await waitFor(() => expect(fake.loadPhoto).toHaveBeenLastCalledWith(pasted));
    expect(event.defaultPrevented).toBe(true);
  });

  it('brak kamery zostawia ścieżkę z plikiem', async () => {
    const dialog = renderWizard();
    fireEvent.click(within(dialog).getByRole('button', { name: 'Zrób zdjęcie' }));
    expect(
      await within(dialog).findByText(/Ta przeglądarka nie udostępnia kamery/),
    ).toBeInTheDocument();
    expect(within(dialog).getAllByRole('button', { name: 'Wybierz plik' }).length).toBe(2);
  });

  it('odmowa dostępu do kamery: komunikat i wybór pliku', async () => {
    const getUserMedia = vi.fn(async () => {
      throw new DOMException('denied', 'NotAllowedError');
    });
    Object.defineProperty(navigator, 'mediaDevices', {
      configurable: true,
      value: { getUserMedia },
    });
    try {
      const dialog = renderWizard();
      fireEvent.click(within(dialog).getByRole('button', { name: 'Zrób zdjęcie' }));
      expect(await within(dialog).findByText(/Brak dostępu do kamery/)).toBeInTheDocument();
      expect(getUserMedia).toHaveBeenCalledWith(
        expect.objectContaining({
          video: expect.objectContaining({ facingMode: { ideal: 'environment' } }),
        }),
      );
    } finally {
      Reflect.deleteProperty(navigator, 'mediaDevices');
    }
  });

  it('import pliku .json w kroku 1 otwiera kreator z wykonanymi krokami', async () => {
    const dialog = renderWizard();
    const input = within(dialog).getByLabelText('Plik notesu (.json)');
    fireEvent.change(input, { target: { files: [new File(['{'], 'zly.json')] } });
    expect(await within(dialog).findByText(/nie jest poprawnym plikiem JSON/)).toBeInTheDocument();

    const json = JSON.stringify({
      format: 'score-pad',
      version: 2,
      template: {
        ...TEMPLATE,
        size: { w: 10, h: 14 },
        tape: '#2c3a46',
        grid: { x: [0, 0.25, 0.5, 0.75, 1], y: [0, 0.5, 1], players: 'cols', labels: 1 },
      },
    });
    const noImage = JSON.parse(json) as { template: Record<string, unknown> };
    delete noImage.template.image;
    fireEvent.change(input, {
      target: { files: [new File([JSON.stringify(noImage)], 'bez-zdjecia.json')] },
    });
    expect(await within(dialog).findByText(/nie zawiera zdjęcia kartki/)).toBeInTheDocument();
    expect(fake.loadTemplate).not.toHaveBeenCalled();

    fireEvent.change(input, { target: { files: [new File([json], 'notes.json')] } });
    expect(await within(dialog).findByText(/Wczytano notes Z pliku z pliku/)).toBeInTheDocument();
    expect(fake.loadTemplate).toHaveBeenCalledWith(expect.objectContaining({ name: 'Z pliku' }));
    for (const name of ['Obszar kartki', 'Mapowanie pól', 'Kategorie']) {
      expect(pill(`${name} (ukończony)`)).toBeEnabled();
    }
    expect(pill('5. Test i zapis')).toBeEnabled();
  });

  it('niezapisane zmiany: × pyta o odrzucenie, Esc zamyka tylko pytanie', async () => {
    const dialog = renderWizard();
    // Bez zmian nie ma pytania.
    expect(fake.status?.dirty).toBe(false);
    await choosePhoto(dialog);

    fireEvent.click(within(dialog).getByRole('button', { name: 'Zamknij' }));
    const confirm = screen.getByRole('dialog', { name: 'Odrzucić zmiany?' });
    expect(within(confirm).getByRole('button', { name: 'Wróć do edycji' })).toHaveFocus();
    expect(dialog.closest('[inert]')).not.toBeNull();
    fireEvent.keyDown(confirm, { key: 'Escape' });
    expect(screen.queryByRole('dialog', { name: 'Odrzucić zmiany?' })).not.toBeInTheDocument();
    expect(window.location.search).toContain('scorepads/new');

    fireEvent.keyDown(dialog, { key: 'Escape' });
    const again = screen.getByRole('dialog', { name: 'Odrzucić zmiany?' });
    fireEvent.click(within(again).getByRole('button', { name: 'Odrzuć zmiany' }));
    await waitFor(() => expect(window.location.search).toBe(''));
  });

  it('nowe zdjęcie po mapowaniu pól trzeba potwierdzić', async () => {
    const dialog = renderWizard();
    await choosePhoto(dialog);
    fireEvent.click(next());
    fireEvent.click(next());
    update(MAPPED);
    fireEvent.click(pill('Zdjęcie (ukończony)'));
    fireEvent.change(within(dialog).getByLabelText('Wybierz plik'), {
      target: { files: [photo()] },
    });
    const confirm = screen.getByRole('dialog', { name: 'Zastąpić zdjęcie?' });
    expect(fake.loadPhoto).toHaveBeenCalledTimes(1);
    fireEvent.click(within(confirm).getByRole('button', { name: 'Zastąp zdjęcie' }));
    await waitFor(() => expect(fake.loadPhoto).toHaveBeenCalledTimes(2));
    // Nowe zdjęcie: kolejne kroki od nowa.
    await waitFor(() => expect(pill(/Mapowanie pól/)).toBeDisabled());
  });

  it('edycja notesu: wszystkie kroki wykonane, zapis w ostatnim kroku bez pytania', async () => {
    const pad: Scorepad = {
      id: '00000000-0000-4000-d000-000000000009',
      game_id: GAME.id,
      name: 'Turniejowy',
      created_at: '2026-10-01T12:00:00Z',
      current: {
        id: '00000000-0000-4000-e000-000000000001',
        version: 2,
        image_path: `${GAME.id}/x.jpg`,
        player_slots: 3,
        created_at: '2026-10-01T12:00:00Z',
      },
    };
    const dialog = renderWizard(pad, TEMPLATE);
    await waitFor(() => expect(pill('Obszar kartki (ukończony)')).toBeEnabled());
    fireEvent.click(pill('5. Test i zapis'));
    expect(await within(dialog).findByRole('group', { name: 'Test notesu' })).toBeInTheDocument();
    expect(within(dialog).getByText(/Zapis utworzy wersję 3 notesu/)).toBeInTheDocument();
    expect(
      within(dialog).getByText(/Tego notesu można używać tylko w partiach do 3 graczy/),
    ).toBeInTheDocument();
    update({ dirty: true });
    fireEvent.click(within(dialog).getByRole('button', { name: 'Zapisz notes' }));
    await waitFor(() => expect(window.location.search).toBe(''));
    expect(save).toHaveBeenCalledWith(
      expect.anything(),
      expect.objectContaining({
        gameId: GAME.id,
        previousImage: { url: TEMPLATE.image, path: `${GAME.id}/x.jpg` },
      }),
    );
    expect(screen.queryByRole('dialog', { name: 'Odrzucić zmiany?' })).not.toBeInTheDocument();
  });

  it('krok 5: test notesu z fikcyjnymi graczami, losowy remis i wynik bez zapisu (EDT-14)', async () => {
    // Notes z tabelą dla 3 graczy: punkty 0–3, remis rozstrzygają „Jaja” (więcej = lepiej).
    fake.exported = {
      v: 2,
      id: 'n-test',
      name: 'Turniejowy',
      image: 'data:image/jpeg;base64,/9j/4AAQ',
      size: { w: 10, h: 14 },
      tape: '#161A2B',
      grid: { x: [0, 0.25, 0.5, 0.75, 1], y: [0, 0.25, 0.5, 0.75, 1], players: 'cols', labels: 1 },
      lines: [
        { id: 'n', label: 'Gracze', kind: 'names' },
        { id: 'a', label: 'Ptaki', kind: 'input', min: 0, max: 3 },
        { id: 'e', label: 'Jaja', kind: 'input', min: 0, max: 3 },
        { id: 's', label: 'Suma', kind: 'total', of: ['a', 'e'] },
      ],
      ranking: { line: 'a', dir: 'desc', tiebreak: [{ type: 'line', line: 'e', dir: 'desc' }] },
    } as ScorePadTemplate;
    const pad: Scorepad = {
      id: '00000000-0000-4000-d000-000000000009',
      game_id: GAME.id,
      name: 'Turniejowy',
      created_at: '2026-10-01T12:00:00Z',
      current: null,
    };
    const dialog = renderWizard(pad, TEMPLATE);
    await waitFor(() => expect(pill('Obszar kartki (ukończony)')).toBeEnabled());
    fireEvent.click(pill('5. Test i zapis'));
    await within(dialog).findByRole('group', { name: 'Test notesu' });

    // Notes jak w partii, w trybie testowym, z graczami „Gracz 1…n” zamiast członków klubu.
    await within(dialog).findByTestId('pad');
    expect(padFake.props).toMatchObject({ test: true, controls: false });
    expect(padFake.props?.config?.template).toBe(fake.exported);
    expect(padFake.props?.config?.sheet?.names).toEqual(['Gracz 1', 'Gracz 2', 'Gracz 3']);
    const fill = within(dialog).getByRole('button', { name: 'Wypełnij losowo' });
    const tear = within(dialog).getByRole('button', { name: 'Oderwij kartkę' });
    await waitFor(() => expect(fill).toBeEnabled());
    expect(within(dialog).getByText('Miejsca według: Ptaki')).toBeInTheDocument();
    expect(within(dialog).getByText(/Oderwij wypełnioną kartkę/)).toBeInTheDocument();

    fireEvent.click(within(dialog).getByRole('checkbox', { name: 'Wymuś remis przy losowaniu' }));
    fireEvent.click(fill);
    const sheet = padFake.setSheet.mock.lastCall?.[0] as {
      names: string[];
      cells: Record<string, number[]>;
    };
    expect(sheet.names).toEqual(['Gracz 1', 'Gracz 2', 'Gracz 3']);
    for (const id of ['a', 'e'])
      for (const v of sheet.cells[id] ?? []) expect([0, 1, 2, 3]).toContain(v);
    // Wymuszony remis: dwóch graczy ma tyle samo „Ptaków” co lider.
    const best = Math.max(...(sheet.cells.a ?? []));
    expect((sheet.cells.a ?? []).filter((v) => v === best).length).toBeGreaterThanOrEqual(2);

    fireEvent.click(tear);
    expect(padFake.tear).toHaveBeenCalledTimes(1);
    const result = within(dialog).getByRole('region', { name: 'Wynik testu' });
    const rows = within(result).getAllByRole('listitem');
    expect(rows).toHaveLength(3);
    expect(rows[0]).toHaveTextContent(/^1\.Gracz \d/);
    // Remis lidera opisuje reguła „Jaja” albo wspólne miejsce, gdy i ona nie rozstrzyga.
    expect(
      within(result).getAllByText(/^(Wspólne miejsce|Remis rozstrzygnęła kategoria Jaja)$/).length,
    ).toBeGreaterThanOrEqual(2);

    // Oderwanie pustej kartki (bez wyniku) kończy poprzedni wynik testu.
    act(() => padFake.props?.onTear?.());
    expect(within(result).queryAllByRole('listitem')).toHaveLength(0);
    expect(within(dialog).getByText(/Oderwij wypełnioną kartkę/)).toBeInTheDocument();

    // Test niczego nie zapisuje, zapis jest osobnym przyciskiem.
    expect(save).not.toHaveBeenCalled();
    fireEvent.click(within(dialog).getByRole('button', { name: 'Zapisz notes' }));
    await waitFor(() => expect(save).toHaveBeenCalledTimes(1));
  });

  it('krok 5: notes można zapisać od razu, bez testu (EDT-14)', async () => {
    const dialog = renderWizard(null, TEMPLATE);
    await waitFor(() => expect(pill('Obszar kartki (ukończony)')).toBeEnabled());
    fireEvent.click(pill('5. Test i zapis'));
    expect(await within(dialog).findByText(/Test nie jest wymagany/)).toBeInTheDocument();
    fireEvent.click(within(dialog).getByRole('button', { name: 'Zapisz notes' }));
    await waitFor(() => expect(save).toHaveBeenCalledTimes(1));
    expect(padFake.setSheet).not.toHaveBeenCalled();
    expect(padFake.tear).not.toHaveBeenCalled();
  });

  it('krok 2: panel obszaru kartki zmienia ustawienia edytora (EDT-10)', async () => {
    const dialog = renderWizard();
    await choosePhoto(dialog);
    fireEvent.click(next());
    const name = within(dialog).getByRole('textbox', { name: 'Nazwa notesu' });
    expect(name).toHaveValue('Mój notes');
    expect(within(dialog).getByText(/Przeciągnij narożnik na róg kartki/)).toBeInTheDocument();

    // Nazwa jest wymagana: bez niej „Dalej” jest wyłączone.
    fireEvent.change(name, { target: { value: '  ' } });
    expect(fake.setArea).toHaveBeenLastCalledWith({ name: '  ' });
    expect(within(dialog).getByText('Wpisz nazwę notesu.')).toBeInTheDocument();
    expect(next()).toBeDisabled();
    fireEvent.change(name, { target: { value: 'Turniejowy' } });
    expect(next()).toBeEnabled();

    fireEvent.click(within(dialog).getByRole('radio', { name: 'Zielony' }));
    expect(fake.setArea).toHaveBeenLastCalledWith({ tape: '#3a9d6e' });
    fireEvent.click(within(dialog).getByRole('radio', { name: 'Ręcznie' }));
    expect(fake.setArea).toHaveBeenLastCalledWith({ mode: 'manual' });
    expect(within(dialog).getByText(/Kliknij lub dotknij krawędzi/)).toBeInTheDocument();
    fireEvent.click(within(dialog).getByRole('radio', { name: 'Z lewej' }));
    expect(fake.setArea).toHaveBeenLastCalledWith({ binding: 'left' });

    // Wygładzanie: przełącznik odsłania suwak siły 0–10.
    expect(within(dialog).queryByRole('slider', { name: 'Siła' })).not.toBeInTheDocument();
    fireEvent.click(within(dialog).getByRole('switch', { name: 'Wygładź krawędzie' }));
    expect(fake.setArea).toHaveBeenLastCalledWith({ smoothing: true });
    const strength = within(dialog).getByRole('slider', { name: 'Siła' });
    expect(strength).toHaveAttribute('max', '10');
    fireEvent.change(strength, { target: { value: '7' } });
    expect(fake.setArea).toHaveBeenLastCalledWith({ strength: 7 });

    // Rozmiar w cm: przecinek dziesiętny, zapis po wyjściu z pola; zła wartość wraca.
    const width = within(dialog).getByRole('textbox', { name: 'Szerokość kartki' });
    fireEvent.change(width, { target: { value: '12,5' } });
    fireEvent.blur(width);
    expect(fake.setArea).toHaveBeenLastCalledWith({ size: { w: 12.5 } });
    // Poza zakresem: pole od razu pokazuje wartość zapisaną przez edytor.
    fireEvent.change(width, { target: { value: '100' } });
    fireEvent.blur(width);
    expect(fake.setArea).toHaveBeenLastCalledWith({ size: { w: 60 } });
    expect(width).toHaveValue('60');
    const height = within(dialog).getByRole('textbox', { name: 'Wysokość kartki' });
    fireEvent.change(height, { target: { value: 'abc' } });
    fireEvent.blur(height);
    expect(height).toHaveValue('14,8');

    // Pasek sceny: obrót i cofnij (po zmianie jest co cofać); Ctrl+Z poza polem tekstowym.
    const toolbar = within(within(dialog).getByRole('toolbar', { name: 'Narzędzia obszaru' }));
    fireEvent.click(toolbar.getByRole('button', { name: 'Obróć w lewo' }));
    expect(fake.rotatePhoto).toHaveBeenLastCalledWith(-1);
    fireEvent.click(toolbar.getByRole('button', { name: 'Obróć w prawo' }));
    expect(fake.rotatePhoto).toHaveBeenLastCalledWith(1);
    fireEvent.click(toolbar.getByRole('button', { name: 'Cofnij (Ctrl+Z)' }));
    expect(fake.undoArea).toHaveBeenCalledTimes(1);
    fireEvent.keyDown(within(dialog).getByRole('radio', { name: 'U góry' }), {
      key: 'z',
      ctrlKey: true,
    });
    expect(fake.undoArea).toHaveBeenCalledTimes(2);
    fireEvent.keyDown(name, { key: 'z', ctrlKey: true });
    expect(fake.undoArea).toHaveBeenCalledTimes(2);

    // Powiększenie zdjęcia: bez powiększenia nie ma czego oddalać ani dopasowywać.
    expect(toolbar.getByRole('button', { name: 'Oddal (−)' })).toBeDisabled();
    expect(toolbar.getByRole('button', { name: 'Pokaż całe zdjęcie (0)' })).toBeDisabled();
    fireEvent.click(toolbar.getByRole('button', { name: 'Przybliż (+)' }));
    expect(fake.zoom).toHaveBeenLastCalledWith('in');
    update({ zoom: { level: 8, max: 8 } });
    expect(toolbar.getByRole('button', { name: 'Przybliż (+)' })).toBeDisabled();
    fireEvent.click(toolbar.getByRole('button', { name: 'Oddal (−)' }));
    expect(fake.zoom).toHaveBeenLastCalledWith('out');
    fireEvent.click(toolbar.getByRole('button', { name: 'Pokaż całe zdjęcie (0)' }));
    expect(fake.zoom).toHaveBeenLastCalledWith('fit');
  });

  it('krok 2: bez automatycznego wykrywania kartki', async () => {
    const dialog = renderWizard();
    await choosePhoto(dialog);
    fireEvent.click(next());
    expect(within(dialog).getByRole('radio', { name: 'Całe zdjęcie' })).toBeChecked();
    expect(within(dialog).getByRole('radio', { name: 'Ręcznie' })).toBeInTheDocument();
    expect(within(dialog).queryByRole('radio', { name: /Wykryj/ })).toBeNull();
  });

  it('krok 2: kolor grzbietu spoza palety jest pierwszą próbką', async () => {
    const dialog = renderWizard();
    await choosePhoto(dialog);
    update({ settings: { ...(fake.status as ScorePadEditorStatus).settings, tape: '#22304a' } });
    fireEvent.click(next());
    const custom = within(dialog).getByRole('radio', { name: 'Obecny kolor #22304a' });
    expect(custom).toBeChecked();
    expect(
      within(dialog).getAllByRole('radio', { name: /kolor|owy|ony|Różowy|Granatowy/ })[0],
    ).toBe(custom);
  });

  it('krok 3: mapowanie pól, liczby, ostrzeżenie EDT-6 i walidacja (EDT-11)', async () => {
    const dialog = renderWizard();
    await choosePhoto(dialog);
    fireEvent.click(next());
    fireEvent.click(next());
    expect(fake.goStep).toHaveBeenLastCalledWith(3);
    expect(within(dialog).getByText('Krok 3 z 5')).toBeInTheDocument();
    // Prostokąty ręczne: bez pól „Dalej” jest wyłączone, a panel mówi, czego brakuje.
    expect(await within(dialog).findByRole('radio', { name: 'Prostokąty ręczne' })).toBeChecked();
    expect(within(dialog).getByText('Narysuj na kartce pole pierwszej kategorii.')).toBeVisible();
    expect(next()).toBeDisabled();
    expect(within(dialog).getByRole('radio', { name: 'Miejsce 1' })).toBeChecked();
    expect(within(dialog).getByText('Nowa kategoria (1)')).toBeInTheDocument();
    const toolbar = within(dialog).getByRole('toolbar', { name: 'Narzędzia mapowania' });
    expect(within(toolbar).getByRole('button', { name: 'Cofnij (Ctrl+Z)' })).toBeDisabled();
    expect(within(toolbar).getByRole('button', { name: 'Dopasuj widok' })).toBeDisabled();
    fireEvent.click(within(toolbar).getByRole('button', { name: 'Przybliż (+)' }));
    expect(fake.zoom).toHaveBeenLastCalledWith('in');
    // EDT-6: mniej miejsc niż max. graczy gry (5).
    expect(
      within(dialog).getByText(
        'Notes ma 1 miejsce dla gracza, a gra pozwala na 5 graczy. Tego notesu można używać tylko w partiach do 1 graczy.',
      ),
    ).toBeVisible();

    // Pola dwóch miejsc: kafelki, nawigator kategorii, powielenie dla następnego miejsca.
    update({
      seats: 2,
      lines: [
        { label: 'Kategoria 1', kind: 'input' },
        { label: 'Kategoria 2', kind: 'input' },
      ],
      mapping: {
        ...EMPTY.mapping,
        seats: 2,
        categories: 2,
        activeSeat: 1,
        activeCategory: 1,
        selected: 2,
        canDuplicate: true,
        canUndo: true,
        hasContent: true,
        zoomed: true,
        problem: null,
      },
    });
    expect(next()).toBeEnabled();
    const tiles = dialog.querySelectorAll('.wizard-stat__number');
    expect([...tiles].map((tile) => tile.textContent)).toEqual(['2', '2']);
    expect(within(dialog).getByText('Kategoria 2 z 2')).toBeInTheDocument();
    fireEvent.click(within(dialog).getByRole('button', { name: 'Poprzednia kategoria' }));
    expect(fake.editMapping).toHaveBeenLastCalledWith({ type: 'category', category: 0 });
    fireEvent.click(within(dialog).getByRole('button', { name: 'Powiel dla miejsca 3' }));
    expect(fake.editMapping).toHaveBeenLastCalledWith({ type: 'duplicate' });
    fireEvent.click(within(dialog).getByRole('button', { name: 'Usuń 2 zaznaczone pola' }));
    expect(fake.editMapping).toHaveBeenLastCalledWith({ type: 'delete' });
    fireEvent.click(within(dialog).getByRole('radio', { name: 'Miejsce 1' }));
    expect(fake.editMapping).toHaveBeenLastCalledWith({ type: 'seat', seat: 0 });
    fireEvent.click(within(dialog).getByRole('button', { name: 'Dodaj miejsce' }));
    expect(fake.editMapping).toHaveBeenLastCalledWith({ type: 'seats', delta: 1 });
    fireEvent.click(within(toolbar).getByRole('button', { name: 'Dopasuj widok' }));
    expect(fake.editMapping).toHaveBeenLastCalledWith({ type: 'fit' });
    // Ctrl+Z w panelu (poza polem tekstowym) cofa zmianę mapowania.
    fireEvent.keyDown(within(dialog).getByRole('radio', { name: 'Miejsce 2' }), {
      key: 'z',
      ctrlKey: true,
    });
    expect(fake.editMapping).toHaveBeenLastCalledWith({ type: 'undo' });
    // Problem mapowania blokuje przejście dalej.
    update({
      mapping: {
        ...(fake.status as ScorePadEditorStatus).mapping,
        problem: 'Miejsce 2 nie ma jeszcze pól.',
      },
    });
    expect(next()).toBeDisabled();
    expect(within(dialog).getByText('Miejsce 2 nie ma jeszcze pól.')).toBeVisible();
  });

  it('krok 3: zmiana sposobu mapowania z polami wymaga potwierdzenia; anulowanie niczego nie zmienia', async () => {
    const dialog = renderWizard();
    await choosePhoto(dialog);
    fireEvent.click(next());
    fireEvent.click(next());
    await within(dialog).findByRole('radio', { name: 'Tabela' });
    update({
      mapping: { ...EMPTY.mapping, categories: 2, hasContent: true, problem: null },
    });
    const table = within(dialog).getByRole('radio', { name: 'Tabela' });
    fireEvent.click(table);
    const confirm = screen.getByRole('dialog', { name: 'Zmienić sposób mapowania?' });
    expect(within(confirm).getByText(/pola i kategorie zostaną usunięte/)).toBeInTheDocument();
    fireEvent.click(within(confirm).getByRole('button', { name: 'Anuluj' }));
    expect(screen.queryByRole('dialog', { name: 'Zmienić sposób mapowania?' })).toBeNull();
    expect(fake.editMapping).not.toHaveBeenCalled();
    expect(within(dialog).getByRole('radio', { name: 'Prostokąty ręczne' })).toBeChecked();

    fireEvent.click(within(dialog).getByRole('radio', { name: 'Tabela' }));
    fireEvent.click(
      within(screen.getByRole('dialog', { name: 'Zmienić sposób mapowania?' })).getByRole(
        'button',
        { name: 'Usuń i zmień' },
      ),
    );
    expect(fake.editMapping).toHaveBeenCalledWith({ type: 'mode', mode: 'table' });
    expect(within(dialog).getByRole('radio', { name: 'Tabela' })).toBeChecked();
    // Bez pól zmiana nie pyta.
    fireEvent.click(within(dialog).getByRole('radio', { name: 'Prostokąty ręczne' }));
    expect(screen.queryByRole('dialog', { name: 'Zmienić sposób mapowania?' })).toBeNull();
    expect(fake.editMapping).toHaveBeenLastCalledWith({ type: 'mode', mode: 'rects' });
  });

  it('krok 3: narzędzia tabeli (gracze w kolumnach lub wierszach, liczby, bez wykrywania)', async () => {
    const dialog = renderWizard();
    await choosePhoto(dialog);
    fireEvent.click(next());
    fireEvent.click(next());
    await within(dialog).findByRole('radio', { name: 'Tabela' });
    update({
      seats: 6,
      lines: Array.from({ length: 7 }, (_, i) => ({ label: `K${i}`, kind: 'input' as const })),
      mapping: {
        ...EMPTY.mapping,
        mode: 'table',
        seats: 6,
        categories: 7,
        rows: 7,
        hasContent: true,
        problem: null,
      },
    });
    // Tabelę i nazwy kategorii dopasowuje się ręcznie: bez wykrywania tabeli na zdjęciu.
    expect(within(dialog).queryByRole('button', { name: /Wykryj/ })).toBeNull();
    // 6 miejsc ≥ 5 graczy gry: bez ostrzeżenia EDT-6.
    expect(within(dialog).queryByText(/można używać tylko w partiach/)).toBeNull();
    fireEvent.click(within(dialog).getByRole('radio', { name: 'Wierszach' }));
    expect(fake.editMapping).toHaveBeenLastCalledWith({ type: 'players', players: 'rows' });
    const seats = within(dialog).getByRole('spinbutton', { name: 'Miejsca dla graczy' });
    fireEvent.keyDown(seats, { key: 'ArrowUp' });
    expect(fake.editMapping).toHaveBeenLastCalledWith({ type: 'seats', delta: 1 });
    const rows = within(dialog).getByRole('spinbutton', { name: 'Wiersze kategorii' });
    fireEvent.keyDown(rows, { key: 'ArrowDown' });
    expect(fake.editMapping).toHaveBeenLastCalledWith({ type: 'categories', delta: -1 });
    // PageUp: dziesięć kroków naraz.
    fake.editMapping.mockClear();
    fireEvent.keyDown(seats, { key: 'PageUp' });
    expect(fake.editMapping).toHaveBeenCalledTimes(10);
    fireEvent.keyDown(within(dialog).getByRole('spinbutton', { name: 'Kolumny opisu' }), {
      key: 'ArrowUp',
    });
    expect(fake.editMapping).toHaveBeenLastCalledWith({ type: 'labels', delta: 1 });
  });

  /** Kreator w kroku 4 z kategoriami z kroku 3. */
  async function openCategories() {
    const dialog = renderWizard();
    await choosePhoto(dialog);
    fireEvent.click(next());
    fireEvent.click(next());
    update(MAPPED);
    fireEvent.click(next());
    expect(within(dialog).getByText('Krok 4 z 5')).toBeInTheDocument();
    await within(dialog).findByRole('tab', { name: 'Kategorie' });
    return dialog;
  }

  it('krok 4: nazwa, typ, zakres, sumy i opis kategorii (EDT-13)', async () => {
    const dialog = await openCategories();
    expect(within(dialog).getByRole('tab', { name: 'Kategorie' })).toHaveAttribute(
      'aria-selected',
      'true',
    );
    // Nawigator ‹ „Kategoria 1 z 3” ›; kategorię wybiera się też na kartce.
    expect(within(dialog).getByRole('button', { name: 'Poprzednia kategoria' })).toBeDisabled();
    fireEvent.click(within(dialog).getByRole('button', { name: 'Następna kategoria' }));
    expect(fake.editCategories).toHaveBeenLastCalledWith({ type: 'select', index: 1 });
    expect(within(dialog).getByText('Kategoria 2 z 3')).toBeInTheDocument();

    const name = within(dialog).getByRole('textbox', { name: 'Nazwa' });
    expect(name).toHaveValue('Ptaki');
    fireEvent.change(name, { target: { value: 'Ptaki na planszy' } });
    expect(fake.editCategories).toHaveBeenLastCalledWith({
      type: 'update',
      index: 1,
      patch: { label: 'Ptaki na planszy' },
    });
    expect(within(dialog).getByRole('radio', { name: 'Punktacja' })).toBeChecked();

    // Zakres min–max–krok: tylko liczby całkowite trafiają do edytora.
    expect(within(dialog).getByRole('radio', { name: 'Min–max' })).toBeChecked();
    const max = within(dialog).getByRole('textbox', { name: 'Max' });
    fireEvent.change(max, { target: { value: '12,5' } });
    expect(within(dialog).getByText('Wpisz liczbę całkowitą.')).toBeVisible();
    expect(fake.editCategories).not.toHaveBeenCalledWith(
      expect.objectContaining({ patch: { max: 12.5 } }),
    );
    fireEvent.change(max, { target: { value: '120' } });
    expect(fake.editCategories).toHaveBeenLastCalledWith({
      type: 'update',
      index: 1,
      patch: { max: 120 },
    });
    // Lista wartości.
    fireEvent.click(within(dialog).getByRole('radio', { name: 'Lista wartości' }));
    expect(fake.editCategories).toHaveBeenLastCalledWith({
      type: 'update',
      index: 1,
      patch: { range: 'list' },
    });
    fireEvent.change(within(dialog).getByRole('textbox', { name: 'Dozwolone wartości' }), {
      target: { value: '0, 3, 7' },
    });
    expect(fake.editCategories).toHaveBeenLastCalledWith({
      type: 'update',
      index: 1,
      patch: { values: [0, 3, 7] },
    });
    fireEvent.change(within(dialog).getByRole('textbox', { name: /Opis/ }), {
      target: { value: '1 pkt za ptaka' },
    });
    expect(fake.editCategories).toHaveBeenLastCalledWith({
      type: 'update',
      index: 1,
      patch: { hint: '1 pkt za ptaka' },
    });

    // Suma: „Sumuje kategorie” zamiast zakresu.
    fireEvent.click(within(dialog).getByRole('button', { name: 'Następna kategoria' }));
    expect(within(dialog).getByRole('radio', { name: 'Suma' })).toBeChecked();
    expect(within(dialog).queryByRole('radio', { name: 'Min–max' })).toBeNull();
    const chip = within(dialog).getByRole('checkbox', { name: 'Ptaki na planszy' });
    expect(chip).toBeChecked();
    fireEvent.click(chip);
    expect(fake.editCategories).toHaveBeenLastCalledWith({
      type: 'update',
      index: 2,
      patch: { of: [] },
    });
    // Typ kategorii.
    fireEvent.click(within(dialog).getByRole('radio', { name: 'Puste pole' }));
    expect(fake.editCategories).toHaveBeenLastCalledWith({
      type: 'update',
      index: 2,
      patch: { kind: 'skip' },
    });
  });

  it('krok 4: problemy walidatora blokują „Dalej” (dokładnie jedna nazwa gracza)', async () => {
    const dialog = await openCategories();
    expect(next()).toBeEnabled();
    update({
      categories: {
        ...(fake.status as ScorePadEditorStatus).categories,
        issues: [
          { code: 'names-count', path: 'lines' },
          { code: 'invalid-range', path: 'lines[1]' },
        ],
      },
    });
    expect(next()).toBeDisabled();
    expect(
      within(dialog).getByText('Notes musi mieć dokładnie jedną kategorię typu „Nazwa gracza”.'),
    ).toBeVisible();
    expect(
      within(dialog).getByText(
        'Kategoria „Ptaki”: min nie może być większe od max, a krok musi wynosić co najmniej 1.',
      ),
    ).toBeVisible();
    expect(pill(/Test i zapis/)).toBeDisabled();
    update({ categories: { ...(fake.status as ScorePadEditorStatus).categories, issues: [] } });
    expect(next()).toBeEnabled();
  });

  it('krok 4: kategoria decydująca, kierunek i uporządkowane reguły remisów (EDT-2…EDT-4)', async () => {
    const dialog = await openCategories();
    update({
      categories: {
        ...(fake.status as ScorePadEditorStatus).categories,
        lines: [
          category('n', 'Gracze', 'names'),
          category('a', 'Ptaki', 'input'),
          category('b', 'Jajka', 'input'),
          category('c', 'Żywność', 'input'),
          category('s', 'Suma', 'total', { of: ['a', 'b', 'c'] }),
        ],
      },
    });
    fireEvent.click(within(dialog).getByRole('tab', { name: 'Wygrana i remisy' }));
    expect(fake.editCategories).toHaveBeenLastCalledWith({ type: 'view', view: 'ranking' });
    expect(
      within(dialog).getByRole('button', { name: /^Kategoria decydująca o miejscu/ }),
    ).toHaveTextContent('Suma');
    expect(within(dialog).getByRole('radio', { name: 'Więcej = lepiej' })).toBeChecked();
    fireEvent.click(within(dialog).getByRole('radio', { name: 'Mniej = lepiej' }));
    expect(fake.editCategories).toHaveBeenLastCalledWith({
      type: 'ranking',
      ranking: { line: 's', dir: 'asc', tiebreak: [] },
    });
    // Końcowe „Wspólne miejsce” jest zawsze na liście.
    const rules = within(dialog).getByRole('list', { name: 'Remisy' });
    expect(
      within(rules)
        .getAllByRole('listitem')
        .map((row) => row.textContent),
    ).toEqual(['1Wspólne miejsceGracze nadal zremisowani zajmują to samo miejsce.']);

    // Dwie reguły: pierwsza wolna kategoria, potem wybrana z listy.
    fireEvent.click(within(dialog).getByRole('button', { name: 'Dodaj regułę' }));
    fireEvent.click(within(dialog).getByRole('button', { name: 'Dodaj' }));
    expect(fake.editCategories).toHaveBeenLastCalledWith({
      type: 'ranking',
      ranking: { line: 's', dir: 'asc', tiebreak: [{ type: 'line', line: 'a', dir: 'desc' }] },
    });
    fireEvent.click(within(dialog).getByRole('button', { name: 'Dodaj regułę' }));
    const editing = dialog.querySelector('.wizard-rule--editing') as HTMLElement;
    fireEvent.click(within(editing).getByRole('button', { name: /^Kategoria reguły/ }));
    fireEvent.click(screen.getByRole('option', { name: /Jajka/ }));
    fireEvent.click(within(editing).getByRole('radio', { name: 'Mniej = lepiej' }));
    fireEvent.click(within(dialog).getByRole('button', { name: 'Dodaj' }));
    expect(fake.editCategories).toHaveBeenLastCalledWith({
      type: 'ranking',
      ranking: {
        line: 's',
        dir: 'asc',
        tiebreak: [
          { type: 'line', line: 'a', dir: 'desc' },
          { type: 'line', line: 'b', dir: 'asc' },
        ],
      },
    });
    expect(
      within(within(dialog).getByRole('list', { name: 'Remisy' }))
        .getAllByRole('listitem')
        .map((row) => row.querySelector('.wizard-rule__title')?.textContent),
    ).toEqual(['Ptaki', 'Jajka', 'Wspólne miejsce']);
    // W trakcie zmiany reguły pozostałe przyciski reguł czekają (indeks się nie przesuwa),
    // a kategoria użyta w innej regule nie jest do wyboru.
    fireEvent.click(within(dialog).getByRole('button', { name: 'Zmień regułę 1' }));
    expect(within(dialog).getByRole('button', { name: 'Usuń regułę 2' })).toBeDisabled();
    expect(within(dialog).getByRole('button', { name: 'Dodaj regułę' })).toBeDisabled();
    fireEvent.click(within(dialog).getByRole('button', { name: /^Kategoria reguły/ }));
    expect(screen.getAllByRole('option').map((o) => o.textContent)).toEqual([
      'PtakiPunktacja',
      'ŻywnośćPunktacja',
    ]);
    fireEvent.click(screen.getByRole('option', { name: /Ptaki/ }));
    fireEvent.click(within(dialog).getByRole('button', { name: 'Anuluj' }));

    // Kolejność i usuwanie.
    fireEvent.click(within(dialog).getByRole('button', { name: 'Przesuń regułę 2 wyżej' }));
    expect(fake.editCategories).toHaveBeenLastCalledWith({
      type: 'ranking',
      ranking: {
        line: 's',
        dir: 'asc',
        tiebreak: [
          { type: 'line', line: 'b', dir: 'asc' },
          { type: 'line', line: 'a', dir: 'desc' },
        ],
      },
    });
    fireEvent.click(within(dialog).getByRole('button', { name: 'Usuń regułę 1' }));
    expect(fake.editCategories).toHaveBeenLastCalledWith({
      type: 'ranking',
      ranking: { line: 's', dir: 'asc', tiebreak: [{ type: 'line', line: 'a', dir: 'desc' }] },
    });
    // Zmiana reguły: kliknięcie wiersza otwiera wybór kategorii i kierunku.
    fireEvent.click(within(dialog).getByRole('button', { name: 'Zmień regułę 1' }));
    fireEvent.click(within(dialog).getByRole('button', { name: 'Zapisz regułę' }));
    expect(fake.editCategories).toHaveBeenLastCalledWith({
      type: 'ranking',
      ranking: { line: 's', dir: 'asc', tiebreak: [{ type: 'line', line: 'a', dir: 'desc' }] },
    });
  });

  it('krok 4: notes bez sumy decyduje sumą wszystkich punktacji; reguły po wyborze kategorii', async () => {
    const dialog = await openCategories();
    update({
      categories: {
        ...(fake.status as ScorePadEditorStatus).categories,
        view: 'ranking',
        lines: [category('n', 'Gracze', 'names'), category('a', 'Ptaki', 'input')],
        ranking: { line: '__total', dir: 'desc', tiebreak: [] },
      },
    });
    expect(
      within(dialog).getByRole('button', { name: /^Kategoria decydująca o miejscu/ }),
    ).toHaveTextContent('Suma wszystkich punktacji');
    expect(within(dialog).getByText(/Notes nie ma sumy/)).toBeVisible();
    expect(within(dialog).getByRole('radio', { name: 'Mniej = lepiej' })).toBeDisabled();
    expect(within(dialog).getByRole('button', { name: 'Dodaj regułę' })).toBeDisabled();
  });
});
