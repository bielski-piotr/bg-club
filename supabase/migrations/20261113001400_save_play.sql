-- [029] Transakcyjny zapis wyników partii (PRD PAD-5, PAD-7, GAME-9, §5.6, §6).
--
-- Zasady:
-- - Oderwanie karteczki kończy partię: aplikacja pokazuje podsumowanie, a po potwierdzeniu
--   wywołuje `save_play(play_id, scorepad_version_id, sheet, results)`. Jedna transakcja zapisuje
--   pełne wpisy kartki (`plays.sheet`), wyniki graczy (`play_results`) i status `saved`.
-- - Uprawnienia jak przy szkicu: admin albo prowadzący (`private.require_meeting_runner`),
--   tylko spotkanie w trakcie (PAD-9), tylko partia w statusie `draft`.
-- - `results` to tablica JSON z jednym obiektem na gracza szkicu:
--   `{ profile_id, seat, place, scores, ranking_value }` (`scores` = `values` z PAD-7: kategoria →
--   liczba albo null; `ranking_value` = wartość kategorii decydującej). Inne klucze są błędem:
--   klient nie przysyła punktów, remisów ani wygranych (§5.6.2).
-- - Gracze i miejsca w notesie muszą być dokładnie te ze szkicu (rozpoczęcie partii, [027]).
--   Miejsca w partii tworzą numerację z remisami („1, 1, 3”) i zgadzają się z kolejnością
--   wartości kategorii decydującej w kierunku reguły notesu (`template.ranking.dir`; puste pole
--   jest za każdą liczbą). Co najmniej jeden gracz ma wartość kategorii decydującej.
-- - Snapshoty z rozpoczęcia partii (GAME-9): klient podaje wersję notesu, według której liczył
--   miejsca; inna niż `plays.scorepad_version_id` to błąd. Punktacja miejsc pochodzi wyłącznie
--   z `plays.points_snapshot` i musi obejmować wszystkich graczy.
-- - Baza liczy punkty (`public.play_points`, floor ze średniej przy remisie), `tied`
--   (wspólne miejsce) i `is_win` (miejsce 1, także wspólne).
-- - Ponowienie po błędzie sieci albo przekroczeniu czasu (także równoległe) nie tworzy
--   duplikatu: blokada wiersza partii szereguje wywołania, a wywołanie na zapisanej już partii
--   z tymi samymi wpisami i wynikami zwraca zapisaną partię. Inna treść to błąd
--   `plays_already_saved`: zakończonej partii nie da się zapisać ponownie.
-- - Osiągnięcia ([036]) i obraz karteczki ([030]) dochodzą w osobnych zadaniach.
-- - Błędy reguł mają SQLSTATE 23514 (brak partii: P0002) i nazwę reguły w HINT, jak
--   w migracjach [023], [024], [027] i [028].

-- Wynik gracza z żądania `save_play` po sprawdzeniu kształtu.
create type private.play_result_input as (
  profile_id uuid,
  seat int,
  place int,
  scores jsonb,
  ranking_value numeric
);

-- Wyniki z żądania; zły kształt to błąd `plays_results_invalid`.
create function private.play_results_input(results jsonb)
returns private.play_result_input[]
language plpgsql
immutable
set search_path = ''
as $$
declare
  item jsonb;
  parsed private.play_result_input[] := '{}';
