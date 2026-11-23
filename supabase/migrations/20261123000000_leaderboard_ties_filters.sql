-- Ranking bez remisów, filtry dat i gier, bez klasyfikacji serii (PRD LB-1, LB-4, LB-6, NFR-10).
--
-- Zasady:
-- - `leaderboard(kind, date_from, date_to, game_ids)` zwraca klasyfikację `points` (suma punktów)
--   albo `wins` (liczba wygranych). Seria zwycięstw nie jest już rankingiem: zostaje statystyką
--   profilu (`player_stats.streak_record` / `streak_current`) i podsumowania spotkania.
-- - Filtry łączą się ze sobą i każdy jest opcjonalny (NULL = bez ograniczenia):
--   `date_from` / `date_to` to dni (włącznie) w strefie klubu (`club.timezone`, NFR-10): liczą się
--   partie spotkań, których `starts_at` wypada w tych dniach lokalnie; `game_ids` zawęża do
--   partii wybranych gier (pusta tablica = wszystkie gry). Pusty zakres (od > do) to błąd 22023
--   z HINT `leaderboard_range_invalid`.
-- - Nie ma remisów: każdy ma własne miejsce. Równy wynik rozstrzygają kolejno:
--   1. spotkanie, na którym gracz osiągnął swój wynik (ostatnie spotkanie, które go zmieniło:
--      z punktami w `points`, z wygraną w `wins`) — późniejsze (`starts_at`, potem `id`,
--      §5.6.6) jest wyżej; gracz z wynikiem 0 takiego spotkania nie ma i jest niżej;
--   2. punkty zdobyte na tym spotkaniu — więcej jest wyżej;
--   3. liczba wszystkich wygranych gracza w całej historii (bez względu na filtry dat i gier)
--      — więcej jest wyżej;
--   4. imię i nazwisko alfabetycznie (polskie sortowanie), na końcu `id`.
--   Wiersz zwraca dane tych kryteriów (`reached_*`, `wins`) i flagę `tied` (ten sam wynik
--   co ktoś inny), z których aplikacja pokazuje szczegóły rozstrzygnięcia.
-- - Usunięci członkowie są za aktywnymi (między sobą według tych samych kryteriów), z miejscami
--   liczonymi dalej, i nigdy nie stają na podium (LB-7). Klasyfikowani są gracze z ≥ 1 zapisaną
--   partią w zakresie filtrów (LB-5).
-- - `leaderboard_years()` znika: filtr roku zastępuje zakres dat z kalendarza.

create function private.migration_rewrite(def text, pattern text, replacement text)
returns text
language plpgsql
immutable
set search_path = ''
as $$
begin
  if def !~ pattern then
    raise exception 'migration: fragment not found: %', pattern;
  end if;
  return regexp_replace(def, pattern, replacement);
end;
$$;

drop function public.leaderboard(text, int);
drop function public.leaderboard_years();

create function public.leaderboard(
  kind text,
  date_from date default null,
  date_to date default null,
  game_ids uuid[] default null
)
returns table (
  place int,
  profile_id uuid,
  first_name text,
  last_name text,
  avatar_path text,
  deleted boolean,
  podium boolean,
  value numeric,
  tied boolean,
  reached_meeting_id uuid,
  reached_meeting_title text,
  reached_at timestamptz,
  reached_points numeric,
  wins int
)
language plpgsql
stable
security invoker
set search_path = ''
as $$
declare
  tz text := private.club_timezone();
  -- Brak filtru dat to nieograniczony zakres: jeden prosty warunek zakresu dla planu z indeksem.
  range_starts timestamptz := '-infinity'::timestamptz;
  range_ends timestamptz := 'infinity'::timestamptz;
  game_filter uuid[] := nullif(leaderboard.game_ids, '{}'::uuid[]);
