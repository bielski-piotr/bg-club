import type { SupabaseClient } from '@supabase/supabase-js';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { fireEvent, render, screen, waitFor, within } from '@testing-library/react';
import { describe, expect, it, onTestFinished, vi } from 'vitest';
import { AuthContext, type AuthContextValue } from '../auth/authContext';
import { PopupRouter } from '../popups/PopupRouter';
import type { Profile } from '../react-shared/profiles';
import { ToastProvider } from '../ui';
import { Hub } from './Hub';
import { visibleMembers } from './members';

function person(n: number, first: string, extra: Partial<Profile> = {}): Profile {
  return {
    id: `00000000-0000-4000-a000-${String(n).padStart(12, '0')}`,
    hook: `${first.toLowerCase()}-test-${String(n).padStart(4, '0')}`,
    first_name: first,
    last_name: 'Testowa',
    role: n === 1 ? 'admin' : 'player',
    avatar_path: null,
    deleted_at: null,
    ...extra,
  };
}

const ADA = person(1, 'Ada');
const NAMES = ['Bea', 'Cela', 'Dora', 'Ewa', 'Fela', 'Gaja'];
const OTHERS = NAMES.map((name, i) => person(i + 2, name));
const REMOVED = person(99, 'Zoja', { deleted_at: '2026-11-01T10:00:00Z' });

interface FakeClub {
  name: string;
  logo_path: string | null;
  timezone: string;
}

interface FakeOptions {
  extra?: Profile[];
  /** Klub w bazie; `null` = pierwsze uruchomienie (CLUB-1). */
  club?: FakeClub | null;
  /** Błąd PostgREST przy zapisie klubu (np. `23505` przy równoległej próbie). */
  saveError?: { code: string; message: string };
  /** Odpowiedź Edge Function `create-member` (domyślnie: utworzony członek). */
  createMember?: (body: { firstName: string; lastName: string }) => {
    data: unknown;
    error: unknown;
  };
}

const PLANSZOWKI: FakeClub = { name: 'Planszówki', logo_path: null, timezone: 'Europe/Warsaw' };

/** `player_stats` gracza bez zapisanych partii. */
const EMPTY_PLAYER_STATS = {
  meetings: 0,
  plays: 0,
  wins: 0,
  points: 0,
  wins_total: 0,
  streak_record: 0,
  streak_current: 0,
  places: { points: null, wins: null },
  favorite_game: null,
  best_game: null,
  recent_meetings: [],
};

/**
 * Atrapa PostgREST: `eq('id', …)` filtruje, `is('deleted_at', null)` pomija usuniętych. Tabela
 * `club` przyjmuje `insert` i `update` (jak RLS dla admina) i zapamiętuje wiersz.
 */

