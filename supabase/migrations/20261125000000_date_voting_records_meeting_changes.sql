-- Spotkania: głosowanie na termin, rekordy w partiach i zmiany w rankingu punktów.
--
-- 1. Głosowanie na termin. Administrator włącza je w formularzu spotkania (`save_meeting`,
--    parametr `date_voting`), a uczestnicy proponują terminy (`propose_meeting_date`, data
--    i godzina w strefie klubu, NFR-10, bez limitu) i głosują na dowolnie wiele z nich
--    (`meeting_date_votes`, jawne jak głosy na gry). Głosowanie jest tylko opinią: termin
--    spotkania ustala administrator, wybierając propozycję (`decide_meeting_date`) albo wpisując
--    dowolny termin w formularzu. Zasady:
--    - ten sam termin raz na spotkanie. Uczestnik dodaje propozycję przy otwartym głosowaniu na
--      termin (nie w przeszłości) i od razu na nią głosuje. Administrator może też zapisać listę
--      propozycji w formularzu (`date_options`: tablica `{"date", "time"}`, NULL = bez zmiany);
--      propozycja, która zostaje, zachowuje głosy, usunięta kasuje swoje;
--    - głosowanie na termin (`meetings.date_voting_open`) jest niezależne od głosowania na gry
--      i możliwe tylko w zaplanowanym spotkaniu; rozpoczęcie spotkania je zamyka;
--    - `decide_meeting_date(meeting_id, option_id)` ustawia termin spotkania z propozycji
--      i zamyka głosowanie; `reopen_date_voting(meeting_id)`
--      otwiera je ponownie. Obie tylko dla administratora, tylko w zaplanowanym spotkaniu;
--    - głos dodaje i usuwa sam uczestnik (RLS), tylko przy otwartym głosowaniu na termin;
--      usunięcie uczestnika kasuje jego głosy i jego propozycje.
--
-- 2. `meeting_play_records(meeting_id)`: wyniki zapisanych partii spotkania, które były
--    rekordem w chwili rozegrania. Wartość to kategoria decydująca (`ranking_value`), kierunek
--    „lepiej” i porównywalne partie jak w `game_stats` / `player_records` (wersja notesu
--    ostatniej zapisanej partii gry). Partie wcześniejsze to te przed nią w kolejności
--    §5.6.6 (spotkanie `starts_at`, `id`, partia `saved_at`, `id`).
--    - `club_record`: najlepsza wartość partii i lepsza od każdej wcześniejszej w tej grze;
--      pierwsza partia gry ustanawia rekord klubu (najlepsza wartość tej partii);
--    - `personal_record`: lepsza od każdej wcześniejszej wartości gracza w tej grze (pierwsza
--      partia gracza w grze nie jest rekordem osobistym: nie ma z czym porównać).
--    `play_record_preview(play_id, results)` liczy to samo dla partii w toku przed zapisem
--    (podsumowanie oderwanej karteczki, PAD-5): porównuje z zapisanymi partiami gry
--    w kierunku wersji notesu tej partii.
--
-- 3. `meeting_leaderboard_changes(meeting_id, game_ids)` zastępuje w aplikacji
--    `meeting_summary`: dla graczy z partią spotkania (w wybranych grach) punkty zdobyte na
--    spotkaniu, suma i miejsce w klasyfikacji punktów przed spotkaniem i po nim. Klasyfikacja
--    jak `leaderboard('points', …, game_ids)` (te same rozstrzygnięcia, usunięci na końcu),
--    ale liczona z partii do spotkania włącznie (po) albo sprzed niego (przed); liczba wygranych
--    w rozstrzygnięciu też z tego okresu. Pusta tablica / NULL = wszystkie gry.

-- ---------------------------------------------------------------------------------------------
-- 1. Głosowanie na termin
-- ---------------------------------------------------------------------------------------------
alter table public.meetings
  add column date_voting_open boolean not null default false,
  add constraint meetings_date_voting_only_planned check (not date_voting_open or status = 'planned');

comment on column public.meetings.date_voting_open is
  'Głosowanie na proponowane terminy otwarte; tylko w zaplanowanym spotkaniu.';

