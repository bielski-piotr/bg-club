/**
 * Atrapa {@link AccountStore} dla testów `deno test`: profile w pamięci, tokeny jako mapa
 * token → id i zapis wywołań, żeby sprawdzić kolejność kroków usuwania.
 */
import type { AccountProfile, AccountStore } from './accountDeletion.ts';

export const ADMIN_ID = '00000000-0000-4000-a000-000000000001';
export const PLAYER_ID = '00000000-0000-4000-a000-000000000002';
export const OTHER_ID = '00000000-0000-4000-a000-000000000003';
export const REMOVED_ID = '00000000-0000-4000-a000-000000000004';

export const TOKENS: Readonly<Record<string, string>> = {
  'admin-token': ADMIN_ID,
  'player-token': PLAYER_ID,
  'other-token': OTHER_ID,
  'removed-token': REMOVED_ID,
};

export interface TestStore {
  readonly store: AccountStore;
  readonly profiles: Map<string, AccountProfile>;
  /** Wywołania zmieniające dane, np. `profile:<id>`, `auth:<id>`. */
  readonly calls: string[];
}

export function testStore(options: { failAuthDelete?: boolean } = {}): TestStore {
  const profiles = new Map<string, AccountProfile>([
    [ADMIN_ID, { id: ADMIN_ID, hook: 'ala-admin-0001', role: 'admin', deleted: false }],
    [PLAYER_ID, { id: PLAYER_ID, hook: 'bartek-gracz-0002', role: 'player', deleted: false }],
    [OTHER_ID, { id: OTHER_ID, hook: 'celina-gracz-0003', role: 'player', deleted: false }],
    [REMOVED_ID, { id: REMOVED_ID, hook: 'dawid-usuniety-0004', role: 'player', deleted: true }],
  ]);
  const calls: string[] = [];
  const store: AccountStore = {
    authenticate: (token) => Promise.resolve(TOKENS[token] ?? null),
    findProfile: (id) => Promise.resolve(profiles.get(id) ?? null),
    softDeleteProfile: (id) => {
      calls.push(`profile:${id}`);
      const profile = profiles.get(id);
      if (profile && profile.role === 'player') profiles.set(id, { ...profile, deleted: true });
      return Promise.resolve();
    },
    deleteAuthUser: (id) => {
      calls.push(`auth:${id}`);
      return options.failAuthDelete ? Promise.reject(new Error('auth down')) : Promise.resolve();
    },
  };
  return { store, profiles, calls };
}

export function post(url: string, body: unknown, token?: string): Request {
  return new Request(url, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      ...(token ? { Authorization: `Bearer ${token}` } : {}),
    },
    body: typeof body === 'string' ? body : JSON.stringify(body),
  });
}