function fakeClient(members: Profile[], options: FakeOptions = {}) {
  const db = { club: options.club === undefined ? PLANSZOWKI : options.club };
  const writes: { op: 'insert' | 'update'; row: Partial<FakeClub> }[] = [];
  const from = vi.fn((table: string) => {
    let rows: unknown[] =
      table === 'profiles'
        ? [...members, ...(options.extra ?? [])]
        : table === 'club' && db.club
          ? [db.club]
          : [];
    const write = (op: 'insert' | 'update', row: Partial<FakeClub>) => {
      writes.push({ op, row });
      if (options.saveError) return { data: null, error: options.saveError };
      db.club = { ...(db.club ?? PLANSZOWKI), ...row } as FakeClub;
      return { data: db.club, error: null };
    };
    let pending: ReturnType<typeof write> | undefined;
    const query = {
      select: () => query,
      order: () => query,
      limit: () => query,
      returns: () => query,
      insert: (row: Partial<FakeClub>) => {
        pending = write('insert', row);
        return query;
      },
      update: (row: Partial<FakeClub>) => {
        pending = write('update', row);
        return query;
      },
      eq: (column: string, value: string) => {
        if (column === 'id' && table === 'profiles') {
          rows = rows.filter((row) => (row as Profile).id === value);
        }
        return query;
      },
      is: () => {
        rows = rows.filter((row) => (row as Profile).deleted_at === null);
        return query;
      },
      single: async () => pending,
      maybeSingle: async () => ({ data: rows[0] ?? null, error: null }),
      then: (resolve: (value: unknown) => unknown) =>
        Promise.resolve({ data: rows, error: null }).then(resolve),
    };
    return query;
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
  const invoke = vi.fn(
    async (name: string, { body }: { body: { firstName: string; lastName: string } }) => {
      if (name !== 'create-member') throw new Error(`nieznana funkcja ${name}`);
      if (options.createMember) return options.createMember(body);
      return {
        data: {
          member: {
            id: '00000000-0000-4000-a000-0000000000aa',
            hook: 'lukasz-zolw-7c1e',
            first_name: body.firstName,
            last_name: body.lastName,
            role: 'player',
            deleted_at: null,
          },
          password: 'Tajne7HasloXyz23',
        },
        error: null,
      };
    },
  );
  return {
    // Ranking (LB-1): bez zapisanych partii funkcje SQL zwracają pustą listę, a statystyki
    // gracza (STAT-1) same zera.
    client: {
      from,
      storage,
      functions: { invoke },
      rpc: vi.fn(async (name: string) => ({
        data: name === 'player_stats' ? EMPTY_PLAYER_STATS : [],
        error: null,
      })),
    } as unknown as SupabaseClient,
    writes,
    db,
    invoke,
  };
}

function renderHub(members: Profile[], options: FakeOptions = {}, me: Profile = ADA) {
  const fake = fakeClient(members, options);
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
  return { auth, queryClient, ...fake };
}

describe('widżet członków (MEM-1)', () => {
  it('przy ≤ 5 członkach pokazuje wszystkich, przy więcej 4 i licznik', () => {
    expect(visibleMembers([ADA, ...OTHERS.slice(0, 4)])).toMatchObject({ rest: 0 });
    const many = visibleMembers([ADA, ...OTHERS]);
    expect(many.shown).toHaveLength(4);
    expect(many.rest).toBe(3);
  });

  it('pokazuje widżety w kolejności PRD i awatary prowadzące do profili', async () => {
    renderHub([ADA, ...OTHERS]);
    expect(
      await screen.findByRole('heading', { level: 1, name: 'Planszówki' }),
    ).toBeInTheDocument();
    expect(screen.getAllByRole('heading', { level: 2 }).map((h) => h.textContent)).toEqual([
      'Spotkanie',
      'Ranking',
      'Timeline',
      'Kolekcja',
      'Członkowie',
    ]);
    const members = screen.getByRole('region', { name: 'Członkowie' });
    expect(await within(members).findByText('7 osób')).toBeInTheDocument();
    expect(members).toHaveTextContent('Ada, Bea, Cela, Dora i 3 inne osoby');
    expect(
      within(members).getByRole('link', { name: 'Wszyscy członkowie: 7 osób' }),
    ).toHaveTextContent('+3');

    fireEvent.click(within(members).getByRole('link', { name: 'Otwórz profil: Bea Testowa' }));
    const profile = await screen.findByRole('dialog', { name: 'Profil' });
    expect(await within(profile).findByText('bea-test-0002')).toBeInTheDocument();
  });

  it('przy jednym członku pokazuje pusty stan z własnym awatarem', async () => {
    renderHub([ADA]);
    expect(await screen.findByText('Na razie jesteś tu tylko Ty')).toBeInTheDocument();
    expect(screen.getByRole('link', { name: 'Otwórz profil: Ada Testowa' })).toBeInTheDocument();
    expect(screen.queryByRole('link', { name: /Zobacz więcej/ })).not.toBeInTheDocument();
  });

  it('podpis przy 2–5 członkach łączy imiona spójnikiem', async () => {
    renderHub([ADA, ...OTHERS.slice(0, 2)]);
    const members = await screen.findByRole('region', { name: 'Członkowie' });
    expect(await within(members).findByText('Ada, Bea i Cela')).toBeInTheDocument();
  });
});

describe('popupy huba', () => {
  it('popup członków otwiera profil na stosie, a profil ma przycisk ←', async () => {
    renderHub([ADA, ...OTHERS]);
    fireEvent.click(await screen.findByRole('link', { name: 'Zobacz więcej' }));
    const list = await screen.findByRole('dialog', { name: 'Członkowie' });
    fireEvent.click(await within(list).findByRole('link', { name: /Cela Testowa/ }));
    const profile = await screen.findByRole('dialog', { name: 'Profil' });
    expect(window.location.search).toBe(`?p=members&p=profile/${OTHERS[1]?.id}`);
    expect(within(profile).getByRole('button', { name: 'Wróć' })).toBeInTheDocument();
  });

  it('profil usuniętego członka jest tylko do odczytu', async () => {
    window.history.replaceState(null, '', `/?p=profile/${REMOVED.id}`);
    renderHub([ADA], { extra: [REMOVED] });
    const profile = await screen.findByRole('dialog', { name: 'Profil' });
    expect(await within(profile).findByText('(usunięty)')).toBeInTheDocument();
    expect(profile).toHaveTextContent('Profil jest tylko do odczytu.');
    expect(within(profile).queryByRole('button', { name: 'Wyloguj się' })).not.toBeInTheDocument();
  });

  it('nieistniejący profil i nieznany adres mają czytelne stany', async () => {
    window.history.replaceState(null, '', `/?p=profile/${person(50, 'Nikt').id}`);
    renderHub([ADA]);
    expect(await screen.findByText('Nie znaleziono gracza')).toBeInTheDocument();

    window.history.replaceState(null, '', '/?p=game/1');
    window.dispatchEvent(new PopStateEvent('popstate'));
    const invalid = await screen.findByRole('dialog', { name: 'Nie znaleziono' });
    fireEvent.click(within(invalid).getByRole('button', { name: 'Wróć do klubu' }));
    expect(window.location.search).toBe('');
  });

  it('menu awatara otwiera własny profil, ustawienia i wylogowuje (CLUB-1, USR-5)', async () => {
    const { auth } = renderHub([ADA]);
    const chip = await screen.findByRole('button', { name: 'Twoje konto: Ada Testowa' });
    fireEvent.click(chip);
    const menu = screen.getByRole('menu', { name: 'Menu konta' });
    expect(
      within(menu)
        .getAllByRole('menuitem')
        .map((item) => item.textContent),
    ).toEqual(['Mój profil', 'Ustawienia', 'Wyloguj się']);
    expect(within(menu).getByRole('menuitem', { name: 'Mój profil' })).toHaveFocus();
    fireEvent.keyDown(menu, { key: 'Escape' });
    expect(screen.queryByRole('menu')).not.toBeInTheDocument();
    expect(chip).toHaveFocus();

    fireEvent.click(chip);
    fireEvent.click(screen.getByRole('menuitem', { name: 'Mój profil' }));
    const profile = await screen.findByRole('dialog', { name: 'Profil' });
    expect(window.location.search).toBe(`?p=profile/${ADA.id}`);
    // Właściciel ma Ustawienia; bez partii statystyki i rekordy (pusta kolekcja) mają puste stany.
    expect(
      await within(profile).findByText('Statystyki pojawią się po pierwszej partii'),
    ).toBeInTheDocument();
    expect(profile).toHaveTextContent('Kolekcja jest pusta');
    fireEvent.click(within(profile).getByRole('button', { name: 'Ustawienia' }));
    expect(await screen.findByRole('dialog', { name: 'Ustawienia' })).toBeInTheDocument();
    expect(window.location.search).toBe(`?p=profile/${ADA.id}&p=settings`);

    fireEvent.click(screen.getAllByRole('button', { name: 'Zamknij' }).at(-1) as HTMLElement);
    await waitFor(() => expect(window.location.search).toBe(''));
    fireEvent.click(await screen.findByRole('button', { name: 'Twoje konto: Ada Testowa' }));
    fireEvent.click(screen.getByRole('menuitem', { name: 'Wyloguj się' }));
    expect(auth.signOut).toHaveBeenCalled();
  });

  it('cudzy profil nie ma ustawień ani akcji edycji, także dla admina (USR-7)', async () => {
    window.history.replaceState(null, '', `/?p=profile/${OTHERS[0]?.id}`);
    renderHub([ADA, ...OTHERS]);
    const profile = await screen.findByRole('dialog', { name: 'Profil' });
    expect(await within(profile).findByText('Bea Testowa')).toBeInTheDocument();
    expect(within(profile).queryByRole('button', { name: 'Ustawienia' })).not.toBeInTheDocument();
    expect(within(profile).queryByText('Ty')).not.toBeInTheDocument();
  });
});

const BEA = OTHERS[0] as Profile;

describe('pierwsze uruchomienie (CLUB-1, CLUB-3)', () => {
  it('admin widzi ilustrację i „Dodaj klub” zamiast widżetów, a nagłówek tylko swój chip', async () => {
    renderHub([ADA], { club: null });
    expect(await screen.findByRole('heading', { level: 1, name: 'Załóż swój klub' })).toBeVisible();
    expect(document.querySelector('.first-run__art')).toBeInTheDocument();
    expect(screen.queryByRole('region', { name: 'Spotkanie' })).not.toBeInTheDocument();
    expect(screen.queryByRole('button', { name: 'Edytuj klub' })).not.toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Twoje konto: Ada Testowa' })).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Dodaj klub' })).toBeInTheDocument();
  });

  it('gracz widzi tę samą ilustrację bez przycisku, a formularz z linku jest niedostępny', async () => {
    window.history.replaceState(null, '', '/?p=club');
    renderHub([ADA, BEA], { club: null }, BEA);
    expect(
      await screen.findByRole('heading', { level: 1, name: 'Klub nie został jeszcze założony' }),
    ).toBeInTheDocument();
    expect(screen.queryByRole('button', { name: 'Dodaj klub' })).not.toBeInTheDocument();
    expect(await screen.findByRole('dialog', { name: 'Nie znaleziono' })).toBeInTheDocument();
  });
});

