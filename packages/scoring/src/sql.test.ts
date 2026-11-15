import { readFileSync, writeFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { describe, expect, it } from 'vitest';
import { invalidPlacings, playCases, type PlayCase } from './cases';
import { rankPlayers } from './ranking';
import { savePlayResults } from './save';
import {
  SAVE_PLAY_SQL_TEST_PATH,
  SQL_TEST_PATH,
  renderSavePlaySqlTest,
  renderSqlTest,
} from './sql';

const path = (relative: string) => fileURLToPath(new URL(`../../../${relative}`, import.meta.url));

/** Wyniki `save_play` z miejsc policzonych w TypeScripcie; gracz miejsca k to „gracz k”. */
const tsResults = (c: PlayCase) =>
  savePlayResults(
    rankPlayers(c.template, c.players),
    new Map(
      c.players.map((p) => [
        p.seat + 1,
        `00000000-0000-4000-a000-${String(100 + p.seat).padStart(12, '0')}`,
      ]),
    ),
  );

function expectFresh(relative: string, expected: string) {
  const file = path(relative);
  if (process.env.SCORING_WRITE_SQL) writeFileSync(file, expected);
  expect(readFileSync(file, 'utf8')).toBe(expected);
}

describe('testy pgTAP ze wspólnych przypadków', () => {
  it('110_scoring jest aktualny (pnpm --filter @bg-club/scoring gen:sql)', () => {
    expectFresh(SQL_TEST_PATH, renderSqlTest(playCases, invalidPlacings));
  });

  it('171_save_play_cases jest aktualny (pnpm --filter @bg-club/scoring gen:sql)', () => {
    expectFresh(SAVE_PLAY_SQL_TEST_PATH, renderSavePlaySqlTest(playCases, tsResults));
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
    const save = renderSavePlaySqlTest([{ ...first, name: "gra 'A'" }], tsResults);
    expect(save).toContain("'gra ''A'': punkty, remisy i wygrane z bazy'");
  });
});
