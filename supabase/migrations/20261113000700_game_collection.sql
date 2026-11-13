-- [012] Kolekcja gier: widżet, wyszukiwanie, formularze i miękkie usuwanie (PRD GAME-1…GAME-6,
-- GAME-8, GAME-9).
--
-- Zasady:
-- - `game_collection` to aktywne gry (bez usuniętych, GAME-8) z datą ostatniej zapisanej partii.
--   Widżet sortuje po niej malejąco (gry bez partii na końcu), potem po dacie dodania malejąco
--   i `id` (GAME-1, Q11, Q24). Widok działa z uprawnieniami wołającego (`security_invoker`),
--   więc obowiązuje RLS tabel `games` i `plays`.
-- - `search_games(query)` filtruje kolekcję po tytule bez rozróżniania wielkości liter
--   i polskich znaków (GAME-2): ta sama funkcja `search_text` (unaccent + lower) buduje kolumnę
--   `title_search` i zapytanie, a znaki `%`, `_` i `\` w zapytaniu są dosłowne.
-- - Usunięcie gry jest miękkie i nieodwracalne (GAME-8): `deleted_at` ustawia baza (`now()`),
--   a usuniętej gry nie da się już edytować ani przywrócić. Gra znika z głosowań i list gier
--   zaplanowanych spotkań; partie, wyniki i snapshoty punktacji zostają (GAME-9). Strażnik
--   aktywnej gry blokuje jej wiersz, więc głos dodany w chwili usuwania nie przetrwa.
-- - Edycja punktacji nie zmienia rozegranych partii: partia ma snapshot `points_snapshot`
--   ustawiany wyzwalaczem przy rozpoczęciu (migracja [003], GAME-9, Q23).

-- ---------------------------------------------------------------------------------------------
-- games: strażnik edycji i skutki miękkiego usunięcia (GAME-8)
-- ---------------------------------------------------------------------------------------------
create function public.games_guard_update()
returns trigger
language plpgsql
set search_path = ''
as $$
begin
  if old.deleted_at is not null then
    raise exception 'game % is deleted', old.id
      using errcode = '23514', constraint = 'games_deleted_immutable';
  end if;
  -- Znacznik usunięcia nadaje baza; klient wysyła dowolną wartość różną od NULL.
  if new.deleted_at is not null then
    new.deleted_at := now();
  end if;
  return new;
end;
$$;

create trigger games_guard_update before update on public.games
  for each row execute function public.games_guard_update();

-- Gra usunięta z kolekcji znika z głosowań i z opublikowanych list zaplanowanych spotkań
-- (jak usunięty członek, MEM-6). Spotkania w trakcie i zakończone zachowują historię.
create function public.games_after_soft_delete()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  delete from public.game_votes v
   using public.meetings m
   where m.id = v.meeting_id
     and m.status = 'planned'
     and v.game_id = new.id;

  delete from public.meeting_games mg
   using public.meetings m
   where m.id = mg.meeting_id
     and m.status = 'planned'
     and mg.game_id = new.id;

  return null;
end;
$$;

create trigger games_after_soft_delete
  after update of deleted_at on public.games
  for each row
  when (old.deleted_at is null and new.deleted_at is not null)
  execute function public.games_after_soft_delete();

-- Strażnik z migracji [003] (głosy, publikacja, nowe partie) blokuje teraz wiersz gry
-- (FOR SHARE). Bez blokady głos dodany w chwili usuwania gry mógłby przetrwać: wyzwalacz
-- powyżej nie widzi niezatwierdzonego głosu, a strażnik głosu widzi grę jeszcze aktywną.
-- Z blokadą usunięcie czeka na zatwierdzenie głosu (i go skasuje), a głos dodany po
-- usunięciu widzi już `deleted_at` i jest odrzucany.
create or replace function public.require_active_game()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
declare
  removed_at timestamptz;
begin
  select g.deleted_at into removed_at from public.games g where g.id = new.game_id for share;
  -- Nieistniejącą grę odrzuca klucz obcy.
  if removed_at is not null then
    raise exception 'game % is deleted', new.game_id
      using errcode = '23514', constraint = tg_table_name || '_game_active';
  end if;
  return new;
end;
$$;

revoke execute on function public.require_active_game() from public, anon, authenticated;

-- ---------------------------------------------------------------------------------------------
-- game_collection: aktywne gry z datą ostatniej partii (GAME-1, GAME-2)
-- ---------------------------------------------------------------------------------------------
create view public.game_collection
with (security_invoker = true)
as
select
  g.id,
  g.title,
  g.title_search,
  g.cover_path,
  g.min_players,
  g.max_players,
  g.placement_points,
  g.created_at,
  g.updated_at,
  (select max(p.saved_at)
     from public.plays p
    where p.game_id = g.id
      and p.status = 'saved') as last_played_at
from public.games g
where g.deleted_at is null;

comment on view public.game_collection is
  'Aktywne gry kolekcji (GAME-8) z datą ostatniej zapisanej partii (kolejność widżetu, GAME-1, Q11).';
comment on column public.game_collection.last_played_at is
  'saved_at ostatniej zapisanej partii gry; NULL = gra jeszcze nie grana.';

-- Wyszukiwanie po tytule (GAME-2). Zapytanie puste albo z samych spacji zwraca całą kolekcję.
create function public.search_games(query text default null)
returns setof public.game_collection
language sql
stable
security invoker
set search_path = ''
as $$
  select c.*
    from public.game_collection c
   where coalesce(btrim(query), '') = ''
      or c.title_search like '%' || replace(replace(replace(
           public.search_text(btrim(query)), '\', '\\'), '%', '\%'), '_', '\_') || '%'
   order by c.title_search, c.id;
$$;

comment on function public.search_games(text) is
  'Aktywne gry, których tytuł zawiera zapytanie (bez wielkości liter i polskich znaków, GAME-2).';

-- ---------------------------------------------------------------------------------------------
-- Uprawnienia
-- ---------------------------------------------------------------------------------------------
revoke all on public.game_collection from anon, authenticated;
grant select on public.game_collection to authenticated;

revoke execute on function public.search_games(text) from public, anon;
grant execute on function public.search_games(text) to authenticated;

revoke execute on function
  public.games_guard_update(),
  public.games_after_soft_delete()
from public, anon, authenticated;
