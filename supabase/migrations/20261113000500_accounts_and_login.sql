-- [005] Konta Auth: bootstrap administratora, logowanie hookiem i blokada usuniętych kont
-- (PRD AUTH-1…AUTH-3, AUTH-5, AUTH-7, §6.1).
--
-- Zasady:
-- - Konto Supabase Auth ma techniczny e-mail `<hook>@users.bgclub.invalid` (AUTH-1). Domena
--   `.invalid` jest zarezerwowana (RFC 2606), więc żadna wiadomość nie wychodzi poza Auth.
-- - Konto Auth i profil powstają razem, w jednej transakcji: wyzwalacz na `auth.users` tworzy
--   profil z `app_metadata.bg_club`, które ustawia wyłącznie klucz service role (Edge Functions,
--   skrypt bootstrapu). Błąd profilu wycofuje też konto Auth, więc nie zostaje niespójne konto.
-- - Rejestracja samodzielna jest wyłączona w Auth (`enable_signup = false`, AUTH-2), a baza
--   dodatkowo odrzuca każde konto bez `app_metadata.bg_club`: nawet włączony przez pomyłkę
--   signup ani ręcznie dodany w panelu użytkownik nie dostaje profilu ani dostępu.
-- - Pierwszym kontem jest zawsze administrator (AUTH-3): rola `admin` tylko na pustej instalacji,
--   konto gracza dopiero wtedy, gdy administrator istnieje. Ponowiony bootstrap nie utworzy
--   drugiego administratora (także przy równoległych próbach: unikalny indeks
--   `profiles_single_admin`).
-- - Hook jest niezmienny (USR-1), więc techniczny e-mail też: zmiana e-maila jest blokowana.
-- - Auth wydaje i odświeża sesję tylko kontu z aktywnym profilem (AUTH-5, AUTH-7): hook
--   `custom_access_token` odmawia kontu usuniętemu i kontu bez profilu. Wydany wcześniej token
--   dostępu (najwyżej `jwt_expiry`) nie daje danych, bo RLS wymaga aktywnego profilu ([004]).

-- ---------------------------------------------------------------------------------------------
-- Techniczny e-mail i hook (AUTH-1, USR-1)
-- ---------------------------------------------------------------------------------------------
-- Hook z technicznego e-maila albo NULL, gdy adres nie należy do domeny aplikacji.
-- Ta sama domena jest w `packages/accounts` (TECHNICAL_EMAIL_DOMAIN).
create function private.hook_from_email(email text)
returns text
language sql
immutable
parallel safe
set search_path = ''
return case
  when email ~ '^[^@]+@users\.bgclub\.invalid$' then split_part(email, '@', 1)
end;

comment on function private.hook_from_email(text) is
  'Hook z technicznego e-maila <hook>@users.bgclub.invalid (AUTH-1); NULL dla innej domeny.';

-- ---------------------------------------------------------------------------------------------
-- auth.users → profiles: konto i profil w jednej transakcji (AUTH-2, AUTH-3, MEM-3)
-- ---------------------------------------------------------------------------------------------
-- `app_metadata.bg_club` = { "first_name": "…", "last_name": "…", "role": "admin" | "player" }.
-- Hook profilu pochodzi z e-maila, więc login i profil nie mogą się rozjechać.
--
-- Wyzwalacz jest odroczony do końca transakcji: Auth wstawia wiersz `auth.users`, a
-- `app_metadata` dopisuje osobnym UPDATE w tej samej transakcji. Dlatego funkcja czyta bieżący
-- stan wiersza, a nie NEW z chwili wstawienia.
create function public.handle_auth_user_created()
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
  insert into public.profiles (id, hook, first_name, last_name, role)
  values (account.id, new_hook, btrim(meta ->> 'first_name'), btrim(meta ->> 'last_name'), new_role);

  return null;
end;
$$;

comment on function public.handle_auth_user_created() is
  'Tworzy profil z app_metadata.bg_club w transakcji tworzenia konta Auth; odrzuca konta spoza aplikacji.';

create constraint trigger on_auth_user_created
  after insert on auth.users
  deferrable initially deferred
  for each row execute function public.handle_auth_user_created();

-- Techniczny e-mail jest niezmienny (hook jest niezmienny, Q5). Blokujemy też zgłoszenie
-- zmiany (`email_change`): Auth wysłałby wtedy wiadomości na adresy `.invalid`.
create function public.auth_users_guard_email()
returns trigger
language plpgsql
set search_path = ''
as $$
begin
  -- Miękkie usunięcie konta w Auth (`auth.admin.deleteUser(id, true)`) zaciera e-mail i ustawia
  -- `deleted_at`; tej zmiany nie blokujemy. Profil oznacza jako usunięty Edge Function ([011]).
  if new.deleted_at is not null then
    return new;
  end if;
  if new.email is distinct from old.email
     or (coalesce(new.email_change, '') <> '' and new.email_change is distinct from old.email_change) then
    raise exception 'account email is derived from the immutable hook and cannot change'
      using errcode = '23514', constraint = 'auth_users_email_immutable';
  end if;
  return new;
end;
$$;

comment on function public.auth_users_guard_email() is
  'Blokuje zmianę technicznego e-maila konta (hook jest niezmienny, AUTH-1, USR-1).';

create trigger auth_users_guard_email before update of email, email_change on auth.users
  for each row execute function public.auth_users_guard_email();

-- ---------------------------------------------------------------------------------------------
-- Hook Auth `custom_access_token`: sesja tylko dla aktywnego profilu (AUTH-5, AUTH-7)
-- ---------------------------------------------------------------------------------------------
-- Auth wywołuje go przy każdym wydaniu tokenu: logowaniu hasłem i odświeżeniu sesji. Odmowa
-- logowania oznacza, że konto usunięte (MEM-4, USR-6) nie zaloguje się ponownie, a jego
-- zapamiętana sesja wygaśnie przy najbliższym odświeżeniu. Claims zostają bez zmian.
-- Lokalnie włącza go `supabase/config.toml`; w projekcie Supabase trzeba go włączyć w panelu
-- (README, sekcja „Wdrożenie”).
create function public.custom_access_token_hook(event jsonb)
returns jsonb
language plpgsql
stable
security definer
set search_path = ''
as $$
begin
  if not exists (
    select 1 from public.profiles p
     where p.id = private.try_uuid(event ->> 'user_id')
       and p.deleted_at is null
  ) then
    -- Komunikat jest kodem, który aplikacja mapuje na polski tekst (apps/web/src/auth).
    return jsonb_build_object(
      'error', jsonb_build_object('http_code', 403, 'message', 'account_inactive')
    );
  end if;
  return jsonb_build_object('claims', event -> 'claims');
end;
$$;

comment on function public.custom_access_token_hook(jsonb) is
  'Hook Auth: odmawia tokenu (logowanie, odświeżenie) kontu bez aktywnego profilu (AUTH-7).';

-- ---------------------------------------------------------------------------------------------
-- Prawa: funkcje nie są API. Hook wywołuje tylko rola usługi Auth (`supabase_auth_admin`);
-- jako SECURITY DEFINER czyta profile bez dodatkowych praw i polityk dla tej roli.
-- ---------------------------------------------------------------------------------------------
revoke execute on function
  private.hook_from_email(text),
  public.handle_auth_user_created(),
  public.auth_users_guard_email(),
  public.custom_access_token_hook(jsonb)
from public, anon, authenticated;

grant usage on schema public to supabase_auth_admin;
grant execute on function public.custom_access_token_hook(jsonb) to supabase_auth_admin;