create table public.meeting_date_options (
  id uuid primary key default gen_random_uuid(),
  meeting_id uuid not null references public.meetings (id) on delete cascade,
  starts_at timestamptz not null,
  created_by uuid not null references public.profiles (id),
  created_at timestamptz not null default now(),
  constraint meeting_date_options_unique unique (meeting_id, starts_at),
  constraint meeting_date_options_id_meeting_key unique (id, meeting_id)
);

create index meeting_date_options_created_by_idx on public.meeting_date_options (created_by);

comment on table public.meeting_date_options is
  'Proponowane terminy spotkania (głosowanie na termin); dodają je uczestnicy i administrator.';

create table public.meeting_date_votes (
  option_id uuid not null,
  meeting_id uuid not null,
  profile_id uuid not null,
  created_at timestamptz not null default now(),
  primary key (option_id, profile_id),
  foreign key (option_id, meeting_id)
    references public.meeting_date_options (id, meeting_id) on delete cascade,
  -- Głosuje tylko uczestnik; usunięcie uczestnika kasuje jego głosy.
  foreign key (meeting_id, profile_id)
    references public.meeting_participants (meeting_id, profile_id) on delete cascade
);

create index meeting_date_votes_meeting_idx on public.meeting_date_votes (meeting_id, profile_id);

comment on table public.meeting_date_votes is
  'Jawne głosy uczestników na proponowane terminy; opinia, termin ustala administrator.';

alter table public.meeting_date_options enable row level security;
alter table public.meeting_date_votes enable row level security;

revoke all on public.meeting_date_options, public.meeting_date_votes from anon, authenticated;
grant select on public.meeting_date_options, public.meeting_date_votes to authenticated;
grant insert (option_id, meeting_id, profile_id) on public.meeting_date_votes to authenticated;
grant delete on public.meeting_date_votes to authenticated;

create function private.is_date_voting_open(target_meeting_id uuid)
returns boolean
language sql
stable
security definer
set search_path = ''
return exists (
  select 1 from public.meetings m where m.id = target_meeting_id and m.date_voting_open
);

comment on function private.is_date_voting_open(uuid) is
  'Czy spotkanie ma otwarte głosowanie na termin (polityki meeting_date_votes).';
revoke all on function private.is_date_voting_open(uuid) from public, anon;
grant execute on function private.is_date_voting_open(uuid) to authenticated;

create policy meeting_date_options_select on public.meeting_date_options for select to authenticated
  using ((select private.is_active_member()));

create policy meeting_date_votes_select on public.meeting_date_votes for select to authenticated
  using ((select private.is_active_member()));
create policy meeting_date_votes_insert_own on public.meeting_date_votes for insert to authenticated
  with check (
    profile_id = (select auth.uid())
    and (select private.is_active_member())
    and private.is_date_voting_open(meeting_id)
  );
create policy meeting_date_votes_delete_own on public.meeting_date_votes for delete to authenticated
  using (
    profile_id = (select auth.uid())
    and (select private.is_active_member())
    and private.is_date_voting_open(meeting_id)
  );

-- Jak głosy na gry: blokada współdzielona spotkania czeka na równoległe zamknięcie głosowania.
create function public.meeting_date_votes_require_open_voting()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  if not coalesce(
    (select m.date_voting_open from public.meetings m where m.id = new.meeting_id for share), false
  ) then
    raise exception 'date voting is closed in meeting %', new.meeting_id
      using errcode = '23514', constraint = 'meeting_date_votes_voting_open',
            hint = 'meeting_date_voting_closed';
  end if;
  return new;
end;
$$;

create trigger meeting_date_votes_require_open_voting
  before insert or update on public.meeting_date_votes
  for each row execute function public.meeting_date_votes_require_open_voting();

revoke execute on function public.meeting_date_votes_require_open_voting() from public, anon, authenticated;

-- Rozpoczęcie spotkania zamyka głosowanie na termin (jak głosowanie na gry, RUN-1).
create function public.meetings_close_date_voting()
returns trigger
language plpgsql
set search_path = ''
as $$
begin
  if new.status <> 'planned' then
    new.date_voting_open := false;
  end if;
  return new;
end;
$$;

create trigger meetings_close_date_voting
  before update of status on public.meetings
  for each row execute function public.meetings_close_date_voting();

revoke execute on function public.meetings_close_date_voting() from public, anon, authenticated;

