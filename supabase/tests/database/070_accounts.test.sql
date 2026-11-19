-- Konta Auth i logowanie: profil powstaje razem z kontem
-- Auth z `app_metadata.bg_club`, pierwszym kontem jest administrator, drugi administrator nie
-- powstanie, techniczny e-mail jest niezmienny, a hook `custom_access_token` odmawia sesji
-- kontu bez aktywnego profilu. Ścieżkę przez prawdziwe API Auth sprawdzają testy integracyjne
-- (`pnpm test:auth`). Dane testowe są fikcyjne.
begin;

create extension if not exists pgtap with schema extensions;

-- Wyzwalacz konta jest odroczony do końca transakcji; w teście sprawdzamy go od razu.
set constraints all immediate;

select plan(24);

-- ---------------------------------------------------------------------------------------------
-- Struktura i prawa
-- ---------------------------------------------------------------------------------------------
select has_trigger('auth', 'users', 'on_auth_user_created', 'konto Auth tworzy profil (wyzwalacz)');
select ok(
  (select tgdeferrable and tginitdeferred from pg_trigger
    where tgrelid = 'auth.users'::regclass and tgname = 'on_auth_user_created'),
  'wyzwalacz profilu działa na końcu transakcji (Auth dopisuje app_metadata osobnym UPDATE)'
);
select has_trigger('auth', 'users', 'auth_users_guard_email', 'techniczny e-mail jest chroniony wyzwalaczem');
select ok(
  has_function_privilege('supabase_auth_admin', 'public.custom_access_token_hook(jsonb)', 'execute'),
  'Auth może wywołać hook custom_access_token'
);
select ok(
  not has_function_privilege('anon', 'public.custom_access_token_hook(jsonb)', 'execute')
    and not has_function_privilege('authenticated', 'public.custom_access_token_hook(jsonb)', 'execute'),
  'klient nie wywoła hooka (nie sprawdzi nim cudzych kont)'
);

-- ---------------------------------------------------------------------------------------------
-- Pusta instalacja: pierwszym kontem jest administrator
-- ---------------------------------------------------------------------------------------------
select throws_ok(
  $$ insert into auth.users (id, email) values
       ('00000000-0000-4000-a000-0000000000f1', 'obcy-uzytkownik-f001@users.bgclub.invalid') $$,
  '42501',
  'accounts are created only by the server (app_metadata.bg_club is missing)',
  'konto bez app_metadata.bg_club (signup, panel Supabase) nie powstaje'
);
select throws_like(
  $$ insert into auth.users (id, email, raw_app_meta_data) values
       ('00000000-0000-4000-a000-000000000002', 'bartek-testowy-b002@users.bgclub.invalid',
        '{"bg_club": {"first_name": "Bartek", "last_name": "Testowy", "role": "player"}}') $$,
  '%administrator account must be created first%',
  'konto gracza nie powstanie przed kontem administratora'
);
select throws_like(
  $$ insert into auth.users (id, email, raw_app_meta_data) values
       ('00000000-0000-4000-a000-000000000001', 'ada@example.com',
        '{"bg_club": {"first_name": "Ada", "last_name": "Adminowska", "role": "admin"}}') $$,
  '%<hook>@users.bgclub.invalid%',
  'konto musi mieć techniczny e-mail <hook>@users.bgclub.invalid'
);
select lives_ok(
  $$ insert into auth.users (id, email, raw_app_meta_data) values
       ('00000000-0000-4000-a000-000000000001', 'ada-adminowska-a001@users.bgclub.invalid',
        '{"bg_club": {"first_name": " Ada ", "last_name": "Adminowska ", "role": "admin"}}') $$,
  'pierwsze konto (bootstrap) to administrator'
);
select results_eq(
  $$ select hook, first_name, last_name, role from public.profiles $$,
  $$ values ('ada-adminowska-a001'::text, 'Ada'::text, 'Adminowska'::text, 'admin'::text) $$,
  'profil administratora: hook z e-maila, imię i nazwisko bez spacji na brzegach'
);
select throws_like(
  $$ insert into auth.users (id, email, raw_app_meta_data) values
       ('00000000-0000-4000-a000-0000000000f2', 'obcy-admin-f002@users.bgclub.invalid',
        '{"bg_club": {"first_name": "Obcy", "last_name": "Admin", "role": "admin"}}') $$,
  '%only on an empty installation%',
  'ponowiony bootstrap nie utworzy drugiego administratora'
);
select lives_ok(
  $$ insert into auth.users (id, email, raw_app_meta_data) values
       ('00000000-0000-4000-a000-000000000002', 'bartek-testowy-b002@users.bgclub.invalid',
        '{"bg_club": {"first_name": "Bartek", "last_name": "Testowy"}}') $$,
  'konto gracza powstaje po administratorze'
);
select is(
  (select role from public.profiles where id = '00000000-0000-4000-a000-000000000002'),
  'player',
  'bez roli w app_metadata konto jest kontem gracza'
);
select throws_like(
  $$ insert into auth.users (id, email, raw_app_meta_data) values
       ('00000000-0000-4000-a000-0000000000f3', 'zly_hook-f003@users.bgclub.invalid',
        '{"bg_club": {"first_name": "Zły", "last_name": "Hook"}}') $$,
  '%profiles_hook_format%',
  'hook z e-maila musi mieć poprawny format'
);
select is(
  (select count(*)::int from auth.users where id::text like '00000000-0000-4000-a000-0000000000f%'),
  0,
  'odrzucone konto nie zostawia wiersza w auth.users (konto i profil w jednej transakcji)'
);

