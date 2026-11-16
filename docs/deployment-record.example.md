# Rejestr instalacji i odbioru do uzupełnienia

Status na #45: **produkcji nie wdrożono, spotkania klubowego nie przeprowadzono, #46 nie odebrano**.
Ten plik jest szablonem. Zrób prywatną kopię poza repo i uzupełnij pola, gdy będą dostępne.
Nie wklejaj sekretów, danych członków ani zrzutów ekranu z kluczami do issue/PR.

| Pole                              | Wartość Production              | Wartość Preview                              | Skąd wziąć                                                       | Gdzie wpisać                                                                                                                      |
| --------------------------------- | ------------------------------- | -------------------------------------------- | ---------------------------------------------------------------- | --------------------------------------------------------------------------------------------------------------------------------- |
| Supabase nazwa projektu           | DO UZUPEŁNIENIA                 | DO UZUPEŁNIENIA                              | Nazwa nadana podczas Create project                              | Ten prywatny rejestr i opis środowiska w panelu                                                                                   |
| Supabase project ref              | DO UZUPEŁNIENIA                 | DO UZUPEŁNIENIA                              | Project Settings / General, także adres panelu projektu          | `supabase link --project-ref`, prywatny rejestr                                                                                   |
| Supabase API URL                  | DO UZUPEŁNIENIA                 | DO UZUPEŁNIENIA                              | Connect / API projektu                                           | Cloudflare `VITE_SUPABASE_URL`; prywatny env operatora `SUPABASE_URL`                                                             |
| Publiczny anon/publishable        | DO UZUPEŁNIENIA                 | DO UZUPEŁNIENIA                              | Project Settings / API Keys, klucz publiczny danego projektu     | Odpowiednio Cloudflare Pages Production/Preview `VITE_SUPABASE_ANON_KEY`; lokalnie `apps/web/.env.local` dla wybranego środowiska |
| Cloudflare account, Account ID    | DO UZUPEŁNIENIA                 | ten sam account lub DO UZUPEŁNIENIA          | Panel Cloudflare / Workers & Pages, Account ID                   | Prywatny rejestr, wybór konta przy tworzeniu Pages                                                                                |
| Cloudflare Pages project          | DO UZUPEŁNIENIA                 | ten sam projekt, środowisko Preview          | Nazwa projektu Pages                                             | Prywatny rejestr, ustawienia buildu/gałęzi                                                                                        |
| Publiczny URL frontendu           | DO UZUPEŁNIENIA                 | DO UZUPEŁNIENIA, alias i URL próbnego buildu | Wynik wdrożenia Pages lub ustawiona domena                       | Supabase Auth Site URL i redirect allowlist odpowiedniego projektu                                                                |
| Gałąź i commit                    | `master`, SHA DO UZUPEŁNIENIA   | gałąź PR, SHA DO UZUPEŁNIENIA                | Git i szczegóły deploymentu                                      | Pages branch controls i dowód wdrożenia                                                                                           |
| Deployment ID                     | DO UZUPEŁNIENIA                 | DO UZUPEŁNIENIA                              | Szczegóły udanego deploymentu Pages                              | Prywatny rejestr, punkt rollbacku                                                                                                 |
| Wersje DB/Auth/Storage i migracje | DO UZUPEŁNIENIA                 | DO UZUPEŁNIENIA                              | Supabase, CLI migration list, manifest backupu                   | Rejestr i dowód zgodności restore                                                                                                 |
| Auth hook i ustawienia            | NIE POTWIERDZONO                | NIE POTWIERDZONO                             | Authentication po migracjach, próba login/refresh i zmiany hasła | Konfiguracja każdego projektu i dowód sprawdzenia                                                                                 |
| Bootstrap administratora          | osoba/data/hook DO UZUPEŁNIENIA | fikcyjny admin, osoba/data DO UZUPEŁNIENIA   | Wynik `pnpm bootstrap:admin`                                     | Prywatny rejestr; hasło wyłącznie menedżer haseł                                                                                  |
| Backup przed wdrożeniem           | ID/czas DO UZUPEŁNIENIA         | ID/czas DO UZUPEŁNIENIA                      | Kompletny eksport i `verify`, raport restore                     | Szyfrowany magazyn, odnośnik bez danych w rejestrze                                                                               |

## Prywatne poświadczenia

| Rodzaj                                          | Skąd                                                      | Bezpieczne miejsce docelowe, nigdy treść w rejestrze                                                                                |
| ----------------------------------------------- | --------------------------------------------------------- | ----------------------------------------------------------------------------------------------------------------------------------- |
| Hasło DB i parametry PG                         | Supabase Connect, hasło ustawione przy tworzeniu projektu | Menedżer haseł / bezpieczny system env operatora; `PGHOST`, `PGPORT`, `PGDATABASE`, `PGUSER`, `PGPASSWORD`, `PGSSLMODE` dla backupu |
| Klucz service role                              | Supabase API Keys danego projektu                         | Prywatny `SUPABASE_SERVICE_ROLE_KEY` operatora / bootstrapu; brak w Pages i `VITE_*`                                                |
| Token CLI Supabase                              | Supabase Account / Access tokens lub `supabase login`     | Magazyn CLI / secret store operatora, ewentualnie `SUPABASE_ACCESS_TOKEN`                                                           |
| Połączenie Cloudflare/GitHub i ewentualny token | Połączenie Git projektu Pages, konto Cloudflare           | Panel dostawcy / secret store, nie jest potrzebne w frontendzie                                                                     |
| Hasło administratora i przekazanie              | Bootstrap, późniejsza zmiana w UI                         | Menedżer haseł, prywatny kanał do administratora; zapisz tylko fakt przekazania                                                     |
| Backup z hashami haseł i obrazami               | `backup:export`                                           | Szyfrowany magazyn poza repo, ograniczony dostęp i retencja                                                                         |

## Przyszły odbiór #46

To miejsce na wynik przyszłego wdrożenia i spotkania. Uzupełnienie nie zmienia zależności issue.

| Pole                                                           | Wartość                                                      |
| -------------------------------------------------------------- | ------------------------------------------------------------ |
| Osoba wdrażająca / data UTC                                    | DO UZUPEŁNIENIA                                              |
| Osoba odbierająca / data UTC                                   | DO UZUPEŁNIENIA                                              |
| Adres produkcji i SHA/deployment ID                            | DO UZUPEŁNIENIA                                              |
| Login admina i gracza, blokada anonimowego dostępu             | NIE WYKONANO, później data i odnośnik do dowodu bez sekretów |
| Spotkanie, zapis partii, karteczki, wynik/ranking/odblokowania | NIE WYKONANO, później osoba/data i prywatne dowody           |
| PWA na urządzeniu i aktualizacja z zapisanym szkicem           | NIE WYKONANO                                                 |
| Produkcyjny backup i odtworzenie w izolowanym środowisku       | NIE WYKONANO                                                 |
| Decyzja odbioru #46 / ograniczenia                             | NIE ODEBRANO                                                 |
