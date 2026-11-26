import type { SupabaseClient } from '@supabase/supabase-js';
import { complexityPoints } from '@bg-club/scoring';
import { QueryClient } from '@tanstack/query-core';
import { QueryClientContext } from '../lib/queryClient';
import { fireEvent, render, screen, waitFor, within } from '@solidjs/testing-library';
import { describe, expect, it, vi } from 'vitest';
import { AuthContext, type AuthContextValue } from '../auth/authContext';
import { Hub } from './Hub';
import { PopupRouter } from '../popups/PopupRouter';
import type { Profile } from '../profile/profileQueries';
import { normalizeSearch, ToastProvider } from '../ui';
import type { Game } from '../games/games';

/*
 * Kolekcja gier w hubie (PRD GAME-1…GAME-6, GAME-8): widżet, popup z wyszukiwaniem,
 * formularze admina i usuwanie. PostgREST jest atrapą; wyszukiwanie w atrapie naśladuje
 * `search_games` (bez wielkości liter i polskich znaków). Dane są fikcyjne.
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
const BEA: Profile = {
  ...ADA,
  id: '00000000-0000-4000-a000-000000000002',
  hook: 'bea-test-0002',
  first_name: 'Bea',
  role: 'player',
};

function game(n: number, title: string, extra: Partial<Game> = {}): Game {
  return {
    id: `00000000-0000-4000-b000-${String(n).padStart(12, '0')}`,
    title,
    cover_path: null,
    min_players: 2,
    max_players: 4,
    placement_points: [10, 6, 4, 2],
    // Gra sprzed wprowadzenia skomplikowania (GAME-5).
    complexity: null,
    created_at: `2026-10-${String(n).padStart(2, '0')}T12:00:00Z`,
    last_played_at: null,
    base_game_id: null,
    cover_source_path: null,
    cover_crop: null,
    play_count: null,
    available: true,
    ...extra,
  };
}

const ZOLWIE = game(1, 'Żółwie Wyścigi', { last_played_at: '2026-11-06T19:00:00Z' });
const LAKA = game(2, 'Łąka i Pszczoły', { min_players: 1, max_players: 1, placement_points: [5] });
const GRA = game(3, 'Gra Planszowa');

interface Write {
  readonly op: 'insert' | 'update';
  readonly row: Record<string, unknown>;
  readonly filters: Record<string, unknown>;
}

function fakeClient(initial: Game[]) {
  const db = { games: [...initial] };
  const writes: Write[] = [];
  const searches: string[] = [];
  const active = () => db.games.filter((g) => !('deleted' in g));

  const from = vi.fn((table: string) => {
    let rows: unknown[] =
      table === 'profiles'
        ? [ADA, BEA]
        : table === 'club'
          ? [{ name: 'Planszówki', logo_path: null, timezone: 'Europe/Warsaw' }]
          : table === 'game_collection'
            ? active()
            : [];
    let write: Write | undefined;
    const filters: Record<string, unknown> = {};
    const query = {
      select: () => query,
      order: () => query,
      limit: (n: number) => {
        rows = rows.slice(0, n);
        return query;
      },
      returns: () => query,
      insert: (row: Record<string, unknown>) => {
        write = { op: 'insert', row, filters };
        return query;
      },
      update: (row: Record<string, unknown>) => {
        write = { op: 'update', row, filters };
        return query;
      },
      eq: (column: string, value: string) => {
        filters[column] = value;
        if (column === 'id') rows = rows.filter((row) => (row as Game).id === value);
        return query;
      },
      is: (column: string, value: null) => {
        filters[`${column} is`] = value;
        if (table === 'profiles') rows = rows.filter((row) => (row as Profile).deleted_at === null);
        return query;
      },
      single: async () => {
        if (!write) return { data: rows[0] ?? null, error: null };
        return commit(write);
      },
      maybeSingle: async () => ({ data: rows[0] ?? null, error: null }),
      then: (resolve: (value: unknown) => unknown) => {
        if (write) return Promise.resolve(commit(write)).then(resolve);
        return Promise.resolve({ data: rows, error: null, count: active().length }).then(resolve);
      },
    };
    const commit = (pending: Write) => {
      writes.push(pending);
      if (pending.op === 'insert') {
        const created = { ...game(99, ''), ...pending.row } as Game;
        db.games.push(created);
        return { data: created, error: null };
      }
      const id = pending.filters.id;
      db.games = db.games.map((g) =>
        g.id === id
          ? pending.row.deleted_at
            ? ({ ...g, deleted: true } as Game)
            : ({ ...g, ...pending.row } as Game)
          : g,
      );
      return { data: db.games.find((g) => g.id === id) ?? null, error: null };
    };
    return query;
  });

  const rpc = vi.fn((name: string, args: { query: string }) => {
    if (name !== 'search_games') throw new Error(`nieznana funkcja ${name}`);
    searches.push(args.query);
    const needle = normalizeSearch(args.query);
    const result = active()
      .filter((g) => normalizeSearch(g.title).includes(needle))
      .sort((a, b) => normalizeSearch(a.title).localeCompare(normalizeSearch(b.title)));
    const builder = {
      select: () => builder,
      then: (resolve: (value: unknown) => unknown) =>
        Promise.resolve({ data: result, error: null }).then(resolve),
    };
    return builder;
  });

  const storage = {
    from: () => ({
      createSignedUrl: async (path: string) => ({
        data: { signedUrl: `https://storage.test/${path}` },
        error: null,
      }),
      upload: vi.fn(async () => ({ data: {}, error: null })),
      remove: vi.fn(async () => ({ data: [], error: null })),
    }),
  };
  return {
    client: { from, rpc, storage } as unknown as SupabaseClient,
    db,
    writes,
    searches,
  };
}

function renderHub(games: Game[], me: Profile = ADA, search = '') {
  window.history.replaceState(null, '', `/${search}`);
  const fake = fakeClient(games);
  const auth = {
    client: fake.client,
    state: { status: 'signedIn', session: { user: { id: me.id } } },
    signIn: vi.fn(),
    signOut: vi.fn(async () => undefined),
  } as unknown as AuthContextValue;
  const queryClient = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  render(() => (
    <QueryClientContext value={queryClient}>
      <ToastProvider>
        <AuthContext value={auth}>
          <PopupRouter>
            <Hub me={{ ...me, theme: 'system', password_change_suggested: false }} />
          </PopupRouter>
        </AuthContext>
      </ToastProvider>
    </QueryClientContext>
  ));
  return fake;
}

describe('widżet kolekcji (GAME-1, CLUB-4)', () => {
  it('pusta kolekcja: admin ma „Dodaj grę”, gracz sam pusty stan', async () => {
    renderHub([]);
    const widget = await screen.findByRole('region', { name: 'Kolekcja' });
    expect(await within(widget).findByText('Kolekcja jest pusta')).toBeInTheDocument();
    expect(within(widget).getByText('0 gier')).toBeInTheDocument();
    fireEvent.click(within(widget).getByRole('button', { name: 'Dodaj grę' }));
    expect(await screen.findByRole('dialog', { name: 'Dodaj grę' })).toBeInTheDocument();
    expect(window.location.search).toBe('?p=games/new');
  });

  it('gracz nie ma przycisku dodawania', async () => {
    renderHub([], BEA);
    const widget = await screen.findByRole('region', { name: 'Kolekcja' });
    expect(await within(widget).findByText('Kolekcja jest pusta')).toBeInTheDocument();
    expect(within(widget).queryByRole('button', { name: 'Dodaj grę' })).not.toBeInTheDocument();
  });

  it('pokazuje gry w kolejności z bazy, licznik i „Zobacz więcej”', async () => {
    renderHub([ZOLWIE, LAKA, GRA]);
    const widget = await screen.findByRole('region', { name: 'Kolekcja' });
    expect(await within(widget).findByText('3 gry')).toBeInTheDocument();
    const links = within(widget).getAllByRole('link');
    expect(links.map((link) => link.textContent)).toEqual([
      'Zobacz więcej',
      'ŻWŻółwie Wyścigi2–4 graczy',
      'ŁŁąka i Pszczoły1 gracz',
      'GGra Planszowa2–4 graczy',
    ]);
    fireEvent.click(within(widget).getByRole('link', { name: 'Zobacz więcej' }));
    expect(await screen.findByRole('dialog', { name: 'Kolekcja' })).toBeInTheDocument();
    expect(window.location.search).toBe('?p=games');
  });
});

describe('popup kolekcji (GAME-2, GAME-3)', () => {
  it('wyszukuje na bieżąco w bazie bez polskich znaków', async () => {
    const { searches } = renderHub([ZOLWIE, LAKA, GRA], ADA, '?p=games');
    const dialog = await screen.findByRole('dialog', { name: 'Kolekcja' });
    const grid = await within(dialog).findByRole('list', { name: 'Gry w kolekcji' });
    expect(
      within(grid)
        .getAllByRole('listitem')
        .map((item) => item.querySelector('.game-tile__title')?.textContent),
    ).toEqual(['Gra Planszowa', 'Łąka i Pszczoły', 'Żółwie Wyścigi']);
    // Licznik jest w nagłówku (desktop) i pod wyszukiwarką (telefon), DS §7.
    expect(within(dialog).getAllByText('3 gry').length).toBeGreaterThan(0);

    // Szybkie pisanie: zapytanie idzie dopiero po przerwie, więc bez „Z” i „ZO”.
    const box = within(dialog).getByRole('searchbox', { name: 'Szukaj gry' });
    for (const value of ['Z', 'ZO', 'ZOLW']) fireEvent.input(box, { target: { value } });
    await waitFor(() => expect(within(dialog).getAllByRole('listitem')).toHaveLength(1));
    expect(within(dialog).getByText('Żółwie Wyścigi')).toBeInTheDocument();
    expect(searches).toEqual(['', 'ZOLW']);

    fireEvent.input(within(dialog).getByRole('searchbox', { name: 'Szukaj gry' }), {
      target: { value: 'szachy' },
    });
    expect(await within(dialog).findByText('Żadna gra nie pasuje do „szachy”')).toBeInTheDocument();
  });

  it('gracz nie widzi akcji admina', async () => {
    renderHub([ZOLWIE], BEA, '?p=games');
    const dialog = await screen.findByRole('dialog', { name: 'Kolekcja' });
    expect(await within(dialog).findByText('Żółwie Wyścigi')).toBeInTheDocument();
    expect(within(dialog).queryByRole('button', { name: /Dodaj/ })).not.toBeInTheDocument();
    expect(within(dialog).queryByRole('button', { name: /Akcje gry/ })).not.toBeInTheDocument();
  });

  it('gracz z linku do formularza widzi „Nie znaleziono”', async () => {
    renderHub([ZOLWIE], BEA, `?p=game/${ZOLWIE.id}/edit`);
    expect(await screen.findByRole('dialog', { name: 'Nie znaleziono' })).toBeInTheDocument();
  });
});

describe('formularz gry (GAME-3…GAME-5)', () => {
  it('admin dodaje grę: walidacja, pola punktów zależne od max, ostrzeżenie', async () => {
    const { writes } = renderHub([], ADA, '?p=games&p=games/new');
    const dialog = await screen.findByRole('dialog', { name: 'Dodaj grę' });
    expect(within(dialog).getByRole('button', { name: 'Wróć' })).toBeInTheDocument();
    expect(within(dialog).getAllByLabelText(/\. miejsce$/)).toHaveLength(4);

    // Puste pola: komunikaty i brak zapisu.
    fireEvent.click(within(dialog).getByRole('button', { name: 'Zapisz' }));
    expect(await within(dialog).findByText('Wpisz tytuł gry.')).toBeInTheDocument();
    expect(within(dialog).getAllByText('Wpisz punkty.')).toHaveLength(4);
    expect(within(dialog).getByText('Wpisz skomplikowanie gry.')).toBeInTheDocument();
    expect(writes).toEqual([]);

    // Max 4 → 3 usuwa ostatnie pole; min > max to błąd zakresu.
    const [minStepper, maxStepper] = within(dialog)
      .getAllByRole('spinbutton')
      .map((element) => element as HTMLElement);
    fireEvent.keyDown(maxStepper as HTMLElement, { key: 'ArrowDown' });
    await waitFor(() => expect(within(dialog).getAllByLabelText(/\. miejsce$/)).toHaveLength(3));
    fireEvent.keyDown(minStepper as HTMLElement, { key: 'ArrowUp' });
    await waitFor(() => expect(minStepper).toHaveAttribute('aria-valuenow', '2'));
    fireEvent.keyDown(minStepper as HTMLElement, { key: 'ArrowUp' });
    expect(
      await within(dialog).findByText('Max. liczba graczy nie może być mniejsza niż min.'),
    ).toBeInTheDocument();
    fireEvent.keyDown(minStepper as HTMLElement, { key: 'ArrowDown' });
    await waitFor(() => expect(minStepper).toHaveAttribute('aria-valuenow', '3'));
    fireEvent.keyDown(minStepper as HTMLElement, { key: 'ArrowDown' });
    await waitFor(() => expect(minStepper).toHaveAttribute('aria-valuenow', '2'));

    fireEvent.input(within(dialog).getByLabelText('Tytuł'), {
      target: { value: '  Kolejka Górska ' },
    });
    // Skomplikowanie przelicza punkty ze wzoru (GAME-5); można je potem poprawić.
    fireEvent.input(within(dialog).getByLabelText('Skomplikowanie'), { target: { value: '1' } });
    await waitFor(() => expect(within(dialog).getByLabelText('1. miejsce')).toHaveValue('20,6'));
    expect(within(dialog).getByLabelText('3. miejsce')).toHaveValue('2,1');
    fireEvent.input(within(dialog).getByLabelText('1. miejsce'), { target: { value: '5' } });
    fireEvent.input(within(dialog).getByLabelText('2. miejsce'), { target: { value: '-1' } });
    fireEvent.input(within(dialog).getByLabelText('3. miejsce'), { target: { value: '7' } });
    expect(
      await within(dialog).findByText(
        'Wpisz liczbę 0 lub większą, najwyżej z dwoma miejscami po przecinku.',
      ),
    ).toBeInTheDocument();
    expect(within(dialog).getByText(/różnią się od wyliczonych ze wzoru/)).toBeInTheDocument();
    // Rosnąca punktacja: ostrzeżenie bez blokady (GAME-5).
    expect(within(dialog).getByText(/Niższe miejsce ma więcej punktów/)).toBeInTheDocument();
    fireEvent.input(within(dialog).getByLabelText('2. miejsce'), { target: { value: '3' } });

    fireEvent.click(within(dialog).getByRole('button', { name: 'Zapisz' }));
    expect(await screen.findByText('Dodano grę Kolejka Górska')).toBeInTheDocument();
    expect(writes).toHaveLength(1);
    expect(writes[0]).toMatchObject({
      op: 'insert',
      row: {
        title: 'Kolejka Górska',
        min_players: 2,
        max_players: 3,
        complexity: 1,
        placement_points: [5, 3, 7],
      },
    });
    expect(writes[0]?.row.id).toMatch(/^[0-9a-f-]{36}$/);
    // Formularz się zamyka, kolekcja pod spodem pokazuje nową grę.
    const list = await screen.findByRole('dialog', { name: 'Kolekcja' });
    expect(await within(list).findByText('Kolejka Górska')).toBeInTheDocument();
  });

  it('opuszczenie pola tytułu nie pokazuje błędów pozostałych pól', async () => {
    renderHub([], ADA, '?p=games/new');
    const dialog = await screen.findByRole('dialog', { name: 'Dodaj grę' });
    const title = within(dialog).getByLabelText('Tytuł');
    fireEvent.input(title, { target: { value: 'Catan' } });
    fireEvent.blur(title);
    expect(within(dialog).queryByText('Wpisz punkty.')).not.toBeInTheDocument();
    expect(within(dialog).queryByText('Popraw zaznaczone pola.')).not.toBeInTheDocument();
    fireEvent.input(title, { target: { value: '   ' } });
    expect(await within(dialog).findByText('Wpisz tytuł gry.')).toBeInTheDocument();
  });

  it('admin edytuje starszą grę z menu ⋯: max dodaje puste pole, skomplikowanie przelicza punkty', async () => {
    const { writes } = renderHub([ZOLWIE], ADA, '?p=games');
    const dialog = await screen.findByRole('dialog', { name: 'Kolekcja' });
    fireEvent.click(
      await within(dialog).findByRole('button', { name: 'Akcje gry Żółwie Wyścigi' }),
    );
    fireEvent.click(await screen.findByRole('menuitem', { name: 'Edytuj' }));
    // Formularz pojawia się po wczytaniu gry, więc szukamy go po polu.
    expect(await screen.findByLabelText('Tytuł')).toHaveValue('Żółwie Wyścigi');
    const form = screen.getByRole('dialog', { name: 'Edytuj grę' });
    expect(window.location.search).toBe(`?p=games&p=game/${ZOLWIE.id}/edit`);
    expect(within(form).getByLabelText('4. miejsce')).toHaveValue('2');
    expect(within(form).getByText(/nie zmienia rozegranych partii/)).toBeInTheDocument();

    const maxStepper = within(form).getAllByRole('spinbutton')[1] as HTMLElement;
    fireEvent.keyDown(maxStepper as HTMLElement, { key: 'ArrowUp' });
    expect(await within(form).findByLabelText('5. miejsce')).toHaveValue('');
    // Gra bez skomplikowania: zapis wymaga jego uzupełnienia.
    expect(within(form).getByText(/nie ma jeszcze skomplikowania/)).toBeInTheDocument();
    fireEvent.input(within(form).getByLabelText('Skomplikowanie'), { target: { value: '1' } });
    await waitFor(() => expect(within(form).getByLabelText('1. miejsce')).toHaveValue('21,8'));
    expect(within(form).getByLabelText('5. miejsce')).toHaveValue('2,2');
    fireEvent.click(within(form).getByRole('button', { name: 'Zapisz' }));

    expect(await screen.findByText('Zapisano zmiany w grze Żółwie Wyścigi')).toBeInTheDocument();
    expect(writes).toEqual([
      {
        op: 'update',
        row: {
          title: 'Żółwie Wyścigi',
          min_players: 2,
          max_players: 5,
          complexity: 1,
          available: true,
          placement_points: complexityPoints(1, 5),
        },
        filters: { id: ZOLWIE.id, 'deleted_at is': null },
      },
    ]);
  });

  it('admin ustawia grę jako niedostępną w formularzu edycji', async () => {
    const { writes } = renderHub([{ ...ZOLWIE, complexity: 2 }], ADA, `?p=game/${ZOLWIE.id}/edit`);
    expect(await screen.findByLabelText('Tytuł')).toHaveValue('Żółwie Wyścigi');
    const form = screen.getByRole('dialog', { name: 'Edytuj grę' });
    const toggle = within(form).getByRole('switch', { name: 'Dostępna' });
    expect(toggle).toHaveAttribute('aria-checked', 'true');
    fireEvent.click(toggle);
    await waitFor(() => expect(toggle).toHaveAttribute('aria-checked', 'false'));
    fireEvent.click(within(form).getByRole('button', { name: 'Zapisz' }));
    expect(await screen.findByText('Zapisano zmiany w grze Żółwie Wyścigi')).toBeInTheDocument();
    expect(writes).toMatchObject([{ op: 'update', row: { available: false } }]);
  });

  it('niedostępna gra jest w kolekcji wyszarzona, a jej podgląd się otwiera', async () => {
    renderHub([{ ...ZOLWIE, available: false }, LAKA], ADA, '?p=games');
    const dialog = await screen.findByRole('dialog', { name: 'Kolekcja' });
    const open = await within(dialog).findByRole('button', {
      name: 'Szczegóły gry Żółwie Wyścigi (niedostępna)',
    });
    expect(open.closest('li')).toHaveClass('game-tile--unavailable');
    expect(
      within(dialog).getByRole('button', { name: 'Szczegóły gry Łąka i Pszczoły' }).closest('li'),
    ).not.toHaveClass('game-tile--unavailable');
    fireEvent.click(open);
    expect(await screen.findByRole('dialog', { name: 'Żółwie Wyścigi' })).toBeInTheDocument();
  });

  it('edycja usuniętej albo nieistniejącej gry: „Nie znaleziono gry”', async () => {
    renderHub([ZOLWIE], ADA, `?p=game/${GRA.id}/edit`);
    expect(await screen.findByRole('dialog', { name: 'Nie znaleziono gry' })).toBeInTheDocument();
  });
});

describe('usuwanie gry (GAME-8)', () => {
  it('admin usuwa grę po potwierdzeniu; gra znika z kolekcji', async () => {
    const { writes } = renderHub([ZOLWIE, LAKA], ADA, '?p=games');
    const dialog = await screen.findByRole('dialog', { name: 'Kolekcja' });
    fireEvent.click(
      await within(dialog).findByRole('button', { name: 'Akcje gry Łąka i Pszczoły' }),
    );
    fireEvent.click(await screen.findByRole('menuitem', { name: 'Usuń' }));
    const confirm = await screen.findByRole('dialog', { name: 'Usunąć grę?' });
    expect(
      await within(confirm).findByText(/„Łąka i Pszczoły” zniknie z kolekcji/),
    ).toBeInTheDocument();
    fireEvent.click(within(confirm).getByRole('button', { name: 'Usuń' }));

    expect(await screen.findByText('Usunięto grę Łąka i Pszczoły')).toBeInTheDocument();
    expect(writes).toHaveLength(1);
    expect(writes[0]).toMatchObject({
      op: 'update',
      filters: { id: LAKA.id, 'deleted_at is': null },
    });
    expect(writes[0]?.row).toHaveProperty('deleted_at');
    await waitFor(() =>
      expect(within(dialog).queryByText('Łąka i Pszczoły')).not.toBeInTheDocument(),
    );
    expect(within(dialog).getByText('Żółwie Wyścigi')).toBeInTheDocument();
  });
});
