-- [004] Uprawnienia: RLS, prawa ról klienta, funkcje sprawdzające role i buckety Storage
-- (PRD §2, §6.1, NFR-9).
--
-- Zasady:
-- - Odmowa domyślna. Rola `anon` nie ma żadnych praw do tabel i funkcji aplikacji. Rola
--   `authenticated` ma tylko prawa wymienione niżej (także na poziomie kolumn), a RLS zawęża
--   je do wierszy. Konto usunięte (`profiles.deleted_at`) z ważnym jeszcze tokenem nie widzi
--   niczego i niczego nie zapisze.
-- - `service_role` (Edge Functions) omija RLS i jest jedyną drogą do pól `role`, `hook`,
--   `deleted_at` oraz do tworzenia i usuwania profili (§6.1). Ten klucz nie trafia do SPA.
-- - Zapis i usuwanie partii i wyników (`plays`, `play_results`), rozpoczęcie i zakończenie
--   spotkania idą przez RPC SECURITY DEFINER z kolejnych zadań
--   (jedna transakcja: zmiana + przeliczenie, §5.6.5). Każde takie RPC zaczyna od
--   `private.require_admin()` albo `private.require_meeting_runner(meeting_id)`.
-- - Funkcje sprawdzające role są w schemacie `private`, którego PostgREST nie udostępnia, więc
--   klient nie wywoła ich przez /rpc. Są SECURITY DEFINER z pustym search_path: czytają
--   `profiles` i `meetings` z pominięciem RLS (bez rekurencji polityk) i nie dają się
--   przekierować na obce obiekty przez search_path.

-- ---------------------------------------------------------------------------------------------
-- Schemat private: funkcje sprawdzające role
-- ---------------------------------------------------------------------------------------------
create schema private;

comment on schema private is
  'Funkcje pomocnicze uprawnień (RLS, RPC). Nie jest udostępniany przez PostgREST.';

revoke all on schema private from public;
-- Polityki RLS wywołują funkcje z prawami użytkownika, który wykonuje zapytanie.
grant usage on schema private to authenticated;

-- Czy zalogowany użytkownik ma aktywny profil (nie jest usunięty, MEM-4, AUTH-7).
-- Token usuniętego konta bywa ważny jeszcze do godziny (jwt_expiry); ta funkcja go odcina.
create function private.is_active_member()
returns boolean
language sql
stable
security definer
set search_path = ''
return exists (
  select 1 from public.profiles p
   where p.id = auth.uid()
     and p.deleted_at is null
);

comment on function private.is_active_member() is
  'Czy auth.uid() ma aktywny (nieusunięty) profil. Warunek odczytu wszystkich danych (§6.1).';

-- Czy zalogowany użytkownik jest administratorem (AUTH-3). Admina nie da się usunąć, ale
-- warunek deleted_at zostaje na wypadek ręcznej zmiany w bazie.
create function private.is_admin()
returns boolean
language sql
stable
security definer
set search_path = ''
return exists (
  select 1 from public.profiles p
   where p.id = auth.uid()
     and p.role = 'admin'
     and p.deleted_at is null
);

comment on function private.is_admin() is 'Czy auth.uid() jest aktywnym administratorem (§2).';

-- Czy zalogowany użytkownik może prowadzić istniejące spotkanie (§2.1): admin zawsze (także
-- zakończone, żeby cofnąć zakończenie, RUN-5), prowadzący (`host_id`) tylko w swoim
-- niezakończonym spotkaniu. Zakończone spotkanie zachowuje prowadzącego w historii, ale ten
-- traci uprawnienia; gdy admin cofnie zakończenie, prowadzący znów prowadzi spotkanie w
-- trakcie (admin może go wcześniej zmienić, PLAN-4). Nieistniejące spotkanie i NULL: false.
create function private.is_meeting_runner(target_meeting_id uuid)
returns boolean
language sql
stable
security definer
set search_path = ''
return exists (
  select 1
    from public.meetings m
   where m.id = target_meeting_id
     and (
       private.is_admin()
       or (
         m.host_id = auth.uid()
         and m.status <> 'finished'
         and private.is_active_member()
       )
     )
);

comment on function private.is_meeting_runner(uuid) is
  'Admin albo prowadzący (host_id) niezakończonego spotkania. Kontrola „admin lub host_id” z §6.1.';

