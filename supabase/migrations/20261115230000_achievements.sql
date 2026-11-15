-- [036] Katalog i przeliczanie osiągnięć (PRD ACH-1, ACH-2, §5.10, §5.6.5, §5.6.6, Q16–Q18, Q24).
--
-- Zasady:
-- - Katalog (29 pozycji, Q16) jest w kodzie: `packages/scoring/src/achievements.ts` (ACH-1).
--   Baza liczy te same warunki w `private.computed_achievement_unlocks()`; obie implementacje
--   przechodzą wspólne przypadki (`packages/scoring/src/cases/achievements.ts`, generowany test
--   pgTAP `221_achievement_cases`).
-- - Przeliczenie jest pełne i deterministyczne: odtwarza całą historię w kolejności z §5.6.6
--   (spotkania po `starts_at`, potem `id`; partie po `saved_at`, potem `id`) i porównuje wynik
--   z `achievement_unlocks`: dopisuje nowe, usuwa niespełnione i poprawia datę spełnionych
--   później (np. po usunięciu partii, Q17). Data odblokowania to `starts_at` spotkania, na
--   którym warunek spełniono po raz pierwszy; `play_id` wskazuje partię, która go dopełniła.
--   Przy skali jednego klubu pełne przeliczenie to kilka zapytań z funkcjami okienkowymi.
-- - Kiedy (ACH-2): w tej samej transakcji co zmiana danych, wyzwalaczami:
--   - zapis partii (`save_play`: szkic → zapisana) i usunięcie partii (`delete_play` przez
--     `private.recalculate_after_plays_change`),
--   - zakończenie spotkania (i każda inna zmiana statusu z albo na `finished`, np. RUN-5),
--   - zamknięcie głosowania (publikacja gier albo rozpoczęcie spotkania, Q18) oraz zmiana
--     terminu zaplanowanego spotkania z zamkniętym głosowaniem (termin to data `voter-10`),
--   - usunięcie spotkania (PLAN-3, PLAN-5; jego odblokowania znikają kaskadą, a głosy
--     przestają się liczyć do `voter-10`).
--   Pojedynczy głos niczego nie przelicza (Q18).
-- - `voter-10` liczy spotkania, w których gracz miał ≥ 1 głos w chwili zamknięcia głosowania.
--   Zamknięcie zapisuje migawkę głosujących w `private.meeting_voters`: późniejsze zniknięcie
--   głosów (cofnięcie po ponownym otwarciu, usunięcie uczestnika, gry albo członka) nie odbiera
--   zaliczonego głosowania, a ponowne zamknięcie tego samego spotkania liczy się raz. Migawka
--   znika razem ze spotkaniem.
-- - `flawless` liczy tylko spotkania zakończone (sprawdzane przy zakończeniu, §5.10); pozostałe
--   warunki liczą każdą zapisaną partię, także w spotkaniu w trakcie (jak leaderboard).
-- - Równoległe przeliczenia szereguje blokada doradcza transakcji: drugie czyta historię po
--   zatwierdzeniu pierwszego, więc dwie partie zapisane jednocześnie (RUN-3) nie gubią
--   osiągnięcia spełnionego dopiero przez obie. Usunięcie spotkania bierze tę blokadę przed
--   blokadami wierszy (wyzwalacz BEFORE na poziomie instrukcji), żeby nie czekać na nią
--   z zablokowanym spotkaniem, do którego przeliczenie dopisuje odblokowanie. RPC biorą ją po
--   blokadzie swojego spotkania; ewentualne zakleszczenie Postgres wykrywa i przerywa jedną
--   transakcję (błąd 40P01), a ponowienie RPC jest bezpieczne.
-- - Przy skali jednego klubu (PRD §6) pełne przeliczenie w transakcji zapisu jest tanie;
--   przy dużej historii można je zawęzić do graczy i gier, których zmiana dotyczy.
-- - Klient niczego tu nie wywołuje: odblokowania czyta z `achievement_unlocks` (RLS), a zapisuje
--   je wyłącznie przeliczenie.

