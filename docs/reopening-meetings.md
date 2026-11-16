# Ponowne otwieranie spotkań

RUN-5 i Q10 pozwalają administratorowi dograć zapomnianą partię w zakończonym spotkaniu.
W szczegółach spotkania wybiera on z menu „Otwórz spotkanie ponownie”, a potem potwierdza
„Otwórz ponownie”. „Anuluj” zamyka dialog bez zmiany danych. Prowadzący i gracz nie mają
tej akcji, także pod adresem `?p=meeting/<uuid>/reopen`.

RPC `reopen_meeting(meeting_id)` sprawdza aktywnego administratora, blokuje wiersz spotkania
i wymaga statusu `finished`. Ustawia `in_progress` oraz `finished_at = null`. Unikalny indeks
`meetings_single_in_progress` blokuje otwarcie, gdy inne spotkanie trwa, także przy
równoległym otwieraniu dwóch spotkań lub otwieraniu i rozpoczynaniu innego. Wtedy aplikacja
pokazuje „Trwa już inne spotkanie. Najpierw je zakończ.”.

Identyfikator, termin, pierwotne `started_at`, prowadzący, uczestnicy, głosy i opublikowane gry
pozostają. Głosowanie pozostaje zamknięte. Operacja zachowuje zapisane partie, wyniki,
snapshot punktacji, wersję notesu, dane kartki i obrazy w Storage. Nie tworzy kopii spotkania.
Nowe partie zapisują administrator i aktualny prowadzący, według dotychczasowych reguł.
Nie można edytować wyników zapisanych partii ani zmieniać historycznego tytułu i terminu.

Po dograniu administrator lub prowadzący ponownie kończy spotkanie. Szkice nadal blokują
zakończenie. Podsumowania, rankingi i serie liczą się z zapisanych partii przy odczycie.
Dogranie starszego spotkania może zmienić późniejsze serie i daty odblokowania osiągnięć.
Wyzwalacz `meetings_after_change` przelicza osiągnięcia przy otwarciu i zakończeniu,
a zapis nowej partii uruchamia istniejący wyzwalacz zapisu. `flawless` wymaga zakończonego
spotkania, więc podczas dogrywania może zniknąć. Ponowne zakończenie odtworzy je tylko,
jeśli warunek nadal jest spełniony. Klucz `(profile_id, achievement_id)` oraz przeliczenie
różnicy z historią zapobiegają duplikatom. Aplikacja odświeża spotkania i dane profili
po otwarciu i zakończeniu, także gdy serwer odrzuci próbę ze starego widoku.

## Weryfikacja

- `250_reopen_meeting.test.sql` sprawdza role, statusy, blokadę innego spotkania, zachowanie
  pełnej historii i obrazu karteczki, dopisanie partii przez prowadzącego, przeliczenie
  podsumowania i późniejszej serii oraz odblokowania po kolejnych cyklach.
- `packages/accounts/integration/auth.test.ts` wysyła rzeczywiste równoległe żądania API
  z dwóch sesji admina. Kolejne testy zapisują partię w ponownie otwartym spotkaniu.
- `meeting-run.spec.ts` sprawdza menu, potwierdzenie, anulowanie, dwa cykle, historię wyników,
  role i deep linki, brak spotkania, zmieniony status, konflikt oraz dostępność dialogu.
  `new-play.spec.ts` sprawdza istniejącą ścieżkę rozpoczynania partii. Oba pliki działają
  w czterech projektach Playwright: 360 px i desktop, motyw jasny i ciemny.

Testy SQL/API wymagają własnego lokalnego Supabase z fikcyjnymi danymi. Konfigurację
z unikalnym `project_id` i wolnymi portami należy umieścić poza repozytorium. Skopiować
do niej migracje, testy, funkcje i pliki `packages/accounts/src` wymagane przez funkcje.
Nie kierować resetu ani migracji do stosu innej sesji.

```powershell
$env:BG_CLUB_TEST_WORKDIR = '<katalog własnego stosu>'
pnpm exec supabase start --workdir $env:BG_CLUB_TEST_WORKDIR
pnpm exec supabase test db --workdir $env:BG_CLUB_TEST_WORKDIR
# Integracja wymaga pustej własnej bazy, uruchamiać po testach SQL.
pnpm exec supabase db reset --local --workdir $env:BG_CLUB_TEST_WORKDIR
pnpm test:auth
```

Do E2E użyć osobnego portu i lokalnego override Playwright z `reuseExistingServer: false`.
Nie dodawać konfiguracji, kluczy ani jednorazowych override do Git. Po testach zatrzymać
wyłącznie własny stos przez `supabase stop --workdir <katalog własnego stosu>`.
Nie są potrzebne dane produkcyjne ani odbiór klubowy.
