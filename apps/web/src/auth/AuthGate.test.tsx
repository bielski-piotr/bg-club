import {
  AuthApiError,
  AuthRetryableFetchError,
  type AuthChangeEvent,
  type AuthError,
  type Session,
  type SupabaseClient,
} from '@supabase/supabase-js';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { act, fireEvent, render, screen, waitFor, within } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';
import { AuthGate } from '../App';
import { AuthProvider } from './AuthProvider';
import type { OwnProfile } from './useOwnProfile';

const ADA: OwnProfile = {
  id: '00000000-0000-4000-a000-000000000001',
  hook: 'ada-adminowska-a001',
  first_name: 'Ada',
  last_name: 'Adminowska',
  role: 'admin',
};

function sessionFor(userId: string, token = 'token-1', expiresIn = 3600): Session {
  return {
    access_token: token,
    refresh_token: 'refresh-1',
    expires_in: 3600,
    expires_at: Math.floor(Date.now() / 1000) + expiresIn,
    token_type: 'bearer',
    user: {
      id: userId,
      aud: 'authenticated',
      app_metadata: {},
      user_metadata: {},
      created_at: new Date().toISOString(),
    },
  };
}

interface FakeOptions {
  readonly session?: Session | null;
  readonly profile?: OwnProfile | null;
  readonly signInError?: AuthError;
}

/**
 * Zapytanie PostgREST: każda metoda filtra zwraca to samo zapytanie, `maybeSingle` daje jeden
 * wiersz, a samo `await` listę (np. członkowie klubu).
 */
function fakeQuery(row: OwnProfile | null) {
  const result = { data: row ? [{ ...row, deleted_at: null }] : [], error: null };
  const query = {
    select: () => query,
    eq: () => query,
    is: () => query,
    order: () => query,
    maybeSingle: async () => ({ data: row ? { ...row, deleted_at: null } : null, error: null }),
    then: (resolve: (value: typeof result) => unknown) => Promise.resolve(result).then(resolve),
  };
  return query;
}

/** Atrapa klienta Supabase: zdarzenia Auth emitujemy ręcznie, jak supabase-js. */
function fakeSupabase({ session = null, profile = ADA, signInError }: FakeOptions = {}) {
  let listener: ((event: AuthChangeEvent, session: Session | null) => void) | undefined;
  const emit = (event: AuthChangeEvent, next: Session | null) => act(() => listener?.(event, next));
  const auth = {
    onAuthStateChange: vi.fn((callback: typeof listener) => {
      listener = callback;
      queueMicrotask(() => listener?.('INITIAL_SESSION', session));
      return { data: { subscription: { unsubscribe: vi.fn() } } };
    }),
    signInWithPassword: vi.fn(async () => {
      if (signInError) return { data: { user: null, session: null }, error: signInError };
      const next = sessionFor(ADA.id);
      listener?.('SIGNED_IN', next);
      return { data: { user: next.user, session: next }, error: null };
    }),
    signOut: vi.fn(async () => {
      listener?.('SIGNED_OUT', null);
      return { error: null };
    }),
  };
  const from = vi.fn((table: string) => fakeQuery(table === 'profiles' ? profile : null));
  return { client: { auth, from } as unknown as SupabaseClient, auth, from, emit };
}

function renderGate(fake: ReturnType<typeof fakeSupabase>) {
  const queryClient = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  render(
    <QueryClientProvider client={queryClient}>
      <AuthProvider client={fake.client}>
        <AuthGate />
      </AuthProvider>
    </QueryClientProvider>,
  );
  return { queryClient };
}

const hubHeading = () => screen.findByRole('heading', { level: 1, name: 'BG Club' });

/** Własny profil otwiera chip użytkownika w nagłówku huba. */
async function openOwnProfile() {
  fireEvent.click(await screen.findByRole('link', { name: 'Twój profil: Ada Adminowska' }));
  return screen.findByRole('dialog', { name: 'Profil' });
}