-- Usunięcie uczestnika kasuje jego propozycje (jak jego głosy). Propozycje administratora,
-- który nie jest uczestnikiem, zostają.
create function public.meeting_participants_drop_date_options()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  delete from public.meeting_date_options o
   where o.meeting_id = old.meeting_id and o.created_by = old.profile_id;
  return old;
end;
$$;

create trigger meeting_participants_drop_date_options
  after delete on public.meeting_participants
  for each row execute function public.meeting_participants_drop_date_options();

revoke execute on function public.meeting_participants_drop_date_options() from public, anon, authenticated;

-- save_meeting z głosowaniem na termin. Dotychczasowa funkcja zostaje jako rdzeń w `private`
-- (zapis spotkania, uczestników i prowadzącego), a nowa dopisuje głosowanie na termin w tej
-- samej transakcji.
-- Nazwa zostaje (`save_meeting.<parametr>` w ciele funkcji odwołuje się do jej nazwy).
alter function public.save_meeting(uuid, text, date, time, uuid[], uuid, boolean) set schema private;
-- Woła ją tylko `public.save_meeting` (security definer), więc sama nie potrzebuje praw właściciela.
alter function private.save_meeting(uuid, text, date, time, uuid[], uuid, boolean) security invoker;
revoke all on function private.save_meeting(uuid, text, date, time, uuid[], uuid, boolean)
  from public, anon, authenticated;

create function public.save_meeting(
  meeting_id uuid,
  title text,
  local_date date,
  local_time time,
  participant_ids uuid[],
  host_id uuid,
  is_new boolean default true,
  date_options jsonb default null,
  date_voting boolean default null
)
returns public.meetings
language plpgsql
security definer
set search_path = ''
as $$
declare
  saved public.meetings;
  club_timezone text := private.club_timezone();
  wanted timestamptz[];
  current_options timestamptz[];
begin
  perform private.require_admin();

  saved := private.save_meeting(
    save_meeting.meeting_id, save_meeting.title, save_meeting.local_date, save_meeting.local_time,
    save_meeting.participant_ids, save_meeting.host_id, save_meeting.is_new);

  if save_meeting.date_options is not null then
    if jsonb_typeof(save_meeting.date_options) <> 'array' then
      raise exception 'date_options must be an array'
        using errcode = '22023', hint = 'meeting_date_options_invalid';
    end if;
    select coalesce(array_agg(distinct private.meeting_local_start(
             (o ->> 'date')::date, (o ->> 'time')::time, club_timezone)), '{}')
      into wanted
      from jsonb_array_elements(save_meeting.date_options) o;
    select coalesce(array_agg(o.starts_at), '{}') into current_options
      from public.meeting_date_options o where o.meeting_id = saved.id;
    -- Ta sama lista (np. edycja innych pól) niczego nie zmienia.
    if not (wanted @> current_options and current_options @> wanted) then
      if saved.status <> 'planned' then
        raise exception 'meeting % has started; date options are locked', saved.id
          using errcode = '23514', constraint = 'meetings_schedule_locked', hint = 'meetings_schedule_locked';
      end if;
      delete from public.meeting_date_options o
       where o.meeting_id = saved.id and not (o.starts_at = any (wanted));
      insert into public.meeting_date_options (meeting_id, starts_at, created_by)
      select saved.id, w, auth.uid() from unnest(wanted) w
      on conflict on constraint meeting_date_options_unique do nothing;
    end if;
  end if;

  if save_meeting.date_voting is not null and save_meeting.date_voting is distinct from saved.date_voting_open then
    if saved.status <> 'planned' then
      raise exception 'meeting % has started; date voting is locked', saved.id
        using errcode = '23514', constraint = 'meetings_schedule_locked', hint = 'meetings_schedule_locked';
    end if;
    update public.meetings m
       set date_voting_open = save_meeting.date_voting
     where m.id = saved.id
    returning * into saved;
  end if;
  return saved;
end;
$$;

comment on function public.save_meeting(uuid, text, date, time, uuid[], uuid, boolean, jsonb, boolean) is
  'Planuje spotkanie (is_new) albo zapisuje zmiany: tytuł, termin w strefie klubu (NULL = bez zmiany), uczestnicy, prowadzący, proponowane terminy (NULL = bez zmiany) i głosowanie na termin (NULL = bez zmiany). Tylko admin.';

