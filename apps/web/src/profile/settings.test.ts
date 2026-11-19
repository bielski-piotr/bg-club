import {
  AuthApiError,
  AuthRetryableFetchError,
  AuthWeakPasswordError,
  type SupabaseClient,
} from '@supabase/supabase-js';
import { describe, expect, it, vi } from 'vitest';
import type { OwnProfile } from '../auth/useOwnProfile';
import {
  changePassword,
  newAvatarPath,
  PasswordChangeError,
  passwordErrorKind,
  passwordProblems,
  saveProfile,
} from './settings';

const ME: OwnProfile = {
  id: '00000000-0000-4000-a000-000000000002',
  hook: 'bea-testowa-b002',
  first_name: 'Bea',
  last_name: 'Testowa',
  role: 'player',
  avatar_path: '00000000-0000-4000-a000-000000000002/avatar-stary.webp',
  deleted_at: null,
  theme: 'system',
  password_change_suggested: true,
};

describe('walidacja zmiany hasła', () => {
  it('wymaga obecnego hasła i dwóch takich samych nowych, co najmniej 12 znaków', () => {
    expect(passwordProblems({ current: '', next: '', repeat: '' })).toEqual({
      current: 'currentRequired',
      next: 'nextRequired',
      repeat: 'repeatRequired',
    });
    expect(passwordProblems({ current: 'stare', next: 'krotkie', repeat: 'krotkie' })).toEqual({
      next: 'tooShort',
    });
    expect(
      passwordProblems({ current: 'stare', next: 'nowe-haslo-123', repeat: 'nowe-haslo-124' }),
    ).toEqual({ repeat: 'mismatch' });
    expect(
      passwordProblems({
        current: 'to-samo-haslo-1',
        next: 'to-samo-haslo-1',
        repeat: 'to-samo-haslo-1',
      }),
    ).toEqual({ next: 'sameAsCurrent' });
    expect(
      passwordProblems({ current: 'stare', next: 'nowe-haslo-123', repeat: 'nowe-haslo-123' }),
    ).toEqual({});
  });

  it('rozpoznaje błędy Auth (kody sprawdzone na lokalnym Supabase)', () => {
    const api = (code: string, status = 400) => new AuthApiError('x', status, code);
    expect(passwordErrorKind(api('current_password_invalid'))).toBe('currentInvalid');
    expect(passwordErrorKind(api('current_password_required'))).toBe('currentInvalid');
    expect(passwordErrorKind(new AuthWeakPasswordError('x', 422, ['length']))).toBe('weak');
    expect(passwordErrorKind(api('same_password', 422))).toBe('same');
    expect(passwordErrorKind(api('over_request_rate_limit', 429))).toBe('rateLimited');
    expect(passwordErrorKind(new AuthRetryableFetchError('offline', 0))).toBe('network');
    expect(passwordErrorKind(new Error('?'))).toBe('unknown');
  });
});

function fakeClient(options: { updateError?: unknown; uploadError?: unknown } = {}) {
  const upload = vi.fn(async () => ({ data: {}, error: options.uploadError ?? null }));
  const remove = vi.fn(async () => ({ data: [], error: null }));
  const updates: unknown[] = [];
  const query = {
    update: (row: Record<string, unknown>) => {
      updates.push(row);
      return query;
    },
    eq: () => query,
    select: () => query,
    single: async () =>
      options.updateError
        ? { data: null, error: options.updateError }
        : { data: { ...ME, ...(updates.at(-1) as object) }, error: null },
    then: (resolve: (value: unknown) => unknown) =>
      Promise.resolve({ data: null, error: null }).then(resolve),
  };
  const updateUser = vi.fn(async () => ({ data: {}, error: null as unknown }));
  const client = {
    from: vi.fn(() => query),
    storage: { from: vi.fn(() => ({ upload, remove })) },
    auth: { updateUser },
  } as unknown as SupabaseClient;
  return { client, upload, remove, updates, updateUser };
}

const IMAGE = { blob: new Blob(['x'], { type: 'image/webp' }), extension: 'webp' as const };

