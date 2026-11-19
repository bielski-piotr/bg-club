-- Rankingi, serie i filtr roku.
--
-- Zasady:
-- - `leaderboard(kind, year)` zwraca klasyfikację: `points` (suma punktów), `wins`
--   (liczba wygranych partii, także wspólne 1. miejsce) albo `streak` (rekord serii
--   zwycięstw). `year` NULL = cała historia, inaczej rok kalendarzowy w strefie
--   klubu (`club.timezone`): liczą się partie spotkań, których `starts_at` wypada w tym
--   roku lokalnie, a seria jest liczona tylko w obrębie tego roku.
-- - Liczą się tylko zapisane partie (`plays.status = 'saved'`), także w spotkaniu w trakcie.
--   Wyniki są liczone z `play_results` przy odczycie, więc zapis i usunięcie partii (`save_play`,
--   `delete_play`) zmieniają ranking od razu, bez zapisanych agregatów; dlatego ciało
--   `private.recalculate_after_plays_change` zostaje bez zmian.
-- - Seria: spotkania gracza chronologicznie (`starts_at`, potem `id`). Spotkanie z ≥ 1
--   wygraną daje +1 (najwyżej raz), spotkanie z partiami bez wygranej zeruje serię, spotkanie
--   bez partii gracza nic nie zmienia. Rekord to najdłuższa seria; 0, gdy gracz nie wygrał.
-- - Klasyfikowani są gracze z ≥ 1 zapisaną partią w zakresie. Równe wyniki mają wspólne
--   miejsce (`rank()`, numeracja 1, 1, 3), a w obrębie remisu kolejność jest alfabetyczna
--   (imię, nazwisko, polskie sortowanie). Usunięci członkowie są zawsze za aktywnymi
--   (między sobą według wyniku), z miejscami liczonymi dalej, i nigdy nie stają na podium.
-- - Funkcje działają z prawami wywołującego (security invoker), więc RLS daje wynik tylko
--   aktywnym członkom. Zły rodzaj albo rok to błąd 22023 z nazwą reguły w HINT.

-- Strefa klubu do granic roku. Przed założeniem klubu obowiązuje domyślna strefa
-- kolumny `club.timezone`. Działa z prawami wywołującego (RLS), jak funkcje rankingów.
create function private.club_timezone()
returns text
language sql
stable
security invoker
set search_path = ''
as $$
  select coalesce((select c.timezone from public.club c where c.id = 1), 'Europe/Warsaw');
$$;

comment on function private.club_timezone() is
  'Strefa IANA klubu do granic roku leaderboardu; przed założeniem klubu Europe/Warsaw.';

revoke all on function private.club_timezone() from public, anon;
grant execute on function private.club_timezone() to authenticated;

create function public.leaderboard(kind text, year int default null)
returns table (
  place int,
  profile_id uuid,
  first_name text,
  last_name text,
  avatar_path text,
  deleted boolean,
  podium boolean,
  value int
)
language plpgsql
stable
security invoker
set search_path = ''
as $$
declare
  tz text := private.club_timezone();
  -- Cała historia to nieograniczony zakres: jeden prosty warunek zakresu dla planu z indeksem.
  year_starts timestamptz := '-infinity'::timestamptz;
  year_ends timestamptz := 'infinity'::timestamptz;
