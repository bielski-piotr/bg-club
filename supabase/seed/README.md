# supabase/seed

Pliki `*.sql` z tego katalogu ładuje `supabase db reset` po migracjach (`[db.seed]` w `config.toml`), w kolejności nazw. Na razie ich nie ma: pusta instalacja nie zawiera żadnych danych (PRD CLUB-1).

Seed nie zawiera danych klubu ani haseł (NFR-9).

## Pierwszy administrator (AUTH-3)

Konto pierwszego administratora tworzy skrypt [`packages/accounts/src/bootstrap-admin.ts`](../../packages/accounts/src/bootstrap-admin.ts) z danych w zmiennych środowiskowych. Konto Auth potrzebuje API Auth (hasło, techniczny e-mail), więc nie da się go utworzyć plikiem SQL.

```bash
cp supabase/seed/.env.example supabase/seed/.env   # uzupełnij imię i nazwisko
pnpm bootstrap:admin:local                         # lokalny Supabase (pnpm db:start)
```

Dla projektu w chmurze: `pnpm bootstrap:admin` z `SUPABASE_URL` i `SUPABASE_SERVICE_ROLE_KEY` w zmiennych środowiskowych albo w `supabase/seed/.env` (README, sekcja „Wdrożenie”).

- Tworzy wyłącznie konto administratora, bez klubu i danych demonstracyjnych.
- Bez `BOOTSTRAP_ADMIN_PASSWORD` generuje losowe hasło (16 znaków, generator kryptograficzny) i wypisuje je jeden raz.
- Ponowne uruchomienie niczego nie zmienia (także hasła). Drugiego administratora odrzuca też baza.
- `supabase/seed/.env` jest poza repozytorium (`.gitignore`).