-- Tekst → uuid bez wyjątku (NULL dla złego formatu). Ścieżki plików w Storage pochodzą od
-- klienta, a błąd rzutowania w polityce przerwałby żądanie komunikatem bazy.
create function private.try_uuid(value text)
returns uuid
language sql
immutable
parallel safe
set search_path = ''
return case
  when value ~* '^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$' then value::uuid
end;

comment on function private.try_uuid(text) is 'Rzutowanie tekstu na uuid; NULL zamiast błędu dla złego formatu.';

-- Czy w spotkaniu trwa głosowanie (VOTE-1). Flaga jest dozwolona tylko w statusie planned.
create function private.is_voting_open(target_meeting_id uuid)
returns boolean
language sql
stable
security definer
set search_path = ''
return exists (select 1 from public.meetings m where m.id = target_meeting_id and m.voting_open);

comment on function private.is_voting_open(uuid) is 'Czy spotkanie ma otwarte głosowanie (polityki game_votes).';

-- Strażnicy dla RPC SECURITY DEFINER (które omijają RLS): pierwsza instrukcja każdego RPC
-- zapisującego dane. Kod 42501 (insufficient_privilege) aplikacja mapuje na polski komunikat.
-- Same nie potrzebują podwyższonych praw: wywołują funkcje is_* (SECURITY DEFINER).
create function private.require_active_member()
returns void
language plpgsql
stable
set search_path = ''
as $$
begin
  if not private.is_active_member() then
    raise exception 'active member account required' using errcode = '42501';
  end if;
end;
$$;

create function private.require_admin()
returns void
language plpgsql
stable
set search_path = ''
as $$
begin
  if not private.is_admin() then
    raise exception 'administrator required' using errcode = '42501';
  end if;
end;
$$;

create function private.require_meeting_runner(target_meeting_id uuid)
returns void
language plpgsql
stable
set search_path = ''
as $$
begin
  if not private.is_meeting_runner(target_meeting_id) then
    raise exception 'administrator or host of meeting % required', target_meeting_id using errcode = '42501';
  end if;
end;
$$;

comment on function private.require_active_member() is 'Strażnik RPC: wyjątek 42501, gdy konto nie jest aktywne.';
comment on function private.require_admin() is 'Strażnik RPC: wyjątek 42501, gdy wywołujący nie jest adminem.';
comment on function private.require_meeting_runner(uuid) is
  'Strażnik RPC: wyjątek 42501, gdy wywołujący nie jest adminem ani prowadzącym spotkania.';

-- EXECUTE domyślnie ma PUBLIC; odbieramy i nadajemy tylko to, czego używają polityki.
-- Strażnicy require_* są dla RPC SECURITY DEFINER (działają jako właściciel), więc klient
-- nie potrzebuje do nich praw.
revoke all on all functions in schema private from public, anon, authenticated;
grant execute on function
  private.is_active_member(),
  private.is_admin(),
  private.is_meeting_runner(uuid),
  private.is_voting_open(uuid),
  private.try_uuid(text)
to authenticated;

-- ---------------------------------------------------------------------------------------------
-- Prawa ról klienta do tabel public
-- ---------------------------------------------------------------------------------------------
-- Supabase domyślnie nadaje anon i authenticated wszystkie prawa do nowych tabel i funkcji
-- w public. Odbieramy je także dla przyszłych obiektów, więc każda kolejna migracja musi
-- nadać prawa jawnie (EXECUTE od PUBLIC trzeba odebrać osobno przy każdej funkcji;
-- pilnuje tego test 050).
revoke all on all tables in schema public from anon, authenticated;
revoke all on all sequences in schema public from anon, authenticated;
alter default privileges for role postgres in schema public revoke all on tables from anon, authenticated;
alter default privileges for role postgres in schema public revoke all on sequences from anon, authenticated;
alter default privileges for role postgres in schema public revoke all on functions from anon, authenticated;

-- Funkcje czyste z migracji [003] (wyszukiwanie, walidacja). Używają ich kolumna generowana,
-- CHECK i wyzwalacz klubu, więc zostają dla authenticated; anon traci dostęp.
revoke execute on function
  public.f_unaccent(text),
  public.search_text(text),
  public.is_valid_points(numeric[], int),
  public.is_valid_timezone(text)
from public, anon;
grant execute on function
  public.f_unaccent(text),
  public.search_text(text),
  public.is_valid_points(numeric[], int),
  public.is_valid_timezone(text)
to authenticated;

