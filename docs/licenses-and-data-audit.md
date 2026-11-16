# Kontrola danych i licencji dla #45

Zakres to bieżący śledzony zestaw plików BG Club i zmiany #45, nie historia Git ani zawartość
kont Supabase/Cloudflare. Szczegóły pochodzenia i pełne teksty licencji:
[THIRD-PARTY-NOTICES.md](../THIRD-PARTY-NOTICES.md).

## Kontrola danych

Nie zapisujemy eksportów, haseł, tokenów ani danych klubowych w repo lub w dowodach PR.
Env mają tylko placeholdery, a `.gitignore` odrzuca `.env*` poza `.env.example` oraz typowe backupy.
Eksporter dodatkowo wymaga katalogu poza checkoutem, także po rozwiązaniu symlinków/junctions.
Restore-drill tworzy osobne katalogi w prywatnym katalogu tymczasowym, hasła generuje w pamięci,
a log pokazuje wyłącznie nazwy kontroli, status i liczby. Backup z hashami haseł pozostaje poufny.

Powtarzalna kontrola z katalogu repo. Polecenia wyszukujące pokazują **wyłącznie ścieżki**, nie wartości:

```sh
git ls-files
git ls-files '*.env*' '*.dump' '*.backup' '*data.sql' '*manifest.json'
git grep -I -l -E 'BEGIN (RSA |EC |OPENSSH )?PRIVATE KEY|sb_secret_[A-Za-z0-9_-]{12,}|sbp_[A-Za-z0-9]{20,}|gh[pousr]_[A-Za-z0-9]{20,}|AKIA[A-Z0-9]{16}|eyJ[A-Za-z0-9_-]{25,}\.[A-Za-z0-9_-]{25,}\.[A-Za-z0-9_-]{20,}'
git ls-files '*.png' '*.jpg' '*.jpeg' '*.webp' '*.woff' '*.woff2' '*.json' '*.sql'
git diff --check
```

Brak dopasowań wzorców oznacza kod wyjścia 1 w `git grep`, nie awarię. Wyniki należy sprawdzić
prywatnie. Nazwy `SERVICE_ROLE`, przykładowe placeholdery i testy odmowy sekretnego klucza nie są
sekretami. Same wzorce nie wykrywają każdego hasła ani danych osobowych, dlatego potrzebny jest też
przegląd plików `.env.example`, seedów, testowych fixture, importów i binarnych assetów.

Wynik kontroli z 2026-11-16 po review zmian #45:

- Wyszukiwanie powyższych wzorców w śledzonych plikach nie zwróciło dopasowań.
- Śledzone env to wyłącznie cztery `.env.example` z pustymi polami/placeholderami i publicznym
  lokalnym URL. Nie ma śledzonych dumpów, backupów, `data.sql` ani manifestów backupu.
- Przejrzano seedy, przykłady env, fixture SQL/TS/JSON i pliki nowego narzędzia. Dane testów są
  jawnie fikcyjne. Cztery śledzone PNG to ikony PWA z `public/favicon.svg`, ich źródłem jest
  `apps/web/scripts/icons.mjs`. Nie znaleziono zdjęć, eksportów ani danych rzeczywistego klubu.
- Prywatny eksport i logi startu Supabase nie trafiły do śledzonych plików. Log próby zawiera
  wyniki kontroli, nie hasła/tokeny/rekordy. `git diff --check` nie zgłosił problemów.

Nie deklarujemy na tej podstawie, że historia Git lub przyszłe pliki dodane przez operatora
nigdy nie zawierały sekretów. Wzorce i przegląd mają opisany wyżej zakres.

## Kontrola praw

Sprawdzono drzewa konkretnych commitów obu POC przez GitHub API i rzeczywiste pliki LICENSE
sześciu paczek fontów oraz Three.js z instalacji `pnpm install --frozen-lockfile`.
Źródła fontów i Three.js mają licencje OFL/MIT i dołączono ich pełne teksty do statycznego buildu.
Źródła POC nie zawierają licencji. Ten sam właściciel i wskazanie importu w PRD nie dowodzą
wyłącznych praw ani zgody wszystkich autorów. Publiczna redystrybucja pozostaje do potwierdzenia
przez właściciela. Nie zmieniamy licencji repo i nie oznaczamy tego jako potwierdzone.
