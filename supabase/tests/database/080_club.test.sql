-- Zakładanie klubu i strefa czasowa z perspektywy klienta.
-- Klub zakłada i edytuje tylko admin; drugi klub nie powstaje (klucz główny z CHECK id = 1,
-- także przy INSERT ... ON CONFLICT); zmiana strefy zmienia tylko `club.timezone`, a nie
-- zapisane terminy spotkań (`timestamptz`). Równoległe próby przez prawdziwe API sprawdza
-- `pnpm test:auth` (packages/accounts/integration). Dane testowe są fikcyjne.
begin;

create extension if not exists pgtap with schema extensions;

set constraints all immediate;

select plan(14);

-- a001 Ada: admin; a002 Bartek: gracz. Spotkanie c001 o 18:00 czasu polskiego (17:00 UTC).
insert into public.profiles (id, hook, first_name, last_name, role) values
  ('00000000-0000-4000-a000-000000000001', 'ada-adminowska-a001', 'Ada', 'Adminowska', 'admin'),
  ('00000000-0000-4000-a000-000000000002', 'bartek-testowy-b002', 'Bartek', 'Testowy', 'player');
insert into public.meetings (id, title, starts_at, created_by) values
  ('00000000-0000-4000-c000-000000000001', 'Listopadowe granie', '2026-11-20 17:00:00+00',
   '00000000-0000-4000-a000-000000000001');

-- =============================================================================================
-- Pusta instalacja: klubu nie ma, gracz go nie założy
-- =============================================================================================
set local role authenticated;
set local request.jwt.claims to '{"sub": "00000000-0000-4000-a000-000000000002", "role": "authenticated"}';

select is_empty($$ select 1 from public.club $$, 'pusta instalacja: brak klubu');
select throws_ok(
  $$ insert into public.club (name, timezone) values ('Klub Bartka', 'Europe/Warsaw') $$,
  '42501', null, 'gracz: nie zakłada klubu');

reset role;

-- =============================================================================================
-- Admin zakłada klub; drugiego nie ma
-- =============================================================================================
set local role authenticated;
set local request.jwt.claims to '{"sub": "00000000-0000-4000-a000-000000000001", "role": "authenticated"}';

select throws_ok(
  $$ insert into public.club (name, timezone) values ('Klub Testowy', 'Europa/Warszawa') $$,
  '23514', null, 'admin: nieznana strefa IANA jest odrzucana');
select lives_ok(
  $$ insert into public.club (name, timezone, logo_path)
     values ('Klub Testowy', 'Europe/Warsaw', 'club/logo-a.webp') $$,
  'admin: zakłada klub z nazwą, logo i strefą');
select throws_ok(
  $$ insert into public.club (name, timezone) values ('Drugi Klub', 'Europe/Warsaw') $$,
  '23505', null, 'admin: drugi klub odrzuca klucz główny (club_pkey)');
select lives_ok(
  $$ insert into public.club (name, timezone) values ('Trzeci Klub', 'Europe/Warsaw')
     on conflict (id) do nothing $$,
  'admin: INSERT ... ON CONFLICT DO NOTHING nie zgłasza błędu');
select results_eq(
  $$ select count(*)::int, min(name) from public.club $$,
  $$ values (1, 'Klub Testowy') $$,
  'admin: po wszystkich próbach jest dokładnie jeden klub, ten pierwszy');

-- =============================================================================================
-- Zmiana strefy nie zmienia terminów
-- =============================================================================================
select results_eq(
  $$ select (m.starts_at at time zone c.timezone)::text from public.meetings m, public.club c $$,
  $$ values ('2026-11-20 18:00:00') $$,
  'spotkanie w strefie klubu Europe/Warsaw: 18:00');
select lives_ok(
  $$ update public.club set timezone = 'America/New_York', name = 'Klub Po Zmianie',
     logo_path = null where id = 1 $$,
  'admin: zmienia strefę, nazwę i usuwa logo');
select is(
  (select starts_at from public.meetings where id = '00000000-0000-4000-c000-000000000001'),
  '2026-11-20 17:00:00+00'::timestamptz,
  'zmiana strefy nie zmienia zapisanego terminu (timestamptz)');
select results_eq(
  $$ select (m.starts_at at time zone c.timezone)::text from public.meetings m, public.club c $$,
  $$ values ('2026-11-20 12:00:00') $$,
  'ten sam termin w nowej strefie klubu: 12:00 w Nowym Jorku');
select throws_ok(
  $$ update public.club set name = '   ' where id = 1 $$,
  '23514', null, 'admin: nazwa klubu nie może być pusta');

reset role;

-- =============================================================================================
-- Gracz nie edytuje klubu: UPDATE nie obejmuje żadnego wiersza (RLS)
-- =============================================================================================
set local role authenticated;
set local request.jwt.claims to '{"sub": "00000000-0000-4000-a000-000000000002", "role": "authenticated"}';

select is_empty(
  $$ update public.club set timezone = 'Asia/Tokyo' where id = 1 returning id $$,
  'gracz: UPDATE klubu nie zmienia wiersza');
select results_eq(
  $$ select name, timezone, logo_path from public.club $$,
  $$ values ('Klub Po Zmianie'::text, 'America/New_York'::text, null::text) $$,
  'gracz: widzi klub z danymi zapisanymi przez admina');

reset role;

select * from finish();

rollback;
