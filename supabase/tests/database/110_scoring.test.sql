-- [014] Punkty leaderboardu za miejsca (PRD §5.6.2, §8.3): public.play_points.
-- PLIK GENEROWANY z packages/scoring/src/cases/play-cases.json — nie edytować ręcznie.
-- Po zmianie przypadków: pnpm --filter @bg-club/scoring gen:sql.
-- Te same przypadki przechodzi implementacja TypeScript (packages/scoring).
begin;

create extension if not exists pgtap with schema extensions;

select plan(20);

-- Funkcja jest pomocnicza dla RPC zapisu partii: klient jej nie wywołuje.
select ok(not has_function_privilege('anon', 'public.play_points(int[], int[])', 'execute'),
  'anon nie wykona play_points');
select ok(not has_function_privilege('authenticated', 'public.play_points(int[], int[])', 'execute'),
  'authenticated nie wykona play_points');
select is(public.play_points('{}'::int[], array[3, 1]::int[]), '{}'::int[], 'brak graczy: brak punktów');

-- Przypadki poprawne: miejsca i punkty w kolejności graczy z przypadku.
select is(public.play_points(array[3, 1, 1, 4, 5]::int[], array[10, 6, 4, 2, 0]::int[]), array[4, 8, 8, 2, 0]::int[],
  'PRD §5.6.2: remis dwóch o 1. miejsce, punktacja 10/6/4/2/0 → 8/8/4/2/0 (starszy format)');
select is(public.play_points(array[1, 2, 2, 2]::int[], array[10, 7, 4, 2]::int[]), array[10, 4, 4, 4]::int[],
  'floor: trzech graczy remisuje o 2. miejsce, (7+4+2)/3 → 4');
select is(public.play_points(array[4, 2, 1, 2]::int[], array[6, 3, 2, 0]::int[]), array[0, 2, 6, 2]::int[],
  'ujemne wyniki, więcej = lepiej');
select is(public.play_points(array[1, 2, 4, 2]::int[], array[6, 3, 2, 0]::int[]), array[6, 2, 0, 2]::int[],
  'ujemne wyniki, mniej = lepiej (EDT-3)');
select is(public.play_points(array[1, 3, 2, 4]::int[], array[10, 6, 4, 2]::int[]), array[10, 4, 6, 2]::int[],
  'remis w remisie: reguła 1 daje 1 + remis dwóch, reguła 2 rozstrzyga tylko tych dwóch (EDT-4)');
select is(public.play_points(array[1, 2, 2, 4]::int[], array[10, 6, 4, 2]::int[]), array[10, 5, 5, 2]::int[],
  'remis po wszystkich regułach zostaje: 1, 2, 2, 4 (niejawne wspólne miejsce)');
select is(public.play_points(array[1, 1, 1, 4]::int[], array[10, 6, 4, 2]::int[]), array[6, 6, 6, 2]::int[],
  'wspólne miejsce trzech graczy: 1, 1, 1, 4, (10+6+4)/3 → 6');
select is(public.play_points(array[3, 2, 1]::int[], array[3, 2, 1]::int[]), array[1, 2, 3]::int[],
  'punktacja decyduje (EDT-2), mniej = lepiej, remis rozstrzyga suma');
select is(public.play_points(array[2, 1]::int[], array[5, 0]::int[]), array[0, 5]::int[],
  'starszy format: decyduje suma, której nie sumuje żadna inna (suma z sumy)');
select is(public.play_points(array[2, 1, 2]::int[], array[4, 2, 1]::int[]), array[1, 4, 1]::int[],
  'starszy format bez sumy końcowej: suma punktacji, puste pole się nie liczy');
select is(public.play_points(array[2, 1, 2]::int[], array[2, 1, 0]::int[]), array[0, 2, 0]::int[],
  'puste pole kategorii decydującej jest za każdą liczbą, także przy „mniej = lepiej”');
select is(public.play_points(array[1, 1]::int[], array[3, 1]::int[]), array[2, 2]::int[],
  'remis wszystkich graczy: każdy wygrywa, (3+1)/2 → 2');

-- Miejsca albo punktacja, z których nie da się policzyć punktów.
select throws_ok($$ select public.play_points(array[2, 3]::int[], array[3, 1]::int[]) $$,
  '22023', null, 'brak 1. miejsca');
select throws_ok($$ select public.play_points(array[1, 1, 2]::int[], array[3, 2, 1]::int[]) $$,
  '22023', null, 'po remisie o 1. miejsce nie ma 2. miejsca');
select throws_ok($$ select public.play_points(array[1, 3]::int[], array[3, 1]::int[]) $$,
  '22023', null, 'luka w miejscach');
select throws_ok($$ select public.play_points(array[1, 2, 3]::int[], array[3, 1]::int[]) $$,
  '22023', null, 'punktacja ma mniej pozycji niż graczy');
select throws_ok($$ select public.play_points(array[1, 2]::int[], array[3, -1]::int[]) $$,
  '22023', null, 'ujemna punktacja');

select * from finish();
rollback;
