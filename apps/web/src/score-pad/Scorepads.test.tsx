import type { SupabaseClient } from '@supabase/supabase-js';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { fireEvent, render, screen, waitFor, within } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';
import { AuthContext, type AuthContextValue } from '../auth/authContext';
import type { Game } from '../games/games';
import { Hub } from '../hub/Hub';
import { PopupRouter } from '../popups/PopupRouter';
import type { Profile } from '../profile/profiles';
import { ToastProvider } from '../ui';
import type { Scorepad } from './scorepads';

/*
 * Popup notesów gry (PRD GAME-7, EDT-6, zadanie [015]): lista z liczbą miejsc i wersją,
 * ostrzeżenie o zbyt małej liczbie miejsc, import pliku `.json`, zmiana nazwy i usuwanie.
 * Supabase jest atrapą. Dane są fikcyjne.
 */

const ADA: Profile = {
  id: '00000000-0000-4000-a000-000000000001',
  hook: 'ada-test-0001',
  first_name: 'Ada',
  last_name: 'Testowa',
  role: 'admin',
  avatar_path: null,
  deleted_at: null,
};
const BEA: Profile = { ...ADA, id: '00000000-0000-4000-a000-000000000002', role: 'player' };

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

function pad(n: number, name: string, seats: number, version: number): Scorepad {
  const id = `00000000-0000-4000-d000-00000000000${n}`;
  return {
    id,
    game_id: GAME.id,
    name,
    created_at: `2026-10-0${n}T12:00:00Z`,
    current: {
      id: `00000000-0000-4000-e000-00000000000${n}`,
      version,
      image_path: `${GAME.id}/${id}-v${version}.jpg`,
      player_slots: seats,
      created_at: `2026-10-0${n}T12:00:00Z`,
    },
  };
}

const TURNIEJ = pad(1, 'Turniejowy', 5, 2);
const MALY = pad(2, 'Mały', 3, 1);

const TEMPLATE = {
  v: 2,
  id: 'n-plik',
  name: 'Z pliku',
  size: { w: 10, h: 14 },
  tape: '#2c3a46',
  image: 'data:image/jpeg;base64,/9j/4AAQ',
  grid: { x: [0, 0.25, 0.5, 0.75, 1], y: [0, 0.5, 1], players: 'cols', labels: 1 },
  lines: [
    { id: 'names', label: 'Gracze', kind: 'names' },
    { id: 'a', label: 'Punkty', kind: 'input', free: true },
  ],
};

function fakeClient(pads: Scorepad[]) {
  const db = { pads: [...pads] };
  const updates: { row: Record<string, unknown>; id: unknown }[] = [];
  const from = vi.fn((table: string) => {
    let rows: unknown[] =
      table === 'profiles'
        ? [ADA, BEA]
        : table === 'club'
          ? [{ name: 'Planszówki', logo_path: null, timezone: 'Europe/Warsaw' }]
          : table === 'game_collection'
            ? [GAME]
            : table === 'scorepads'
              ? db.pads
              : [];
    let update: Record<string, unknown> | undefined;
    const filters: Record<string, unknown> = {};
    const query = {
      select: () => query,
      order: () => query,
      limit: () => query,
      returns: () => query,
      update: (row: Record<string, unknown>) => {
        update = row;
        return query;
      },
      eq: (column: string, value: string) => {
        filters[column] = value;
        rows = rows.filter((row) => (row as Record<string, unknown>)[column] === value);
        return query;
      },
      is: () => query,
      single: async () => {
        if (update) {
          updates.push({ row: update, id: filters.id });
          db.pads = db.pads.map((p) => (p.id === filters.id ? { ...p, ...update } : p));
        }
        return { data: rows[0] ?? null, error: null };
      },
      maybeSingle: async () => ({ data: rows[0] ?? null, error: null }),
      then: (resolve: (value: unknown) => unknown) => {
        if (update) {
          updates.push({ row: update, id: filters.id });
          db.pads = db.pads.filter((p) => p.id !== filters.id);
        }
        return Promise.resolve({ data: rows, error: null, count: rows.length }).then(resolve);
      },
    };
    return query;
  });
  const rpc = vi.fn((name: string, args: Record<string, unknown>) => {
    if (name === 'save_scorepad') {
      db.pads.push({
        ...pad(3, String(args.name), Number(args.player_slots), 1),
        id: String(args.scorepad_id),
      });
    }
    return {
      select: () => ({
        then: (resolve: (value: unknown) => unknown) =>
          Promise.resolve({ data: name === 'search_games' ? [GAME] : [], error: null }).then(
            resolve,
          ),
      }),
      single: async () => ({ data: { version: 1 }, error: null }),
    };
  });
  const upload = vi.fn(async () => ({ data: {}, error: null }));
  const storage = {
    from: () => ({
      createSignedUrl: async (path: string) => ({
        data: { signedUrl: `https://storage.test/${path}` },
        error: null,
      }),
      upload,
      remove: vi.fn(async () => ({ data: [], error: null })),
    }),
  };
  return { client: { from, rpc, storage } as unknown as SupabaseClient, db, updates, rpc, upload };
}