-- Odczyt: wszystko dla zalogowanych (RLS: tylko aktywne konta). Gracz przegląda cały klub,
-- także historię z usuniętymi grami i członkami (§2.1, MEM-5, GAME-8).
grant select on all tables in schema public to authenticated;

-- Zapis: tylko kolumny, które klient może ustawić. Identyfikatory, znaczniki czasu, numery
-- wersji i snapshoty nadaje baza; `role`, `hook`, `deleted_at` profilu tylko service_role.
grant insert (name, logo_path, timezone) on public.club to authenticated;
grant update (name, logo_path, timezone) on public.club to authenticated;

grant update (first_name, last_name, avatar_path, theme) on public.profiles to authenticated;

grant insert (id, title, cover_path, min_players, max_players, placement_points, complexity, base_game_id,
  cover_source_path, cover_crop, available) on public.games to authenticated;
grant update (title, cover_path, min_players, max_players, placement_points, deleted_at, complexity,
  cover_source_path, cover_crop, available) on public.games to authenticated;

grant insert (id, game_id, name) on public.scorepads to authenticated;
grant update (game_id, name, current_version_id, deleted_at) on public.scorepads to authenticated;

grant insert (id, scorepad_id, template, image_path, player_slots) on public.scorepad_versions to authenticated;

-- Status spotkania i jego znaczniki czasu zmieniają RPC rozpoczęcia i zakończenia (RUN-1,
-- RUN-4, RUN-5), bo robi to także prowadzący. created_by ustawia baza (domyślnie auth.uid()).
grant insert (id, title, starts_at, voting_open, host_id) on public.meetings to authenticated;
grant update (title, starts_at, voting_open, host_id) on public.meetings to authenticated;
grant delete on public.meetings to authenticated;

grant insert (meeting_id, profile_id) on public.meeting_participants to authenticated;
grant delete on public.meeting_participants to authenticated;

grant insert (meeting_id, game_id, profile_id) on public.game_votes to authenticated;
grant delete on public.game_votes to authenticated;

grant insert (meeting_id, game_id, position) on public.meeting_games to authenticated;
grant update (position) on public.meeting_games to authenticated;
grant delete on public.meeting_games to authenticated;

-- plays, play_results: tylko odczyt. Tworzenie, zapis i usuwanie partii (także porzucenie
-- szkicu) robi RPC, bo usunięcie musi w tej samej transakcji przeliczyć zależne dane (§5.6.5).

-- Autor spotkania z tokenu, a nie z treści żądania.
alter table public.meetings alter column created_by set default auth.uid();

-- Awatar leży w folderze właściciela w buckecie avatars: `<profile_id>/<plik>`. Profil nie
-- wskaże cudzego pliku (polityki Storage pozwalają pisać tylko do własnego folderu).
alter table public.profiles
  add constraint profiles_avatar_path_own_folder
  check (avatar_path is null or avatar_path ~ ('^' || id::text || '/[^/]+$'));

-- ---------------------------------------------------------------------------------------------
-- Polityki RLS (wszystkie dla roli authenticated; anon nie ma żadnej)
-- `(select …)` wokół funkcji bez argumentów: Postgres liczy ją raz na zapytanie, nie na wiersz.
-- ---------------------------------------------------------------------------------------------

-- club: odczyt aktywni, zapis admin (CLUB-2). Klubu nie usuwa nikt.
create policy club_select on public.club for select to authenticated
  using ((select private.is_active_member()));
create policy club_insert_admin on public.club for insert to authenticated
  with check ((select private.is_admin()));
create policy club_update_admin on public.club for update to authenticated
  using ((select private.is_admin()))
  with check ((select private.is_admin()));

-- profiles: odczyt aktywni (także profile usuniętych, MEM-5). Edycja tylko własnego wiersza
-- (USR-5, USR-7: admin też nie edytuje cudzych kont); dozwolone kolumny wyznacza GRANT.
-- Tworzenie i usuwanie profili: Edge Functions (service_role).
create policy profiles_select on public.profiles for select to authenticated
  using ((select private.is_active_member()));
create policy profiles_update_own on public.profiles for update to authenticated
  using (id = (select auth.uid()) and (select private.is_active_member()))
  with check (id = (select auth.uid()));

-- games, scorepads, scorepad_versions: odczyt aktywni, zapis admin (GAME-3, GAME-7).
-- Usuwanie miękkie (UPDATE deleted_at), więc bez polityk DELETE; wersje są niezmienne.
create policy games_select on public.games for select to authenticated
  using ((select private.is_active_member()));