describe('zakładanie i edycja klubu (CLUB-2, CLUB-4)', () => {
  it('zapis tworzy klub i odsłania pięć pustych widżetów', async () => {
    const { writes } = renderHub([ADA], { club: null });
    fireEvent.click(await screen.findByRole('button', { name: 'Dodaj klub' }));
    const dialog = await screen.findByRole('dialog', { name: 'Dodaj klub' });
    expect(window.location.search).toBe('?p=club');

    // Bez nazwy formularz nie wysyła niczego.
    fireEvent.click(within(dialog).getByRole('button', { name: 'Zapisz' }));
    expect(await within(dialog).findByText('Wpisz nazwę klubu.')).toBeInTheDocument();
    expect(writes).toEqual([]);

    fireEvent.change(within(dialog).getByLabelText('Nazwa klubu'), {
      target: { value: '  Klub Planszówkowy  ' },
    });
    // Domyślnie strefa przeglądarki (w testach z `TZ`), a gdy jej brak, Europe/Warsaw.
    const zone = Intl.DateTimeFormat().resolvedOptions().timeZone;
    expect(within(dialog).getByRole('button', { name: /Strefa czasowa/ })).toHaveTextContent(zone);
    fireEvent.click(within(dialog).getByRole('button', { name: 'Zapisz' }));

    expect(
      await screen.findByRole('heading', { level: 1, name: 'Klub Planszówkowy' }),
    ).toBeInTheDocument();
    expect(writes).toEqual([
      { op: 'insert', row: { name: 'Klub Planszówkowy', timezone: zone, logo_path: null } },
    ]);
    expect(screen.queryByRole('dialog')).not.toBeInTheDocument();
    expect(screen.getAllByRole('heading', { level: 2 }).map((h) => h.textContent)).toEqual([
      'Spotkanie',
      'Ranking',
      'Timeline',
      'Kolekcja',
      'Członkowie',
    ]);
    expect(await screen.findByText('Klub założony')).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Edytuj klub' })).toBeInTheDocument();
  });

  it('równoległa próba (klub już jest) nie tworzy drugiego klubu', async () => {
    const { db } = renderHub([ADA], {
      club: null,
      saveError: { code: '23505', message: 'duplicate key value violates "club_pkey"' },
    });
    fireEvent.click(await screen.findByRole('button', { name: 'Dodaj klub' }));
    const dialog = await screen.findByRole('dialog', { name: 'Dodaj klub' });
    fireEvent.change(within(dialog).getByLabelText('Nazwa klubu'), { target: { value: 'Drugi' } });
    // Inna karta założyła klub w międzyczasie.
    db.club = PLANSZOWKI;
    fireEvent.click(within(dialog).getByRole('button', { name: 'Zapisz' }));
    expect(
      await screen.findByText('Klub został już założony, więc drugi nie powstał.'),
    ).toBeInTheDocument();
    expect(
      await screen.findByRole('heading', { level: 1, name: 'Planszówki' }),
    ).toBeInTheDocument();
    expect(screen.queryByRole('dialog')).not.toBeInTheDocument();
  });

  it('admin edytuje nazwę i strefę z nagłówka; gracz nie ma ołówka', async () => {
    const { writes } = renderHub([ADA]);
    fireEvent.click(await screen.findByRole('button', { name: 'Edytuj klub' }));
    const dialog = await screen.findByRole('dialog', { name: 'Edytuj klub' });
    expect(within(dialog).getByLabelText('Nazwa klubu')).toHaveValue('Planszówki');

    fireEvent.click(within(dialog).getByRole('button', { name: /Strefa czasowa/ }));
    const search = within(dialog).getByRole('combobox', { name: 'Szukaj strefy' });
    expect(search).toHaveFocus();
    fireEvent.change(search, { target: { value: 'new york' } });
    expect(
      within(dialog)
        .getAllByRole('option')
        .map((o) => o.textContent),
    ).toEqual([expect.stringMatching(/^America\/New_York/)]);
    fireEvent.keyDown(search, { key: 'Enter' });
    fireEvent.click(within(dialog).getByRole('button', { name: 'Zapisz' }));

    expect(await screen.findByText('Zapisano zmiany w klubie')).toBeInTheDocument();
    expect(writes).toEqual([
      {
        op: 'update',
        row: { name: 'Planszówki', timezone: 'America/New_York', logo_path: null },
      },
    ]);
  });

  it('gracz nie widzi ołówka edycji klubu', async () => {
    renderHub([ADA, BEA], {}, BEA);
    expect(
      await screen.findByRole('heading', { level: 1, name: 'Planszówki' }),
    ).toBeInTheDocument();
    expect(screen.queryByRole('button', { name: 'Edytuj klub' })).not.toBeInTheDocument();
  });
});

