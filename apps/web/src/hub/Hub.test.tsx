import type { SupabaseClient } from '@supabase/supabase-js';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { fireEvent, render, screen, within } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';
import { AuthContext, type AuthContextValue } from '../auth/authContext';
import { PopupRouter } from '../popups/PopupRouter';
import type { Profile } from '../profile/profiles';
import { Hub } from './Hub';
import { visibleMembers } from './members';

function person(n: number, first: string, extra: Partial<Profile> = {}): Profile {
  return {
    id: `00000000-0000-4000-a000-${String(n).padStart(12, '0')}`,
    hook: `${first.toLowerCase()}-test-${String(n).padStart(4, '0')}`,
    first_name: first,
    last_name: 'Testowa',
    role: n === 1 ? 'admin' : 'player',
    deleted_at: null,
    ...extra,
  };
}

const ADA = person(1, 'Ada');
const NAMES = ['Bea', 'Cela', 'Dora', 'Ewa', 'Fela', 'Gaja'];
const OTHERS = NAMES.map((name, i) => person(i + 2, name));
const REMOVED = person(99, 'Zoja', { deleted_at: '2026-11-01T10:00:00Z' });

/** Atrapa PostgREST: `eq('id', …)` filtruje, `is('deleted_at', null)` pomija usuniętych. */
function fakeClient(members: Profile[], extra: Profile[] = []) {
  const from = vi.fn((table: string) => {
    let rows: Profile[] = table === 'profiles' ? [...members, ...extra] : [];
    const query = {
      select: () => query,
      order: () => query,
      eq: (_column: string, value: string) => {
        rows = rows.filter((row) => row.id === value);
        return query;
      },
      is: () => {
        rows = rows.filter((row) => row.deleted_at === null);
        return query;
      },
      maybeSingle: async () => ({ data: rows[0] ?? null, error: null }),
      then: (resolve: (value: unknown) => unknown) =>
        Promise.resolve({ data: rows, error: null }).then(resolve),
    };
    return query;
  });
  return { from } as unknown as SupabaseClient;
}

function renderHub(members: Profile[], extra: Profile[] = []) {
  const client = fakeClient(members, extra);
  const auth = {
    client,
    state: { status: 'signedIn', session: { user: { id: ADA.id } } },
    signIn: vi.fn(),
    signOut: vi.fn(async () => undefined),
  } as unknown as AuthContextValue;
  render(
    <QueryClientProvider
      client={new QueryClient({ defaultOptions: { queries: { retry: false } } })}
    >
      <AuthContext.Provider value={auth}>
        <PopupRouter>
          <Hub me={ADA} />
        </PopupRouter>
      </AuthContext.Provider>
    </QueryClientProvider>,
  );
  return auth;
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
    expect(await screen.findByRole('heading', { level: 1, name: 'BG Club' })).toBeInTheDocument();
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
    const members = screen.getByRole('region', { name: 'Członkowie' });
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
    renderHub([ADA], [REMOVED]);
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

  it('własny profil pozwala się wylogować', async () => {
    const auth = renderHub([ADA]);
    fireEvent.click(screen.getByRole('link', { name: 'Twój profil: Ada Testowa' }));
    const profile = await screen.findByRole('dialog', { name: 'Profil' });
    fireEvent.click(await within(profile).findByRole('button', { name: 'Wyloguj się' }));
    expect(auth.signOut).toHaveBeenCalled();
  });
});
