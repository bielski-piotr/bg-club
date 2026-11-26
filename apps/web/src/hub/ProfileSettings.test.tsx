import { AuthApiError, type SupabaseClient } from '@supabase/supabase-js';
import { QueryClient } from '@tanstack/query-core';
import { QueryClientContext } from '../lib/queryClient';
import { fireEvent, render, screen, waitFor, within } from '@solidjs/testing-library';
import { act } from '../test/render';
import { describe, expect, it, vi } from 'vitest';
import { AuthContext, type AuthContextValue } from '../auth/authContext';
import { ownProfileKey, type OwnProfile } from '../auth/ownProfile';
import { Hub } from './Hub';
import { PopupRouter } from '../popups/PopupRouter';
import { createProfileTheme } from '../theme/createTheme';
import { getThemePreference, setThemePreference } from '../theme/themeStore';
import { createSignal, flush } from 'solid-js';
import { ToastProvider } from '../ui';

const BEA: OwnProfile = {
  id: '00000000-0000-4000-a000-000000000002',
  hook: 'bea-testowa-b002',
  first_name: 'Bea',
  last_name: 'Testowa',
  role: 'player',
  avatar_path: null,
  deleted_at: null,
  theme: 'system',
  password_change_suggested: false,
};

interface FakeOptions {
  readonly updateUserError?: unknown;
}

/** Atrapa Supabase: profil `BEA` (UPDATE zmienia wiersz), klub i Auth `updateUser`. */
function fakeClient(me: OwnProfile, options: FakeOptions = {}) {
  let row: OwnProfile = { ...me };
  const updates: Record<string, unknown>[] = [];
  const from = vi.fn((table: string) => {
    let pendingUpdate = false;
    const query = {
      select: () => query,
      order: () => query,
      eq: () => query,
      is: () => query,
      update: (values: Record<string, unknown>) => {
        updates.push(values);
        row = { ...row, ...values } as OwnProfile;
        pendingUpdate = true;
        return query;
      },
      single: async () => ({ data: row, error: null }),
      maybeSingle: async () =>
        table === 'club'
          ? {
              data: { name: 'Planszówki', logo_path: null, timezone: 'Europe/Warsaw' },
              error: null,
            }
          : { data: row, error: null },
      then: (resolve: (value: unknown) => unknown) =>
        Promise.resolve(
          pendingUpdate
            ? { data: null, error: null }
            : { data: table === 'profiles' ? [row] : [], error: null },
        ).then(resolve),
    };
    return query;
  });
  const updateUser = vi.fn(async () => ({ data: {}, error: options.updateUserError ?? null }));
  const storage = {
    from: () => ({
      createSignedUrl: async (path: string) => ({
        data: { signedUrl: `https://s.test/${path}` },
        error: null,
      }),
      upload: vi.fn(async () => ({ data: {}, error: null })),
      remove: vi.fn(async () => ({ data: [], error: null })),
    }),
  };
  const client = { from, storage, auth: { updateUser } } as unknown as SupabaseClient;
  return { client, updates, updateUser, current: () => row };
}

function renderHub(me: OwnProfile, options: FakeOptions = {}) {
  const fake = fakeClient(me, options);
  const auth = {
    client: fake.client,
    state: { status: 'signedIn', session: { user: { id: me.id } } },
    signIn: vi.fn(),
    signOut: vi.fn(async () => undefined),
  } as unknown as AuthContextValue;
  const queryClient = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  queryClient.setQueryData(ownProfileKey(me.id), me);
  const view = render(() => (
    <QueryClientContext value={queryClient}>
      <ToastProvider>
        <AuthContext value={auth}>
          <PopupRouter>
            <Hub me={me} />
          </PopupRouter>
        </AuthContext>
      </ToastProvider>
    </QueryClientContext>
  ));
  return { ...fake, auth, queryClient, view };
}

// Wartość pola idzie zdarzeniem `input` (jak przy pisaniu).
const type = (field: HTMLElement, value: string) => fireEvent.input(field, { target: { value } });