-- ---------------------------------------------------------------------------------------------
-- Migawka głosujących przy zamknięciu głosowania (Q18)
-- ---------------------------------------------------------------------------------------------
create table private.meeting_voters (
  meeting_id uuid not null references public.meetings (id) on delete cascade,
  profile_id uuid not null references public.profiles (id),
  primary key (meeting_id, profile_id)
);

create index meeting_voters_profile_id_idx on private.meeting_voters (profile_id);

comment on table private.meeting_voters is
  'Gracze z ≥ 1 głosem w chwili zamknięcia głosowania spotkania (voter-10, Q18). Zapisuje wyzwalacz meetings_after_change.';

revoke all on private.meeting_voters from public, anon, authenticated;

-- Spotkania, których głosowanie zamknięto przed tą migracją: głosy zostają po zamknięciu
-- (publikacja ich nie usuwa), więc to najlepsze przybliżenie stanu z chwili zamknięcia.
insert into private.meeting_voters (meeting_id, profile_id)
select distinct v.meeting_id, v.profile_id
  from public.game_votes v
  join public.meetings m on m.id = v.meeting_id
 where not m.voting_open;

-- ---------------------------------------------------------------------------------------------
-- Warunki z katalogu (PRD §5.10)
-- ---------------------------------------------------------------------------------------------
create function private.computed_achievement_unlocks()
returns table (
  profile_id uuid,
  achievement_id text,
  meeting_id uuid,
  play_id uuid,
  unlocked_at timestamptz
)
language sql
stable
set search_path = ''
as $$
  with plays as (
    select p.id as play_id, p.game_id, p.meeting_id, m.starts_at, m.status as meeting_status,
           coalesce(rk.dir, 'desc') as dir,
           -- Jedna globalna kolejność partii (§5.6.6).
           row_number() over (order by m.starts_at, m.id, p.saved_at, p.id) as seq
      from public.plays p
      join public.meetings m on m.id = p.meeting_id
      left join public.scorepad_versions v on v.id = p.scorepad_version_id
      left join lateral private.scorepad_ranking(v.template) rk on true
     where p.status = 'saved'
  ),
  results as (
    select r.profile_id, r.place, r.points, r.is_win, r.ranking_value, pl.*,
           count(*) over (partition by pl.play_id) as players,
           count(*) filter (where r.is_win) over (partition by pl.play_id) as winners,
           max(r.place) over (partition by pl.play_id) as last_place
      from public.play_results r
      join plays pl on pl.play_id = r.play_id
  ),
  marked as (
    select r.*,
           row_number() over (partition by r.profile_id, r.game_id order by r.seq) = 1 as first_of_game,
           row_number() over (partition by r.profile_id, r.meeting_id order by r.seq) as meeting_plays,
           count(*) filter (where r.is_win) over (partition by r.profile_id, r.meeting_id order by r.seq) as meeting_wins,
           count(*) filter (where r.is_win) over (partition by r.profile_id, r.game_id order by r.seq) as game_wins
      from results r
  ),
  -- Liczniki gracza po każdej jego partii.
  ev as (
    select x.*,
           count(*) over w as plays_n,
           count(*) filter (where x.is_win) over w as wins_n,
           sum(x.points) over w as points_n,
           -- Ostatnie miejsce, także wspólne, ale nie wtedy, gdy wszyscy dzielą 1. miejsce.
           count(*) filter (where x.place = x.last_place and x.last_place > 1) over w as last_n,
           count(*) filter (where x.first_of_game) over w as games_n,
           count(*) filter (where x.is_win and x.game_wins = 1) over w as won_games_n,
           count(*) filter (where x.meeting_plays = 1) over w as meetings_n
      from marked x
    window w as (partition by x.profile_id order by x.seq)
  ),
  play_level (profile_id, achievement_id, seq) as (
              select e.profile_id, 'meet-1', e.seq from ev e where e.meetings_n >= 1
    union all select e.profile_id, 'meet-10', e.seq from ev e where e.meetings_n >= 10
    union all select e.profile_id, 'meet-25', e.seq from ev e where e.meetings_n >= 25
    union all select e.profile_id, 'meet-50', e.seq from ev e where e.meetings_n >= 50
    union all select e.profile_id, 'play-10', e.seq from ev e where e.plays_n >= 10
    union all select e.profile_id, 'play-50', e.seq from ev e where e.plays_n >= 50
    union all select e.profile_id, 'play-100', e.seq from ev e where e.plays_n >= 100
    union all select e.profile_id, 'marathon', e.seq from ev e where e.meeting_plays >= 5
    union all select e.profile_id, 'win-1', e.seq from ev e where e.wins_n >= 1
    union all select e.profile_id, 'win-10', e.seq from ev e where e.wins_n >= 10
    union all select e.profile_id, 'win-50', e.seq from ev e where e.wins_n >= 50
    union all select e.profile_id, 'hattrick', e.seq from ev e where e.meeting_wins >= 3
    union all select e.profile_id, 'explorer-10', e.seq from ev e where e.games_n >= 10
    union all select e.profile_id, 'explorer-25', e.seq from ev e where e.games_n >= 25
    union all select e.profile_id, 'versatile-5', e.seq from ev e where e.won_games_n >= 5
    union all select e.profile_id, 'specialist', e.seq from ev e where e.game_wins >= 10
    union all select e.profile_id, 'beginners-luck', e.seq from ev e where e.is_win and e.first_of_game
    union all select e.profile_id, 'big-table', e.seq from ev e where e.players >= 6
    union all select e.profile_id, 'tie-top', e.seq from ev e where e.is_win and e.winners >= 2
    union all select e.profile_id, 'lantern-10', e.seq from ev e where e.last_n >= 10
    union all select e.profile_id, 'pts-100', e.seq from ev e where e.points_n >= 100
    union all select e.profile_id, 'pts-500', e.seq from ev e where e.points_n >= 500
  ),
  -- Spotkania gracza z ≥ 1 partią: serie (§5.6.4), powrót i bez skazy.
  player_meetings as (
    select r.profile_id, r.meeting_id, r.starts_at, r.meeting_status,
           count(*) as plays, count(*) filter (where r.is_win) as wins,
           bool_or(r.is_win) as won,
           min(r.seq) filter (where r.is_win) as first_win_seq,
           max(r.seq) as last_seq
      from results r
     group by r.profile_id, r.meeting_id, r.starts_at, r.meeting_status
  ),
  -- Każde spotkanie bez wygranej zaczyna nową grupę (jak `leaderboard`).
  runs as (
    select pm.*,
           count(*) filter (where not pm.won)
             over (partition by pm.profile_id order by pm.starts_at, pm.meeting_id) as grp
      from player_meetings pm
  ),
  streaks as (
    select ru.*,
           case when ru.won
                then count(*) filter (where ru.won)
                       over (partition by ru.profile_id, ru.grp order by ru.starts_at, ru.meeting_id)
                else 0 end as streak
      from runs ru
  ),
  breaks as (
    select s.*,
           not s.won and coalesce(lag(s.streak) over wp, 0) >= 3 as broke
      from streaks s
    window wp as (partition by s.profile_id order by s.starts_at, s.meeting_id)
  ),
  meeting_level (profile_id, achievement_id, seq) as (
              select b.profile_id, 'streak-3', b.first_win_seq from breaks b where b.streak >= 3
    union all select b.profile_id, 'streak-5', b.first_win_seq from breaks b where b.streak >= 5
    union all select b.profile_id, 'streak-10', b.first_win_seq from breaks b where b.streak >= 10
    union all select b.profile_id, 'flawless', b.last_seq from breaks b
               where b.meeting_status = 'finished' and b.plays >= 3 and b.wins = b.plays
    union all select c.profile_id, 'comeback', c.first_win_seq
                from (select b.profile_id, b.won, b.first_win_seq,
                             coalesce(lag(b.broke) over (partition by b.profile_id order by b.starts_at, b.meeting_id), false) as after_break
                        from breaks b) c
               where c.won and c.after_break
  ),
  -- Rekord (GAME-11, Q17, Q25): najlepszy wynik partii lepszy od wszystkich wcześniejszych
  -- partii gry w tym samym kierunku notesu. Pierwsza partia i wyrównanie nie dają osiągnięcia.
  play_best as (
    select r.play_id, r.game_id, r.dir, r.seq,
           case when r.dir = 'asc' then min(r.ranking_value) else max(r.ranking_value) end as best
      from results r
     group by r.play_id, r.game_id, r.dir, r.seq
  ),
  prior as (
    select pb.*,
           case when pb.dir = 'asc' then min(pb.best) over wg else max(pb.best) over wg end as previous
      from play_best pb
    window wg as (partition by pb.game_id, pb.dir order by pb.seq
                  rows between unbounded preceding and 1 preceding)
  ),
  record_level (profile_id, achievement_id, seq) as (
    select r.profile_id, 'record', r.seq
      from results r
      join prior pr on pr.play_id = r.play_id
     where r.ranking_value = pr.best
       and pr.previous is not null
       and case when pr.dir = 'asc' then pr.best < pr.previous else pr.best > pr.previous end
  ),
  unlocks as (
    select distinct on (u.profile_id, u.achievement_id)
           u.profile_id, u.achievement_id, pl.meeting_id, pl.play_id, pl.starts_at
      from (select * from play_level
            union all select * from meeting_level
            union all select * from record_level) u
      join plays pl on pl.seq = u.seq
     order by u.profile_id, u.achievement_id, u.seq
  ),
  -- Głos ludu (Q18): dziesiąte różne spotkanie z głosem, chronologicznie.
  votes as (
    select v.profile_id, m.id as meeting_id, m.starts_at,
           row_number() over (partition by v.profile_id order by m.starts_at, m.id) as n
      from private.meeting_voters v
      join public.meetings m on m.id = v.meeting_id
  )
  select u.profile_id, u.achievement_id, u.meeting_id, u.play_id, u.starts_at from unlocks u
  union all
  select v.profile_id, 'voter-10', v.meeting_id, null::uuid, v.starts_at from votes v where v.n = 10;