describe('dodawanie członka (MEM-3, AUTH-4)', () => {
  it('admin dodaje członka z pustego widżetu i raz widzi hook oraz hasło', async () => {
    const writeText = vi.fn(async () => undefined);
    const original = Object.getOwnPropertyDescriptor(navigator, 'clipboard');
    Object.defineProperty(navigator, 'clipboard', { value: { writeText }, configurable: true });
    onTestFinished(() => {
      if (original) Object.defineProperty(navigator, 'clipboard', original);
      else Reflect.deleteProperty(navigator, 'clipboard');
    });
    const { invoke, queryClient } = renderHub([ADA]);
    const widget = await screen.findByRole('region', { name: 'Członkowie' });
    fireEvent.click(await within(widget).findByRole('button', { name: 'Dodaj członka' }));
    const form = await screen.findByRole('dialog', { name: 'Dodaj członka' });
    expect(window.location.search).toBe('?p=members/new');

    // Puste pola: komunikaty i brak wywołania funkcji.
    fireEvent.click(within(form).getByRole('button', { name: 'Dodaj członka' }));
    expect(await within(form).findByText('Wpisz imię.')).toBeInTheDocument();
    expect(within(form).getByText('Wpisz nazwisko.')).toBeInTheDocument();
    expect(invoke).not.toHaveBeenCalled();

    // Pola obszaru Członkowie są w Solid: wartość idzie zdarzeniem `input` (jak przy pisaniu).
    fireEvent.input(within(form).getByLabelText('Imię'), { target: { value: ' Łukasz ' } });
    fireEvent.input(within(form).getByLabelText('Nazwisko'), { target: { value: 'Żółw' } });
    fireEvent.click(within(form).getByRole('button', { name: 'Dodaj członka' }));

    const done = await screen.findByRole('dialog', { name: 'Członek dodany' });
    expect(invoke).toHaveBeenCalledWith('create-member', {
      method: 'POST',
      body: { firstName: 'Łukasz', lastName: 'Żółw' },
    });
    expect(within(done).getByLabelText('Hook (login)')).toHaveValue('lukasz-zolw-7c1e');
    expect(within(done).getByLabelText('Hasło')).toHaveValue('Tajne7HasloXyz23');
    expect(done).toHaveTextContent('Hasło pokazujemy tylko teraz.');
    // Hasło nie trafia do cache'u zapytań ani do adresu.
    expect(
      JSON.stringify(
        queryClient
          .getQueryCache()
          .getAll()
          .map((q) => q.state.data),
      ),
    ).not.toContain('Tajne7HasloXyz23');
    expect(window.location.href).not.toContain('Tajne7HasloXyz23');

    fireEvent.click(within(done).getByRole('button', { name: 'Kopiuj hasło' }));
    expect(writeText).toHaveBeenCalledWith('Tajne7HasloXyz23');
    expect(await screen.findByText('Skopiowano hasło')).toBeInTheDocument();
    fireEvent.click(within(done).getByRole('button', { name: 'Kopiuj hook' }));
    expect(writeText).toHaveBeenCalledWith('lukasz-zolw-7c1e');

    fireEvent.click(within(done).getByRole('button', { name: 'Gotowe' }));
    await waitFor(() => expect(screen.queryByRole('dialog')).not.toBeInTheDocument());
    expect(document.body).not.toHaveTextContent('Tajne7HasloXyz23');
  });

  it('błąd funkcji pokazuje komunikat i zostawia formularz', async () => {
    window.history.replaceState(null, '', '/?p=members&p=members/new');
    renderHub([ADA, BEA], {
      createMember: () => ({
        data: null,
        error: Object.assign(new Error('Edge Function returned a non-2xx status code'), {
          name: 'FunctionsHttpError',
          context: new Response(JSON.stringify({ error: 'failed' }), { status: 500 }),
        }),
      }),
    });
    const form = await screen.findByRole('dialog', { name: 'Dodaj członka' });
    fireEvent.input(within(form).getByLabelText('Imię'), { target: { value: 'Ola' } });
    fireEvent.input(within(form).getByLabelText('Nazwisko'), { target: { value: 'Nowak' } });
    fireEvent.click(within(form).getByRole('button', { name: 'Dodaj członka' }));
    expect(
      await within(form).findByText(
        'Nie udało się dodać członka. Nic nie zostało zapisane, spróbuj ponownie.',
      ),
    ).toBeInTheDocument();
    expect(within(form).getByLabelText('Imię')).toHaveValue('Ola');
  });

  it('gracz nie ma „Dodaj członka”, a formularz z linku jest niedostępny', async () => {
    window.history.replaceState(null, '', '/?p=members/new');
    const { invoke } = renderHub([ADA, BEA], {}, BEA);
    expect(await screen.findByRole('dialog', { name: 'Nie znaleziono' })).toBeInTheDocument();
    expect(screen.queryByRole('button', { name: 'Dodaj członka' })).not.toBeInTheDocument();

    window.history.replaceState(null, '', '/?p=members');
    window.dispatchEvent(new PopStateEvent('popstate'));
    const list = await screen.findByRole('dialog', { name: 'Członkowie' });
    expect(within(list).queryByRole('button', { name: 'Dodaj członka' })).not.toBeInTheDocument();
    expect(invoke).not.toHaveBeenCalled();
  });

  it('pusty widżet gracza nie ma CTA', async () => {
    renderHub([BEA], {}, BEA);
    expect(await screen.findByText('Na razie jesteś tu tylko Ty')).toBeInTheDocument();
    expect(screen.queryByRole('button', { name: 'Dodaj członka' })).not.toBeInTheDocument();
  });
});