describe('ustawienia (USR-5, USR-8)', () => {
  it('zapisuje imię i nazwisko z przyciętymi spacjami i wraca do huba', async () => {
    window.history.replaceState(null, '', '/?p=settings');
    const fake = renderHub(BEA);
    const dialog = await screen.findByRole('dialog', { name: 'Ustawienia' });
    expect(within(dialog).getByLabelText('Hook (login)')).toHaveValue(BEA.hook);
    expect(within(dialog).getByLabelText('Hook (login)')).toHaveAttribute('readonly');

    type(within(dialog).getByLabelText('Imię'), '   ');
    fireEvent.click(within(dialog).getByRole('button', { name: 'Zapisz' }));
    expect(await within(dialog).findByText('Wpisz imię.')).toBeInTheDocument();
    expect(fake.updates).toEqual([]);

    type(within(dialog).getByLabelText('Imię'), ' Beata ');
    type(within(dialog).getByLabelText('Nazwisko'), 'Nowak');
    fireEvent.click(within(dialog).getByRole('button', { name: 'Zapisz' }));
    await waitFor(() => expect(window.location.search).toBe(''));
    expect(fake.updates).toEqual([{ first_name: 'Beata', last_name: 'Nowak', avatar_path: null }]);
    expect(fake.queryClient.getQueryData<OwnProfile>(ownProfileKey(BEA.id))?.first_name).toBe(
      'Beata',
    );
    expect(await screen.findByText('Zapisano zmiany')).toBeInTheDocument();
  });

  it('motyw działa od razu i trafia do profilu oraz localStorage (USR-8)', async () => {
    setThemePreference('system');
    window.history.replaceState(null, '', '/?p=settings');
    const fake = renderHub(BEA);
    const dialog = await screen.findByRole('dialog', { name: 'Ustawienia' });
    fireEvent.click(within(dialog).getByRole('radio', { name: 'Ciemny' }));
    expect(document.documentElement).toHaveAttribute('data-theme', 'dark');
    expect(localStorage.getItem('bg-club.theme')).toBe('dark');
    await waitFor(() => expect(fake.updates).toEqual([{ theme: 'dark' }]));
    await waitFor(() =>
      expect(fake.queryClient.getQueryData<OwnProfile>(ownProfileKey(BEA.id))?.theme).toBe('dark'),
    );
    setThemePreference('system');
  });

  it('niewłaściwy plik zdjęcia daje komunikat bez wysyłania', async () => {
    window.history.replaceState(null, '', '/?p=settings');
    renderHub(BEA);
    const dialog = await screen.findByRole('dialog', { name: 'Ustawienia' });
    const input = within(dialog).getByLabelText('Zdjęcie profilowe', { selector: 'input' });
    fireEvent.change(input, {
      target: { files: [new File(['gif'], 'a.gif', { type: 'image/gif' })] },
    });
    expect(await within(dialog).findByRole('alert')).toHaveTextContent(
      'Wybierz zdjęcie JPG, PNG lub WebP.',
    );
  });
});

describe('motyw z profilu (USR-8)', () => {
  it('stosuje motyw zapisany w profilu, gdy różni się od lokalnej kopii', () => {
    setThemePreference('light');
    /** Profil z cache; każdy zapis to świeży obiekt (jak po ponownym pobraniu). */
    const [profile, setProfile] = createSignal<{ theme: OwnProfile['theme'] | undefined }>({
      theme: undefined,
    });
    function Probe() {
      createProfileTheme(() => profile().theme);
      return null;
    }
    render(() => <Probe />);
    flush();
    expect(getThemePreference()).toBe('light');
    setProfile({ theme: 'dark' });
    flush();
    expect(getThemePreference()).toBe('dark');
    expect(document.documentElement).toHaveAttribute('data-theme', 'dark');
    // Lokalny wybór (np. w ustawieniach) nie jest cofany, dopóki profil się nie zmieni.
    act(() => setThemePreference('light'));
    setProfile({ theme: 'dark' });
    flush();
    expect(getThemePreference()).toBe('light');
    setProfile({ theme: 'system' });
    flush();
    expect(getThemePreference()).toBe('system');
    expect(document.documentElement).not.toHaveAttribute('data-theme');
  });
});

