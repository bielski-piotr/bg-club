-- Notesy gry i ich wersje z perspektywy klienta:
-- zapis wersji w jednej transakcji (`save_scorepad`), obraz tylko ze Storage, trwałe pliki
-- wersji, zmiana nazwy i miękkie usunięcie notesu. Dane testowe są fikcyjne.
begin;

create extension if not exists pgtap with schema extensions;

set constraints all immediate;
-- Storage blokuje bezpośrednie DELETE na storage.objects; w teście sprawdzamy same polityki.
set local storage.allow_delete_query = 'true';

select plan(35);

-- a001 Ada: admin; a002 Bartek: gracz.
insert into public.profiles (id, hook, first_name, last_name, role) values
  ('00000000-0000-4000-a000-000000000001', 'ada-adminowska-a001', 'Ada', 'Adminowska', 'admin'),
  ('00000000-0000-4000-a000-000000000002', 'bartek-testowy-b002', 'Bartek', 'Testowy', 'player');

insert into public.games (id, title, min_players, max_players, placement_points) values
  ('00000000-0000-4000-b000-000000000001', 'Żółwie Wyścigi', 2, 4, '{10,6,4,2}'),
  ('00000000-0000-4000-b000-000000000002', 'Łąka i Pszczoły', 2, 2, '{5,0}');

insert into storage.objects (bucket_id, name) values
  ('scorepads', 'b0000001/d0000001-v1.jpg'),
  ('scorepads', 'b0000001/d0000001-v2.jpg'),
  ('scorepads', 'b0000001/sierota.jpg'),
  ('covers', 'games/okladka.webp');

-- Szablon v2 bez zdjęcia (zdjęcie jest w Storage).
create temporary table tpl (body jsonb) on commit drop;
insert into tpl values ('{"v": 2, "id": "n-turniej", "name": "Turniejowy", "lines": []}');
grant select on tpl to authenticated;

-- =============================================================================================
-- Zapis: tylko admin
-- =============================================================================================
set local role authenticated;
set local request.jwt.claims to '{"sub": "00000000-0000-4000-a000-000000000002", "role": "authenticated"}';

select throws_ok(
  $$ select public.save_scorepad('00000000-0000-4000-b000-000000000001',
       '00000000-0000-4000-d000-000000000001', 'Notes Bartka', (select body from tpl),
       'b0000001/d0000001-v1.jpg', 4) $$,
  '42501', null, 'gracz: nie zapisuje notesu');

reset role;
set local role authenticated;
set local request.jwt.claims to '{"sub": "00000000-0000-4000-a000-000000000001", "role": "authenticated"}';

-- =============================================================================================
-- Pierwsza wersja tworzy notes i wskaźnik aktualnej wersji
-- =============================================================================================
select is(
  (select version from public.save_scorepad('00000000-0000-4000-b000-000000000001',
     '00000000-0000-4000-d000-000000000001', '  Turniejowy  ', (select body from tpl),
     'b0000001/d0000001-v1.jpg', 4)),
  1, 'admin: pierwszy zapis tworzy wersję 1');
select is(
  (select name from public.scorepads where id = '00000000-0000-4000-d000-000000000001'),
  'Turniejowy', 'notes dostaje nazwę bez spacji na brzegach');
select is(
  (select v.version from public.scorepads s join public.scorepad_versions v on v.id = s.current_version_id
    where s.id = '00000000-0000-4000-d000-000000000001'),
  1, 'aktualna wersja wskazuje wersję 1');
select is(
  (select image_path || ' ' || player_slots from public.scorepad_versions
    where scorepad_id = '00000000-0000-4000-d000-000000000001'),
  'b0000001/d0000001-v1.jpg 4', 'wersja ma ścieżkę obrazu i liczbę miejsc');

-- =============================================================================================
-- Kolejny zapis: nowa wersja, stara bez zmian
-- =============================================================================================
select is(
  (select version from public.save_scorepad('00000000-0000-4000-b000-000000000001',
     '00000000-0000-4000-d000-000000000001', 'Turniejowy 2',
     (select body || '{"name": "Turniejowy 2"}' from tpl), 'b0000001/d0000001-v2.jpg', 3)),
  2, 'edycja tworzy wersję 2');
select is(
  (select v.version || ' ' || s.name from public.scorepads s
     join public.scorepad_versions v on v.id = s.current_version_id
    where s.id = '00000000-0000-4000-d000-000000000001'),
  '2 Turniejowy 2', 'wskaźnik i nazwa notesu przechodzą na nową wersję');
