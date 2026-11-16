# Próba odtworzenia #45

## Zakres i izolacja

Próbę wykonano lokalnie 2026-11-16 na Windows PowerShell i Docker Desktop.
Stan istniejącego stosu `bg-club` przed pracą odczytano bez zmiany danych: 0 kont Auth,
0 profili, 0 partii, 0 obiektów Storage. Nie wykonano na nim resetu ani importu.

`pnpm test:restore`, czyli `node scripts/backup/drill.mjs`, tworzy dwa nowe projekty
`bg45-source-<losowy suffix>` i `bg45-target-<losowy suffix>` w prywatnym katalogu tymczasowym,
poza checkoutem. Źródło używa API/DB 55421/55422, cel 56421/56422. Sprawdzenie zajętych portów
poprzedza start kontenerów. Migracje są kopiami z repo. Uruchamiane są Postgres, Auth,
PostgREST, Storage i bramka; pozostałe usługi, w tym Edge Runtime, są wyłączone w tej próbie.
Test nie korzysta z produkcji, Cloudflare, atrap API ani danych prawdziwego klubu.

## Dane i wykonane operacje

Źródło otrzymało przez rzeczywiste API trzy fikcyjne konta Auth z profilami: admina,
gracza i później usuniętego gracza. Hasła losowano w pamięci i nie wypisywano.
Utworzono klub, grę, dwa szkice partii, zapisano jeden z nich, wyniki trzech graczy,
osiągnięcia i prywatny snapshot głosujących. Gra i notes zostały potem zmienione, aby
stare dane różniły się od bieżącej konfiguracji. Wersja historyczna ma punktację
10/6/4 i remis o pierwsze miejsce, a bieżąca gra 100/60/40 oraz inną regułę notesu.

Wgrano **sześć prawidłowych plików PNG jako bajty**: awatar, logo, okładkę, zdjęcie
szablonu, obraz zapisanej kartki i nieużywany obraz w dodatkowym piątym buckecie
`drill-extra`. Użyto podfolderów, nazwy ze spacją, MIME, cache i user metadata.
To małe fikcyjne obrazy testowe; nie są testem jakości renderowania notesu 3D.

Eksport i restore korzystają z tych samych narzędzi, które otrzymuje operator.
Po utworzeniu i sprawdzeniu backupu **rzeczywiście usunięto** ze źródła zapisaną partię
przez `delete_play` i jeden plik przez Storage API. Odtworzenie korzystało z lokalnego
zestawu backupu i nowego pustego celu. Nie pobierało brakujących danych ze źródła.

## Potwierdzone kontrole

Przebieg przed końcowym review zakończył się kodem 0 i 16 komunikatami PASS, w tym:

- Eksport wszystkich tabel aplikacji i kont Auth oraz wszystkich pięciu bucketów.
  Offline `verify` sprawdził SHA-256 plików bazy, migracji i rzeczywistych obrazów.
- Uszkodzony plik odrzucono przed zmianą celu. Zły cel, źródło jako cel, inny schemat,
  niepusta baza, niepusty Storage i ponowienie restore nie nadpisały danych.
- Kontrolowany błąd SQL, `SELECT 1/0` po właściwych COPY w zaufanym testowym backupie,
  wycofał całą transakcję kont i historii. W DB celu nadal było 0 kont, profili i partii.
  Sześć fizycznych plików pozostało poza transakcją SQL. Test potwierdził je i usunął
  wyłącznie z własnego jednorazowego celu przed właściwym odtworzeniem.
- Właściwy restore porównał liczbę wierszy i SHA-256 **pełnej uporządkowanej zawartości każdej eksportowanej tabeli**,
  wszystkie klucze obce i SHA-256 każdego ponownie pobranego pliku. Nie było rozbieżności.
- Admin i gracz zalogowali się starymi hasłami, z identycznymi UID jak przed eksportem.
  Usunięty użytkownik nie mógł się zalogować. Refresh sesji działał. Po deaktywacji
  samego profilu istniejące konto Auth odrzucił skonfigurowany hook tokenu.
- Zalogowany klient odczytał identyczną historię, ranking i gablotę osiągnięć.
  Stara wersja szablonu, snapshot punktów i wyniki remisu **8/8/4** zostały zachowane
  mimo późniejszej edycji gry/notesu. Zachowano też niezapisany szkic i snapshot głosujących.
- Aktywny gracz pobrał właściwe bajty każdego obrazu aplikacji. Anonimowy klient nie
  pobrał żadnego prywatnego obrazu. Dodatkowy bucket bez polityki dla gracza pozostał prywatny.
- Szkic po restore dał się zapisać ponownie, a utworzenie nowego konta Auth utworzyło profil.
  Wyzwalacze i uprawnienia działały po zakończeniu importu z `replica`.

