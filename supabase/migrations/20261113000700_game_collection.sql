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
-- - `games.complexity`: skomplikowanie gry 1,00…5,00, wymagane przy dodaniu gry przez aplikację
--   i przy każdej edycji gry, która je ma. Formularz gry wylicza z niego punktację miejsc
--   (`complexityPoints` w `@bg-club/scoring`); baza sprawdza tylko poprawność punktacji, bo
--   administrator może ją poprawić ręcznie.
-- - Dodatki (`games.base_game_id`): dodatek to wiersz `games` wskazujący grę podstawową, z własnym
--   tytułem, okładką, liczbą graczy, skomplikowaniem, punktacją i notesami. Gra podstawowa nie
--   jest dodatkiem (bez zagnieżdżania) i jest aktywna przy dodaniu dodatku, a `base_game_id`
--   jest niezmienne; usunięcie gry podstawowej usuwa (miękko) jej dodatki. Dodatków nie ma
--   w kolekcji, wyszukiwaniu ani w głosowaniu: głosy, opublikowane gry i partie przyjmują tylko
--   gry podstawowe.
-- - Kadrowanie okładki: `games.cover_source_path` to oryginał (przeskalowany) w buckecie
--   `covers`, z którego aplikacja wycina okładkę, a `games.cover_crop` to kadr.
-- - Dostępność (`games.available`): niedostępna gra (np. pożyczona) zostaje w kolekcji,
--   wyszukiwaniu i filtrach, ale nie da się na nią zagłosować, opublikować jej ani rozpocząć jej
--   partii (niedostępnego dodatku nie da się zaznaczyć w partii). Oddane głosy, opublikowane
--   listy i partie zostają. Wyłączenie gry podstawowej wyłącza jej dodatki, a nowy dodatek
--   niedostępnej gry jest niedostępny; ponowne włączenie gry nie włącza dodatków.

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

-- Skomplikowanie jest wymagane przy dodaniu gry przez aplikację (rola `authenticated`, formularz
-- GAME-4); gra, która je ma, nie może go stracić. Import i dane techniczne (service_role,
-- właściciel bazy) mogą dodać grę bez niego.
create function public.games_require_complexity()
returns trigger
language plpgsql
set search_path = ''
as $$
begin
  if new.complexity is null
     and ((tg_op = 'INSERT' and current_user = 'authenticated')
          or (tg_op = 'UPDATE' and old.complexity is not null)) then
    raise exception 'game complexity is required'
      using errcode = '23502', constraint = 'games_complexity_required', hint = 'games_complexity_required';
  end if;
  return new;
end;
$$;

revoke execute on function public.games_require_complexity() from public, anon, authenticated;

create trigger games_require_complexity before insert or update on public.games
  for each row execute function public.games_require_complexity();

-- Dodatki: gra podstawowa istnieje, jest aktywna i nie jest dodatkiem; base_game_id niezmienne.
create function public.games_guard_expansion()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
declare
  base public.games;
begin
  if tg_op = 'UPDATE' then
    if new.base_game_id is distinct from old.base_game_id then
      raise exception 'games.base_game_id is immutable'
        using errcode = '23514', constraint = 'games_base_game_immutable';
    end if;
    return new;
  end if;

  if new.base_game_id is not null then
    -- Blokada gry podstawowej: równoległe usunięcie czeka albo dodatek widzi `deleted_at`.
    select g.* into base from public.games g where g.id = new.base_game_id for share;
    if not found then
      raise exception 'base game % does not exist', new.base_game_id
        using errcode = '23503', constraint = 'games_base_game_id_fkey';
    end if;
    if base.base_game_id is not null then
      raise exception 'expansion % cannot have expansions', base.id
        using errcode = '23514', constraint = 'games_expansion_of_base', hint = 'games_expansion_of_base';
    end if;
    if base.deleted_at is not null then
      raise exception 'game % is deleted', base.id
        using errcode = '23514', constraint = 'games_base_game_active', hint = 'games_base_game_active';
    end if;
  end if;
  return new;
end;
$$;

revoke execute on function public.games_guard_expansion() from public, anon, authenticated;

create trigger games_guard_expansion before insert or update on public.games
  for each row execute function public.games_guard_expansion();