select is(
  (select template ->> 'name' || ' ' || image_path || ' ' || player_slots
     from public.scorepad_versions
    where scorepad_id = '00000000-0000-4000-d000-000000000001' and version = 1),
  'Turniejowy b0000001/d0000001-v1.jpg 4', 'wersja 1 zostaje bez zmian');
select is(
  (select count(*)::int from public.scorepads where game_id = '00000000-0000-4000-b000-000000000001'),
  1, 'edycja nie dodaje drugiego notesu');

-- Drugi notes tej samej gry (dowolna liczba notesów). Ten sam plik może wskazywać
-- kilka wersji (edycja bez zmiany zdjęcia nie wysyła go ponownie).
select lives_ok(
  $$ select public.save_scorepad('00000000-0000-4000-b000-000000000001',
       '00000000-0000-4000-d000-000000000002', 'Uproszczony', (select body from tpl),
       'b0000001/d0000001-v2.jpg', 2) $$,
  'admin: drugi notes gry, z istniejącym już plikiem zdjęcia');

-- =============================================================================================
-- Walidacja: v2, obraz w Storage, aktywna gra i notes
-- =============================================================================================
select throws_ok(
  $$ select public.save_scorepad('00000000-0000-4000-b000-000000000001',
       '00000000-0000-4000-d000-000000000003', 'Stary', '{"v": 1, "lines": []}', null, 2) $$,
  '22023', null, 'szablon spoza formatu v2 jest odrzucany');
select throws_ok(
  $$ select public.save_scorepad('00000000-0000-4000-b000-000000000001',
       '00000000-0000-4000-d000-000000000003', 'Bez kategorii', '{"v": 2}', null, 2) $$,
  '22023', null, 'szablon bez listy kategorii jest odrzucany');
select throws_ok(
  $$ select public.save_scorepad('00000000-0000-4000-b000-000000000001',
       '00000000-0000-4000-d000-000000000003', 'Z data URL',
       '{"v": 2, "lines": [], "image": "data:image/jpeg;base64,AAAA"}',
       'b0000001/d0000001-v1.jpg', 2) $$,
  '23514', null, 'zdjęcie w JSON-ie (data URL) jest odrzucane');
select throws_ok(
  $$ insert into public.scorepad_versions (scorepad_id, template, image_path, player_slots) values
     ('00000000-0000-4000-d000-000000000001', '{"v": 1}', 'brak.jpg', 2) $$,
  '42501', null, 'admin: wersji nie doda z pominięciem save_scorepad');
select throws_ok(
  $$ insert into public.scorepads (game_id, name) values ('00000000-0000-4000-b000-000000000001', 'Pusty') $$,
  '42501', null, 'admin: notesu bez wersji nie doda z pominięciem save_scorepad');
select throws_ok(
  $$ select public.save_scorepad('00000000-0000-4000-b000-000000000001',
       '00000000-0000-4000-d000-000000000003', 'Bez zdjęcia', (select body from tpl), null, 2) $$,
  '23503', null, 'notes bez zdjęcia kartki jest odrzucany (edytor go nie otworzy)');
select throws_ok(
  $$ select public.save_scorepad('00000000-0000-4000-b000-000000000001',
       '00000000-0000-4000-d000-000000000001', 'Turniejowy 3', (select body from tpl),
       'b0000001/nie-wyslany.jpg', 4) $$,
  '23503', null, 'obraz, którego nie ma w Storage (nieudany upload), nie publikuje wersji');
select is(
  (select v.version from public.scorepads s join public.scorepad_versions v on v.id = s.current_version_id
    where s.id = '00000000-0000-4000-d000-000000000001'),
  2, 'po odrzuconym zapisie aktualna wersja się nie zmienia');
select throws_ok(
  $$ select public.save_scorepad('00000000-0000-4000-b000-000000000002',
       '00000000-0000-4000-d000-000000000001', 'Przeniesiony', (select body from tpl),
       'b0000001/d0000001-v1.jpg', 2) $$,
  '23514', null, 'notesu nie da się przenieść do innej gry');
select throws_ok(
  $$ select public.save_scorepad('00000000-0000-4000-b000-000000000001',
       '00000000-0000-4000-d000-000000000004', 'Zero miejsc', (select body from tpl),
       'b0000001/d0000001-v1.jpg', 0) $$,
  '23514', null, 'notes musi mieć co najmniej jedno miejsce dla gracza');