revoke execute on function public.save_meeting(uuid, text, date, time, uuid[], uuid, boolean, jsonb, boolean)
  from public, anon;
grant execute on function public.save_meeting(uuid, text, date, time, uuid[], uuid, boolean, jsonb, boolean)
  to authenticated;

-- Propozycja terminu od uczestnika (albo administratora) z głosem proponującego.
create function public.propose_meeting_date(meeting_id uuid, local_date date, local_time time)
returns public.meeting_date_options
language plpgsql
security definer
set search_path = ''
as $$
declare
  current_meeting public.meetings;
  participant boolean;
  starts timestamptz;
  option public.meeting_date_options;
begin
  perform private.require_active_member();

  select m.* into current_meeting from public.meetings m
   where m.id = propose_meeting_date.meeting_id for share;
  if not found then
    raise exception 'meeting % does not exist', propose_meeting_date.meeting_id
      using errcode = 'P0002', hint = 'meetings_not_found';
  end if;
  participant := exists (
    select 1 from public.meeting_participants mp
     where mp.meeting_id = current_meeting.id and mp.profile_id = auth.uid()
  );
  if not participant and not private.is_admin() then
    raise exception 'only participants propose dates'
      using errcode = '42501', hint = 'meeting_date_not_participant';
  end if;
  if not current_meeting.date_voting_open then
    raise exception 'date voting is closed in meeting %', current_meeting.id
      using errcode = '23514', constraint = 'meeting_date_votes_voting_open',
            hint = 'meeting_date_voting_closed';
  end if;
  starts := private.meeting_local_start(
    propose_meeting_date.local_date, propose_meeting_date.local_time, private.club_timezone());
  if starts < now() then
    raise exception 'proposed date % is in the past', starts
      using errcode = '23514', constraint = 'meeting_date_options_future', hint = 'meeting_date_option_past';
  end if;

  insert into public.meeting_date_options (meeting_id, starts_at, created_by)
  values (current_meeting.id, starts, auth.uid())
  on conflict on constraint meeting_date_options_unique do nothing;
  select o.* into option from public.meeting_date_options o
   where o.meeting_id = current_meeting.id and o.starts_at = starts;

  -- Proponujący głosuje na swój termin (administrator spoza uczestników nie głosuje).
  if participant then
    insert into public.meeting_date_votes (option_id, meeting_id, profile_id)
    values (option.id, current_meeting.id, auth.uid())
    on conflict do nothing;
  end if;
  return option;
end;
$$;

comment on function public.propose_meeting_date(uuid, date, time) is
  'Dodaje proponowany termin spotkania (data i godzina w strefie klubu; uczestnik albo admin, przy otwartym głosowaniu na termin, nie w przeszłości) z głosem proponującego; ten sam termin się nie powtarza.';

create function public.decide_meeting_date(meeting_id uuid, option_id uuid)
returns public.meetings
language plpgsql
security definer
set search_path = ''
as $$
declare
  current_meeting public.meetings;
  option_start timestamptz;
  saved public.meetings;
begin
  perform private.require_admin();

  select m.* into current_meeting from public.meetings m
   where m.id = decide_meeting_date.meeting_id for update;
  if not found then
    raise exception 'meeting % does not exist', decide_meeting_date.meeting_id
      using errcode = 'P0002', hint = 'meetings_not_found';
  end if;
  if current_meeting.status <> 'planned' then
    raise exception 'meeting % has started; title and date are locked', current_meeting.id
      using errcode = '23514', constraint = 'meetings_schedule_locked', hint = 'meetings_schedule_locked';
  end if;

  select o.starts_at into option_start from public.meeting_date_options o
   where o.id = decide_meeting_date.option_id and o.meeting_id = current_meeting.id;
  if not found then
    raise exception 'date option % does not belong to meeting %', decide_meeting_date.option_id, current_meeting.id
      using errcode = 'P0002', hint = 'meeting_date_option_not_found';
  end if;

  update public.meetings m
     set starts_at = option_start, date_voting_open = false
   where m.id = current_meeting.id
  returning * into saved;
  return saved;
end;
$$;

comment on function public.decide_meeting_date(uuid, uuid) is
  'Ustala termin zaplanowanego spotkania z propozycji i zamyka głosowanie na termin. Głosy są tylko opinią. Tylko admin.';