-- ---------------------------------------------------------------------------------------------
-- Techniczny e-mail jest niezmienny
-- ---------------------------------------------------------------------------------------------
select throws_like(
  $$ update auth.users set email = 'ada-adminowska-a001@users.bgclub.invalid'
      where id = '00000000-0000-4000-a000-000000000002' $$,
  '%cannot change%',
  'gracz nie zmieni e-maila konta (np. na adres innego hooka)'
);
select throws_like(
  $$ update auth.users set email_change = 'nowy-hook-0000@users.bgclub.invalid'
      where id = '00000000-0000-4000-a000-000000000002' $$,
  '%cannot change%',
  'nie da się zgłosić zmiany e-maila (Auth wysłałby wiadomość na adres .invalid)'
);
select lives_ok(
  $$ update auth.users set email = email, encrypted_password = 'zmienione-haslo', email_change = ''
      where id = '00000000-0000-4000-a000-000000000002' $$,
  'inne zmiany konta (hasło, zapis tego samego e-maila) działają'
);
select lives_ok(
  $$ update auth.users set email = 'zatarty-0000@deleted.invalid', deleted_at = now()
      where id = '00000000-0000-4000-a000-000000000002' $$,
  'miękkie usunięcie konta w Auth (zatarcie e-maila) nie jest blokowane'
);

-- ---------------------------------------------------------------------------------------------
-- Hook custom_access_token: sesja tylko dla aktywnego profilu
-- ---------------------------------------------------------------------------------------------
create function pg_temp.token_event(user_id text)
returns jsonb
language sql
return jsonb_build_object(
  'user_id', user_id,
  'claims', jsonb_build_object('sub', user_id, 'role', 'authenticated', 'aal', 'aal1'),
  'authentication_method', 'password'
);

select is(
  public.custom_access_token_hook(pg_temp.token_event('00000000-0000-4000-a000-000000000001')),
  jsonb_build_object('claims', pg_temp.token_event('00000000-0000-4000-a000-000000000001') -> 'claims'),
  'aktywne konto: hook zwraca claims bez zmian'
);

update public.profiles set deleted_at = now() where id = '00000000-0000-4000-a000-000000000002';

select is(
  public.custom_access_token_hook(pg_temp.token_event('00000000-0000-4000-a000-000000000002')),
  '{"error": {"http_code": 403, "message": "account_inactive"}}'::jsonb,
  'usunięte konto: Auth odmawia logowania i odświeżenia sesji'
);
select is(
  public.custom_access_token_hook(pg_temp.token_event('00000000-0000-4000-a000-0000000000f9')),
  '{"error": {"http_code": 403, "message": "account_inactive"}}'::jsonb,
  'konto bez profilu: odmowa'
);
select is(
  public.custom_access_token_hook(pg_temp.token_event('nie-uuid')),
  '{"error": {"http_code": 403, "message": "account_inactive"}}'::jsonb,
  'błędny identyfikator konta: odmowa zamiast wyjątku'
);

-- Auth wywołuje hook jako supabase_auth_admin (tej roli test nie przyjmie; wywołanie przez
-- prawdziwe Auth sprawdza `pnpm test:auth`). SECURITY DEFINER pozwala czytać profile bez
-- polityk RLS dla tej roli; pusty search_path wymusza test 050.
select ok(
  (select prosecdef from pg_proc where oid = 'public.custom_access_token_hook(jsonb)'::regprocedure),
  'hook czyta profile jako właściciel tabel (SECURITY DEFINER), więc RLS go nie ogranicza'
);

select * from finish();

rollback;
