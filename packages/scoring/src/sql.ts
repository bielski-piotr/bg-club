/**
 * Generator testu pgTAP `supabase/tests/database/110_scoring.test.sql` ze wspólnych przypadków
 * (PRD §8.3). Plik SQL jest wynikiem tej funkcji; `sql.test.ts` pilnuje, że jest aktualny,
 * a `pnpm --filter @bg-club/scoring gen:sql` zapisuje go od nowa.
 */
import type { InvalidPlacingCase, PlayCase } from './cases';
import { placesInSeatOrder } from './cases';

export const SQL_TEST_PATH = 'supabase/tests/database/110_scoring.test.sql';

const literal = (s: string): string => `'${s.replaceAll("'", "''")}'`;
const intArray = (xs: readonly number[]): string =>
  xs.length ? `array[${xs.join(', ')}]::int[]` : `'{}'::int[]`;

export function renderSqlTest(
  cases: readonly PlayCase[],
  invalid: readonly InvalidPlacingCase[],
): string {
  const lines: string[] = [
    '-- [014] Punkty leaderboardu za miejsca (PRD §5.6.2, §8.3): public.play_points.',
    '-- PLIK GENEROWANY z packages/scoring/src/cases/play-cases.json — nie edytować ręcznie.',
    '-- Po zmianie przypadków: pnpm --filter @bg-club/scoring gen:sql.',
    '-- Te same przypadki przechodzi implementacja TypeScript (packages/scoring).',
    'begin;',
    '',
    'create extension if not exists pgtap with schema extensions;',
    '',
    `select plan(${cases.length + invalid.length + 3});`,
    '',
    '-- Funkcja jest pomocnicza dla RPC zapisu partii: klient jej nie wywołuje.',
    "select ok(not has_function_privilege('anon', 'public.play_points(int[], int[])', 'execute'),",
    "  'anon nie wykona play_points');",
    "select ok(not has_function_privilege('authenticated', 'public.play_points(int[], int[])', 'execute'),",
    "  'authenticated nie wykona play_points');",
    "select is(public.play_points('{}'::int[], array[3, 1]::int[]), '{}'::int[], 'brak graczy: brak punktów');",
    '',
    '-- Przypadki poprawne: miejsca i punkty w kolejności graczy z przypadku.',
  ];
  for (const c of cases) {
    const { places, points } = placesInSeatOrder(c);
    lines.push(
      `select is(public.play_points(${intArray(places)}, ${intArray(c.points)}), ${intArray(points)},`,
      `  ${literal(c.name)});`,
    );
  }
  lines.push('', '-- Miejsca albo punktacja, z których nie da się policzyć punktów.');
  for (const c of invalid) {
    lines.push(
      `select throws_ok($$ select public.play_points(${intArray(c.places)}, ${intArray(c.points)}) $$,`,
      `  '22023', null, ${literal(c.name)});`,
    );
  }
  lines.push('', 'select * from finish();', 'rollback;', '');
  return lines.join('\n');
}
