-- Profil i ustawienia: propozycja zmiany wygenerowanego hasła.
--
-- Zasady:
-- - `profiles.password_change_suggested` mówi, że konto ma jeszcze hasło wygenerowane przez
--   aplikację (`create-member`, bootstrap bez własnego hasła). Przy pierwszym logowaniu
--   aplikacja proponuje wtedy zmianę hasła. Gracz może propozycję pominąć: SPA ustawia flagę
--   `false` po pominięciu i po udanej zmianie hasła.
-- - Flagę przy tworzeniu konta ustawia wyzwalacz z `app_metadata.bg_club.password_generated`
--   (domyślnie `true`, bo tylko bootstrap z własnym hasłem podaje `false`). `app_metadata`
--   ustawia wyłącznie klucz service role.
-- - Klient może zmienić tylko swoją flagę (polityka `profiles_update_own`). Ponowne ustawienie
--   `true` niczego nie odblokowuje: najwyżej znowu pokaże tę samą propozycję.
-- - Samą zmianę hasła sprawdza Auth: `updateUser` wymaga obecnego hasła
--   (`require_current_password`, `supabase/config.toml`; w projekcie Supabase włączane w panelu).

alter table public.profiles
  add column password_change_suggested boolean not null default false;

comment on column public.profiles.password_change_suggested is
  'Konto ma hasło wygenerowane przez aplikację; po zalogowaniu proponujemy jego zmianę.';

grant update (password_change_suggested) on public.profiles to authenticated;

-- Wyzwalacz konta z dodaną flagą. Reszta bez zmian (komentarze).
create or replace function public.handle_auth_user_created()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
declare
  account auth.users;
  meta jsonb;
  new_hook text;
  new_role text;
begin
  select * into account from auth.users where id = new.id;
  if not found then
    -- Konto usunięte w tej samej transakcji: nie ma czego tworzyć.
    return null;
  end if;

  meta := account.raw_app_meta_data -> 'bg_club';
  new_hook := private.hook_from_email(account.email);

  if meta is null or jsonb_typeof(meta) <> 'object' then
    raise exception 'accounts are created only by the server (app_metadata.bg_club is missing)'
      using errcode = '42501';
  end if;
  if new_hook is null then
    raise exception 'account email must be <hook>@users.bgclub.invalid'
      using errcode = '23514', constraint = 'auth_users_technical_email';
  end if;

  new_role := coalesce(meta ->> 'role', 'player');

  -- Blokada transakcyjna szereguje tworzenie kont: sprawdzenie „pusta instalacja” albo
  -- „administrator istnieje” widzi zatwierdzone wcześniej konta, a nie tylko własną migawkę.
  perform pg_catalog.pg_advisory_xact_lock(pg_catalog.hashtext('bg_club.create_account'));

  if new_role = 'admin' and exists (select 1 from public.profiles) then
    raise exception 'administrator can be created only on an empty installation'
      using errcode = '23514', constraint = 'profiles_admin_first';
  end if;
  if new_role <> 'admin'
     and not exists (select 1 from public.profiles where role = 'admin') then
    raise exception 'the administrator account must be created first'
      using errcode = '23514', constraint = 'profiles_admin_first';
  end if;

  -- Długości, format hooka i rola sprawdzają ograniczenia tabeli profiles.
  insert into public.profiles (id, hook, first_name, last_name, role, password_change_suggested)
  values (
    account.id,
    new_hook,
    btrim(meta ->> 'first_name'),
    btrim(meta ->> 'last_name'),
    new_role,
    -- Tylko jawne `false` (własne hasło administratora z bootstrapu) wyłącza propozycję.
    (meta -> 'password_generated') is distinct from 'false'::jsonb
  );

  return null;
end;
$$;

revoke execute on function public.handle_auth_user_created() from public, anon, authenticated;
