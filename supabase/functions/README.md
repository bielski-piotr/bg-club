# supabase/functions

Edge Functions (Deno) z kluczem service role wyłącznie po stronie serwera (PRD §6.1): `create-member` ([009]), `delete-member` i `delete-own-account` ([011]). Wspólny kod jest w `_shared`. Pierwszy administrator nie ma funkcji: tworzy go skrypt instalacyjny `pnpm bootstrap:admin` ([005], `supabase/seed/README.md`), więc pusta instancja nie wystawia publicznego endpointu, przez który ktoś mógłby ją przejąć.

Lokalne sekrety funkcji trzymamy w `supabase/functions/.env` (ignorowany przez git). Wzór: `.env.example`.

Service role omija RLS, więc każda funkcja sama sprawdza, kto ją wywołuje (token użytkownika, rola admina w `profiles`). Token weryfikuje sama funkcja (`auth.getUser`), dlatego `config.toml` ma `verify_jwt = false`: sprawdzanie JWT w bramce nie obsługuje asymetrycznych kluczy JWT nowych projektów.

Każda funkcja ma `index.ts` (Deno, supabase-js, `Deno.serve`) i `handler.ts` z logiką żądania bez zależności od Deno, testowaną przez `deno test` (`handler.test.ts`). Lint, typy i testy: README, sekcja „Edge Functions”.

## create-member

`POST /functions/v1/create-member` z tokenem sesji administratora i treścią `{ "firstName": "…", "lastName": "…" }`. Odpowiedź 201: `{ member, password }` (profil jak wiersz `profiles` i jednorazowe hasło, `Cache-Control: no-store`). Błędy: `{ "error": kod }`, gdzie kod to `unauthorized` (401), `forbidden` (403, np. gracz), `invalid_body` / `invalid_input` z `problems` (400) albo `failed` (500). Hasła i treści żądania funkcja nie loguje.

Awatar dodawany przy tworzeniu członka (MEM-3) dojdzie w [010] razem z uploadem awatara (USR-3): funkcja zapisze go w folderze `avatars/<profile_id>/`, bo admin nie ma prawa zapisu do cudzych folderów (USR-7).

Konto tworzy się przez `auth.admin.createUser` z technicznym e-mailem i `app_metadata.bg_club` (`first_name`, `last_name`, `role`): profil zakłada wtedy wyzwalacz w bazie, w tej samej transakcji co konto Auth. Hook, techniczny e-mail i generator hasła są w pakiecie `packages/accounts` (moduł bez zależności, działa także w Deno).

## Wspólne moduły (`_shared`)

`http.ts` (CORS, odpowiedź JSON z `no-store`, token z nagłówka, treść JSON o ograniczonym rozmiarze), `accountDeletion.ts` (kroki usuwania konta, bez zależności), `supabase.ts` (klienty service role i anon oraz dostęp do profili i Auth dla funkcji usuwających; tylko dla `index.ts`) i `testStore.ts` (atrapa do `deno test`).

## delete-member

`POST /functions/v1/delete-member` z tokenem sesji administratora i treścią `{ "memberId": "<uuid>" }` (PRD MEM-4, MEM-6). Odpowiedź 200: `{ "memberId": "<uuid>" }`, także przy ponowieniu dla usuniętego już członka. Błędy: `unauthorized` (401, także token usuniętego konta), `forbidden` (403, gracz), `invalid_body` (400), `not_found` (404), `admin_protected` (409: administratora nie da się usunąć) albo `failed` (500).

## delete-own-account

`POST /functions/v1/delete-own-account` z tokenem sesji gracza i treścią `{ "password": "…" }` (PRD USR-6). Hasło funkcja sprawdza logowaniem technicznym e-mailem konta (klucz anon, sesja nie jest zapamiętywana) i go nie loguje. Odpowiedź 200: `{ "deleted": true }`. Błędy: `unauthorized` (401), `admin_protected` (403: administrator nie usuwa swojego konta), `invalid_body` (400, brak hasła), `wrong_password` (400), `rate_limited` (429, limit prób logowania Auth) albo `failed` (500).

Obie funkcje usuwają konto tak samo (`_shared/accountDeletion.ts`): najpierw miękko profil (`deleted_at`; RLS i hook tokenu odcinają konto, a wyzwalacz w bazie stosuje skutki MEM-6: wyjście z zaplanowanych spotkań z głosami, zwrot prowadzenia niezakończonych spotkań adminowi), potem miękko konto Auth (`auth.admin.deleteUser(id, true)`: zatarty e-mail, usunięte sesje). Profil i wiersz `auth.users` zostają w historii.