$$;

comment on function private.computed_achievement_unlocks() is
  'Odblokowania osiągnięć wynikające z całej historii (§5.10), w kolejności zdarzeń z §5.6.6. Ta sama logika co computeAchievements w packages/scoring.';

revoke execute on function private.computed_achievement_unlocks() from public, anon, authenticated;

-- ---------------------------------------------------------------------------------------------
-- Przeliczenie: różnica między historią a achievement_unlocks
-- ---------------------------------------------------------------------------------------------
create function private.recalculate_achievements()
returns void
language plpgsql
set search_path = ''
as $$
begin
  -- Szeregowanie równoległych przeliczeń; kolejne zapytanie widzi już zatwierdzone poprzednie.
  perform pg_advisory_xact_lock(hashtextextended('bg-club:achievements', 0));

  with computed as materialized (
    select * from private.computed_achievement_unlocks()
  ),
  revoked as (
    delete from public.achievement_unlocks u
     where not exists (
       select 1 from computed c
        where c.profile_id = u.profile_id and c.achievement_id = u.achievement_id
     )
  )
  insert into public.achievement_unlocks as u (profile_id, achievement_id, unlocked_at, meeting_id, play_id)
  select c.profile_id, c.achievement_id, c.unlocked_at, c.meeting_id, c.play_id
    from computed c
  on conflict (profile_id, achievement_id) do update
     set unlocked_at = excluded.unlocked_at,
         meeting_id = excluded.meeting_id,
         play_id = excluded.play_id
   where (u.unlocked_at, u.meeting_id, u.play_id)
         is distinct from (excluded.unlocked_at, excluded.meeting_id, excluded.play_id);