create policy games_insert_admin on public.games for insert to authenticated
  with check ((select private.is_admin()));
create policy games_update_admin on public.games for update to authenticated
  using ((select private.is_admin()))
  with check ((select private.is_admin()));

create policy scorepads_select on public.scorepads for select to authenticated
  using ((select private.is_active_member()));
create policy scorepads_insert_admin on public.scorepads for insert to authenticated
  with check ((select private.is_admin()));
create policy scorepads_update_admin on public.scorepads for update to authenticated
  using ((select private.is_admin()))
  with check ((select private.is_admin()));

create policy scorepad_versions_select on public.scorepad_versions for select to authenticated
  using ((select private.is_active_member()));
create policy scorepad_versions_insert_admin on public.scorepad_versions for insert to authenticated
  with check ((select private.is_admin()));

-- meetings, meeting_participants, meeting_games: odczyt aktywni, zapis admin (PLAN-1…PLAN-5,
-- VOTE-5, PLAN-4). Prowadzący nie edytuje spotkania ani uczestników (Q14). Skład uczestników
-- zmienia się tylko przed zakończeniem spotkania (PLAN-3, PLAN-4); usunięcia uczestnika z
-- partią i spotkania z partiami blokują klucze obce (PLAN-4, PLAN-5).
create policy meetings_select on public.meetings for select to authenticated
  using ((select private.is_active_member()));
create policy meetings_insert_admin on public.meetings for insert to authenticated
  with check ((select private.is_admin()) and created_by = (select auth.uid()));
create policy meetings_update_admin on public.meetings for update to authenticated
  using ((select private.is_admin()))
  with check ((select private.is_admin()));
create policy meetings_delete_admin on public.meetings for delete to authenticated
  using ((select private.is_admin()));

create policy meeting_participants_select on public.meeting_participants for select to authenticated
  using ((select private.is_active_member()));
create policy meeting_participants_insert_admin on public.meeting_participants for insert to authenticated
  with check (
    (select private.is_admin())
    and exists (select 1 from public.meetings m where m.id = meeting_id and m.status <> 'finished')
  );
create policy meeting_participants_delete_admin on public.meeting_participants for delete to authenticated
  using (
    (select private.is_admin())
    and exists (select 1 from public.meetings m where m.id = meeting_id and m.status <> 'finished')
  );

create policy meeting_games_select on public.meeting_games for select to authenticated
  using ((select private.is_active_member()));
create policy meeting_games_insert_admin on public.meeting_games for insert to authenticated
  with check ((select private.is_admin()));
create policy meeting_games_update_admin on public.meeting_games for update to authenticated
  using ((select private.is_admin()))
  with check ((select private.is_admin()));
create policy meeting_games_delete_admin on public.meeting_games for delete to authenticated
  using ((select private.is_admin()));

-- game_votes: jawne (VOTE-3). Własny głos, tylko uczestnik (klucz obcy do uczestników),
-- tylko przy otwartym głosowaniu (VOTE-1, VOTE-2). Usunięcie uczestnika lub spotkania kasuje
-- głosy kaskadą, która nie podlega RLS.
create policy game_votes_select on public.game_votes for select to authenticated
  using ((select private.is_active_member()));
create policy game_votes_insert_own on public.game_votes for insert to authenticated
  with check (
    profile_id = (select auth.uid())
    and (select private.is_active_member())
    and private.is_voting_open(meeting_id)
  );
create policy game_votes_delete_own on public.game_votes for delete to authenticated
  using (
    profile_id = (select auth.uid())
    and (select private.is_active_member())
    and private.is_voting_open(meeting_id)
  );

-- Głos dodany równolegle z zamknięciem głosowania (VOTE-5) nie może się prześlizgnąć: blokada
-- współdzielona wiersza spotkania czeka na transakcję, która zamyka głosowanie, i widzi jej
-- wynik. Dotyczy też service_role. Usuwanie głosów tylko przez RLS, bo kaskada (usunięcie
-- uczestnika lub spotkania) musi działać także po zamknięciu głosowania.
create function public.game_votes_require_open_voting()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  if not coalesce((select m.voting_open from public.meetings m where m.id = new.meeting_id for share), false) then
    raise exception 'voting is closed in meeting %', new.meeting_id
      using errcode = '23514', constraint = 'game_votes_voting_open';
  end if;
  return new;