begin
  if results is null or jsonb_typeof(results) <> 'array' then
    raise exception 'results must be a JSON array'
      using errcode = '23514', constraint = 'play_results_input', hint = 'plays_results_invalid';
  end if;
  for item in select value from jsonb_array_elements(results) loop
    if jsonb_typeof(item) <> 'object'
       -- Tylko znane klucze: punktów, remisu i wygranej klient nie podaje (§5.6.2).
       or exists (
         select 1 from jsonb_object_keys(item) k
          where k not in ('profile_id', 'seat', 'place', 'scores', 'ranking_value')
       )
       or jsonb_typeof(item -> 'profile_id') is distinct from 'string'
       or (item ->> 'profile_id') !~* '^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$'
       or jsonb_typeof(item -> 'seat') is distinct from 'number'
       or (item ->> 'seat') !~ '^[1-9][0-9]{0,8}$'
       or jsonb_typeof(item -> 'place') is distinct from 'number'
       or (item ->> 'place') !~ '^[1-9][0-9]{0,8}$'
       or jsonb_typeof(item -> 'scores') is distinct from 'object'
       or exists (
         select 1 from jsonb_each(item -> 'scores') s
          where jsonb_typeof(s.value) not in ('number', 'null')
       )
       or coalesce(jsonb_typeof(item -> 'ranking_value'), 'null') not in ('number', 'null') then
      raise exception 'invalid result %', item
        using errcode = '23514', constraint = 'play_results_input', hint = 'plays_results_invalid';
    end if;
    parsed := parsed || row(
      (item ->> 'profile_id')::uuid,
      (item ->> 'seat')::int,
      (item ->> 'place')::int,
      item -> 'scores',
      (item ->> 'ranking_value')::numeric
    )::private.play_result_input;
  end loop;
  return parsed;
end;
$$;

revoke execute on function private.play_results_input(jsonb) from public, anon, authenticated;

-- Reguła miejsc notesu tak, jak stosuje ją notes (`padRanking` → `parseRanking` w
-- `@bg-club/scoring`): `template.ranking` tylko wtedy, gdy jest w pełni poprawna (kategoria
-- decydująca i kategorie reguł remisu to istniejące kategorie liczbowe, kierunki `asc`/`desc`,
-- reguły `line`, `shared` albo `manual`); inaczej domyślna: suma końcowa, „więcej = lepiej”,
-- bez reguł remisu. `tiebreak`: czy pierwsza reguła remisu rozdziela graczy (typ `line`).
create function private.scorepad_ranking(template jsonb, out dir text, out tiebreak boolean)
language plpgsql
immutable
set search_path = ''
as $$
declare
  ranking jsonb := template -> 'ranking';
  numeric_lines text[];
  valid boolean;
begin
  dir := 'desc';
  tiebreak := false;
  if jsonb_typeof(ranking) is distinct from 'object' or jsonb_typeof(template -> 'lines') is distinct from 'array' then
    return;
  end if;
  numeric_lines := array(
    select l ->> 'id' from jsonb_array_elements(template -> 'lines') l
     where jsonb_typeof(l) = 'object' and l ->> 'kind' in ('input', 'sum', 'bonus', 'total')
  );
  valid := jsonb_typeof(ranking -> 'line') = 'string'
    and (ranking ->> 'line') = any (numeric_lines)
    and jsonb_typeof(ranking -> 'dir') = 'string'
    and (ranking ->> 'dir') in ('asc', 'desc')
    and jsonb_typeof(ranking -> 'tiebreak') = 'array'
    and not exists (
      select 1 from jsonb_array_elements(ranking -> 'tiebreak') r
       where jsonb_typeof(r) is distinct from 'object'
          or not (
            (r ->> 'type') in ('shared', 'manual')
            or ((r ->> 'type') = 'line'
                and jsonb_typeof(r -> 'line') = 'string' and (r ->> 'line') = any (numeric_lines)
                and jsonb_typeof(r -> 'dir') = 'string' and (r ->> 'dir') in ('asc', 'desc'))
          )
    );
  if valid then
    dir := ranking ->> 'dir';
    tiebreak := (ranking -> 'tiebreak' -> 0 ->> 'type') is not distinct from 'line';
  end if;
end;
$$;

revoke execute on function private.scorepad_ranking(jsonb) from public, anon, authenticated;

create function public.save_play(play_id uuid, scorepad_version_id uuid, sheet jsonb, results jsonb)
returns public.plays
language plpgsql
security definer
set search_path = ''
as $$
declare
  play_meeting_id uuid;
  meeting_status text;
  play public.plays;
  saved public.plays;
  dir text;
  tiebreak boolean;
  players int;
  seat_places int[];
  seat_profiles uuid[];
  seat_points int[];
  input private.play_result_input[];