describe('wyszukiwanie członków (MEM-2)', () => {
  it('filtruje po imieniu i hooku bez polskich znaków; brak wyników ma pusty stan', async () => {
    window.history.replaceState(null, '', '/?p=members');
    const lukasz = person(30, 'Łukasz', { last_name: 'Żółw', hook: 'lukasz-zolw-7c1e' });
    renderHub([ADA, ...OTHERS, lukasz]);
    const list = await screen.findByRole('dialog', { name: 'Członkowie' });
    expect(await within(list).findAllByRole('listitem')).toHaveLength(8);
    expect(within(list).getByRole('button', { name: 'Dodaj członka' })).toBeInTheDocument();

    const search = within(list).getByRole('searchbox', { name: 'Szukaj członka' });
    // Popup jest w Solid: wartość idzie zdarzeniem `input`, a lista zmienia się w mikrozadaniu.
    fireEvent.input(search, { target: { value: 'lukasz zol' } });
    await waitFor(() => expect(within(list).getAllByRole('listitem')).toHaveLength(1));
    expect(within(list).getByRole('link', { name: /Łukasz Żółw/ })).toBeInTheDocument();
    expect(within(list).getByRole('status')).toHaveTextContent('1 wynik');

    fireEvent.input(search, { target: { value: '7C1E' } });
    await waitFor(() => expect(within(list).getAllByRole('listitem')).toHaveLength(1));
    expect(within(list).getByRole('link', { name: /Łukasz Żółw/ })).toBeInTheDocument();

    fireEvent.input(search, { target: { value: 'nikogo' } });
    await waitFor(() => expect(within(list).queryAllByRole('listitem')).toHaveLength(0));
    expect(within(list).getByText('Nikt nie pasuje do „nikogo”')).toBeInTheDocument();

    fireEvent.keyDown(search, { key: 'Escape' });
    await waitFor(() => expect(within(list).getAllByRole('listitem')).toHaveLength(8));
  });
});
