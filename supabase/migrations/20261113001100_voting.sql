-- [024] Głosowanie, publikacja gier i ponowne otwarcie (PRD VOTE-1…VOTE-6, PLAN-2, PLAN-3).
--
-- Zasady:
-- - Głos to wiersz `game_votes`, który uczestnik dodaje i usuwa sam (RLS z migracji [003]):
--   tylko własny, tylko przy otwartym głosowaniu, jeden na grę (klucz główny), bez limitu gier.
--   Głos po zamknięciu odrzuca wyzwalacz `game_votes_require_open_voting` (blokuje wiersz
--   spotkania FOR SHARE, więc czeka na równoległe zamknięcie), głos na usuniętą grę odrzuca
--   `require_active_game`, a głos nie-uczestnika klucz obcy do `meeting_participants`.
--   Usunięcie uczestnika (save_meeting), gry (games_after_soft_delete) albo spotkania kasuje
--   głosy. Ta migracja tego nie zmienia; testy są w 140_voting.test.sql.
-- - Publikacja gier (`publish_meeting_games`, VOTE-5) zamyka głosowanie i zapisuje listę
--   „Gramy w:” w jednej transakcji. Admin wybiera dowolne aktywne gry z kolekcji, także bez
--   głosów; kolejność tablicy to kolejność listy. Ponowna publikacja w zaplanowanym spotkaniu
--   zastępuje listę. Głosy zostają (jawna historia głosowania, Q18).
-- - Ponowne otwarcie (`reopen_voting`, VOTE-6) jest możliwe tylko przed rozpoczęciem
--   spotkania. Usuwa opublikowaną listę: otwarte głosowanie i „Gramy w:” się wykluczają, a
--   rozpoczęcie przy otwartym głosowaniu (RUN-1) nie może pokazać nieaktualnej listy.
-- - Obie funkcje wywołuje tylko admin (§2.1, prowadzący nie publikuje). `authenticated` traci
--   bezpośredni zapis `meeting_games`: lista zmienia się tylko razem z flagą głosowania.
-- - Błędy reguł mają SQLSTATE 23514 i nazwę reguły w HINT, jak w migracji [023].

-- ---------------------------------------------------------------------------------------------
-- publish_meeting_games: zamknięcie głosowania z listą gier (VOTE-5)
-- ---------------------------------------------------------------------------------------------
create function public.publish_meeting_games(meeting_id uuid, game_ids uuid[])
returns public.meetings
language plpgsql
security definer
set search_path = ''
as $$
declare
  current_meeting public.meetings;
  saved public.meetings;
  games uuid[];
begin
  perform private.require_admin();

  -- Bez duplikatów i NULL-i, w kolejności pierwszego wystąpienia.
  select coalesce(array_agg(g.id order by g.first), '{}')
    into games
    from (
      select p.id, min(p.ord) as first
        from unnest(coalesce(publish_meeting_games.game_ids, '{}')) with ordinality as p(id, ord)
       where p.id is not null
       group by p.id
    ) g;
  if cardinality(games) = 0 then
    raise exception 'choose at least one game to publish'
      using errcode = '23514', constraint = 'meeting_games_required', hint = 'meeting_games_required';
  end if;

  -- Blokada wiersza spotkania: głosy dodawane równolegle czekają i widzą zamknięte głosowanie.
  select m.* into current_meeting from public.meetings m where m.id = publish_meeting_games.meeting_id for update;
  if not found then
    raise exception 'meeting % does not exist', publish_meeting_games.meeting_id
      using errcode = 'P0002', hint = 'meetings_not_found';
  end if;
  if current_meeting.status <> 'planned' then
    raise exception 'meeting % is not planned', current_meeting.id
      using errcode = '23514', constraint = 'meeting_games_planned', hint = 'meeting_games_planned';
  end if;

  -- Blokada gier: równoległe usunięcie gry czeka na publikację (i usunie ją z listy) albo
  -- publikacja widzi już `deleted_at`.
  perform 1 from public.games g where g.id = any (games) for share;
  if exists (
    select 1 from unnest(games) p(id)
     where not exists (select 1 from public.games g where g.id = p.id and g.deleted_at is null)
  ) then
    raise exception 'only active games can be published'
      using errcode = '23514', constraint = 'meeting_games_game_active', hint = 'meeting_games_game_active';
  end if;

  delete from public.meeting_games mg where mg.meeting_id = current_meeting.id;
  insert into public.meeting_games (meeting_id, game_id, position)
  select current_meeting.id, p.id, (p.ord - 1)::int
    from unnest(games) with ordinality as p(id, ord);

  update public.meetings m
     set voting_open = false
   where m.id = current_meeting.id
  returning * into saved;
  return saved;