async function submit(hook: string, password: string) {
  fireEvent.change(screen.getByLabelText('Hook'), { target: { value: hook } });
  fireEvent.change(screen.getByLabelText('Hasło'), { target: { value: password } });
  await act(async () => {
    fireEvent.click(screen.getByRole('button', { name: 'Zaloguj się' }));
  });
}

describe('logowanie hookiem (AUTH-1)', () => {
  it('bez sesji pokazuje polski ekran logowania', async () => {
    renderGate(fakeSupabase());
    expect(
      await screen.findByRole('heading', { level: 1, name: 'Zaloguj się' }),
    ).toBeInTheDocument();
    expect(screen.getByText('Hook i hasło dostajesz od administratora klubu.')).toBeInTheDocument();
  });

  it('sprawdza wymagane pola i format hooka bez wysyłania żądania', async () => {
    const fake = fakeSupabase();
    renderGate(fake);
    await screen.findByLabelText('Hook');

    await submit('', '');
    expect(screen.getByText('Wpisz swój hook.')).toBeInTheDocument();
    expect(screen.getByText('Wpisz hasło.')).toBeInTheDocument();
    expect(screen.getByLabelText('Hook')).toHaveFocus();

    // Poprawianie pola zdejmuje jego błąd jeszcze przed kolejną próbą.
    fireEvent.change(screen.getByLabelText('Hasło'), { target: { value: 'h' } });
    expect(screen.queryByText('Wpisz hasło.')).not.toBeInTheDocument();
    expect(screen.getByText('Wpisz swój hook.')).toBeInTheDocument();

    await submit('jan@example.com', 'haslo');
    expect(
      screen.getByText('Hook to małe litery, cyfry i myślniki, np. jan-kowalski-3f9a.'),
    ).toBeInTheDocument();
    expect(fake.auth.signInWithPassword).not.toHaveBeenCalled();
  });

  it('loguje technicznym e-mailem, którego interfejs nie pokazuje', async () => {
    const fake = fakeSupabase();
    renderGate(fake);
    await screen.findByLabelText('Hook');

    await submit('  Ada-Adminowska-A001 ', 'tajne-haslo-123');
    expect(fake.auth.signInWithPassword).toHaveBeenCalledWith({
      email: 'ada-adminowska-a001@users.bgclub.invalid',
      password: 'tajne-haslo-123',
    });
    expect(await hubHeading()).toBeInTheDocument();
    const profile = await openOwnProfile();
    expect(await within(profile).findByText('ada-adminowska-a001')).toBeInTheDocument();
    expect(within(profile).getByText('Admin')).toBeInTheDocument();
    expect(document.body.textContent).not.toMatch(/bgclub\.invalid/);
  });

  it.each([
    [
      new AuthApiError('Invalid login credentials', 400, 'invalid_credentials'),
      'Nieprawidłowy hook lub hasło.',
    ],
    [
      new AuthApiError('account_inactive', 403, 'unknown'),
      'To konto zostało usunięte. Jeśli to pomyłka, skontaktuj się z administratorem klubu.',
    ],
    [
      new AuthRetryableFetchError('Failed to fetch', 0),
      'Brak połączenia z serwerem. Sprawdź internet i spróbuj ponownie.',
    ],
  ])('pokazuje błąd logowania po polsku (%s)', async (error, message) => {
    renderGate(fakeSupabase({ signInError: error }));
    await screen.findByLabelText('Hook');
    await submit('ada-adminowska-a001', 'zle-haslo');
    expect(await screen.findByRole('alert')).toHaveTextContent(message);
    expect(screen.getByRole('heading', { level: 1, name: 'Zaloguj się' })).toBeInTheDocument();
  });

  it('po złym haśle czyści pole hasła i ustawia na nim fokus', async () => {
    const error = new AuthApiError('Invalid login credentials', 400, 'invalid_credentials');
    renderGate(fakeSupabase({ signInError: error }));
    await screen.findByLabelText('Hook');
    await submit('ada-adminowska-a001', 'zle-haslo');
    await screen.findByRole('alert');
    expect(screen.getByLabelText('Hasło')).toHaveValue('');
    expect(screen.getByLabelText('Hasło')).toHaveFocus();
    expect(screen.getByLabelText('Hook')).toHaveValue('ada-adminowska-a001');
  });
});