begin
  if kind is null or kind not in ('points', 'wins', 'streak') then
    raise exception 'unknown leaderboard kind %', kind
      using errcode = '22023', hint = 'leaderboard_kind_invalid';
  end if;
  if leaderboard.year is not null then
    if leaderboard.year not between 1 and 9999 then
      raise exception 'leaderboard year % is out of range', leaderboard.year
        using errcode = '22023', hint = 'leaderboard_year_invalid';
    end if;
    -- Północ 1 stycznia w strefie klubu: granice uwzględniają przesunięcie strefy (także DST).
    year_starts := make_timestamptz(leaderboard.year, 1, 1, 0, 0, 0, tz);
    year_ends := make_timestamptz(leaderboard.year + 1, 1, 1, 0, 0, 0, tz);
  end if;

  return query
  with results as (
    select r.profile_id, r.points, r.is_win, m.id as meeting_id, m.starts_at
      from public.play_results r
      join public.plays p on p.id = r.play_id and p.status = 'saved'
      join public.meetings m on m.id = r.meeting_id
     where m.starts_at >= year_starts and m.starts_at < year_ends
  ),
  totals as (
    select r.profile_id,
           sum(r.points)::int as points,
           (count(*) filter (where r.is_win))::int as wins
      from results r
     group by r.profile_id
  ),
  -- Serie liczymy tylko dla klasyfikacji `streak`; dla pozostałych ten krok jest pusty.
  meetings_played as (
    select r.profile_id, r.meeting_id, min(r.starts_at) as starts_at, bool_or(r.is_win) as won
      from results r
     where leaderboard.kind = 'streak'
     group by r.profile_id, r.meeting_id
  ),
  -- Każde spotkanie bez wygranej zaczyna nową grupę; wygrane w grupie to jedna seria.
  runs as (
    select mp.profile_id, mp.won,
           count(*) filter (where not mp.won)
             over (partition by mp.profile_id order by mp.starts_at, mp.meeting_id) as run
      from meetings_played mp
  ),
  streaks as (
    select s.profile_id, max(s.length)::int as record
      from (select ru.profile_id, count(*) filter (where ru.won) as length
              from runs ru
             group by ru.profile_id, ru.run) s
     group by s.profile_id
  ),
  scored as (
    select t.profile_id, pr.first_name, pr.last_name, pr.avatar_path,
           pr.deleted_at is not null as deleted,
           case leaderboard.kind
             when 'points' then t.points
             when 'wins' then t.wins
             else coalesce(s.record, 0)
           end as value
      from totals t
      left join streaks s on s.profile_id = t.profile_id
      join public.profiles pr on pr.id = t.profile_id
  ),
  ranked as (
    select sc.*,
           (rank() over (partition by sc.deleted order by sc.value desc)
             + case when sc.deleted then count(*) filter (where not sc.deleted) over () else 0 end)::int as place
      from scored sc
  )
  select rk.place, rk.profile_id, rk.first_name, rk.last_name, rk.avatar_path, rk.deleted,
         not rk.deleted and rk.place <= 3 as podium, rk.value
    from ranked rk
   order by rk.deleted, rk.value desc,
            rk.first_name collate "pl-x-icu", rk.last_name collate "pl-x-icu", rk.profile_id;
end;
$$;

comment on function public.leaderboard(text, int) is
  'Klasyfikacja punktów, wygranych albo rekordu serii dla całej historii albo roku w strefie klubu. Remisy 1, 1, 3 alfabetycznie; usunięci na końcu, bez podium.';

revoke execute on function public.leaderboard(text, int) from public, anon;
grant execute on function public.leaderboard(text, int) to authenticated;

-- Lata do filtru roku: lata w strefie klubu ze spotkaniami z ≥ 1 zapisaną partią,
-- od najnowszego.
create function public.leaderboard_years()
returns setof int
language sql
stable
security invoker
set search_path = ''
as $$
  -- Rok lokalny chwili `starts_at`: ten sam co zakres [1 stycznia, 1 stycznia następnego roku)
  -- w strefie klubu, którym filtruje `leaderboard`.
  select distinct extract(year from m.starts_at at time zone private.club_timezone())::int as year
    from public.meetings m
   where exists (select 1 from public.plays p where p.meeting_id = m.id and p.status = 'saved')
   order by year desc;
$$;

comment on function public.leaderboard_years() is
  'Lata (w strefie klubu) z zapisanymi partiami, od najnowszego: opcje filtru roku leaderboardu.';

revoke execute on function public.leaderboard_years() from public, anon;
grant execute on function public.leaderboard_years() to authenticated;
