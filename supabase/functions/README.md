# supabase/functions

Edge Functions (Deno) z kluczem service role wyłącznie po stronie serwera (PRD §6.1): `create-member`, `delete-member`, `delete-own-account`. Dochodzą w zadaniach [009] i [011]. Pierwszy administrator nie ma funkcji: tworzy go skrypt instalacyjny `pnpm bootstrap:admin` ([005], `supabase/seed/README.md`), więc pusta instancja nie wystawia publicznego endpointu, przez który ktoś mógłby ją przejąć.

Lokalne sekrety funkcji trzymamy w `supabase/functions/.env` (ignorowany przez git). Wzór: `.env.example`.

Service role omija RLS, więc każda funkcja sama sprawdza, kto ją wywołuje (token użytkownika, rola admina w `profiles`). Awatar dodawany przy tworzeniu członka (MEM-3) zapisuje funkcja `create-member` w folderze `avatars/<profile_id>/`, bo admin nie ma prawa zapisu do cudzych folderów (USR-7).

Konto tworzy się przez `auth.admin.createUser` z technicznym e-mailem i `app_metadata.bg_club` (`first_name`, `last_name`, `role`): profil zakłada wtedy wyzwalacz w bazie, w tej samej transakcji co konto Auth. Hook, techniczny e-mail i generator hasła są w pakiecie `packages/accounts` (moduł bez zależności, działa także w Deno).