end;
$$;

comment on function private.recalculate_achievements() is
  'Przelicza achievement_unlocks z całej historii (ACH-2): dopisuje nowe, usuwa niespełnione, poprawia daty. Wywołują je wyzwalacze i RPC w transakcji zmiany danych.';

revoke execute on function private.recalculate_achievements() from public, anon, authenticated;

-- Punkt przeliczenia po zmianie zapisanych partii z [031] (`delete_play`): sygnatura bez zmian.
create or replace function private.recalculate_after_plays_change(meeting_id uuid)
returns void
language plpgsql
set search_path = ''
as $$
begin
  -- Rankingi, statystyki i serie liczą się przy odczycie; zapisane są tylko osiągnięcia, które
  -- zależą od całej historii (np. rekord albo data pierwszej wygranej), więc przeliczamy wszystko.
  perform recalculate_after_plays_change.meeting_id;
  perform private.recalculate_achievements();
end;
$$;

comment on function private.recalculate_after_plays_change(uuid) is
  'Przeliczenie po zmianie zapisanych partii spotkania (§5.6.5): rankingi, serie i rekordy liczą się przy odczycie, osiągnięcia przelicza private.recalculate_achievements.';

-- ---------------------------------------------------------------------------------------------
-- Wyzwalacze: zapis partii, przebieg i usunięcie spotkania
-- ---------------------------------------------------------------------------------------------