end;
$$;

comment on function public.publish_meeting_games(uuid, uuid[]) is
  'Zamyka głosowanie i publikuje listę „Gramy w:” z dowolnych aktywnych gier (VOTE-5). Tylko admin, tylko zaplanowane spotkanie.';

-- ---------------------------------------------------------------------------------------------
-- reopen_voting: ponowne otwarcie przed rozpoczęciem (VOTE-6)
-- ---------------------------------------------------------------------------------------------
create function public.reopen_voting(meeting_id uuid)
returns public.meetings
language plpgsql
security definer
set search_path = ''
as $$
declare
  current_meeting public.meetings;
  saved public.meetings;
begin
  perform private.require_admin();

  select m.* into current_meeting from public.meetings m where m.id = reopen_voting.meeting_id for update;
  if not found then
    raise exception 'meeting % does not exist', reopen_voting.meeting_id
      using errcode = 'P0002', hint = 'meetings_not_found';
  end if;
  if current_meeting.status <> 'planned' then
    raise exception 'meeting % has started; voting cannot be reopened', current_meeting.id
      using errcode = '23514', constraint = 'meetings_reopen_planned', hint = 'meetings_reopen_planned';
  end if;
  -- Ponowienie (np. po błędzie sieci) przy otwartym głosowaniu niczego nie zmienia.
  if current_meeting.voting_open then
    return current_meeting;
  end if;

  delete from public.meeting_games mg where mg.meeting_id = current_meeting.id;
  update public.meetings m
     set voting_open = true
   where m.id = current_meeting.id
  returning * into saved;
  return saved;
end;
$$;

comment on function public.reopen_voting(uuid) is
  'Otwiera ponownie głosowanie w zaplanowanym spotkaniu i usuwa opublikowaną listę gier (VOTE-6). Tylko admin.';

revoke execute on function
  public.publish_meeting_games(uuid, uuid[]),
  public.reopen_voting(uuid)
from public, anon;
grant execute on function
  public.publish_meeting_games(uuid, uuid[]),
  public.reopen_voting(uuid)
to authenticated;

-- Listę gier zmieniają tylko powyższe funkcje (razem z flagą głosowania).
revoke insert, update, delete on public.meeting_games from authenticated;
drop policy meeting_games_insert_admin on public.meeting_games;
drop policy meeting_games_update_admin on public.meeting_games;
drop policy meeting_games_delete_admin on public.meeting_games;

-- ---------------------------------------------------------------------------------------------
-- Suma głosów na grę (GAME-12)
-- ---------------------------------------------------------------------------------------------
-- GAME-12: suma istniejących głosów ze wszystkich spotkań, także po publikacji.
-- Cofnięcie głosu i kaskady usuwania zmniejszają wynik przy kolejnym odczycie.
-- Publikacja zachowuje game_votes.
create function public.game_vote_total(game_id uuid)
returns bigint
language sql
stable
security invoker
set search_path = ''
as $$
  select (select count(*) from public.game_votes v where v.game_id = g.id)
    from public.games g
   where g.id = game_vote_total.game_id;
$$;

comment on function public.game_vote_total(uuid) is
  'GAME-12: liczba istniejących głosów na grę we wszystkich spotkaniach. RLS aktywnego członka; NULL bez gry lub dostępu.';

revoke execute on function public.game_vote_total(uuid) from public, anon;
grant execute on function public.game_vote_total(uuid) to authenticated;