Końcowy przebieg po review zakończył się **2026-11-16 o 08:57:54 UTC, kod 0, 18 PASS**.
Dodał odmowę zapisu backupu w checkoutcie oraz rzeczywistą różnicę domyślnych stref baz
`Europe/Warsaw`/UTC. Weryfikował także MIME, cache i user metadata odtworzonych plików oraz
odrzucenie pomylonych lokalnych portów API/DB. Wszystkie wcześniej opisane kontrole przeszły
ponownie. Odtworzono 15 tabel, 21 migracji schematu i 6 obrazów w 5 bucketach.

| Element końcowej próby   | Wersja / wynik                                                                            |
| ------------------------ | ----------------------------------------------------------------------------------------- |
| Node, pnpm, Supabase CLI | 26.12.1, 10.28.0, 3.1.0                                                                   |
| Postgres i klienty       | 17.11, obraz `public.ecr.aws/supabase/postgres:17.11.0.018`                               |
| Auth                     | `public.ecr.aws/supabase/gotrue:v2.197.0`                                                 |
| Storage                  | `public.ecr.aws/supabase/storage-api:v1.90.1`                                             |
| Auth / profile           | 3 konta, 3 identities, 3 profile, w tym jeden miękko usunięty                             |
| Historia                 | 2 partie, w tym 1 szkic; 6 wierszy wyników, 2 wersje notesu                               |
| Osiągnięcia i głosujący  | 9 odblokowań, 1 prywatny snapshot głosującego                                             |
| Stan `bg-club` po próbie | Nadal 0 kont, profili, partii i obiektów; stos działa, brak pozostałych kontenerów `bg45` |

Prywatny raport końcowy operatora znajduje się w katalogu tymczasowym
`bg-club-restore-45-VaA6ca/result.json`. Zawiera powyższe liczby i nazwy kontroli.
Backup z tego katalogu nie trafił do Git ani logu PR/czatu.

## Własny review i pozostała weryfikacja

Po implementacji wykonano osobny przegląd całego diffu, bez kolejnych agentów.
Poprawiono kanoniczne hashowanie danych w UTC, sortowanie `C` i końce linii psql,
porównanie metadanych obrazów oraz walidację ścieżek Storage i pary połączeń DB/API.
Fingerprint schematu obejmuje też wyzwalacze, polityki, RLS, prawa, widoki, indeksy i FK.
Po poprawkach ponowiono rzeczywisty drill, z wynikiem 18 PASS powyżej.

Wykonano `pnpm typecheck`, `pnpm lint` i `pnpm build`, wszystkie z kodem 0.
Build obejmował kontrolę budżetu JS/CSS. Wystąpiły dotychczasowe ostrzeżenia Vite o
przyszłym native config loader i dużych chunkach, bez błędu buildu. Dla końcowych zmian
skryptów i dokumentów ponowiono ESLint/Prettier. Siedem plików licencji porównano bajtowo
z paczkami lockfile i z `apps/web/dist/licenses`, bez różnic.
Nie zmieniano testów ani UI. `test:restore` dołączono do istniejącego zadania SQL CI;
wynik z Windows jest lokalnym dowodem, nie deklaracją przebiegu GitHub Actions/Linux.

## Powtórzenie i sprzątanie

```powershell
npx --yes pnpm@10.28.0 install --frozen-lockfile
npx --yes pnpm@10.28.0 test:restore
```

Skrypt wypisuje ścieżkę prywatnego katalogu i nazwy kontroli. `result.json` zawiera
wyłącznie wersje, liczby i wyniki, bez haseł, tokenów czy rekordów. Backup w tym samym
katalogu jest poufny i nie jest artefaktem do dołączenia do PR. Po sukcesie skrypt zatrzymuje
tylko dwa utworzone projekty i usuwa ich jednorazowe woluminy przez `stop --no-backup`.
Zachowuje prywatny backup i raport do inspekcji operatora.

Po błędzie projekty mogą pozostać. Odczytaj zapisany `project_id` z ich prywatnych
`supabase/config.toml`, sprawdź, że to dokładnie wygenerowane projekty próby i użyj
`pnpm exec supabase stop --workdir <KATALOG_KONKRETNEGO_PROJEKTU> --no-backup` osobno dla każdego.
Nie używaj `stop --all`, resetu istniejącego `bg-club` ani poleceń usuwających nieznane woluminy.

## Granice dowodu

To dowód lokalnego roundtripu z fikcyjnymi danymi i rzeczywistymi usługami. Nie wykonano
wdrożenia hostowanego Supabase ani Cloudflare Pages, odtworzenia produkcji, spotkania klubowego
i odbioru klubowego. Ten etap użytkownik wyłączył z kolejki i usunął issue #46.
Nie uruchamiano pełnego E2E UI, ponieważ nie zmieniono interfejsu.
Kroki przyszłej produkcji i formularz dowodów odbioru pozostają do uzupełnienia w
[rejestrze instalacji](deployment-record.example.md). Brakujące prawa POC pozostają jawnie
niepotwierdzone w [audycie](licenses-and-data-audit.md).