begin
  play_meeting_id := private.play_meeting(save_play.play_id);
  perform private.require_meeting_runner(play_meeting_id);

  -- Blokada współdzielona: zakończenie spotkania czeka na zapis partii (RUN-4 widzi wynik).
  -- Status sprawdzamy po ponowieniu: zapisana partia wraca także po zakończeniu spotkania.
  select m.status into meeting_status from public.meetings m where m.id = play_meeting_id for share;

  -- Blokada wiersza szereguje równoległe zapisy i ponowienia: drugi widzi już zapisaną partię.
  select p.* into play from public.plays p where p.id = save_play.play_id for update;
  if not found then
    raise exception 'play % does not exist', save_play.play_id
      using errcode = 'P0002', hint = 'plays_not_found';
  end if;

  -- Kształt wyników sprawdzamy od razu, także przy ponowieniu.
  input := private.play_results_input(save_play.results);

  if play.status = 'saved' then
    -- Ponowienie (np. po przekroczeniu czasu): ta sama kartka i te same wyniki → zapisana partia.
    if play.sheet is not distinct from save_play.sheet
       and play.scorepad_version_id is not distinct from save_play.scorepad_version_id
       and cardinality(input) = (select count(*) from public.play_results r where r.play_id = play.id)
       and cardinality(input) = (select count(distinct i.profile_id) from unnest(input) i)
       and not exists (
         select i.profile_id, i.seat, i.place, i.scores, i.ranking_value from unnest(input) i
         except
         select r.profile_id, r.seat, r.place, r.scores, r.ranking_value
           from public.play_results r where r.play_id = play.id
       ) then
      return play;
    end if;
    raise exception 'play % is already saved', play.id
      using errcode = '23514', constraint = 'plays_saved_immutable', hint = 'plays_already_saved';
  end if;

  if meeting_status is distinct from 'in_progress' then
    raise exception 'plays can be saved only in an in-progress meeting'
      using errcode = '23514', constraint = 'plays_meeting_in_progress', hint = 'plays_meeting_in_progress';
  end if;

  if save_play.scorepad_version_id is distinct from play.scorepad_version_id then
    raise exception 'results were computed for scorepad version %, play uses %',
        save_play.scorepad_version_id, play.scorepad_version_id
      using errcode = '23514', constraint = 'plays_scorepad_version_snapshot', hint = 'plays_scorepad_version_mismatch';
  end if;

  if save_play.sheet is null or jsonb_typeof(save_play.sheet) <> 'object' then
    raise exception 'sheet must be a JSON object'
      using errcode = '23514', constraint = 'plays_sheet_object', hint = 'plays_sheet_invalid';
  end if;
  if octet_length(save_play.sheet::text) > private.play_draft_max_bytes() then
    raise exception 'sheet exceeds % bytes', private.play_draft_max_bytes()
      using errcode = '23514', constraint = 'plays_draft_size', hint = 'plays_sheet_too_large';
  end if;

  -- Gracze i miejsca w notesie: dokładnie te ze szkicu, każdy raz.
  select count(*) into players from public.play_results r where r.play_id = play.id;
  if cardinality(input) <> players
     or (select count(distinct i.profile_id) from unnest(input) i) <> players
     or exists (
       select 1 from unnest(input) i
        where not exists (
          select 1 from public.play_results r
           where r.play_id = play.id and r.profile_id = i.profile_id and r.seat = i.seat
        )
     ) then
    raise exception 'results must cover exactly the players and seats of play %', play.id
      using errcode = '23514', constraint = 'play_results_players', hint = 'plays_results_players';
  end if;
  if players < 2 then
    raise exception 'play % has % players, at least 2 required', play.id, players
      using errcode = '23514', constraint = 'plays_min_players', hint = 'plays_results_players';
  end if;

  -- Snapshot punktacji z rozpoczęcia partii obejmuje wszystkich graczy (GAME-9).
  if cardinality(play.points_snapshot) < players then
    raise exception 'points snapshot covers % places, play has % players', cardinality(play.points_snapshot), players
      using errcode = '23514', constraint = 'plays_max_players', hint = 'plays_points_snapshot';
  end if;

  -- Numeracja miejsc z remisami: miejsce = 1 + liczba graczy na lepszych miejscach.
  if exists (
    select 1 from unnest(input) i
     where i.place <> 1 + (select count(*) from unnest(input) o where o.place < i.place)
  ) then
    raise exception 'places must be numbered with ties (1, 1, 3)'
      using errcode = '23514', constraint = 'play_results_places', hint = 'plays_results_places';
  end if;

  if not exists (select 1 from unnest(input) i where i.ranking_value is not null) then
    raise exception 'no player has a value of the deciding category'
      using errcode = '23514', constraint = 'play_results_ranking', hint = 'plays_results_empty';
  end if;

  -- Miejsca zgodne z kategorią decydującą (EDT-2, EDT-3): lepsze miejsce nie ma gorszej
  -- wartości, wspólne miejsce ma tę samą. Reguły remisów rozdzielają tylko równe wartości;
  -- tego, jak je rozdzieliły, baza nie sprawdza (sumy i reguły liczy notes, §8.3).
  select r.dir, r.tiebreak into dir, tiebreak
    from public.scorepad_versions v
   cross join lateral private.scorepad_ranking(v.template) r
   where v.id = play.scorepad_version_id;
  if exists (
    select 1
      from unnest(input) a
      join unnest(input) b on a.place < b.place
     where a.ranking_value is null and b.ranking_value is not null
        or (a.ranking_value is not null and b.ranking_value is not null
            and case when dir = 'asc' then a.ranking_value > b.ranking_value
                     else a.ranking_value < b.ranking_value end)
  ) or exists (
    select 1
      from unnest(input) a
      join unnest(input) b on a.place = b.place and a.profile_id <> b.profile_id
     where a.ranking_value is distinct from b.ranking_value
  ) or (not tiebreak and exists (
    -- Bez reguł remisu równe wartości decydujące dają wspólne miejsce (EDT-4).
    select 1
      from unnest(input) a
      join unnest(input) b on a.place < b.place
     where a.ranking_value is not distinct from b.ranking_value
  )) then
    raise exception 'places do not follow the deciding category'
      using errcode = '23514', constraint = 'play_results_ranking', hint = 'plays_results_ranking';
  end if;

  -- Punkty z snapshotu punktacji (§5.6.2); `play_points` sprawdza też numerację miejsc.
  select array_agg(i.place order by i.seat), array_agg(i.profile_id order by i.seat)
    into seat_places, seat_profiles
    from unnest(input) i;
  seat_points := public.play_points(seat_places, play.points_snapshot);

  -- Najpierw wyniki (wyzwalacz nie pozwala zmieniać wyników zapisanej partii), potem status.
  update public.play_results r
     set scores = i.scores,
         ranking_value = i.ranking_value,
         place = i.place,
         tied = (select count(*) from unnest(input) o where o.place = i.place) > 1,
         points = pts.points,
         is_win = i.place = 1
    from unnest(input) i
    join unnest(seat_profiles, seat_points) as pts(profile_id, points) on pts.profile_id = i.profile_id
   where r.play_id = play.id and r.profile_id = i.profile_id;

  update public.plays p
     set status = 'saved',
         sheet = save_play.sheet
   where p.id = play.id
  returning p.* into saved;

  return saved;
end;
$$;

comment on function public.save_play(uuid, uuid, jsonb, jsonb) is
  'Kończy partię: zapisuje kartkę i wyniki graczy w jednej transakcji; punkty, remisy i wygrane liczy baza (PAD-5, PAD-7, §5.6). Admin lub prowadzący, tylko spotkanie w trakcie; ponowienie z tą samą treścią zwraca zapisaną partię.';

revoke execute on function public.save_play(uuid, uuid, jsonb, jsonb) from public, anon;
grant execute on function public.save_play(uuid, uuid, jsonb, jsonb) to authenticated;
