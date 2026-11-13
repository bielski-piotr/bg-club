# supabase/functions

Edge Functions (Deno) z kluczem service role wyłącznie po stronie serwera (PRD §6.1): `create-member` ([009]), `delete-member` i `delete-own-account` ([011]). Pierwszy administrator nie ma funkcji: tworzy go skrypt instalacyjny `pnpm bootstrap:admin` ([005], `supabase/seed/README.md`), więc pusta instancja nie wystawia publicznego endpointu, przez który ktoś mógłby ją przejąć.

Lokalne sekrety funkcji trzymamy w `supabase/functions/.env` (ignorowany przez git). Wzór: `.env.example`.

Service role omija RLS, więc każda funkcja sama sprawdza, kto ją wywołuje (token użytkownika, rola admina w `profiles`). Bramka dodatkowo wymaga ważnego tokenu (`verify_jwt = true` w `config.toml`).

Każda funkcja ma `index.ts` (Deno, supabase-js, `Deno.serve`) i `handler.ts` z logiką żądania bez zależności od Deno, testowaną przez `deno test` (`handler.test.ts`). Lint, typy i testy: README, sekcja „Edge Functions”.

## create-member

`POST /functions/v1/create-member` z tokenem sesji administratora i treścią `{ "firstName": "…", "lastName": "…" }`. Odpowiedź 201: `{ member, password }` (profil jak wiersz `profiles` i jednorazowe hasło, `Cache-Control: no-store`). Błędy: `{ "error": kod }`, gdzie kod to `unauthorized` (401), `forbidden` (403, np. gracz), `invalid_body` / `invalid_input` z `problems` (400) albo `failed` (500). Hasła i treści żądania funkcja nie loguje.

Awatar dodawany przy tworzeniu członka (MEM-3) dojdzie w [010] razem z uploadem awatara (USR-3): funkcja zapisze go w folderze `avatars/<profile_id>/`, bo admin nie ma prawa zapisu do cudzych folderów (USR-7).

Konto tworzy się przez `auth.admin.createUser` z technicznym e-mailem i `app_metadata.bg_club` (`first_name`, `last_name`, `role`): profil zakłada wtedy wyzwalacz w bazie, w tej samej transakcji co konto Auth. Hook, techniczny e-mail i generator hasła są w pakiecie `packages/accounts` (moduł bez zależności, działa także w Deno).
