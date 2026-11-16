# Backup i odtworzenie BG Club

Dotyczy aplikacji z tego repo, Postgres 17, kont email/password oraz standardowych bucketów Storage.
Narzędzia: Node 22.18+, Docker albo lokalne klienty `pg_dump` i `psql` 17+, dostęp operatora do bazy i klucz service role.
Nie wymagają pnpm ani Supabase CLI do samego backupu. CLI jest potrzebne do postawienia nowego stosu i migracji.
Wersje faktycznie użyte w próbie są w [raporcie](restore-drill.md).

## Co zawiera kompletny backup

| Plik / część           | Zawartość i przeznaczenie                                                                                                                                                                                                                                                                      |
| ---------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `data.sql`             | Dane wszystkich tabel `public` i `private`, w tym `private.meeting_voters`, oraz `auth.users` i `auth.identities`. Hash hasła, UID, metadane i stan miękkiego usunięcia konta zostają zachowane. Nie tworzy nowych kont przez API i nie zmienia ich identyfikatorów.                           |
| `migrations/*.sql`     | Kopia każdej migracji repo z SHA-256. Odtwarza schemat aplikacji, RPC, uprawnienia oraz własne wyzwalacze na `auth.users` i polityki na `storage.objects`. Historia w bazie źródłowej i celu musi odpowiadać tym plikom.                                                                       |
| `schema-reference.sql` | Schemat `public`/`private` do przeglądu i diagnostyki. Restore go nie wykonuje, ponieważ migracje zawierają też własne zmiany w zarządzanych schematach. Nie jest zamiennikiem migracji.                                                                                                       |
| `objects/<numer>.bin`  | Rzeczywiste bajty każdego obiektu znalezionego w `storage.objects`, także w dodatkowych bucketach, podfolderach i dla nieużywanych obrazów. Numer pliku lokalnego nie zależy od nazwy obiektu, co zapobiega zapisowi ścieżki obiektu poza katalogiem backupu.                                  |
| `manifest.json`        | Kompletna lista bucketów z ustawieniami, nazw obiektów, rozmiarów, MIME, cache i user metadata, checksumy plików, liczba i SHA-256 wierszy każdej tabeli, wersje migracji, fingerprint struktury i commit repo. Powstaje jako ostatni, tylko po udanym eksporcie i ponownym porównaniu źródła. |

Nie kopiujemy DDL ani wewnętrznych migracji usług `auth`, `storage`, `realtime`, `extensions`, ról systemowych,
kluczy JWT, haseł ról Postgres czy ustawień projektu. Tworzy je Supabase. Nie przywracamy metadanych
`storage.objects` przez SQL, bo nie odtworzyłoby to plików. Wgrywamy każdy plik przez Storage API, które
tworzy własne rekordy. Zachowujemy bucket/nazwę, ustawienia, MIME, cache i user metadata. Storage nadaje
nowe techniczne UUID obiektów, owner i czasy uploadu. Aplikacja odwołuje się do ścieżek, nie do tych UUID
i nie opiera swoich polityk na owner. UID kont/profili i wszystkie klucze obce danych aplikacji pozostają identyczne.

Sesje, refresh tokeny, jednorazowe logowania i logi audytowe Auth nie przechodzą do celu. Użytkownicy
logują się ponownie dotychczasowym hasłem. Narzędzie odmawia pracy, gdy wykryje dane innych trwałych
tabel Auth, tożsamości inne niż email, Vault lub buckety wektorowe. BG Club nie używa ich w MVP.
Jeśli je dodasz, najpierw rozszerz format, uwzględnij klucze szyfrowania i wykonaj nowy drill. Backup
nie obejmuje zmian infrastruktury lub tabel dodanych w innych schematach poza aplikacją z migracji repo.

## Prywatne środowisko operatora

Zapisz env w **prywatnym katalogu poza checkoutem**. Poniższy wzór nie zawiera poświadczeń.
Zastąp placeholdery wartościami danego projektu, bez nawiasów. Nie używaj transkrypcji terminala,
`--debug`, `supabase status` wypisywanego do publicznego logu ani parametrów z hasłem w linii poleceń.