select is(
  (select count(*)::int from public.scorepads where id = '00000000-0000-4000-d000-000000000004'),
  0, 'odrzucona pierwsza wersja nie zostawia pustego notesu');

-- =============================================================================================
-- Storage: pliki wersji są trwałe
-- =============================================================================================
select is_empty(
  $$ delete from storage.objects where name = 'b0000001/d0000001-v1.jpg' returning name $$,
  'admin: nie usunie obrazu starej wersji');
select is_empty(
  $$ update storage.objects set name = name where name = 'b0000001/d0000001-v2.jpg' returning name $$,
  'admin: nie nadpisze obrazu aktualnej wersji');
select results_eq(
  $$ delete from storage.objects where name = 'b0000001/sierota.jpg' returning name $$,
  $$ values ('b0000001/sierota.jpg'::text) $$,
  'admin: usuwa osierocony plik notesu (sprzątanie po nieudanym zapisie)');
select results_eq(
  $$ delete from storage.objects where name = 'games/okladka.webp' returning name $$,
  $$ values ('games/okladka.webp'::text) $$,
  'admin: okładki usuwa jak dotąd');

-- =============================================================================================
-- Zmiana nazwy i miękkie usunięcie
-- =============================================================================================
select lives_ok(
  $$ update public.scorepads set name = 'Finałowy' where id = '00000000-0000-4000-d000-000000000001' $$,
  'admin: zmienia nazwę notesu');
select is(
  (select count(*)::int from public.scorepad_versions where scorepad_id = '00000000-0000-4000-d000-000000000001'),
  2, 'zmiana nazwy nie tworzy wersji');

reset role;
set local role authenticated;
set local request.jwt.claims to '{"sub": "00000000-0000-4000-a000-000000000002", "role": "authenticated"}';
select is_empty(
  $$ update public.scorepads set name = 'Mój' where id = '00000000-0000-4000-d000-000000000001' returning id $$,
  'gracz: nie zmienia nazwy notesu');

reset role;
set local role authenticated;
set local request.jwt.claims to '{"sub": "00000000-0000-4000-a000-000000000001", "role": "authenticated"}';

select lives_ok(
  $$ update public.scorepads set deleted_at = '2000-01-01' where id = '00000000-0000-4000-d000-000000000001' $$,
  'admin: usuwa notes (miękko)');
select ok(
  (select deleted_at > now() - interval '1 minute' from public.scorepads
    where id = '00000000-0000-4000-d000-000000000001'),
  'znacznik usunięcia nadaje baza');
select throws_ok(
  $$ update public.scorepads set name = 'Wskrzeszony' where id = '00000000-0000-4000-d000-000000000001' $$,
  '23514', null, 'usuniętego notesu nie da się zmieniać');
select throws_ok(
  $$ select public.save_scorepad('00000000-0000-4000-b000-000000000001',
       '00000000-0000-4000-d000-000000000001', 'Wskrzeszony', (select body from tpl),
       'b0000001/d0000001-v1.jpg', 2) $$,
  '23514', null, 'do usuniętego notesu nie dochodzą nowe wersje');
select is(
  (select count(*)::int from public.scorepad_versions where scorepad_id = '00000000-0000-4000-d000-000000000001'),
  2, 'wersje usuniętego notesu zostają czytelne dla historii');

-- Nowy notes usuniętej gry jest odrzucany.
update public.games set deleted_at = now() where id = '00000000-0000-4000-b000-000000000002';
select throws_ok(
  $$ select public.save_scorepad('00000000-0000-4000-b000-000000000002',
       '00000000-0000-4000-d000-000000000005', 'Spóźniony', (select body from tpl),
       'b0000001/d0000001-v1.jpg', 2) $$,
  '23514', null, 'gra usunięta z kolekcji nie dostaje nowych notesów');

-- Ograniczenie tabeli działa też poza API (np. skrypty z kluczem serwisowym).
reset role;
select throws_ok(
  $$ insert into public.scorepad_versions (scorepad_id, template, player_slots) values
     ('00000000-0000-4000-d000-000000000002', '{"v": 2, "lines": [], "image": "data:,"}', 2) $$,
  '23514', null, 'tabela nie przyjmie szablonu ze zdjęciem w JSON-ie');

select * from finish();

rollback;
