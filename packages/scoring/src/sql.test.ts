import { readFileSync, writeFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { describe, expect, it } from 'vitest';
import { invalidPlacings, playCases } from './cases';
import { SQL_TEST_PATH, renderSqlTest } from './sql';

const file = fileURLToPath(new URL(`../../../${SQL_TEST_PATH}`, import.meta.url));

describe('test pgTAP ze wspólnych przypadków', () => {
  it('jest aktualny (pnpm --filter @bg-club/scoring gen:sql)', () => {
    const expected = renderSqlTest(playCases, invalidPlacings);
    if (process.env.SCORING_WRITE_SQL) writeFileSync(file, expected);
    expect(readFileSync(file, 'utf8')).toBe(expected);
  });

  it('cytuje apostrofy w nazwach przypadków', () => {
    const [first] = playCases;
    if (!first) throw new Error('Brak przypadków.');
    const sql = renderSqlTest(
      [{ ...first, name: "gra 'A'" }],
      [{ name: "zła 'B'", places: [], points: [] }],
    );
    expect(sql).toContain("'gra ''A'''");
    expect(sql).toContain("'zła ''B'''");
    expect(sql).toContain("'{}'::int[]");
  });
});