```dotenv
# Supabase Settings / API Keys i Connect. Production i Preview mają osobne pliki.
SUPABASE_URL=https://<PROJECT_REF>.supabase.co
SUPABASE_SERVICE_ROLE_KEY=<PRYWATNY_SERVICE_ROLE>
PGHOST=<HOST_Z_CONNECT>
PGPORT=5432
PGDATABASE=postgres
PGUSER=<USER_Z_CONNECT>
PGPASSWORD=<HASLO_BAZY>
PGSSLMODE=require
PGCONNECT_TIMEOUT=15
# Dopiero po faktycznym zatrzymaniu wszystkich zapisów:
BG_BACKUP_QUIESCED=yes
# Tylko przy restore, dokładny origin osobnego celu, bez końcowego /:
BG_RESTORE_TARGET=https://<REF_CELU>.supabase.co
```

Domyślnie klienty działają w kontenerze
`public.ecr.aws/supabase/postgres:17.11.0.018`, użytym w lokalnej próbie. `BG_PG_IMAGE` pozwala wskazać
zatwierdzony obraz z klientami zgodnymi z serwerem. Narzędzie przekazuje zmienne PG przez środowisko,
bez wartości w argumentach procesów. Docker i administrator systemu nadal mają do nich dostęp.
Dla lokalnej bazy osiągalnej z Dockera ustaw `PGHOST=host.docker.internal`, port tej bazy i
`PGSSLMODE=disable`. W chmurze używaj szyfrowanego połączenia; `require` szyfruje, ale nie zapewnia
pełnej weryfikacji tożsamości serwera. Dla weryfikacji certyfikatu użyj zainstalowanych klientów,
`BG_PG_CLIENT=native`, `PGSSLMODE=verify-full` i `PGSSLROOTCERT` wskazującego certyfikat CA projektu.
Narzędzie wymaga `PGPASSWORD` w prywatnym env także dla native. Nie przekazuj URI z hasłem przez
`PGHOST`. Dla standardowego hostowanego API narzędzie porównuje project ref z hostem direct lub
nazwą użytkownika poolera. Lokalnie wymaga mapowania CLI, czyli port DB = port API + 1.
Kontroluje też inwentarz kont/bucketów przez DB i API. Nadal sprawdź samodzielnie oba adresy w env.

Narzędzie odmawia eksportu ścieżek Storage z pustymi segmentami, `.` lub `..`, które HTTP mogłoby
znormalizować do innej nazwy. Nie pomija ich i nie oznacza niepełnego eksportu jako poprawnego.
Wiersze porównuje w UTC i porządku `C`, z normalizacją końców linii klienta, niezależnie od domyślnej
strefy czasowej bazy. Nie zmienia to danych aplikacji.

W Unix ustaw prywatnemu katalogowi prawa 700, env i plikom 600. W Windows wybierz prywatny katalog
operatora na szyfrowanym woluminie, usuń odziedziczony dostęp innych użytkowników w Właściwości /
Zabezpieczenia i sprawdź ACL. `mode` Node nie ogranicza Windows ACL. Pliki w backupie zawierają dane
osobowe, hashe haseł i pola kont Auth; traktuj cały katalog jako sekret. Przechowuj zaszyfrowaną kopię
poza komputerem i poza dostawcą bazy, z dostępem tylko operatora. Zachowaj manifest z tym samym
zestawem plików. SHA-256 wykrywa uszkodzenie, **nie jest podpisem** chroniącym przed świadomą podmianą
całego katalogu. Odtwarzaj tylko własne zaufane backupy, bo `data.sql` jest wykonywalnym SQL.

## Punkt backupu przed zmianą

1. Zapisz czas UTC, commit frontendu, deployment ID Pages, commit funkcji, wersje usług,
   konfigurację Auth i listę migracji w prywatnym rejestrze. Do eksportu użyj checkoutu obecnie
   wdrożonej wersji, ze zgodnymi migracjami źródła. Nowe, jeszcze niezastosowane migracje z gałęzi
   aktualizacji spowodują odmowę eksportu; wykonaj backup ze starego checkoutu przed ich zastosowaniem.
   Nie rób backupu z checkoutu zawierającego niezatwierdzone migracje lub ręcznie zmieniony schemat.
