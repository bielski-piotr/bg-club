-- Dostępność gry (games.available).
--
-- Gra (albo dodatek) może być Dostępna albo Niedostępna (np. pożyczona, zgubiona, w naprawie):
--   - niedostępna gra zostaje w kolekcji (wyszarzona), w wyszukiwaniu i w filtrach;
--   - nie da się na nią zagłosować, opublikować jej na liście „Gramy w” ani rozpocząć jej
--     partii; niedostępnego dodatku nie da się zaznaczyć w partii;
--   - oddane już głosy i opublikowane listy zostają (głos można cofnąć), a rozpoczęte i zapisane
--     partie się nie zmieniają;
--   - wyłączenie dostępności gry podstawowej wyłącza też wszystkie jej dodatki, a nowy dodatek
--     niedostępnej gry jest niedostępny; ponowne włączenie gry nie włącza dodatków.

alter table public.games
  add column available boolean not null default true;

comment on column public.games.available is
  'Dostępność gry: false = widoczna w kolekcji i filtrach, ale nie do wyboru w głosowaniu, publikacji i partii.';

grant insert (available) on public.games to authenticated;
grant update (available) on public.games to authenticated;

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

-- Głosy, opublikowane gry i partie: tylko aktywne, dostępne gry podstawowe.
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

-- Dodatki partii: aktywne i dostępne dodatki gry.
do $$
declare
  def text := pg_get_functiondef('public.plays_before_insert()'::regprocedure);
  old_fragment text := 'where g.id = e.id and g.base_game_id = new.game_id and g.deleted_at is null';
begin
  if position(old_fragment in def) = 0 then
    raise exception 'migration: fragment not found: %', old_fragment;
  end if;
  execute replace(def, old_fragment, old_fragment || ' and g.available');
end;
$$;

-- To samo sprawdzenie dodatków w `start_play` (przed wstawieniem partii), a niedostępna gra
-- podstawowa odpada wcześnie z czytelnym HINT (wyzwalacz partii i tak by ją odrzucił).
do $$
declare
  def text := pg_get_functiondef('public.start_play(uuid, uuid, uuid, uuid[], int[], uuid[])'::regprocedure);
  expansions_fragment text := 'where g.id = e.id and g.base_game_id = game.id and g.deleted_at is null';
  game_fragment text := '  expansions := array(select distinct e from unnest(coalesce(start_play.expansion_ids';
begin
  if position(expansions_fragment in def) = 0 then
    raise exception 'migration: fragment not found: %', expansions_fragment;
  end if;
  if position(game_fragment in def) = 0 then
    raise exception 'migration: fragment not found: %', game_fragment;
  end if;
  def := replace(def, expansions_fragment, expansions_fragment || ' and g.available');
  def := replace(def, game_fragment,
    '  if not game.available then
    raise exception ''game % is unavailable'', game.id
      using errcode = ''23514'', constraint = ''plays_game_available'', hint = ''games_unavailable'';
  end if;

' || game_fragment);
  execute def;
end;
$$;

-- Kolekcja z dostępnością (nowa kolumna na końcu widoku).
create or replace view public.game_collection
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

comment on column public.game_collection.available is
  'Dostępność gry: false = w kolekcji (wyszarzona) i filtrach, ale nie do wyboru w głosowaniu i partii.';

-- `search_games` zwraca wiersze widoku: odtworzenie po zmianie typu wiersza.
create or replace function public.search_games(query text default null)
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