describe('zapis profilu', () => {
  it('nowe zdjęcie trafia do własnego folderu pod nową nazwą, a stare jest usuwane', async () => {
    const fake = fakeClient();
    const saved = await saveProfile(fake.client, ME, {
      firstName: '  Beata ',
      lastName: 'Nowa ',
      avatar: { kind: 'new', image: IMAGE },
    });
    const [path] = fake.upload.mock.calls[0] as unknown as [string];
    expect(path).toMatch(new RegExp(`^${ME.id}/avatar-[0-9a-f-]{36}\\.webp$`));
    expect(fake.updates).toEqual([{ first_name: 'Beata', last_name: 'Nowa', avatar_path: path }]);
    expect(saved.avatar_path).toBe(path);
    expect(fake.remove).toHaveBeenCalledWith([ME.avatar_path]);
  });

  it('powrót do monogramu czyści ścieżkę i usuwa plik', async () => {
    const fake = fakeClient();
    await saveProfile(fake.client, ME, {
      firstName: 'Bea',
      lastName: 'Testowa',
      avatar: { kind: 'remove' },
    });
    expect(fake.upload).not.toHaveBeenCalled();
    expect(fake.updates).toEqual([{ first_name: 'Bea', last_name: 'Testowa', avatar_path: null }]);
    expect(fake.remove).toHaveBeenCalledWith([ME.avatar_path]);
  });

  it('bez zmiany zdjęcia zostawia plik', async () => {
    const fake = fakeClient();
    await saveProfile(fake.client, ME, {
      firstName: 'Bea',
      lastName: 'T',
      avatar: { kind: 'keep' },
    });
    expect(fake.updates).toEqual([
      { first_name: 'Bea', last_name: 'T', avatar_path: ME.avatar_path },
    ]);
    expect(fake.remove).not.toHaveBeenCalled();
  });

  it('nieudany zapis wiersza usuwa wysłany plik i zostawia stary', async () => {
    const fake = fakeClient({ updateError: { code: '42501', message: 'rls' } });
    await expect(
      saveProfile(fake.client, ME, {
        firstName: 'B',
        lastName: 'T',
        avatar: { kind: 'new', image: IMAGE },
      }),
    ).rejects.toMatchObject({ reason: 'save' });
    const [path] = fake.upload.mock.calls[0] as unknown as [string];
    expect(fake.remove).toHaveBeenCalledWith([path]);
    expect(fake.remove).not.toHaveBeenCalledWith([ME.avatar_path]);
  });

  it('nieudane wysłanie zdjęcia nie zmienia profilu', async () => {
    const fake = fakeClient({ uploadError: { message: 'too large' } });
    await expect(
      saveProfile(fake.client, ME, {
        firstName: 'B',
        lastName: 'T',
        avatar: { kind: 'new', image: IMAGE },
      }),
    ).rejects.toMatchObject({ reason: 'upload' });
    expect(fake.updates).toEqual([]);
  });

  it('ścieżka zdjęcia jest zawsze nowa', () => {
    expect(newAvatarPath(ME.id, 'webp')).not.toBe(newAvatarPath(ME.id, 'webp'));
  });
});

describe('zmiana hasła', () => {
  it('wysyła obecne hasło do Auth i wyłącza propozycję zmiany', async () => {
    const fake = fakeClient();
    await changePassword(fake.client, ME.id, { current: 'stare-haslo-12', next: 'nowe-haslo-123' });
    expect(fake.updateUser).toHaveBeenCalledWith({
      password: 'nowe-haslo-123',
      current_password: 'stare-haslo-12',
    });
    expect(fake.updates).toEqual([{ password_change_suggested: false }]);
  });

  it('złe obecne hasło nie zmienia flagi', async () => {
    const fake = fakeClient();
    fake.updateUser.mockResolvedValueOnce({
      data: {},
      error: new AuthApiError('bad', 400, 'current_password_invalid'),
    });
    const result = changePassword(fake.client, ME.id, { current: 'zle', next: 'nowe-haslo-123' });
    await expect(result).rejects.toBeInstanceOf(PasswordChangeError);
    await expect(result).rejects.toMatchObject({ reason: 'currentInvalid' });
    expect(fake.updates).toEqual([]);
  });
});