2. Zapowiedz przerwę, doprowadź szkice do zapisu w bazie i zamknij aktywne aplikacje/PWA.
   Wstrzymaj wdrożenia, zadania i wszystkie inne zapisy, w tym bootstrap, operacje admina i Auth.
   Sama blokada strony nie blokuje istniejących sesji API; w organizacji zapewnij faktyczne
   zatrzymanie klientów i ogranicz dostęp na czas prac. Nie używaj tej procedury do backupu online.
3. Dopiero wtedy ustaw `BG_BACKUP_QUIESCED=yes` w env. To oświadczenie operatora, nie blokada bazy.
   Eksporter porównuje dane i inwentarz przed i po, ale nie zapewnia atomowej migawki między
   Postgres i Storage przy równoległych zapisach. Rotacja plików i hasła w trakcie są niedopuszczalne.
4. Wybierz **nowy, nieistniejący podkatalog** prywatnego katalogu, poza checkoutem. Utwórz rodzica,
   ale ostatni katalog tworzy eksporter. Uruchom z katalogu repo:

   ```sh
   node --env-file=<ENV_ZRODLA> scripts/backup/backup.mjs export --dir <NOWY_KATALOG_BACKUPU>
   node scripts/backup/backup.mjs verify --dir <KATALOG_BACKUPU>
   ```

   Oba polecenia muszą zakończyć się kodem 0. `export` i `verify` pokazują tylko status oraz liczby
   tabel i obiektów. Błędy klienta Postgres nie są przekazywane do logu, bo mogą zawierać dane COPY.
   Niekompletny katalog nie ma poprawnego końcowego manifestu i nie nadaje się do odtworzenia.
   Po błędzie diagnozuj prywatnie, a kolejny eksport kieruj do nowego katalogu.

5. Zaszyfruj i skopiuj zestaw do magazynu backupów, sprawdź sumy po odczycie kopii i wykonaj
   odtworzenie według następnej sekcji. Zapisz wynik oraz lokalizację backupu, nie dane, w rejestrze.
   Zachowaj co najmniej punkt sprzed ostatniej zmiany, ostatni sprawdzony backup i kopię poza maszyną.
   Przed każdym spotkaniem/po zakończeniu oraz przed zmianą danych wykonaj kolejny backup; retencję
   i odpowiedzialnego operatora ustal w prywatnym rejestrze. Usuń przeterminowane kopie z magazynu
   zgodnie z tą retencją, bez usuwania ostatniej kopii z potwierdzonym restore.

## Odtworzenie do oddzielnego, pustego projektu

1. Zachowaj stary projekt. Przy incydencie najpierw zrób osobny eksport jego bieżącego stanu,
   jeżeli jest dostępny, aby nie utracić zapisów nowszych od wybranego punktu. Wybrany stary backup
   przywraca stan z tamtej chwili. Nowsze wyniki, członkowie i obrazy nie pojawią się automatycznie.
2. Utwórz **osobny pusty projekt** ze zgodnymi wersjami usług. Użyj właściwego commitu repo z
   manifestu i dokładnie migracji z backupu. Nie wykonuj bootstrapu, importu demo ani nowych migracji.
   `db push --remote` na nowy projekt odtwarza aplikację i historię migracji. Włącz Auth hook, ustaw
   zabezpieczenia Auth i wdróż pasujące Edge Functions według README. Cel pozostaje niedostępny dla
   użytkowników. Nowy projekt ma własne klucze usług i JWT, nie kopiuj ról i haseł dostawcy.
3. Przygotuj env **celu**, ze zgodną parą połączenia DB i API. Ustaw `BG_RESTORE_TARGET` na dokładny
   API origin celu. Narzędzie odrzuca cel równy źródłu, inną historię/schemat/Auth layout oraz dane
   w tabelach lub Storage. Pozwala na puste buckety założone przez migracje, jeżeli ustawienia się
   zgadzają. Dodane buckety odtwarza z manifestu. Ich niestandardowe polityki muszą być w migracjach.
