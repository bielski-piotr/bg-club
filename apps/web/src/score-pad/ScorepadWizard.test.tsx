import type { ScorePadEditorStatus, ScorePadTemplate } from '@bg-club/score-pad';
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
  min_players: 2,
  max_players: 5,
  placement_points: [10, 6, 4, 2, 1],
  created_at: '2026-10-01T12:00:00Z',
  last_played_at: null,
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
  dirty: false,
  openFailed: false,
};
const MAPPED: Partial<ScorePadEditorStatus> = {
  fields: null,
  seats: 3,
  lines: [
    { label: 'Gracze', kind: 'names' },
    { label: 'Ptaki', kind: 'input' },
    { label: 'Suma', kind: 'total' },
  ],
  sheetUrl: 'data:image/jpeg;base64,sheet',
};

/** Atrapa `<score-pad-editor>`: stan, który kreator czyta, i wywołania z kreatora. */
const fake = vi.hoisted(() => ({
  status: null as ScorePadEditorStatus | null,
  emit: (() => undefined) as (status: ScorePadEditorStatus) => void,
  goStep: vi.fn(),
  loadPhoto: vi.fn(),
  loadTemplate: vi.fn(),
  failPhoto: false,
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
      exportConfig: () => ({ format: 'score-pad', version: 2, template: TEMPLATE }),
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
      goStep: (step: 1 | 2 | 3) => {
        fake.goStep(step);
        update({ step });
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
    // Krok 4: kategorie z kroku 3 (pełna konfiguracja: zadanie [019]).
    const list = within(dialog).getByRole('list', { name: 'Kategorie notesu' });
    expect(
      within(list)
        .getAllByRole('listitem')
        .map((row) => row.textContent),
    ).toEqual(['1GraczeNazwa gracza', '2PtakiPunktacja', '3SumaSuma']);

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
    expect(within(dialog).getByRole('img', { name: 'Kartka notesu' })).toBeInTheDocument();
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
});
