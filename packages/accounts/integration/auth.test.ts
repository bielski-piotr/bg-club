/**
 * Testy integracyjne kont i logowania na lokalnym Supabase (PRD AUTH-1…AUTH-5, AUTH-7)
 * oraz zakładania klubu przez API (CLUB-2: równoległe próby, NFR-10).
 *
 * Idą przez prawdziwe API (Auth, PostgREST) z tymi samymi kluczami co aplikacja i skrypt
 * bootstrapu. Startują od pustej instalacji i nie sprzątają po sobie (konta administratora nie
 * da się usunąć), więc kolejne uruchomienie wymaga `pnpm db:reset`. CI uruchamia je dwa razy:
 * na świeżej bazie i po resecie (ponowne uruchomienie pustej instalacji).
 *
 *   pnpm db:start && pnpm db:reset && pnpm test:auth
 *
 * Dane testowe są fikcyjne.
 */
import { execFileSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';
import { createClient, type SupabaseClient } from '@supabase/supabase-js';
import { beforeAll, describe, expect, it } from 'vitest';
import { bootstrapAdmin } from '../src/bootstrap.ts';
import { createHook, generatePassword, hookToEmail, randomHookSuffix } from '../src/index.ts';
import { readLocalStack } from '../src/localStack.ts';

const stack = readLocalStack();
const options = {
  auth: { persistSession: false, autoRefreshToken: false, detectSessionInUrl: false },
} as const;
const service = createClient(stack.apiUrl, stack.serviceRoleKey, options);
const anonClient = (): SupabaseClient => createClient(stack.apiUrl, stack.anonKey, options);

/** Tabele aplikacji poza profilami: po bootstrapie muszą być puste (bez klubu i danych demo). */
const OTHER_TABLES = [
  'club',
  'games',
  'scorepads',
  'scorepad_versions',
  'meetings',
  'meeting_participants',
  'game_votes',
  'meeting_games',
  'plays',
  'play_results',
  'achievement_unlocks',
] as const;

async function countRows(table: string): Promise<number> {
  const { count, error } = await service.from(table).select('*', { count: 'exact', head: true });
  if (error) throw new Error(`${table}: ${error.message}`);
  return count ?? 0;
}

async function authUsers() {
  const { data, error } = await service.auth.admin.listUsers({ perPage: 1000 });
  if (error) throw error;
  return data.users;
}

async function signIn(hook: string, password: string) {
  const client = anonClient();
  const result = await client.auth.signInWithPassword({ email: hookToEmail(hook), password });
  return { client, ...result };
}

/** Konto gracza tak, jak utworzy je Edge Function `create-member` ([009]). */
async function createPlayer(firstName: string, lastName: string) {
  const hook = createHook(firstName, lastName, randomHookSuffix());
  const password = generatePassword();
  const { data, error } = await service.auth.admin.createUser({
    email: hookToEmail(hook),
    password,
    email_confirm: true,
    app_metadata: { bg_club: { first_name: firstName, last_name: lastName, role: 'player' } },
  });
  if (error || !data.user) throw error ?? new Error('brak konta');
  return { id: data.user.id, hook, password };
}

const admin = { hook: '', password: '' };

describe('konta i logowanie na pustej instalacji', () => {
  beforeAll(async () => {
    const profiles = await countRows('profiles');
    const users = await authUsers();
    if (profiles > 0 || users.length > 0) {
      throw new Error('Testy wymagają pustej instalacji. Uruchom `pnpm db:reset` i powtórz.');
    }
  });

  describe('konta tworzy tylko serwer (AUTH-2)', () => {
    it('rejestracja samodzielna i logowanie anonimowe są wyłączone', async () => {
      const client = anonClient();
      const signUp = await client.auth.signUp({
        email: hookToEmail('obcy-gracz-0001'),
        password: generatePassword(),
      });
      expect(signUp.error?.code).toBe('signup_disabled');
      const anonymous = await client.auth.signInAnonymously();
      expect(anonymous.error).not.toBeNull();
      expect(await authUsers()).toHaveLength(0);
    });

    it('baza odrzuca konto bez danych aplikacji, gracza przed adminem i obcy e-mail', async () => {
      const attempts = await Promise.all([
        service.auth.admin.createUser({
          email: hookToEmail('panel-supabase-0002'),
          password: generatePassword(),
          email_confirm: true,
        }),
        service.auth.admin.createUser({
          email: hookToEmail('gracz-przed-adminem-0003'),
          password: generatePassword(),
          email_confirm: true,
          app_metadata: { bg_club: { first_name: 'Gracz', last_name: 'Pierwszy' } },
        }),
        service.auth.admin.createUser({
          email: 'admin@example.com',
          password: generatePassword(),
          email_confirm: true,
          app_metadata: { bg_club: { first_name: 'Obcy', last_name: 'Adres', role: 'admin' } },
        }),
      ]);
      expect(attempts.map(({ error }) => error !== null)).toEqual([true, true, true]);
      // Konto Auth i profil powstają w jednej transakcji: nic nie zostaje.
      expect(await authUsers()).toHaveLength(0);
      expect(await countRows('profiles')).toBe(0);
    });
  });

  describe('bootstrap administratora (AUTH-3)', () => {
    it('równoległe uruchomienia tworzą dokładnie jednego administratora', async () => {
      const results = await Promise.all([
        bootstrapAdmin(service, { firstName: 'Łucja', lastName: 'Żak-Główna' }),
        bootstrapAdmin(service, { firstName: 'Obcy', lastName: 'Przejmujący' }),
      ]);
      const created = results.filter((r) => r.status === 'created');
      expect(created).toHaveLength(1);
      const winner = created[0];
      if (winner?.status !== 'created' || winner.generatedPassword === undefined) {
        throw new Error('brak wygenerowanego hasła');
      }
      expect(results.map((r) => r.hook)).toEqual([winner.hook, winner.hook]);
      expect(winner.generatedPassword).toHaveLength(16);
      admin.hook = winner.hook;
      admin.password = winner.generatedPassword;
    });

    it('tworzy wyłącznie konto administratora, bez klubu i danych demonstracyjnych', async () => {
      const { data: profiles, error } = await service
        .from('profiles')
        .select('hook, role, deleted_at');
      expect(error).toBeNull();
      expect(profiles).toEqual([{ hook: admin.hook, role: 'admin', deleted_at: null }]);
      expect(admin.hook).toMatch(/^(lucja-zak-glowna|obcy-przejmujacy)-[0-9a-f]{4}$/);

      const users = await authUsers();
      expect(users.map((u) => u.email)).toEqual([hookToEmail(admin.hook)]);
      expect(users[0]?.email_confirmed_at).toBeTruthy();

      for (const table of OTHER_TABLES) {
        expect({ table, rows: await countRows(table) }).toEqual({ table, rows: 0 });
      }
    });

    it('ponowienie nie tworzy drugiego administratora i nie zmienia hasła', async () => {
      const again = await bootstrapAdmin(service, {
        firstName: 'Obcy',
        lastName: 'Przejmujący',
        password: 'przejecie-instancji-1',
      });
      expect(again).toEqual({ status: 'exists', hook: admin.hook });
      expect(await countRows('profiles')).toBe(1);
      expect(await authUsers()).toHaveLength(1);

      const takeover = await signIn(admin.hook, 'przejecie-instancji-1');
      expect(takeover.error?.code).toBe('invalid_credentials');
      const owner = await signIn(admin.hook, admin.password);
      expect(owner.error).toBeNull();
    });

    it('drugiego administratora nie utworzy też bezpośrednio API Auth', async () => {
      const { error } = await service.auth.admin.createUser({
        email: hookToEmail('drugi-admin-0004'),
        password: generatePassword(),
        email_confirm: true,
        app_metadata: { bg_club: { first_name: 'Drugi', last_name: 'Admin', role: 'admin' } },
      });
      expect(error).not.toBeNull();
      expect(await authUsers()).toHaveLength(1);
    });

    it('skrypt CLI przy istniejącym administratorze kończy się bez zmian', () => {
      const output = execFileSync(
        process.execPath,
        [fileURLToPath(new URL('../src/bootstrap-admin.ts', import.meta.url)), '--local'],
        {
          encoding: 'utf8',
          env: {
            ...process.env,
            BOOTSTRAP_ADMIN_FIRST_NAME: 'Obcy',
            BOOTSTRAP_ADMIN_LAST_NAME: 'Przejmujący',
            BOOTSTRAP_ADMIN_PASSWORD: 'przejecie-instancji-2',
          },
        },
      );
      expect(output).toContain(
        `Administrator już istnieje (hook: ${admin.hook}). Nic nie zmieniono.`,
      );
    });
  });

  describe('logowanie hookiem i sesja (AUTH-1, AUTH-5)', () => {
    it('loguje hookiem przez techniczny e-mail i daje dostęp do danych', async () => {
      const { client, data, error } = await signIn(admin.hook, admin.password);
      expect(error).toBeNull();
      expect(data.user?.email).toBe(hookToEmail(admin.hook));
      const { data: profiles } = await client.from('profiles').select('hook, role');
      expect(profiles).toEqual([{ hook: admin.hook, role: 'admin' }]);
    });

    it('zły hook i złe hasło dają ten sam błąd (bez ujawniania kont)', async () => {
      const wrongPassword = await signIn(admin.hook, 'zle-haslo-123456');
      const unknownHook = await signIn('nie-ma-takiego-0005', admin.password);
      expect(wrongPassword.error?.code).toBe('invalid_credentials');
      expect(unknownHook.error?.code).toBe('invalid_credentials');
      expect(wrongPassword.error?.message).toBe(unknownHook.error?.message);
    });

    it('odświeżenie sesji wydaje nowy token, który działa', async () => {
      const { client, data } = await signIn(admin.hook, admin.password);
      const refreshed = await client.auth.refreshSession();
      expect(refreshed.error).toBeNull();
      expect(refreshed.data.session?.access_token).not.toBe(data.session?.access_token);
      const { data: profiles } = await client.from('profiles').select('hook');
      expect(profiles).toEqual([{ hook: admin.hook }]);
    });

    it('wylogowanie usuwa sesję lokalnie i unieważnia ją na serwerze', async () => {
      const { client, data } = await signIn(admin.hook, admin.password);
      const refreshToken = data.session?.refresh_token ?? '';
      const { error } = await client.auth.signOut({ scope: 'local' });
      expect(error).toBeNull();
      expect((await client.auth.getSession()).data.session).toBeNull();
      const reuse = await anonClient().auth.refreshSession({ refresh_token: refreshToken });
      expect(reuse.error).not.toBeNull();
      expect(reuse.data.session).toBeNull();
    });
  });

  describe('konto usunięte (AUTH-7, MEM-4)', () => {
    it('istniejąca sesja nie dostaje danych, nie odświeży się i nie zaloguje ponownie', async () => {
      const player = await createPlayer('Bartek', 'Testowy');
      const session = await signIn(player.hook, player.password);
      expect(session.error).toBeNull();
      const before = await session.client.from('profiles').select('hook');
      expect(before.data).toHaveLength(2);

      const { error } = await service
        .from('profiles')
        .update({ deleted_at: new Date().toISOString() })
        .eq('id', player.id);
      expect(error).toBeNull();

      // Token dostępu jest jeszcze ważny, ale RLS wymaga aktywnego profilu.
      const after = await session.client.from('profiles').select('hook');
      expect(after.data).toEqual([]);
      const update = await session.client
        .from('profiles')
        .update({ first_name: 'Powrót' })
        .eq('id', player.id)
        .select();
      expect(update.data ?? []).toEqual([]);

      const refreshed = await session.client.auth.refreshSession();
      expect(refreshed.error?.status).toBe(403);
      expect(refreshed.error?.message).toBe('account_inactive');

      const again = await signIn(player.hook, player.password);
      expect(again.error?.status).toBe(403);
      expect(again.error?.message).toBe('account_inactive');
      // Złe hasło nadal daje zwykły błąd: odmowa dotyczy tylko znającego hasło.
      const guess = await signIn(player.hook, 'zle-haslo-123456');
      expect(guess.error?.code).toBe('invalid_credentials');
    });

    it('konto usunięte w Auth (panel Supabase) zostaje w historii i nie zaloguje się', async () => {
      const player = await createPlayer('Celina', 'Przykładowa');
      const { error } = await service.auth.admin.deleteUser(player.id);
      expect(error).toBeNull();
      const { data: profile } = await service
        .from('profiles')
        .select('deleted_at')
        .eq('id', player.id)
        .single();
      expect(profile?.deleted_at).not.toBeNull();
      const login = await signIn(player.hook, player.password);
      expect(login.error?.code).toBe('invalid_credentials');
    });

    it('konta administratora nie da się usunąć w Auth', async () => {
      const users = await authUsers();
      const adminUser = users.find((u) => u.email === hookToEmail(admin.hook));
      const { error } = await service.auth.admin.deleteUser(adminUser?.id ?? '');
      expect(error).not.toBeNull();
      expect(await signIn(admin.hook, admin.password)).toMatchObject({ error: null });
    });
  });

  describe('gracz nie zmieni loginu ani roli', () => {
    it('techniczny e-mail jest niezmienny, a metadane użytkownika nie dają roli', async () => {
      const player = await createPlayer('Dawid', 'Fikcyjny');
      const { client } = await signIn(player.hook, player.password);

      const emailChange = await client.auth.updateUser({ email: hookToEmail(admin.hook) });
      expect(emailChange.error).not.toBeNull();
      const otherEmail = await client.auth.updateUser({ email: hookToEmail('nowy-login-0006') });
      expect(otherEmail.error).not.toBeNull();
      const { data: user } = await service.auth.admin.getUserById(player.id);
      expect(user.user?.email).toBe(hookToEmail(player.hook));
      expect(user.user?.new_email ?? '').toBe('');

      const metadata = await client.auth.updateUser({
        data: { role: 'admin', bg_club: { role: 'admin' } },
      });
      expect(metadata.error).toBeNull();
      const roleUpdate = await client
        .from('profiles')
        .update({ role: 'admin' })
        .eq('id', player.id);
      expect(roleUpdate.error).not.toBeNull();
      const { data: profile } = await service
        .from('profiles')
        .select('role')
        .eq('id', player.id)
        .single();
      expect(profile?.role).toBe('player');
      expect(await signIn(player.hook, player.password)).toMatchObject({ error: null });
    });

    it('na koniec w klubie jest dokładnie jeden administrator', async () => {
      const { data } = await service.from('profiles').select('hook').eq('role', 'admin');
      expect(data).toEqual([{ hook: admin.hook }]);
    });
  });

  describe('zakładanie klubu (CLUB-2, [008])', () => {
    const clubAdmin: { client?: SupabaseClient } = {};

    it('gracz nie założy klubu na pustej instalacji', async () => {
      const player = await createPlayer('Ewa', 'Klubowa');
      const { client } = await signIn(player.hook, player.password);
      const { error } = await client
        .from('club')
        .insert({ name: 'Klub Ewy', timezone: 'Europe/Warsaw' });
      expect(error?.code).toBe('42501');
      expect(await countRows('club')).toBe(0);
    });

    it('równoległe próby admina tworzą dokładnie jeden klub', async () => {
      // Jedna sesja (limit logowań Auth), ale cztery równoległe żądania jak z czterech kart.
      const { client } = await signIn(admin.hook, admin.password);
      clubAdmin.client = client;
      const attempts = await Promise.all(
        Array.from({ length: 4 }, (_, i) =>
          client
            .from('club')
            .insert({ name: `Klub z karty ${i + 1}`, timezone: 'Europe/Warsaw' })
            .select('name, timezone, logo_path')
            .single(),
        ),
      );
      const created = attempts.filter((attempt) => attempt.error === null);
      expect(created).toHaveLength(1);
      expect(attempts.filter((attempt) => attempt.error?.code === '23505')).toHaveLength(3);
      const { data } = await service.from('club').select('name');
      expect(data).toEqual([{ name: created[0]?.data?.name }]);
    });

    it('zmiana strefy nie przesuwa zapisanych terminów (NFR-10)', async () => {
      const { client } = clubAdmin;
      if (!client) throw new Error('brak sesji administratora z poprzedniego testu');
      const startsAt = '2026-11-20T17:00:00+00:00';
      const meeting = await client
        .from('meetings')
        .insert({ title: 'Listopadowe granie', starts_at: startsAt })
        .select('id')
        .single();
      expect(meeting.error).toBeNull();

      const update = await client
        .from('club')
        .update({ timezone: 'America/New_York' })
        .eq('id', 1)
        .select('timezone')
        .single();
      expect(update.data).toEqual({ timezone: 'America/New_York' });
      const { data } = await client
        .from('meetings')
        .select('starts_at')
        .eq('id', meeting.data?.id ?? '')
        .single();
      expect(new Date(data?.starts_at ?? '').toISOString()).toBe('2026-11-20T17:00:00.000Z');

      const invalid = await client.from('club').update({ timezone: 'Europa/Warszawa' }).eq('id', 1);
      expect(invalid.error?.code).toBe('23514');
    });
  });
});
