-- Punkty leaderboardu za miejsca: public.play_points.
-- PLIK GENEROWANY z packages/scoring/src/cases/play-cases.json — nie edytować ręcznie.
-- Po zmianie przypadków: pnpm --filter @bg-club/scoring gen:sql.
-- Te same przypadki przechodzi implementacja TypeScript (packages/scoring).
begin;

create extension if not exists pgtap with schema extensions;

select plan(24);

-- Funkcja jest pomocnicza dla RPC zapisu partii: klient jej nie wywołuje.
select ok(not has_function_privilege('anon', 'public.play_points(int[], numeric[])', 'execute'),
  'anon nie wykona play_points');
select ok(not has_function_privilege('authenticated', 'public.play_points(int[], numeric[])', 'execute'),
  'authenticated nie wykona play_points');
select is(public.play_points('{}'::int[], array[3, 1]::numeric[]), '{}'::numeric[], 'brak graczy: brak punktów');

-- Przypadki poprawne: miejsca i punkty w kolejności graczy z przypadku.
select is(public.play_points(array[3, 1, 1, 4, 5]::int[], array[10, 6, 4, 2, 0]::numeric[]), array[4, 8, 8, 2, 0]::numeric[],
  'remis dwóch o 1. miejsce, punktacja 10/6/4/2/0 → 8/8/4/2/0 (starszy format)');
select is(public.play_points(array[1, 2, 2, 2]::int[], array[10, 7, 4, 2]::numeric[]), array[10, 4.33, 4.33, 4.33]::numeric[],
  'floor: trzech graczy remisuje o 2. miejsce, (7+4+2)/3 → 4,33 (floor do setnych)');
select is(public.play_points(array[4, 2, 1, 2]::int[], array[6, 3, 2, 0]::numeric[]), array[0, 2.5, 6, 2.5]::numeric[],
  'ujemne wyniki, więcej = lepiej');
select is(public.play_points(array[1, 2, 4, 2]::int[], array[6, 3, 2, 0]::numeric[]), array[6, 2.5, 0, 2.5]::numeric[],
  'ujemne wyniki, mniej = lepiej');
select is(public.play_points(array[1, 3, 2, 4]::int[], array[10, 6, 4, 2]::numeric[]), array[10, 4, 6, 2]::numeric[],
  'remis w remisie: reguła 1 daje 1 + remis dwóch, reguła 2 rozstrzyga tylko tych dwóch');
select is(public.play_points(array[1, 2, 2, 4]::int[], array[10, 6, 4, 2]::numeric[]), array[10, 5, 5, 2]::numeric[],
  'remis po wszystkich regułach zostaje: 1, 2, 2, 4 (niejawne wspólne miejsce)');
select is(public.play_points(array[1, 1, 1, 4]::int[], array[10, 6, 4, 2]::numeric[]), array[6.66, 6.66, 6.66, 2]::numeric[],
  'wspólne miejsce trzech graczy: 1, 1, 1, 4, (10+6+4)/3 → 6,66 (floor do setnych)');
select is(public.play_points(array[3, 2, 1]::int[], array[3, 2, 1]::numeric[]), array[1, 2, 3]::numeric[],
  'punktacja decyduje, mniej = lepiej, remis rozstrzyga suma');
select is(public.play_points(array[2, 1]::int[], array[5, 0]::numeric[]), array[0, 5]::numeric[],
  'starszy format: decyduje suma, której nie sumuje żadna inna (suma z sumy)');
select is(public.play_points(array[2, 1, 2]::int[], array[4, 2, 1]::numeric[]), array[1.5, 4, 1.5]::numeric[],
  'starszy format bez sumy końcowej: suma punktacji, puste pole się nie liczy');
select is(public.play_points(array[2, 1, 2]::int[], array[2, 1, 0]::numeric[]), array[0.5, 2, 0.5]::numeric[],
  'puste pole kategorii decydującej jest za każdą liczbą, także przy „mniej = lepiej”');
select is(public.play_points(array[1, 1]::int[], array[3, 1]::numeric[]), array[2, 2]::numeric[],
  'remis wszystkich graczy: każdy wygrywa, (3+1)/2 → 2');
select is(public.play_points(array[2, 3, 1, 4]::int[], array[10, 8, 6, 4, 2, 1]::numeric[]), array[4, 2, 6, 1]::numeric[],
  'gra 2–6, partia 4 graczy: zwycięzca dostaje punkty za 3. miejsce, ostatni za 6. (10/8/6/4/2/1 → 6/4/2/1)');
select is(public.play_points(array[1, 2, 2, 4]::int[], array[12.5, 7.25, 3.1, 0.5]::numeric[]), array[12.5, 5.17, 5.17, 0.5]::numeric[],
  'punkty ułamkowe: remis o 2. miejsce, (7,25 + 3,1) / 2 → 5,17 (floor do setnych)');
select is(public.play_points(array[2, 1, 3]::int[], array[10, 6, 4, 2, 1, 0]::numeric[]), array[1, 2, 0]::numeric[],
  'zespoły: 3 strony w grze do 6 graczy, każdy członek zespołu dostaje pełne punkty miejsca (10/6/4/2/1/0 → 2/1/0)');

-- Miejsca albo punktacja, z których nie da się policzyć punktów.
select throws_ok($$ select public.play_points(array[2, 3]::int[], array[3, 1]::numeric[]) $$,
  '22023', null, 'brak 1. miejsca');
select throws_ok($$ select public.play_points(array[1, 1, 2]::int[], array[3, 2, 1]::numeric[]) $$,
  '22023', null, 'po remisie o 1. miejsce nie ma 2. miejsca');
select throws_ok($$ select public.play_points(array[1, 3]::int[], array[3, 1]::numeric[]) $$,
  '22023', null, 'luka w miejscach');
select throws_ok($$ select public.play_points(array[1, 2, 3]::int[], array[3, 1]::numeric[]) $$,
  '22023', null, 'punktacja ma mniej pozycji niż graczy');
select throws_ok($$ select public.play_points(array[1, 2]::int[], array[3, -1]::numeric[]) $$,
  '22023', null, 'ujemna punktacja');
select throws_ok($$ select public.play_points(array[1, 2]::int[], array[3.125, 1]::numeric[]) $$,
  '22023', null, 'punktacja z trzema miejscami po przecinku');

select * from finish();
rollback;