end;
$$;

create trigger game_votes_require_open_voting
  before insert or update on public.game_votes
  for each row execute function public.game_votes_require_open_voting();

revoke execute on function public.game_votes_require_open_voting() from public, anon, authenticated;

-- plays, play_results: odczyt aktywni; zapis i usuwanie przez RPC (§6.1, §5.6.5).
create policy plays_select on public.plays for select to authenticated
  using ((select private.is_active_member()));

create policy play_results_select on public.play_results for select to authenticated
  using ((select private.is_active_member()));

-- ---------------------------------------------------------------------------------------------
-- Storage: prywatne buckety (PRD §6, NFR-7)
-- ---------------------------------------------------------------------------------------------
-- Obrazy są skalowane w przeglądarce (WebP), więc limity mają duży zapas względem NFR-7.
-- Prywatny bucket: pliki tylko przez zalogowane żądanie lub podpisany URL, nigdy publicznie.
insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types) values
  ('avatars', 'avatars', false, 1048576, array['image/webp', 'image/jpeg', 'image/png']),
  ('covers', 'covers', false, 2097152, array['image/webp', 'image/jpeg', 'image/png']),
  ('scorepads', 'scorepads', false, 5242880, array['image/webp', 'image/jpeg', 'image/png']),
  ('sheets', 'sheets', false, 2097152, array['image/webp', 'image/jpeg', 'image/png'])
on conflict (id) do update
  set public = excluded.public,
      file_size_limit = excluded.file_size_limit,
      allowed_mime_types = excluded.allowed_mime_types;

-- Ścieżki:
-- - avatars:   `<profile_id>/<plik>` (bez podfolderów, jak profiles.avatar_path): właściciel
--              profilu (USR-3),
-- - covers:    okładki gier i logo klubu: admin (GAME-6, CLUB-2),
-- - scorepads: zdjęcia szablonów notesów: admin (GAME-7),
-- - sheets:    `<meeting_id>/<play_id>-<losowy sufiks>.webp`: obraz karteczki zapisuje admin
--              lub prowadzący spotkania (PAD-6), bez nadpisywania. Każda próba zapisu ma nową
--              nazwę, więc ponowienie po błędzie nie trafia na istniejący plik; ścieżkę wpisuje
--              do partii RPC zapisu. Usuwa admin razem z partią (§5.6.5).
create policy bg_club_objects_select on storage.objects for select to authenticated
  using (
    bucket_id in ('avatars', 'covers', 'scorepads', 'sheets')
    and (select private.is_active_member())
  );

create policy bg_club_avatars_insert_own on storage.objects for insert to authenticated
  with check (
    bucket_id = 'avatars'
    and (storage.foldername(name))[1] = (select auth.uid())::text
    and array_length(storage.foldername(name), 1) = 1
    and (select private.is_active_member())
  );
create policy bg_club_avatars_update_own on storage.objects for update to authenticated
  using (
    bucket_id = 'avatars'
    and (storage.foldername(name))[1] = (select auth.uid())::text
    and (select private.is_active_member())
  )
  with check (
    bucket_id = 'avatars'
    and (storage.foldername(name))[1] = (select auth.uid())::text
    and array_length(storage.foldername(name), 1) = 1
  );
create policy bg_club_avatars_delete_own on storage.objects for delete to authenticated
  using (
    bucket_id = 'avatars'
    and (storage.foldername(name))[1] = (select auth.uid())::text
    and (select private.is_active_member())
  );

create policy bg_club_admin_assets_insert on storage.objects for insert to authenticated
  with check (bucket_id in ('covers', 'scorepads') and (select private.is_admin()));
create policy bg_club_admin_assets_update on storage.objects for update to authenticated
  using (bucket_id in ('covers', 'scorepads') and (select private.is_admin()))
  with check (bucket_id in ('covers', 'scorepads') and (select private.is_admin()));
create policy bg_club_admin_assets_delete on storage.objects for delete to authenticated
  using (bucket_id in ('covers', 'scorepads') and (select private.is_admin()));

create policy bg_club_sheets_insert_runner on storage.objects for insert to authenticated
  with check (
    bucket_id = 'sheets'
    and private.is_meeting_runner(private.try_uuid((storage.foldername(name))[1]))
  );
create policy bg_club_sheets_delete_admin on storage.objects for delete to authenticated
  using (bucket_id = 'sheets' and (select private.is_admin()));
