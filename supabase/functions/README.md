# supabase/functions

Edge Functions (Deno) z kluczem service role wyłącznie po stronie serwera (PRD §6.1): `create-member`, `delete-member`, `delete-own-account`, `bootstrap-admin`. Dochodzą w zadaniach [005], [009] i [011].

Lokalne sekrety funkcji trzymamy w `supabase/functions/.env` (ignorowany przez git). Wzór: `.env.example`.

Service role omija RLS, więc każda funkcja sama sprawdza, kto ją wywołuje (token użytkownika, rola admina w `profiles`). Awatar dodawany przy tworzeniu członka (MEM-3) zapisuje funkcja `create-member` w folderze `avatars/<profile_id>/`, bo admin nie ma prawa zapisu do cudzych folderów (USR-7).
