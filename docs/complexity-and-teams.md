# Skomplikowanie gry, punkty ułamkowe i zespoły

## Skomplikowanie i punktacja miejsc (GAME-5)

Gra ma wymagane pole **Skomplikowanie** (`games.complexity`, 1,00–5,00). Wpisanie go,
a potem każda zmiana skomplikowania albo max. liczby graczy, przelicza w formularzu punkty za
miejsca 1…max ze wzoru (`complexityPoints` w `@bg-club/scoring`):

```
points = round( M(w) × Z × [0.1 + 0.9 × (n − p) / (n − 1)] × (1 + bonus × (n − 2)), 1 )
M(w)   = 1 + k × (w − 1) / 4
```

Z = 20, k = 2, bonus = 0,03, w = skomplikowanie, n = max. liczba graczy, p = miejsce
(1 = zwycięzca). Dla gry z jednym miejscem (n = 1) ułamek miejsca wynosi 1. Przykład: gra 2–4
o skomplikowaniu 2,5 dostaje 37,1 / 26 / 14,8 / 3,7.

Punkty można poprawić ręcznie (formularz pokazuje wtedy „Przelicz ze wzoru”). Baza sprawdza
tylko poprawność punktacji: liczby ≥ 0 z najwyżej dwoma miejscami po przecinku
(`is_valid_points(numeric[], int)`). Skomplikowanie jest wymagane przy dodaniu gry przez
aplikację (wyzwalacz `games_require_complexity`), a gra, która je ma, nie może go stracić.
Gry sprzed migracji `20261117000000_complexity_fractional_points_teams.sql` mają NULL
i formularz prosi o uzupełnienie przy najbliższej edycji. Rozegrane partie zachowują swój
snapshot punktacji (GAME-9): migracja nie przelicza historii.

## Punkty w mniejszych partiach (§5.6.2)

Punktacja ma pozycję dla każdego miejsca 1…max. W partii z n stronami (graczami albo zespołami)
liczą się **ostatnie** n pozycje: zwycięzca dostaje punkty za miejsce max − n + 1, ostatni za
miejsce max. Gra 2–6 w partii 4 graczy: miejsca 3…6. Remis to średnia punktów zajętych miejsc
zaokrąglona w dół do setnych (wcześniej do całości). Liczą tak `placementPoints`
(TypeScript) i `public.play_points(int[], numeric[])` (baza) na wspólnych przypadkach
`packages/scoring/src/cases/play-cases.json`.

Punkty wyników (`play_results.points`), snapshoty (`plays.points_snapshot`) i rankingi
(`leaderboard`, `game_stats`, `meeting_summary`, `player_stats`, `player_achievements`) są
`numeric`; aplikacja pokazuje ułamki z przecinkiem (`formatNumber`).

## Zespoły (PAD-17)

W kroku „Kategorie” kreatora notesu kategoria „Nazwa gracza” ma pole **Zespoły: kilku graczy
w jednym polu** (`team: true` w `template.lines`). Baza wylicza z szablonu
`scorepad_versions.teams`.

- Kreator nowej partii pozwala wtedy dodać kilku graczy do jednego miejsca notesu (lista
  zostaje otwarta i działa jak przełącznik). Partia potrzebuje co najmniej dwóch zajętych
  miejsc i max(2, min gry)…max gry graczy; notes może mieć mniej miejsc niż graczy.
- `start_play(play_id, meeting_id, scorepad_id, player_ids, seat_numbers)`: bez
  `seat_numbers` jak dotąd; z nim płaska lista graczy i ich miejsc. Kilku graczy na jednym
  miejscu w notesie bez zespołów to błąd `plays_teams_unavailable` (a przy zapisie wprost do
  `play_results` wyzwalacz zgłasza `play_results_seat_key`).
- Kartka pokazuje członków zespołu jako „Anna K. + Jan N.”. `save_play` przyjmuje osobny wynik
  dla każdego członka z tym samym miejscem i wpisami; miejsca i punkty liczy po stronach,
  `tied` oznacza wspólne miejsce różnych stron, więc wygrana zespołu nie daje „Ex aequo”.
- Każdy członek zespołu dostaje pełne punkty i wygraną, a wszystkie statystyki liczą go jak
  gracza tej partii.

## Testy

- `packages/scoring`: `index.test.ts` (wzór, przesunięcie, ułamki), `save.test.ts` (zespół),
  wspólne przypadki z generowanymi testami pgTAP `110_scoring`, `171_save_play_cases`
  i `231_achievement_cases`.
- `supabase/tests/database/280_complexity_teams.test.sql`: zespoły, skomplikowanie, sumy
  ułamkowe w rankingach i podsumowaniu.
- `apps/web`: `form.test.ts`, `newPlay.test.ts`, `playSave.test.ts`, `Collection.test.tsx`
  oraz e2e `games.spec.ts` i `play-save.spec.ts`.