create function public.reopen_date_voting(meeting_id uuid)
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

  select m.* into current_meeting from public.meetings m
   where m.id = reopen_date_voting.meeting_id for update;
  if not found then
    raise exception 'meeting % does not exist', reopen_date_voting.meeting_id
      using errcode = 'P0002', hint = 'meetings_not_found';
  end if;
  if current_meeting.status <> 'planned' then
    raise exception 'meeting % has started; date voting cannot be reopened', current_meeting.id
      using errcode = '23514', constraint = 'meetings_reopen_planned', hint = 'meetings_reopen_planned';
  end if;

  update public.meetings m
     set date_voting_open = true
   where m.id = current_meeting.id
  returning * into saved;
  return saved;
end;
$$;

comment on function public.reopen_date_voting(uuid) is
  'Otwiera ponownie głosowanie na termin w zaplanowanym spotkaniu. Tylko admin.';

revoke execute on function
  public.propose_meeting_date(uuid, date, time),
  public.decide_meeting_date(uuid, uuid),
  public.reopen_date_voting(uuid)
from public, anon;
grant execute on function
  public.propose_meeting_date(uuid, date, time),
  public.decide_meeting_date(uuid, uuid),
  public.reopen_date_voting(uuid)
to authenticated;

-- ---------------------------------------------------------------------------------------------
-- 2. Rekordy w partiach
-- ---------------------------------------------------------------------------------------------
create function public.meeting_play_records(meeting_id uuid)
returns table (
  play_id uuid,
  profile_id uuid,
  value numeric,
  club_record boolean,
  personal_record boolean
)
language sql
stable
security invoker
set search_path = ''
as $$
  with games as (
    select distinct p.game_id from public.plays p
     where p.meeting_id = meeting_play_records.meeting_id and p.status = 'saved'
  ),
  saved as (
    select p.id, p.game_id, p.meeting_id, p.saved_at, m.starts_at, coalesce(rk.dir, 'desc') as dir
      from public.plays p
      join public.meetings m on m.id = p.meeting_id
      left join public.scorepad_versions v on v.id = p.scorepad_version_id
      left join lateral private.scorepad_ranking(v.template) rk on true
     where p.status = 'saved' and p.game_id in (select g.game_id from games g)
  ),
  -- Kierunek wersji notesu ostatniej zapisanej partii gry (jak `game_stats`, §5.6.6).
  current_dir as (
    select distinct on (s.game_id) s.game_id, s.dir
      from saved s
     order by s.game_id, s.starts_at desc, s.meeting_id desc, s.saved_at desc, s.id desc
  ),
  -- Wartość „im większa, tym lepsza” niezależnie od kierunku.
  comparable as (
    select r.profile_id, r.ranking_value as value,
           case when s.dir = 'asc' then -r.ranking_value else r.ranking_value end as score,
           s.id as play_id, s.game_id, s.meeting_id, s.starts_at, s.saved_at
      from public.play_results r
      join saved s on s.id = r.play_id
      join current_dir cd on cd.game_id = s.game_id and cd.dir = s.dir
     where r.ranking_value is not null
  ),
  target as (
    select c.*, max(c.score) over (partition by c.play_id) as play_best
      from comparable c
     where c.meeting_id = meeting_play_records.meeting_id
  ),
  marked as (
    select t.play_id, t.profile_id, t.value,
           coalesce(t.score = t.play_best and t.score > club.best, t.score = t.play_best) as club_record,
           coalesce(t.score > mine.best, false) as personal_record
      from target t
      cross join lateral (
        select max(c.score) as best from comparable c
         where c.game_id = t.game_id
           and (c.starts_at, c.meeting_id, c.saved_at, c.play_id) < (t.starts_at, t.meeting_id, t.saved_at, t.play_id)
      ) club
      cross join lateral (
        select max(c.score) as best from comparable c
         where c.game_id = t.game_id and c.profile_id = t.profile_id
           and (c.starts_at, c.meeting_id, c.saved_at, c.play_id) < (t.starts_at, t.meeting_id, t.saved_at, t.play_id)
      ) mine
  )
  select mk.play_id, mk.profile_id, mk.value, mk.club_record, mk.personal_record
    from marked mk
   where mk.club_record or mk.personal_record
   order by mk.play_id, mk.profile_id;
