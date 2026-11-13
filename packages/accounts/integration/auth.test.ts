/**
 * Testy integracyjne kont i logowania na lokalnym Supabase (PRD AUTH-1…AUTH-5, AUTH-7),
 * zakładania klubu przez API (CLUB-2: równoległe próby, NFR-10), dodawania członków przez
 * Edge Function `create-member` (MEM-3, AUTH-2, AUTH-4, USR-1) oraz ustawień profilu: zmiany
 * hasła z obecnym hasłem, zdjęcia i motywu (USR-3, USR-5, USR-7, USR-8, AUTH-6) oraz usuwania
 * członka i własnego konta przez `delete-member` i `delete-own-account` (MEM-4…MEM-6, USR-6).
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

/**
 * Adres Edge Functions. Domyślnie bramka lokalnego Supabase; `BG_CLUB_FUNCTIONS_URL` pozwala
 * wskazać funkcję uruchomioną osobno (np. `deno run` w `supabase/functions`).
 */
const FUNCTIONS_URL = process.env.BG_CLUB_FUNCTIONS_URL ?? `${stack.apiUrl}/functions/v1`;

interface CreateMemberReply {
  readonly status: number;
  readonly body: {
    readonly member?: { id: string; hook: string; first_name: string; last_name: string };
    readonly password?: string;
    readonly error?: string;
    readonly problems?: Record<string, string>;
  };
}

/** `POST /functions/v1/<name>` z tokenem sesji (albo bez niego, `accessToken` = `null`). */
async function callFunction<Body>(
  name: string,
  accessToken: string | null,
  body: unknown,
): Promise<{ readonly status: number; readonly body: Body }> {
  const response = await fetch(`${FUNCTIONS_URL}/${name}`, {
    method: 'POST',
    headers: {
      apikey: stack.anonKey,
      'Content-Type': 'application/json',
      ...(accessToken ? { Authorization: `Bearer ${accessToken}` } : {}),
    },
    body: JSON.stringify(body),
  });
  return { status: response.status, body: (await response.json()) as Body };
}