function renderPopup(pads: Scorepad[], me: Profile = ADA, search = `?p=game/${GAME.id}/scorepads`) {
  window.history.replaceState(null, '', `/${search}`);
  const fake = fakeClient(pads);
  const auth = {
    client: fake.client,
    state: { status: 'signedIn', session: { user: { id: me.id } } },
    signIn: vi.fn(),
    signOut: vi.fn(async () => undefined),
  } as unknown as AuthContextValue;
  const queryClient = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  render(
    <QueryClientProvider client={queryClient}>
      <ToastProvider>
        <AuthContext.Provider value={auth}>
          <PopupRouter>
            <Hub me={{ ...me, theme: 'system', password_change_suggested: false }} />
          </PopupRouter>
        </AuthContext.Provider>
      </ToastProvider>
    </QueryClientProvider>,
  );
  return fake;
}

/** Popup po wczytaniu danych (okno z treścią zastępuje okno ze spinnerem). */
async function loaded(name: string, text: string | RegExp) {
  await screen.findByText(text);
  return screen.getByRole('dialog', { name });
}

describe('notesy gry (GAME-7)', () => {
  it('lista: nazwa, miejsca, wersja i ostrzeżenie EDT-6', async () => {
    renderPopup([TURNIEJ, MALY]);
    const dialog = await loaded('Notesy', 'Turniejowy');
    const list = within(dialog).getByRole('list', { name: 'Notesy gry Żółwie Wyścigi' });
    const rows = within(list).getAllByRole('listitem');
    expect(rows).toHaveLength(2);
    expect(rows[0]).toHaveTextContent('Turniejowy5 miejsc dla graczy · wersja 2');
    expect(rows[0]).not.toHaveTextContent('Tylko partie');
    expect(rows[1]).toHaveTextContent('Mały3 miejsca dla graczy · wersja 1');
    expect(rows[1]).toHaveTextContent('Tylko partie do 3 graczy');
    expect(within(dialog).getAllByText('2 notesy').length).toBeGreaterThan(0);
    expect(within(dialog).getByText('Żółwie Wyścigi · 2–5 graczy')).toBeInTheDocument();
  });

  it('pusty stan i przycisk „Dodaj notes” otwierający edytor', async () => {
    renderPopup([]);
    const dialog = await loaded('Notesy', 'Gra nie ma jeszcze notesu');
    fireEvent.click(within(dialog).getByRole('button', { name: 'Dodaj notes' }));
    expect(await screen.findByRole('dialog', { name: /Nowy notes/ })).toBeInTheDocument();
    expect(window.location.search).toBe(
      `?p=game/${GAME.id}/scorepads&p=game/${GAME.id}/scorepads/new`,
    );
  });

  it('gracz widzi listę bez akcji', async () => {
    renderPopup([TURNIEJ], BEA);
    const dialog = await loaded('Notesy', 'Turniejowy');
    expect(within(dialog).queryByRole('button', { name: 'Dodaj notes' })).not.toBeInTheDocument();
    expect(within(dialog).queryByRole('button', { name: /Akcje notesu/ })).not.toBeInTheDocument();
  });

  it('import pliku .json: nowy notes, toast i ostrzeżenie EDT-6', async () => {
    const fake = renderPopup([TURNIEJ]);
    const dialog = await loaded('Notesy', 'Turniejowy');
    const input = within(dialog).getByLabelText('Plik notesu (.json)');
    const json = JSON.stringify({ format: 'score-pad', version: 2, template: TEMPLATE });
    fireEvent.change(input, {
      target: { files: [new File([json], 'notes.json', { type: 'application/json' })] },
    });
    expect(await screen.findByText('Zaimportowano notes Z pliku')).toBeInTheDocument();
    expect(fake.upload).toHaveBeenCalledTimes(1);
    expect(fake.rpc).toHaveBeenCalledWith(
      'save_scorepad',
      expect.objectContaining({ game_id: GAME.id, name: 'Z pliku', player_slots: 3 }),
    );
    expect(
      await within(dialog).findByText(/Tego notesu można używać tylko w partiach do 3 graczy/),
    ).toBeInTheDocument();
    await waitFor(() => expect(within(dialog).getAllByRole('listitem')).toHaveLength(2));
  });

  it('import błędnego pliku pokazuje komunikat i niczego nie zapisuje', async () => {
    const fake = renderPopup([TURNIEJ]);
    const dialog = await loaded('Notesy', 'Turniejowy');
    fireEvent.change(within(dialog).getByLabelText('Plik notesu (.json)'), {
      target: { files: [new File(['{"format":"inny"}'], 'x.json')] },
    });
    expect(
      await within(dialog).findByText(/To nie jest plik notesu w formacie v2/),
    ).toBeInTheDocument();
    expect(fake.upload).not.toHaveBeenCalled();
    expect(fake.rpc).not.toHaveBeenCalledWith('save_scorepad', expect.anything());
  });

  it('zmiana nazwy bez nowej wersji', async () => {
    const fake = renderPopup([TURNIEJ], ADA, `?p=scorepad/${TURNIEJ.id}/rename`);
    const field = await screen.findByLabelText('Nazwa notesu');
    const dialog = screen.getByRole('dialog', { name: 'Zmień nazwę notesu' });
    expect(field).toHaveValue('Turniejowy');
    fireEvent.change(field, { target: { value: '' } });
    fireEvent.click(within(dialog).getByRole('button', { name: 'Zapisz' }));
    expect(await within(dialog).findByText('Wpisz nazwę notesu.')).toBeInTheDocument();
    fireEvent.change(field, { target: { value: '  Finałowy ' } });
    fireEvent.click(within(dialog).getByRole('button', { name: 'Zapisz' }));
    expect(await screen.findByText('Zmieniono nazwę notesu na Finałowy')).toBeInTheDocument();
    expect(fake.updates).toEqual([{ row: { name: 'Finałowy' }, id: TURNIEJ.id }]);
    expect(fake.rpc).not.toHaveBeenCalledWith('save_scorepad', expect.anything());
  });

  it('usunięcie notesu jest miękkie', async () => {
    const fake = renderPopup([TURNIEJ], ADA, `?p=scorepad/${TURNIEJ.id}/delete`);
    const dialog = await loaded('Usunąć notes?', /„Turniejowy” zniknie z listy/);
    fireEvent.click(within(dialog).getByRole('button', { name: 'Usuń' }));
    expect(await screen.findByText('Usunięto notes Turniejowy')).toBeInTheDocument();
    expect(fake.updates[0]?.row).toHaveProperty('deleted_at');
  });

  it('gracz nie otworzy edytora, zmiany nazwy ani usuwania z linku', async () => {
    renderPopup([TURNIEJ], BEA, `?p=scorepad/${TURNIEJ.id}/delete`);
    expect(await screen.findByRole('dialog', { name: 'Nie znaleziono' })).toBeInTheDocument();
  });

  it('kolekcja: menu gry ma „Notesy”', async () => {
    renderPopup([TURNIEJ], ADA, '?p=games');
    fireEvent.click(await screen.findByRole('button', { name: 'Akcje gry Żółwie Wyścigi' }));
    fireEvent.click(await screen.findByRole('menuitem', { name: 'Notesy' }));
    expect(await screen.findByRole('dialog', { name: 'Notesy' })).toBeInTheDocument();
    expect(window.location.search).toBe(`?p=games&p=game/${GAME.id}/scorepads`);
  });
});