$$;

comment on function public.meeting_play_records(uuid) is
  'Rekordy klubu i rekordy osobiste ustanowione w zapisanych partiach spotkania (wartość decydująca lepsza od wszystkich wcześniejszych w grze, kierunek jak w game_stats).';

revoke execute on function public.meeting_play_records(uuid) from public, anon;
grant execute on function public.meeting_play_records(uuid) to authenticated;

-- Podgląd przed zapisem: `results` to tablica `{"profile_id": uuid, "value": liczba | null}`.
create function public.play_record_preview(play_id uuid, results jsonb)
returns table (
  profile_id uuid,
  value numeric,
  club_record boolean,
  personal_record boolean
)
language sql
stable
security invoker
set search_path = ''
as $$
  with target as (
    select p.id, p.game_id, coalesce(rk.dir, 'desc') as dir
      from public.plays p
      left join public.scorepad_versions v on v.id = p.scorepad_version_id
      left join lateral private.scorepad_ranking(v.template) rk on true
     where p.id = play_record_preview.play_id
  ),
  candidate as (
    select (e ->> 'profile_id')::uuid as profile_id, (e ->> 'value')::numeric as value
      from jsonb_array_elements(coalesce(play_record_preview.results, '[]'::jsonb)) e
     where e ->> 'value' is not null
  ),
  scored as (
    select c.profile_id, c.value,
           case when t.dir = 'asc' then -c.value else c.value end as score
      from candidate c cross join target t
  ),
  previous as (
    select r.profile_id, case when t.dir = 'asc' then -r.ranking_value else r.ranking_value end as score
      from public.play_results r
      join public.plays p on p.id = r.play_id and p.status = 'saved'
      join target t on t.game_id = p.game_id and p.id <> t.id
      left join public.scorepad_versions v on v.id = p.scorepad_version_id
      left join lateral private.scorepad_ranking(v.template) rk on true
     where r.ranking_value is not null and coalesce(rk.dir, 'desc') = t.dir
  ),
  marked as (
    select s.profile_id, s.value,
           s.score = max(s.score) over ()
             and coalesce(s.score > (select max(pv.score) from previous pv), true) as club_record,
           coalesce(s.score > (select max(pv.score) from previous pv where pv.profile_id = s.profile_id),
                    false) as personal_record
      from scored s
  )
  select mk.profile_id, mk.value, mk.club_record, mk.personal_record
    from marked mk
   where mk.club_record or mk.personal_record
   order by mk.profile_id;
$$;

comment on function public.play_record_preview(uuid, jsonb) is
  'Podgląd rekordów klubu i osobistych dla wyników partii przed zapisem (podsumowanie oderwanej karteczki).';

revoke execute on function public.play_record_preview(uuid, jsonb) from public, anon;
grant execute on function public.play_record_preview(uuid, jsonb) to authenticated;