-- Wyłączenie gry podstawowej wyłącza jej dodatki (włączenie niczego w dodatkach nie zmienia).
create function public.games_after_unavailable()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  update public.games g
     set available = false
   where g.base_game_id = new.id
     and g.available
     and g.deleted_at is null;
  return null;
end;
$$;

revoke execute on function public.games_after_unavailable() from public, anon, authenticated;

create trigger games_after_unavailable after update of available on public.games
  for each row
  when (old.available and not new.available and new.base_game_id is null)
  execute function public.games_after_unavailable();

-- Nowy dodatek niedostępnej gry jest niedostępny.
create function public.games_expansion_availability()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  if new.base_game_id is not null and exists (
    select 1 from public.games g where g.id = new.base_game_id and not g.available
  ) then
    new.available := false;
  end if;
  return new;
end;
$$;

revoke execute on function public.games_expansion_availability() from public, anon, authenticated;

create trigger games_expansion_availability before insert on public.games
  for each row execute function public.games_expansion_availability();

-- Gra usunięta z kolekcji znika z głosowań i z opublikowanych list zaplanowanych spotkań
-- (jak usunięty członek, MEM-6). Spotkania w trakcie i zakończone zachowują historię.
-- Usunięcie gry podstawowej usuwa (miękko) jej dodatki; zostają w historii.
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

  update public.games g
     set deleted_at = now()
   where g.base_game_id = new.id
     and g.deleted_at is null;

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
-- usunięciu widzi już `deleted_at` i jest odrzucany. Głosy, opublikowane gry i partie
-- przyjmują tylko aktywne, dostępne gry podstawowe.
create or replace function public.require_active_game()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
declare
  removed_at timestamptz;
  base uuid;
  is_available boolean;
begin
  select g.deleted_at, g.base_game_id, g.available into removed_at, base, is_available
    from public.games g where g.id = new.game_id for share;
  -- Nieistniejącą grę odrzuca klucz obcy.
  if removed_at is not null then
    raise exception 'game % is deleted', new.game_id
      using errcode = '23514', constraint = tg_table_name || '_game_active';
  end if;
  if base is not null then
    raise exception 'game % is an expansion', new.game_id
      using errcode = '23514', constraint = tg_table_name || '_base_game', hint = 'games_expansion_not_allowed';
  end if;
  if not is_available then
    raise exception 'game % is unavailable', new.game_id
      using errcode = '23514', constraint = tg_table_name || '_game_available', hint = 'games_unavailable';
  end if;
  return new;
end;
$$;

revoke execute on function public.require_active_game() from public, anon, authenticated;

-- ---------------------------------------------------------------------------------------------
-- game_collection: aktywne gry i dodatki z datą ostatniej partii (GAME-1, GAME-2)
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
    where p.status = 'saved'
      and (p.game_id = g.id or g.id = any (p.expansion_ids))) as last_played_at,
  g.complexity,
  g.base_game_id,
  g.cover_source_path,
  g.cover_crop,
  case when g.base_game_id is not null then
    (select count(*) from public.plays p
      where p.status = 'saved' and p.game_id = g.base_game_id and g.id = any (p.expansion_ids))::int
  end as play_count,
  g.available
from public.games g
where g.deleted_at is null;

comment on view public.game_collection is
  'Aktywne gry i dodatki (base_game_id) z datą ostatniej zapisanej partii (GAME-1, Q11); kolekcja to wiersze bez base_game_id.';
comment on column public.game_collection.last_played_at is
  'saved_at ostatniej zapisanej partii gry (dodatku: partii z tym dodatkiem); NULL = jeszcze nie grana.';
comment on column public.game_collection.play_count is
  'Dodatek: liczba zapisanych partii z tym dodatkiem; gra podstawowa: NULL (statystyki w game_stats).';
comment on column public.game_collection.available is
  'Dostępność gry: false = w kolekcji (wyszarzona) i filtrach, ale nie do wyboru w głosowaniu i partii.';

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
   where c.base_game_id is null
     and (coalesce(btrim(query), '') = ''
      or c.title_search like '%' || replace(replace(replace(
           public.search_text(btrim(query)), '\', '\\'), '%', '\%'), '_', '\_') || '%')
   order by c.title_search, c.id;
$$;

comment on function public.search_games(text) is
  'Aktywne gry podstawowe (bez dodatków), których tytuł zawiera zapytanie (bez wielkości liter i polskich znaków, GAME-2).';

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