4. Uruchom najpierw `verify`, następnie `restore`:

   ```sh
   node scripts/backup/backup.mjs verify --dir <KATALOG_BACKUPU>
   node --env-file=<ENV_CELU> scripts/backup/backup.mjs restore --dir <KATALOG_BACKUPU>
   ```

   Kolejność ma znaczenie. Migracje zakładają usługowe tabele i prawa. Potem Storage API wgrywa
   rzeczywiste pliki pod oryginalne ścieżki. Każdy jest pobierany ponownie i porównywany SHA-256.
   Na końcu `psql -1` w jednej transakcji importuje konta i dane aplikacji. W tej transakcji
   `session_replication_role=replica` wyłącza wyzwalacze, w tym tworzenie profilu i przeliczanie
   wyników, oraz obsługę FK. Bez tego stare profile powstałyby drugi raz, snapshoty mogłyby się
   zmienić, a cykliczny FK `scorepads`/`scorepad_versions` nie pozwoliłby na COPY. Przy końcu
   przywracane jest `origin`, a zamknięcie połączenia dodatkowo usuwa ustawienie sesyjne.
   Nie wyłączamy trwale żadnego triggera ani RLS i nie zmieniamy właścicieli zarządzanych tabel.

5. Restore porównuje wszystkie odtworzone wiersze i ich liczby z manifestem, jawnie sprawdza
   **każdy FK** w `public`/`private`/`auth`, pary aktywny profil/Auth i istnienie ścieżek obrazów.
   Samo `VALIDATE CONSTRAINT` nie skontrolowałoby ponownie już ważnych FK po ich pominięciu podczas
   importu. Osiągnięcia i wyniki są przenoszone wprost; nie uruchamiaj na ślepo przeliczenia.
6. Błąd SQL wycofuje wszystkie konta/dane z tej transakcji. Storage nie jest częścią transakcji SQL,
   więc pliki lub nowy bucket mogą już istnieć. Po jakimkolwiek błędzie nie otwieraj celu dla
   użytkowników. Zdiagnozuj problem i utwórz nowy pusty cel albo usuń **wyłącznie rozpoznany,
   jednorazowy projekt próby**. Narzędzie nie usuwa niczego, nie nadpisuje istniejących plików i nie
   próbuje wznowić częściowego restore. Nie naprawiaj tego resetem nieznanej bazy.

## Warunki sukcesu i przełączenie

- `verify` oraz `restore` zakończyły się kodem 0. Liczby i SHA-256 wszystkich wierszy oraz wszystkich
  plików zgadzają się. Wszystkie FK są spójne, także prywatne snapshoty głosujących i stare wersje notesów.
- Admin i gracz logują się **starym hasłem**, `auth.users.id = profiles.id` jest zachowane, refresh
  działa. Konto usunięte nie loguje się. Tworzenie nowego konta przez aplikację tworzy profil.
- Zalogowany gracz widzi stare zapisane karteczki i szkice, wyniki, remisy, ranking i odblokowania.
  Punkty i stara wersja szablonu zostają mimo późniejszej zmiany gry. Pobiera obrazy przez własną
  sesję/podpisany URL, anonimowy klient nie ma dostępu. Szkic można zapisać ponownie.
- Operator zapisuje osobę, datę, wybrany punkt backupu, wynik i dowody bez danych w rejestrze.

Dopiero po tych kontrolach ustaw nowe URL/publiczny klucz w Pages i wykonaj nowy build.
Sprawdź Auth Site URL, frontend, Edge Functions i PWA. Zamknięte wcześniej sesje wymagają nowego
logowania. Stare karty mogą nadal wskazywać poprzedni projekt, dlatego zachowaj przerwę do ich
zamknięcia/bezpiecznej aktualizacji i nie dopuszczaj równoległych zapisów do obu projektów.
Stary projekt i backup zachowaj przez ustalony czas, do osobnego potwierdzenia odbioru.

## Źródła i granice

Oficjalny [opis backupów Supabase](https://supabase.com/docs/guides/platform/backups) wyjaśnia, że
backup bazy nie zawiera bajtów Storage. Procedura usług i wyłączania triggerów pochodzi z
[backup/restore CLI](https://supabase.com/docs/guides/platform/migrating-within-supabase/backup-restore).
Tutaj schemat aplikacji pochodzi z własnych migracji, a pliki odtwarza API; nie importujemy pełnego
DDL platformy. [Klonowanie projektu](https://supabase.com/docs/guides/platform/clone-project) także
wymaga osobnej obsługi Storage, funkcji i ustawień Auth. Narzędzia oraz lokalny drill nie są dowodem
wykonania wdrożenia, backupu ani odtworzenia przyszłej produkcji.