-- ---------------------------------------------------------------------------------------------
-- 3. Zmiany w klasyfikacji punktów po spotkaniu
-- ---------------------------------------------------------------------------------------------
create function public.meeting_leaderboard_changes(meeting_id uuid, game_ids uuid[] default null)
returns table (
  profile_id uuid,
  deleted boolean,
  points numeric,
  games jsonb,
  total_before numeric,
  total_after numeric,
  place_before int,
  place_after int
)
language sql
stable
security invoker
set search_path = ''
as $$
  with target as (
    select m.id, m.starts_at from public.meetings m where m.id = meeting_leaderboard_changes.meeting_id
  ),
  game_filter as (
    select nullif(meeting_leaderboard_changes.game_ids, '{}'::uuid[]) as ids
  ),
  -- Wszystkie zapisane wyniki do spotkania włącznie (kolejność §5.6.6).
  results as (
    select r.profile_id, r.points, r.is_win, p.game_id,
           dense_rank() over (partition by m.id order by p.saved_at, p.id) as play_order,
           m.id as meeting_id, m.starts_at,
           (m.starts_at, m.id) < (t.starts_at, t.id) as earlier
      from public.play_results r
      join public.plays p on p.id = r.play_id and p.status = 'saved'
      join public.meetings m on m.id = r.meeting_id
      cross join target t
     where (m.starts_at, m.id) <= (t.starts_at, t.id)
  ),
  -- Dwa okresy: przed spotkaniem (bez niego) i po nim (z nim).
  phased as (
    select ph.after, r.*
      from results r
      cross join (values (false), (true)) as ph(after)
     where ph.after or r.earlier
  ),
  filtered as (
    select ph.* from phased ph
     cross join game_filter gf
     where gf.ids is null or ph.game_id = any (gf.ids)
  ),
  per_meeting as (
    select f.after, f.profile_id, f.meeting_id, min(f.starts_at) as starts_at, sum(f.points) as points
      from filtered f
     group by f.after, f.profile_id, f.meeting_id
  ),
  totals as (
    select pm.after, pm.profile_id, sum(pm.points) as points
      from per_meeting pm
     group by pm.after, pm.profile_id
  ),
  -- Wygrane z okresu we wszystkich grach (3. kryterium rozstrzygnięcia jak w `leaderboard`).
  career as (
    select ph.after, ph.profile_id, (count(*) filter (where ph.is_win))::int as won
      from phased ph
     group by ph.after, ph.profile_id
  ),
  -- Spotkanie, na którym gracz osiągnął wynik: ostatnie, które ten wynik zmieniło.
  reached as (
    select distinct on (pm.after, pm.profile_id)
           pm.after, pm.profile_id, pm.meeting_id, pm.starts_at, pm.points
      from per_meeting pm
     where pm.points <> 0
     order by pm.after, pm.profile_id, pm.starts_at desc, pm.meeting_id desc
  ),
  scored as (
    select t.after, t.profile_id, t.points as score, pr.first_name, pr.last_name,
           pr.deleted_at is not null as deleted, coalesce(cw.won, 0) as career_won,
           rc.meeting_id as reached_id, rc.starts_at as reached_starts, rc.points as reached_score
      from totals t
      join public.profiles pr on pr.id = t.profile_id
      left join reached rc on rc.after = t.after and rc.profile_id = t.profile_id
      left join career cw on cw.after = t.after and cw.profile_id = t.profile_id
  ),
  ranked as (
    select sc.after, sc.profile_id, sc.score, sc.deleted,
           (row_number() over (
              partition by sc.after, sc.deleted
              order by sc.score desc, sc.reached_starts desc nulls last, sc.reached_id desc nulls last,
                       sc.reached_score desc nulls last, sc.career_won desc,
                       sc.first_name collate "pl-x-icu", sc.last_name collate "pl-x-icu", sc.profile_id)
             + case when sc.deleted then count(*) filter (where not sc.deleted) over (partition by sc.after) else 0 end
           )::int as place
      from scored sc
  ),
  -- Punkty spotkania z rozbiciem na gry (w kolejności pierwszej partii gry w spotkaniu).
  meeting_games as (
    select f.profile_id, f.game_id, g.title, g.deleted_at is not null as game_deleted,
           sum(f.points) as points, min(f.play_order) as first_play
      from filtered f
      join target t on t.id = f.meeting_id
      join public.games g on g.id = f.game_id
     where f.after
     group by f.profile_id, f.game_id, g.title, g.deleted_at
  ),
  players as (
    select mg.profile_id, sum(mg.points) as points,
           jsonb_agg(jsonb_build_object(
             'game_id', mg.game_id, 'title', mg.title, 'deleted', mg.game_deleted, 'points', mg.points)
             order by mg.first_play) as games
      from meeting_games mg
     group by mg.profile_id
  )
  select pl.profile_id, af.deleted, pl.points, pl.games, bf.score, af.score, bf.place, af.place
    from players pl
    join ranked af on af.after and af.profile_id = pl.profile_id
    left join ranked bf on not bf.after and bf.profile_id = pl.profile_id
   order by af.place;
$$;

comment on function public.meeting_leaderboard_changes(uuid, uuid[]) is
  'Zmiany w klasyfikacji punktów po spotkaniu dla graczy z partią spotkania (opcjonalnie tylko wybrane gry): punkty zdobyte na spotkaniu z rozbiciem na gry, suma i miejsce przed spotkaniem i po nim (rozstrzygnięcia jak leaderboard).';

revoke execute on function public.meeting_leaderboard_changes(uuid, uuid[]) from public, anon;
grant execute on function public.meeting_leaderboard_changes(uuid, uuid[]) to authenticated;