describe('sesja (AUTH-5, AUTH-7)', () => {
  it('przywraca zapamiętaną sesję i nie miga przy odświeżeniu tokenu', async () => {
    const session = sessionFor(ADA.id);
    const fake = fakeSupabase({ session });
    renderGate(fake);
    expect(await hubHeading()).toBeInTheDocument();
    await screen.findByText('Na razie jesteś tu tylko Ty');
    const queries = fake.from.mock.calls.length;

    fake.emit('TOKEN_REFRESHED', sessionFor(ADA.id, 'token-2'));
    expect(screen.getByRole('heading', { level: 1, name: 'BG Club' })).toBeInTheDocument();
    expect(fake.from).toHaveBeenCalledTimes(queries);
  });

  it('wylogowuje tylko to urządzenie i czyści dane poprzedniej sesji', async () => {
    const fake = fakeSupabase({ session: sessionFor(ADA.id) });
    const { queryClient } = renderGate(fake);
    await hubHeading();
    const profile = await openOwnProfile();
    expect(queryClient.getQueryCache().getAll().length).toBeGreaterThan(0);

    await act(async () => {
      fireEvent.click(await within(profile).findByRole('button', { name: 'Wyloguj się' }));
    });
    expect(fake.auth.signOut).toHaveBeenCalledWith({ scope: 'local' });
    expect(await screen.findByRole('heading', { name: 'Zaloguj się' })).toBeInTheDocument();
    expect(screen.queryByRole('alert')).not.toBeInTheDocument();
    expect(screen.queryByText('Sesja wygasła. Zaloguj się ponownie.')).not.toBeInTheDocument();
    expect(queryClient.getQueryCache().getAll()).toHaveLength(0);
    // Popup poprzedniej sesji nie zostaje w adresie dla kolejnej osoby.
    expect(window.location.search).toBe('');
  });

  it('kończy sesję usuniętego konta, gdy RLS nie zwraca profilu', async () => {
    const fake = fakeSupabase({ session: sessionFor(ADA.id), profile: null });
    renderGate(fake);
    await waitFor(() => expect(fake.auth.signOut).toHaveBeenCalledWith({ scope: 'local' }));
    expect(await screen.findByRole('alert')).toHaveTextContent(
      'To konto zostało usunięte. Jeśli to pomyłka, skontaktuj się z administratorem klubu.',
    );
    expect(screen.getByRole('heading', { name: 'Zaloguj się' })).toBeInTheDocument();
  });

  it('odrzucone odświeżenie wygasłej sesji wraca do logowania z komunikatem', async () => {
    // supabase-js usuwa sesję po odrzuconym odświeżeniu tylko przy wygasłym tokenie dostępu.
    const fake = fakeSupabase({ session: sessionFor(ADA.id, 'token-1', -5) });
    renderGate(fake);
    await hubHeading();

    fake.emit('SIGNED_OUT', null);
    expect(await screen.findByRole('heading', { name: 'Zaloguj się' })).toBeInTheDocument();
    expect(screen.getByText('Sesja wygasła. Zaloguj się ponownie.')).toBeInTheDocument();
  });

  it('wylogowanie w innej karcie (ważny token) nie mówi o wygaśnięciu sesji', async () => {
    const fake = fakeSupabase({ session: sessionFor(ADA.id) });
    renderGate(fake);
    await hubHeading();

    fake.emit('SIGNED_OUT', null);
    expect(await screen.findByRole('heading', { name: 'Zaloguj się' })).toBeInTheDocument();
    expect(screen.queryByText('Sesja wygasła. Zaloguj się ponownie.')).not.toBeInTheDocument();
  });
});