describe('zmiana hasła (USR-5)', () => {
  it('sprawdza obecne hasło i dwa nowe wpisy', async () => {
    window.history.replaceState(null, '', '/?p=settings&p=settings/password');
    const fake = renderHub(BEA, {
      updateUserError: new AuthApiError('bad', 400, 'current_password_invalid'),
    });
    const dialog = await screen.findByRole('dialog', { name: 'Zmiana hasła' });
    fireEvent.click(within(dialog).getByRole('button', { name: 'Zmień hasło' }));
    // Komunikaty pojawiają się w mikrozadaniu po zdarzeniu.
    expect(await within(dialog).findByText('Wpisz obecne hasło.')).toBeInTheDocument();
    expect(within(dialog).getByText('Wpisz nowe hasło.')).toBeInTheDocument();
    expect(within(dialog).getByText('Powtórz nowe hasło.')).toBeInTheDocument();

    type(within(dialog).getByLabelText('Obecne hasło'), 'zle-haslo');
    type(within(dialog).getByLabelText('Nowe hasło'), 'nowe-haslo-123');
    type(within(dialog).getByLabelText('Powtórz nowe hasło'), 'nowe-haslo-124');
    expect(await within(dialog).findByText('Hasła nie są takie same.')).toBeInTheDocument();
    expect(fake.updateUser).not.toHaveBeenCalled();

    type(within(dialog).getByLabelText('Powtórz nowe hasło'), 'nowe-haslo-123');
    fireEvent.click(within(dialog).getByRole('button', { name: 'Zmień hasło' }));
    expect(await within(dialog).findByText('Obecne hasło jest nieprawidłowe.')).toBeInTheDocument();
    expect(fake.updateUser).toHaveBeenCalledWith({
      password: 'nowe-haslo-123',
      current_password: 'zle-haslo',
    });
    // Hasło nie trafia do adresu.
    expect(window.location.href).not.toContain('haslo');
  });

  it('po zmianie wraca do ustawień i wyłącza propozycję z pierwszego logowania', async () => {
    window.history.replaceState(null, '', '/?p=settings&p=settings/password');
    const fake = renderHub(BEA);
    const dialog = await screen.findByRole('dialog', { name: 'Zmiana hasła' });
    type(within(dialog).getByLabelText('Obecne hasło'), 'stare-haslo-123');
    type(within(dialog).getByLabelText('Nowe hasło'), 'nowe-haslo-123');
    type(within(dialog).getByLabelText('Powtórz nowe hasło'), 'nowe-haslo-123');
    fireEvent.click(within(dialog).getByRole('button', { name: 'Zmień hasło' }));
    expect(await screen.findByText('Hasło zostało zmienione')).toBeInTheDocument();
    await waitFor(() => expect(window.location.search).toBe('?p=settings'));
    expect(fake.updates).toEqual([{ password_change_suggested: false }]);
  });
});

describe('pierwsze logowanie (AUTH-6)', () => {
  it('konto z wygenerowanym hasłem dostaje propozycję, którą można pominąć', async () => {
    window.history.replaceState(null, '', '/');
    const fake = renderHub({ ...BEA, password_change_suggested: true });
    const dialog = await screen.findByRole('dialog', { name: 'Ustaw własne hasło' });
    expect(window.location.search).toBe('?p=first-login');
    expect(within(dialog).getByLabelText('Hasło od administratora')).toBeInTheDocument();
    fireEvent.click(within(dialog).getByRole('button', { name: 'Pomiń' }));
    await waitFor(() => expect(window.location.search).toBe(''));
    expect(fake.updates).toEqual([{ password_change_suggested: false }]);
    expect(fake.updateUser).not.toHaveBeenCalled();
  });

  it('wejście z linku do popupu nie dostaje propozycji, także po zamknięciu popupu', async () => {
    window.history.replaceState(null, '', '/?p=members');
    renderHub({ ...BEA, password_change_suggested: true });
    const list = await screen.findByRole('dialog', { name: 'Członkowie' });
    fireEvent.click(within(list).getByRole('button', { name: 'Zamknij' }));
    await waitFor(() => expect(window.location.search).toBe(''));
    expect(screen.queryByRole('dialog', { name: 'Ustaw własne hasło' })).not.toBeInTheDocument();
  });

  it('konto z własnym hasłem nie dostaje propozycji', async () => {
    window.history.replaceState(null, '', '/');
    renderHub(BEA);
    expect(
      await screen.findByRole('heading', { level: 1, name: 'Planszówki' }),
    ).toBeInTheDocument();
    expect(screen.queryByRole('dialog')).not.toBeInTheDocument();
    expect(window.location.search).toBe('');
  });
});