const callCreateMember = (accessToken: string | null, body: unknown) =>
  callFunction<CreateMemberReply['body']>('create-member', accessToken, body);

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

  describe('dodawanie członków przez Edge Function (MEM-3, [009])', () => {
    const session = { admin: '' };

    beforeAll(async () => {
      const { data, error } = await signIn(admin.hook, admin.password);
      if (error || !data.session) throw error ?? new Error('brak sesji administratora');
      session.admin = data.session.access_token;
    });

    it('administrator tworzy konto i profil; członek loguje się hookiem i hasłem', async () => {
      const { status, body } = await callCreateMember(session.admin, {
        firstName: ' Łukasz ',
        lastName: 'Żółw',
      });
      expect(status).toBe(201);
      const hook = body.member?.hook ?? '';
      expect(hook).toMatch(/^lukasz-zolw-[0-9a-f]{4}$/);
      expect(body.password?.length).toBeGreaterThanOrEqual(12);

      const { data: profile } = await service
        .from('profiles')
        .select('id, hook, first_name, last_name, role, deleted_at')
        .eq('hook', hook)
        .single();
      expect(profile).toEqual({
        id: body.member?.id,
        hook,
        first_name: 'Łukasz',
        last_name: 'Żółw',
        role: 'player',
        deleted_at: null,
      });
      const { data: user } = await service.auth.admin.getUserById(body.member?.id ?? '');
      expect(user.user?.email).toBe(hookToEmail(hook));

      const login = await signIn(hook, body.password ?? '');
      expect(login.error).toBeNull();
    });

    it('te same imię i nazwisko dają różne hooki (kolizja)', async () => {
      const replies = await Promise.all(
        Array.from({ length: 3 }, () =>
          callCreateMember(session.admin, { firstName: 'Zoë', lastName: 'Ćwik-Łąka' }),
        ),
      );
      expect(replies.map((reply) => reply.status)).toEqual([201, 201, 201]);
      const hooks = replies.map((reply) => reply.body.member?.hook ?? '');
      expect(new Set(hooks).size).toBe(3);
      for (const hook of hooks) expect(hook).toMatch(/^zoe-cwik-laka-[0-9a-f]{4}$/);
    });

    it('gracz i niezalogowany nie dodadzą członka; nic nie powstaje', async () => {
      const player = await createPlayer('Filip', 'Zwykły');
      const { data } = await signIn(player.hook, player.password);
      const before = (await authUsers()).length;

      const asPlayer = await callCreateMember(data.session?.access_token ?? '', {
        firstName: 'Przemycony',
        lastName: 'Gracz',
      });
      expect(asPlayer).toEqual({ status: 403, body: { error: 'forbidden' } });
      const anonymous = await callCreateMember(null, { firstName: 'Anonim', lastName: 'Obcy' });
      expect(anonymous.status).toBe(401);

      expect(await authUsers()).toHaveLength(before);
      const { count } = await service
        .from('profiles')
        .select('id', { count: 'exact', head: true })
        .in('first_name', ['Przemycony', 'Anonim']);
      expect(count).toBe(0);
    });

    it('złe dane nie zostawiają konta Auth ani profilu', async () => {
      const before = (await authUsers()).length;
      const reply = await callCreateMember(session.admin, {
        firstName: 'Ola',
        lastName: 'x'.repeat(51),
      });
      expect(reply).toEqual({
        status: 400,
        body: { error: 'invalid_input', problems: { lastName: 'tooLong' } },
      });
      expect(await authUsers()).toHaveLength(before);
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

  describe('profil i ustawienia (USR-3, USR-5, USR-7, AUTH-6, [010])', () => {
    const player = { id: '', hook: '', password: '' };
    const session: { client?: SupabaseClient } = {};

    beforeAll(async () => {
      const { data, error } = await signIn(admin.hook, admin.password);
      if (error || !data.session) throw error ?? new Error('brak sesji administratora');
      const { status, body } = await callCreateMember(data.session.access_token, {
        firstName: 'Hanna',
        lastName: 'Ustawieniowa',
      });
      if (status !== 201 || !body.member || !body.password) throw new Error('brak nowego członka');
      Object.assign(player, {
        id: body.member.id,
        hook: body.member.hook,
        password: body.password,
      });
      const login = await signIn(player.hook, player.password);
      if (login.error) throw login.error;
      session.client = login.client;
    });

    it('konto z wygenerowanym hasłem ma propozycję zmiany hasła (AUTH-6)', async () => {
      const { data } = await service
        .from('profiles')
        .select('hook, password_change_suggested')
        .in('hook', [admin.hook, player.hook])
        .order('hook');
      // Bootstrap w tych testach generuje hasło administratora, create-member zawsze.
      expect(data?.map((row) => row.password_change_suggested)).toEqual([true, true]);
    });

    it('zmiana hasła wymaga poprawnego obecnego hasła i co najmniej 12 znaków (USR-5)', async () => {
      const client = session.client;
      if (!client) throw new Error('brak sesji gracza');
      const next = generatePassword();

      const missing = await client.auth.updateUser({ password: next });
      expect(missing.error?.code).toBe('current_password_required');
      const wrong = await client.auth.updateUser({
        password: next,
        current_password: 'zle-haslo-0000',
      });
      expect(wrong.error?.code).toBe('current_password_invalid');
      const short = await client.auth.updateUser({
        password: 'krotkie-1',
        current_password: player.password,
      });
      expect(short.error?.code).toBe('weak_password');

      const changed = await client.auth.updateUser({
        password: next,
        current_password: player.password,
      });
      expect(changed.error).toBeNull();
      expect((await signIn(player.hook, player.password)).error?.code).toBe('invalid_credentials');
      const login = await signIn(player.hook, next);
      expect(login.error).toBeNull();
      player.password = next;
      session.client = login.client;

      const skip = await login.client
        .from('profiles')
        .update({ password_change_suggested: false })
        .eq('id', player.id)
        .select('password_change_suggested')
        .single();
      expect(skip.data).toEqual({ password_change_suggested: false });
    });

    it('gracz zmienia imię, motyw i zdjęcie we własnym folderze (USR-3, USR-8)', async () => {
      const client = session.client;
      if (!client) throw new Error('brak sesji gracza');
      const path = `${player.id}/avatar-${crypto.randomUUID()}.webp`;
      const upload = await client.storage
        .from('avatars')
        .upload(path, new Blob(['RIFF....WEBP'], { type: 'image/webp' }), { upsert: false });
      expect(upload.error).toBeNull();
      const saved = await client
        .from('profiles')
        .update({ first_name: 'Hania', theme: 'dark', avatar_path: path })
        .eq('id', player.id)
        .select('first_name, theme, avatar_path, hook')
        .single();
      expect(saved.data).toEqual({
        first_name: 'Hania',
        theme: 'dark',
        avatar_path: path,
        hook: player.hook,
      });

      // Inni członkowie widzą zdjęcie przez podpisany URL, ale nie podmienią go.
      const { client: adminClient } = await signIn(admin.hook, admin.password);
      const signed = await adminClient.storage.from('avatars').createSignedUrl(path, 60);
      expect(signed.error).toBeNull();
      expect((await fetch(signed.data?.signedUrl ?? '')).status).toBe(200);
      const foreign = await adminClient.storage
        .from('avatars')
        .upload(`${player.id}/avatar-admina.webp`, new Blob(['x'], { type: 'image/webp' }));
      expect(foreign.error).not.toBeNull();

      // Administrator nie edytuje cudzego profilu (USR-7): RLS nie obejmuje wiersza.
      const edit = await adminClient
        .from('profiles')
        .update({ first_name: 'Zmieniona', avatar_path: null })
        .eq('id', player.id)
        .select('id');
      expect(edit.data).toEqual([]);
      const { data } = await service
        .from('profiles')
        .select('first_name, avatar_path')
        .eq('id', player.id)
        .single();
      expect(data).toEqual({ first_name: 'Hania', avatar_path: path });

      // Powrót do monogramu i usunięcie pliku przez właściciela.
      const reset = await client.from('profiles').update({ avatar_path: null }).eq('id', player.id);
      expect(reset.error).toBeNull();
      const removed = await client.storage.from('avatars').remove([path]);
      expect(removed.data).toHaveLength(1);
    });
  });

  describe('usuwanie członka i własnego konta (MEM-4…MEM-6, USR-6, AUTH-7, [011])', () => {
    type DeleteReply = { memberId?: string; deleted?: boolean; error?: string };
    const callDeleteMember = (token: string | null, body: unknown) =>
      callFunction<DeleteReply>('delete-member', token, body);
    const callDeleteOwnAccount = (token: string | null, body: unknown) =>
      callFunction<DeleteReply>('delete-own-account', token, body);

    const ids = { admin: '', game: '', finished: '', running: '', planned: '' };
    const session: { admin?: SupabaseClient; adminToken: string } = { adminToken: '' };
    type Member = { id: string; hook: string; password: string };
    const host: Member = { id: '', hook: '', password: '' };
    const leaver: Member = { id: '', hook: '', password: '' };

    async function newMember(target: Member, firstName: string, lastName: string) {
      const { status, body } = await callCreateMember(session.adminToken, { firstName, lastName });
      if (status !== 201 || !body.member || !body.password) throw new Error('brak nowego członka');
      Object.assign(target, {
        id: body.member.id,
        hook: body.member.hook,
        password: body.password,
      });
    }

    async function insert(table: string, rows: object | object[]) {
      const { error } = await service.from(table).insert(rows);
      if (error) throw new Error(`${table}: ${error.message}`);
    }

    async function meeting(title: string): Promise<string> {
      const { data, error } = await service
        .from('meetings')
        .insert({ title, starts_at: '2026-12-01T17:00:00Z', created_by: ids.admin })
        .select('id')
        .single();
      if (error) throw new Error(`meetings: ${error.message}`);
      return data.id as string;
    }

    async function setMeeting(id: string, values: object) {
      const { error } = await service.from('meetings').update(values).eq('id', id);
      if (error) throw new Error(`meetings: ${error.message}`);
    }

    async function hostOf(id: string): Promise<string | null> {
      const { data } = await service.from('meetings').select('host_id').eq('id', id).single();
      return (data?.host_id as string | null | undefined) ?? null;
    }

    async function isParticipant(meetingId: string, profileId: string): Promise<boolean> {
      const { count } = await service
        .from('meeting_participants')
        .select('profile_id', { count: 'exact', head: true })
        .eq('meeting_id', meetingId)
        .eq('profile_id', profileId);
      return count === 1;
    }

    beforeAll(async () => {
      const { client, data, error } = await signIn(admin.hook, admin.password);
      if (error || !data.session) throw error ?? new Error('brak sesji administratora');
      session.admin = client;
      session.adminToken = data.session.access_token;
      ids.admin = data.session.user.id;
      await newMember(host, 'Igor', 'Prowadzący');
      await newMember(leaver, 'Julia', 'Odchodząca');

      const { data: game, error: gameError } = await service
        .from('games')
        .insert({
          title: 'Gra do głosowania',
          min_players: 2,
          max_players: 4,
          placement_points: [5, 3, 2, 1],
        })
        .select('id')
        .single();
      if (gameError) throw new Error(`games: ${gameError.message}`);
      ids.game = game.id as string;

      // Zakończone spotkanie prowadzone przez Igora (MEM-6: zachowuje prowadzącego).
      ids.finished = await meeting('Spotkanie zakończone');
      await insert('meeting_participants', { meeting_id: ids.finished, profile_id: host.id });
      await setMeeting(ids.finished, { host_id: host.id });
      await setMeeting(ids.finished, {
        status: 'in_progress',
        voting_open: false,
        started_at: '2026-11-01T17:00:00Z',
      });
      await setMeeting(ids.finished, { status: 'finished', finished_at: '2026-11-01T21:00:00Z' });

      // Spotkanie w trakcie: Igor i Julia uczestniczą, Igor prowadzi.
      ids.running = await meeting('Spotkanie w trakcie');
      await insert('meeting_participants', [
        { meeting_id: ids.running, profile_id: host.id },
        { meeting_id: ids.running, profile_id: leaver.id },
      ]);
      await setMeeting(ids.running, { host_id: host.id });
      await setMeeting(ids.running, {
        status: 'in_progress',
        voting_open: false,
        started_at: '2026-11-13T17:00:00Z',
      });

      // Zaplanowane spotkanie z otwartym głosowaniem: oboje uczestniczą i głosują, Igor prowadzi.
      ids.planned = await meeting('Spotkanie zaplanowane');
      await insert('meeting_participants', [
        { meeting_id: ids.planned, profile_id: host.id },
        { meeting_id: ids.planned, profile_id: leaver.id },
      ]);
      await setMeeting(ids.planned, { host_id: host.id });
      await insert('game_votes', [
        { meeting_id: ids.planned, game_id: ids.game, profile_id: host.id },
        { meeting_id: ids.planned, game_id: ids.game, profile_id: leaver.id },
      ]);
    });

    it('gracz i niezalogowany nie usuną członka; administratora nie usunie nikt', async () => {
      const { data } = await signIn(leaver.hook, leaver.password);
      const asPlayer = await callDeleteMember(data.session?.access_token ?? '', {
        memberId: host.id,
      });
      expect(asPlayer).toEqual({ status: 403, body: { error: 'forbidden' } });
      const anonymous = await callDeleteMember(null, { memberId: host.id });
      expect(anonymous.status).toBe(401);
      const adminTarget = await callDeleteMember(session.adminToken, { memberId: ids.admin });
      expect(adminTarget).toEqual({ status: 409, body: { error: 'admin_protected' } });
      const ownAdmin = await callDeleteOwnAccount(session.adminToken, { password: admin.password });
      expect(ownAdmin).toEqual({ status: 403, body: { error: 'admin_protected' } });

      const { data: profiles } = await service
        .from('profiles')
        .select('id')
        .in('id', [ids.admin, host.id])
        .is('deleted_at', null);
      expect(profiles).toHaveLength(2);
    });

    it('administrator usuwa prowadzącego: znika z list i zaplanowanych spotkań, historia zostaje', async () => {
      const hostSession = await signIn(host.hook, host.password);
      expect(hostSession.error).toBeNull();

      const reply = await callDeleteMember(session.adminToken, { memberId: host.id });
      expect(reply).toEqual({ status: 200, body: { memberId: host.id } });

      // Istniejąca sesja usuniętego: token dostępu jeszcze ważny, ale bez danych i bez odświeżenia.
      const after = await hostSession.client.from('profiles').select('hook');
      expect(after.data).toEqual([]);
      const refreshed = await hostSession.client.auth.refreshSession();
      expect(refreshed.error).not.toBeNull();
      expect(refreshed.data.session).toBeNull();
      // Auth zaciera techniczny e-mail: ponowne logowanie hookiem nie znajduje konta.
      const again = await signIn(host.hook, host.password);
      expect(again.error).not.toBeNull();
      expect(again.data.session).toBeNull();

      // Profil zostaje w historii (tylko do odczytu), ale nie ma go na liście członków.
      const client = session.admin;
      if (!client) throw new Error('brak sesji administratora');
      const { data: profile } = await client
        .from('profiles')
        .select('hook, deleted_at')
        .eq('id', host.id)
        .single();
      expect(profile?.hook).toBe(host.hook);
      expect(profile?.deleted_at).not.toBeNull();
      const { data: members } = await client.from('profiles').select('id').is('deleted_at', null);
      expect(members?.map((row) => row.id)).not.toContain(host.id);

      // MEM-6: zaplanowane bez niego i jego głosów, prowadzenie wraca do admina w niezakończonych.
      expect(await isParticipant(ids.planned, host.id)).toBe(false);
      const { data: votes } = await service
        .from('game_votes')
        .select('profile_id')
        .eq('meeting_id', ids.planned);
      expect(votes).toEqual([{ profile_id: leaver.id }]);
      expect(await hostOf(ids.planned)).toBeNull();
      expect(await hostOf(ids.running)).toBeNull();
      expect(await isParticipant(ids.running, host.id)).toBe(true);
      expect(await hostOf(ids.finished)).toBe(host.id);
    });

    it('usuniętego nie da się dodać do spotkania; ponowienie usunięcia nic nie psuje', async () => {
      const client = session.admin;
      if (!client) throw new Error('brak sesji administratora');
      const join = await client
        .from('meeting_participants')
        .insert({ meeting_id: ids.planned, profile_id: host.id });
      expect(join.error?.code).toBe('23514');
      const fresh = await meeting('Nowe spotkanie');
      const joinFresh = await client
        .from('meeting_participants')
        .insert({ meeting_id: fresh, profile_id: host.id });
      expect(joinFresh.error?.code).toBe('23514');

      const { data: before } = await service
        .from('profiles')
        .select('deleted_at')
        .eq('id', host.id)
        .single();
      const retry = await callDeleteMember(session.adminToken, { memberId: host.id });
      expect(retry).toEqual({ status: 200, body: { memberId: host.id } });
      const { data: afterRetry } = await service
        .from('profiles')
        .select('deleted_at')
        .eq('id', host.id)
        .single();
      expect(afterRetry?.deleted_at).toBe(before?.deleted_at);

      const unknown = await callDeleteMember(session.adminToken, {
        memberId: '00000000-0000-4000-a000-0000000000ff',
      });
      expect(unknown).toEqual({ status: 404, body: { error: 'not_found' } });
    });

    it('gracz usuwa własne konto tylko z poprawnym hasłem (USR-6)', async () => {
      const own = await signIn(leaver.hook, leaver.password);
      const token = own.data.session?.access_token ?? '';

      const wrong = await callDeleteOwnAccount(token, { password: 'zle-haslo-123456' });
      expect(wrong).toEqual({ status: 400, body: { error: 'wrong_password' } });
      const missing = await callDeleteOwnAccount(token, {});
      expect(missing).toEqual({ status: 400, body: { error: 'invalid_body' } });
      const { data: still } = await own.client.from('profiles').select('id').eq('id', leaver.id);
      expect(still).toHaveLength(1);

      const done = await callDeleteOwnAccount(token, { password: leaver.password });
      expect(done).toEqual({ status: 200, body: { deleted: true } });

      const after = await own.client.from('profiles').select('id');
      expect(after.data).toEqual([]);
      expect((await own.client.auth.refreshSession()).data.session).toBeNull();
      expect((await signIn(leaver.hook, leaver.password)).data.session).toBeNull();
      // Ten sam token nie usunie konta drugi raz (konto nie jest już aktywne).
      const twice = await callDeleteOwnAccount(token, { password: leaver.password });
      expect(twice).toEqual({ status: 401, body: { error: 'unauthorized' } });

      // Te same skutki MEM-6 co przy usunięciu przez administratora.
      expect(await isParticipant(ids.planned, leaver.id)).toBe(false);
      expect(await isParticipant(ids.running, leaver.id)).toBe(true);
      const { count } = await service
        .from('game_votes')
        .select('profile_id', { count: 'exact', head: true })
        .eq('meeting_id', ids.planned);
      expect(count).toBe(0);
    });

    it('administrator nadal się loguje i jest jedynym aktywnym administratorem', async () => {
      expect((await signIn(admin.hook, admin.password)).error).toBeNull();
      const { data } = await service
        .from('profiles')
        .select('hook')
        .eq('role', 'admin')
        .is('deleted_at', null);
      expect(data).toEqual([{ hook: admin.hook }]);
    });
  });
});
