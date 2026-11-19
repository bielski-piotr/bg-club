-- Test dymny środowiska testów SQL (pgTAP, `pnpm test:sql`).
-- Sprawdza, że lokalna baza działa na oczekiwanej wersji Postgresa i zna strefy IANA,
-- od których zależy rok w filtrze leaderboardu.
-- Testy schematu są w 010–040, testy uprawnień w 050–060, kont i logowania w 070, klubu w 080,
-- profilu i ustawień w 090, kolekcji gier w 100, wyników w 110, notesów i ich wersji w 120, spotkań
-- w 130; testy leaderboardu (rankingi, serie, filtr roku) są w 200.
begin;

create extension if not exists pgtap with schema extensions;

select plan(4);

select ok(
  current_setting('server_version_num')::int >= 170000,
  'Postgres w wersji co najmniej 17'
);
select has_schema('public', 'schemat public istnieje');
select has_schema('auth', 'schemat auth (Supabase Auth) istnieje');
select is(
  extract(year from timestamptz '2026-12-31 23:30:00+00' at time zone 'Europe/Warsaw')::int,
  2027,
  'baza zna strefy IANA: rok liczony w strefie klubu'
);

select * from finish();

rollback;