-- Zapis partii (`save_play`, szkic → zapisana). Działa z prawami właściciela, bo klient nie
-- ma prawa zapisu `achievement_unlocks`.
create function public.plays_after_save()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  perform private.recalculate_after_plays_change(new.meeting_id);
  return null;
end;
$$;

create trigger plays_after_save
  after update of status on public.plays
  for each row
  when (old.status = 'draft' and new.status = 'saved')
  execute function public.plays_after_save();

revoke execute on function public.plays_after_save() from public, anon, authenticated;

-- Zamknięcie głosowania (`publish_meeting_games`, `start_meeting`) zapisuje migawkę głosujących
-- i przelicza `voter-10`; zmiana statusu z albo na zakończone przelicza `flawless`, a zmiana
-- terminu spotkania z migawką głosów (`save_meeting`) datę i kolejność `voter-10`.
create function public.meetings_after_change()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  if old.voting_open and not new.voting_open then
    insert into private.meeting_voters (meeting_id, profile_id)
    select distinct v.meeting_id, v.profile_id
      from public.game_votes v
     where v.meeting_id = new.id
    on conflict do nothing;
  end if;
  if (old.voting_open and not new.voting_open)
     or ((old.status = 'finished') <> (new.status = 'finished'))
     or (new.starts_at is distinct from old.starts_at
         and exists (select 1 from private.meeting_voters v where v.meeting_id = new.id)) then
    perform private.recalculate_achievements();
  end if;
  return null;
end;
$$;

create trigger meetings_after_change
  after update of status, voting_open, starts_at on public.meetings
  for each row
  execute function public.meetings_after_change();

revoke execute on function public.meetings_after_change() from public, anon, authenticated;

-- Usunięcie spotkania (admin, RLS): odblokowania i migawka głosów znikają kaskadą, a wyzwalacz
-- na poziomie instrukcji przelicza resztę po kaskadach. Blokadę przeliczenia bierze wcześniej,
-- przed blokadami usuwanych wierszy (patrz nagłówek).
create function public.meetings_before_delete()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  perform pg_advisory_xact_lock(hashtextextended('bg-club:achievements', 0));
  return null;
end;
$$;

create trigger meetings_before_delete
  before delete on public.meetings
  for each statement
  execute function public.meetings_before_delete();

create function public.meetings_after_delete()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  -- Instrukcja bez usuniętych wierszy (np. odmowa RLS) niczego nie zmienia.
  if exists (select 1 from deleted_meetings) then
    perform private.recalculate_achievements();
  end if;
  return null;
end;
$$;

create trigger meetings_after_delete
  after delete on public.meetings
  referencing old table as deleted_meetings
  for each statement
  execute function public.meetings_after_delete();

revoke execute on function
  public.meetings_before_delete(),
  public.meetings_after_delete()
from public, anon, authenticated;

-- Odblokowania z historii sprzed tej migracji.
select private.recalculate_achievements();