begin
  if kind is null or kind not in ('points', 'wins') then
    raise exception 'unknown leaderboard kind %', kind
      using errcode = '22023', hint = 'leaderboard_kind_invalid';
  end if;
  if leaderboard.date_from > leaderboard.date_to then
    raise exception 'leaderboard range % – % is empty', leaderboard.date_from, leaderboard.date_to
      using errcode = '22023', hint = 'leaderboard_range_invalid';
  end if;
  -- Północ dnia w strefie klubu: granice uwzględniają przesunięcie strefy (także DST).
  if leaderboard.date_from is not null then
    range_starts := leaderboard.date_from::timestamp at time zone tz;
  end if;
  if leaderboard.date_to is not null then
    range_ends := (leaderboard.date_to + 1)::timestamp at time zone tz;
  end if;

  return query
  with results as (
    select r.profile_id, r.points, r.is_win, m.id as meeting_id, m.title as meeting_title, m.starts_at
      from public.play_results r
      join public.plays p on p.id = r.play_id and p.status = 'saved'
      join public.meetings m on m.id = r.meeting_id
     where m.starts_at >= range_starts and m.starts_at < range_ends
       and (game_filter is null or p.game_id = any (game_filter))
  ),
  per_meeting as (
    select r.profile_id, r.meeting_id, min(r.meeting_title) as meeting_title,
           min(r.starts_at) as starts_at, sum(r.points) as points,
           (count(*) filter (where r.is_win))::int as won
      from results r
     group by r.profile_id, r.meeting_id
  ),
  totals as (
    select pm.profile_id, sum(pm.points) as points, sum(pm.won)::int as won
      from per_meeting pm
     group by pm.profile_id
  ),
  -- Spotkanie, na którym gracz osiągnął wynik: ostatnie, które ten wynik zmieniło.
  -- Wszystkie wygrane gracza z całej historii (3. kryterium), niezależnie od filtrów.
  career as (
    select r.profile_id, (count(*) filter (where r.is_win))::int as won
      from public.play_results r
      join public.plays p on p.id = r.play_id and p.status = 'saved'
     where r.profile_id in (select t.profile_id from totals t)
     group by r.profile_id
  ),
  reached as (
    select distinct on (pm.profile_id)
           pm.profile_id, pm.meeting_id, pm.meeting_title, pm.starts_at, pm.points
      from per_meeting pm
     where case leaderboard.kind when 'points' then pm.points <> 0 else pm.won > 0 end
     order by pm.profile_id, pm.starts_at desc, pm.meeting_id desc
  ),
  scored as (
    select t.profile_id, pr.first_name, pr.last_name, pr.avatar_path,
           pr.deleted_at is not null as deleted,
           case leaderboard.kind when 'points' then t.points else t.won::numeric end as score,
           coalesce(cw.won, 0) as career_won, rc.meeting_id as reached_id, rc.meeting_title as reached_title,
           rc.starts_at as reached_starts, rc.points as reached_score
      from totals t
      left join reached rc on rc.profile_id = t.profile_id
      left join career cw on cw.profile_id = t.profile_id
      join public.profiles pr on pr.id = t.profile_id
  ),
  ranked as (
    select sc.*,
           (row_number() over (
              partition by sc.deleted
              order by sc.score desc, sc.reached_starts desc nulls last, sc.reached_id desc nulls last,
                       sc.reached_score desc nulls last, sc.career_won desc,
                       sc.first_name collate "pl-x-icu", sc.last_name collate "pl-x-icu", sc.profile_id)
             + case when sc.deleted then count(*) filter (where not sc.deleted) over () else 0 end
           )::int as position,
           count(*) over (partition by sc.deleted, sc.score) > 1 as shared
      from scored sc
  )
  select rk.position, rk.profile_id, rk.first_name, rk.last_name, rk.avatar_path, rk.deleted,
         not rk.deleted and rk.position <= 3, rk.score, rk.shared, rk.reached_id, rk.reached_title,
         rk.reached_starts, rk.reached_score, rk.career_won
    from ranked rk
   order by rk.deleted, rk.position;
end;
$$;

comment on function public.leaderboard(text, date, date, uuid[]) is
  'Klasyfikacja punktów albo wygranych (LB-1) z opcjonalnym zakresem dni w strefie klubu i zestawem gier (LB-4, NFR-10). Bez remisów: rozstrzyga późniejsze spotkanie osiągnięcia wyniku, punkty na nim, liczba wygranych z całej historii, alfabet; usunięci na końcu, bez podium (LB-7).';

revoke execute on function public.leaderboard(text, date, date, uuid[]) from public, anon;
grant execute on function public.leaderboard(text, date, date, uuid[]) to authenticated;

-- Statystyki gracza: miejsca w dwóch klasyfikacjach dla roku jako zakresu dni.
do $$
declare
  def text;
begin
  def := pg_get_functiondef('public.player_stats(uuid, int)'::regprocedure);
  def := private.migration_rewrite(def,
    'public\.leaderboard\(k\.kind, player_stats\.year\)',
    'public.leaderboard(k.kind, make_date(player_stats.year, 1, 1), make_date(player_stats.year, 12, 31))');
  def := private.migration_rewrite(def,
    'array\[''points'', ''wins'', ''streak''\]',
    'array[''points'', ''wins'']');
  def := private.migration_rewrite(def,
    ',\s*''streak'', \(select pl\.place from places pl where pl\.kind = ''streak''\)',
    '');
  execute def;
end;
$$;

drop function private.migration_rewrite(text, text, text);
