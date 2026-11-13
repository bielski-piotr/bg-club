-- Test dymny środowiska testów SQL (pgTAP, `pnpm test:sql`).
-- Sprawdza, że lokalna baza działa na oczekiwanej wersji Postgresa i zna strefy IANA,
-- od których zależy rok w filtrze leaderboardu (NFR-10).
-- Testy schematu są w 010–040 ([003]), testy uprawnień w 050–060 ([004]), kont i logowania w 070 ([005]), klubu w 080 ([008]), profilu i ustawień w 090 ([010]);
-- testy leaderboardu dochodzą w [032].
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
  'baza zna strefy IANA: rok liczony w strefie klubu (NFR-10)'
);

select * from finish();

rollback;
