-- [003] Rozszerzenia i funkcje pomocnicze schematu (PRD §6).
--
-- unaccent: wyszukiwanie gier bez rozróżniania wielkości liter i polskich znaków (GAME-2).
-- pg_trgm: indeks GIN dla wyszukiwania fragmentu tytułu (`ilike '%…%'`).
-- Rozszerzenia trafiają do schematu `extensions`, zgodnie z konwencją Supabase.

create extension if not exists unaccent with schema extensions;
create extension if not exists pg_trgm with schema extensions;

-- Niezmienna (immutable) nakładka na unaccent. Sama funkcja `unaccent(text)` jest tylko `stable`,
-- bo zależy od słownika wskazanego przez search_path, więc nie da się jej użyć w kolumnie
-- generowanej ani w indeksie. Wersja z jawnie wskazanym słownikiem jest deterministyczna.
create function public.f_unaccent(value text)
returns text
language sql
immutable
parallel safe
strict
set search_path = ''
return extensions.unaccent('extensions.unaccent'::regdictionary, value);

comment on function public.f_unaccent(text) is
  'Niezmienna nakładka na unaccent ze stałym słownikiem; używana w kolumnach wyszukiwania (GAME-2).';

-- Postać tekstu do wyszukiwania: bez polskich znaków i małymi literami.
-- `ł` nie ma rozkładu Unicode, ale słownik unaccent go zawiera (Ł → L, ł → l).
create function public.search_text(value text)
returns text
language sql
immutable
parallel safe
strict
set search_path = ''
return lower(public.f_unaccent(value));

comment on function public.search_text(text) is
  'Normalizacja do wyszukiwania: unaccent + lower. Ta sama funkcja buduje kolumnę i zapytanie.';

-- Czy tablica punktów zawiera wyłącznie liczby ≥ 0 z najwyżej dwoma miejscami po przecinku, bez
-- NULL, jest jednowymiarowa i ma oczekiwaną długość (GAME-5).
create function public.is_valid_points(points numeric[], expected_length int)
returns boolean
language sql
immutable
parallel safe
set search_path = ''
return points is not null
  and expected_length is not null
  and cardinality(points) = expected_length
  and (expected_length = 0 or array_ndims(points) = 1)
  and coalesce(array_lower(points, 1), 1) = 1
  and array_position(points, null) is null
  and coalesce(0 <= all (points), true)
  and not exists (select 1 from unnest(points) v where v <> round(v, 2));

comment on function public.is_valid_points(numeric[], int) is
  'Walidacja punktacji miejsc: jednowymiarowa, indeksy od 1, bez NULL, wartości ≥ 0 z najwyżej dwoma miejscami po przecinku, zadana długość.';

-- Wspólny wyzwalacz `updated_at`.
create function public.set_updated_at()
returns trigger
language plpgsql
set search_path = ''
as $$
begin
  new.updated_at := now();
  return new;
end;
$$;

comment on function public.set_updated_at() is 'Wyzwalacz BEFORE UPDATE ustawiający updated_at.';

-- Czy nazwa jest znaną strefą IANA (CLUB-2, NFR-10). Lista stref pochodzi z bazy,
-- więc funkcja jest `stable` i jest używana w wyzwalaczu, a nie w CHECK.
create function public.is_valid_timezone(tz text)
returns boolean
language sql
stable
parallel safe
set search_path = ''
return exists (select 1 from pg_catalog.pg_timezone_names where name = tz);

comment on function public.is_valid_timezone(text) is 'Czy tekst jest nazwą strefy czasowej znaną bazie (IANA).';

revoke execute on function public.set_updated_at() from public, anon, authenticated;
