/**
 * Generatory testów pgTAP ze wspólnych przypadków: `110_scoring` (punkty,
 * `public.play_points`), `171_save_play_cases` (pełny zapis partii, `public.save_play`)
 * i `231_achievement_cases` (przeliczenie osiągnięć, `private.recalculate_achievements`).
 * Pliki SQL są wynikiem tych funkcji; `sql.test.ts` pilnuje, że są aktualne,
 * a `pnpm --filter @bg-club/scoring gen:sql` zapisuje je od nowa.
 */
import { ACHIEVEMENT_IDS } from './achievements';
import type { InvalidPlacingCase, PlayCase } from './cases';
import { caseMemberId, caseSeats, placesInSeatOrder, teamSize } from './cases';
import {
  type AchievementCase,
  achievementHistory,
  caseGameId,
  casePlayId,
  caseProfileId,
  expectedUnlocks,
} from './cases/achievements';
import type { SavePlayResult } from './save';

export const SQL_TEST_PATH = 'supabase/tests/database/110_scoring.test.sql';

const literal = (s: string): string => `'${s.replaceAll("'", "''")}'`;
const intArray = (xs: readonly number[]): string =>
  xs.length ? `array[${xs.join(', ')}]::int[]` : `'{}'::int[]`;
const numArray = (xs: readonly number[]): string =>
  xs.length ? `array[${xs.join(', ')}]::numeric[]` : `'{}'::numeric[]`;

export function renderSqlTest(
  cases: readonly PlayCase[],
  invalid: readonly InvalidPlacingCase[],
): string {
  const lines: string[] = [
    '-- Punkty leaderboardu za miejsca: public.play_points.',
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
    "select ok(not has_function_privilege('anon', 'public.play_points(int[], numeric[])', 'execute'),",
    "  'anon nie wykona play_points');",
    "select ok(not has_function_privilege('authenticated', 'public.play_points(int[], numeric[])', 'execute'),",
    "  'authenticated nie wykona play_points');",
    "select is(public.play_points('{}'::int[], array[3, 1]::numeric[]), '{}'::numeric[], 'brak graczy: brak punktów');",
    '',
    '-- Przypadki poprawne: miejsca i punkty w kolejności graczy z przypadku.',
  ];
  for (const c of cases) {
    const { places, points } = placesInSeatOrder(c);
    lines.push(
      `select is(public.play_points(${intArray(places)}, ${numArray(c.points)}), ${numArray(points)},`,
      `  ${literal(c.name)});`,
    );
  }
  lines.push('', '-- Miejsca albo punktacja, z których nie da się policzyć punktów.');
  for (const c of invalid) {
    lines.push(
      `select throws_ok($$ select public.play_points(${intArray(c.places)}, ${numArray(c.points)}) $$,`,
      `  '22023', null, ${literal(c.name)});`,
    );
  }
  lines.push('', 'select * from finish();', 'rollback;', '');
  return lines.join('\n');
}

/** Test pgTAP zapisu partii (`public.save_play`) z tych samych przypadków. */
export const SAVE_PLAY_SQL_TEST_PATH = 'supabase/tests/database/171_save_play_cases.test.sql';

const uuid = (group: string, n: number): string =>
  `00000000-0000-4000-${group}-${String(n).padStart(12, '0')}`;
const bool = (b: boolean): string => (b ? 'true' : 'false');

/**
 * Każdy przypadek przechodzi pełną ścieżkę partii w bazie: gra z punktacją przypadku, notes
 * z jego szablonem, `start_play` i `save_play` z miejscami policzonymi w TypeScripcie
 * (`rankPlayers` → `savePlayResults`). Baza musi przyjąć te miejsca (zgodność z kategorią
 * decydującą i kierunkiem reguły) i policzyć te same punkty, remisy i wygrane co przypadek.
 */
export function renderSavePlaySqlTest(
  cases: readonly PlayCase[],
  results: (c: PlayCase) => readonly SavePlayResult[],
): string {
  const players = Math.max(...cases.map((c) => Math.max(...c.players.map((p) => p.seat + 1))));
  const admin = uuid('a000', 1);
  // Dodatkowi członkowie zespołów (pierwszy członek to gracz miejsca).
  const members = [
    ...new Set(
      cases.flatMap((c) =>
        c.players.flatMap((p) =>
          Array.from({ length: teamSize(c, p.seat) - 1 }, (_, k) => caseMemberId(p.seat, k + 1)),
        ),
      ),
    ),
  ].sort();
  const lines: string[] = [
    '-- Zapis partii: public.save_play na wspólnych przypadkach.',
    '-- PLIK GENEROWANY z packages/scoring/src/cases/play-cases.json — nie edytować ręcznie.',
    '-- Po zmianie przypadków: pnpm --filter @bg-club/scoring gen:sql.',
    '-- Miejsca liczy TypeScript (rankPlayers, savePlayResults), punkty i wygrane baza.',
    '-- Dane testowe są fikcyjne.',
    'begin;',
    '',
    'create extension if not exists pgtap with schema extensions;',
    '',
    `select plan(${cases.length * 2});`,
    '',
    'insert into public.profiles (id, hook, first_name, last_name, role) values',
    [
      `  (${literal(admin)}, 'ada-adminowska-a001', 'Ada', 'Adminowska', 'admin')`,
      ...Array.from(
        { length: players },
        (_, seat) =>
          `  (${literal(caseMemberId(seat))}, ${literal(`gracz-${seat + 1}-testowy-${(0xa100 + seat).toString(16)}`)}, 'Gracz', ${literal(`Testowy ${seat + 1}`)}, 'player')`,
      ),
      ...members.map(
        (id, i) =>
          `  (${literal(id)}, ${literal(`czlonek-${i + 1}-zespolu-${(0xb100 + i).toString(16)}`)}, 'Członek', ${literal(`Zespołu ${i + 1}`)}, 'player')`,
      ),
    ].join(',\n') + ';',
    '',
    'insert into public.meetings (id, title, starts_at, created_by) values',
    `  (${literal(uuid('c000', 1))}, 'Wspólne przypadki', '2026-11-20 18:00+01', ${literal(admin)});`,
    'insert into public.meeting_participants (meeting_id, profile_id)',
    `select ${literal(uuid('c000', 1))}, p.id from public.profiles p;`,
    "update public.meetings set status = 'in_progress', voting_open = false, started_at = now();",
    '',
  ];
  cases.forEach((c, index) => {
    const n = index + 1;
    const slots = Math.max(...c.players.map((p) => p.seat + 1));
    const template = JSON.stringify({ v: 2, ...c.template });
    lines.push(
      `-- ${c.name}`,
      'insert into public.games (id, title, min_players, max_players, placement_points) values',
      `  (${literal(uuid('b000', n))}, ${literal(`Gra ${n}`)}, 2, ${c.points.length}, ${numArray(c.points)});`,
      'insert into public.scorepads (id, game_id, name) values',
      `  (${literal(uuid('d000', n))}, ${literal(uuid('b000', n))}, ${literal(`Notes ${n}`)});`,
      'insert into public.scorepad_versions (id, scorepad_id, template, player_slots) values',
      `  (${literal(uuid('e000', n))}, ${literal(uuid('d000', n))}, ${literal(template)}, ${slots});`,
      `update public.scorepads set current_version_id = ${literal(uuid('e000', n))} where id = ${literal(uuid('d000', n))};`,
    );
  });
  lines.push(
    '',
    'set local role authenticated;',
    `set local request.jwt.claims to ${literal(JSON.stringify({ sub: admin, role: 'authenticated' }))};`,
    '',
  );
  cases.forEach((c, index) => {
    const n = index + 1;
    const slots = Math.max(...c.players.map((p) => p.seat + 1));
    const seated = [...caseSeats(c)].sort(([a], [b]) => a - b);
    const ids = seated.flatMap(([, list]) => list.map(literal));
    const seatNumbers = seated.flatMap(([seat, list]) => list.map(() => seat));
    const seats = Array.from({ length: slots }, (_, seat) =>
      c.players.some((p) => p.seat === seat) ? literal(caseMemberId(seat)) : 'null',
    );
    // Zespoły: płaska lista graczy z numerami miejsc; inaczej gracz miejsca i (NULL = wolne).
    const startArgs = c.teams
      ? `array[${ids.join(', ')}]::uuid[], array[${seatNumbers.join(', ')}]::int[]`
      : `array[${seats.join(', ')}]::uuid[]`;
    const payload = JSON.stringify(results(c));
    const sheet = JSON.stringify({ game: n, names: [], cells: {} });
    const call = [
      `select public.start_play(${literal(uuid('f000', n))}, ${literal(uuid('c000', 1))}, ${literal(uuid('d000', n))},`,
      `       ${startArgs});`,
      `     select public.save_play(${literal(uuid('f000', n))}, ${literal(uuid('e000', n))},`,
      `       ${literal(sheet)}::jsonb,`,
      `       ${literal(payload)}::jsonb);`,
    ].join('\n');
    const expected = [...c.expected]
      .sort((a, b) => a.seat - b.seat)
      .flatMap((e) =>
        Array.from({ length: teamSize(c, e.seat) }, (_, k) => caseMemberId(e.seat, k))
          .sort()
          .map(
            (id) =>
              `(${e.seat + 1}, ${literal(id)}::uuid, ${e.place}, ${bool(e.tiedWith.length > 0)}, ${e.points}::numeric, ${bool(e.place === 1)})`,
          ),
      );
    lines.push(
      `select lives_ok($$ ${call} $$,`,
      `  ${literal(`${c.name}: baza przyjmuje miejsca z TypeScriptu`)});`,
      `select results_eq(`,
      `  $$ select seat, profile_id, place, tied, points, is_win from public.play_results`,
      `      where play_id = ${literal(uuid('f000', n))} order by seat, profile_id $$,`,
      `  $$ values ${expected.join(', ')} $$,`,
      `  ${literal(`${c.name}: punkty, remisy i wygrane z bazy`)});`,
      '',
    );
  });
  lines.push('select * from finish();', 'rollback;', '');
  return lines.join('\n');
}

/** Test pgTAP przeliczenia osiągnięć (`private.recalculate_achievements`) z wspólnych przypadków. */
export const ACHIEVEMENTS_SQL_TEST_PATH = 'supabase/tests/database/231_achievement_cases.test.sql';

const ts = (iso: string): string => `${literal(iso)}::timestamptz`;
const uuidLit = (id: string | null): string =>
  id === null ? 'null::uuid' : `${literal(id)}::uuid`;

/**
 * Każdy przypadek wstawia historię bezpośrednio (bez wyzwalaczy przebiegu spotkania i partii,
 * które pilnują testy 130–190), uruchamia przeliczenie i porównuje `achievement_unlocks`
 * z odblokowaniami oczekiwanymi przez przypadek (te same, które liczy `computeAchievements`).
 */
export function renderAchievementSqlTest(cases: readonly AchievementCase[]): string {
  const histories = cases.map((c) => ({ c, h: achievementHistory(c) }));
  const players = Math.max(
    ...cases.flatMap((c) =>
      c.meetings.flatMap((m) => [
        ...(m.voters ?? []),
        ...(m.plays ?? []).flatMap((p) => p.results.map(([player]) => player)),
      ]),
    ),
  );
  const games = Math.max(
    ...cases.flatMap((c) => c.meetings.flatMap((m) => (m.plays ?? []).map((p) => p.game ?? 1))),
  );
  const admin = uuid('a000', 1);
  const version = (game: number, dir: 'asc' | 'desc') =>
    uuid('e000', game * 10 + (dir === 'asc' ? 2 : 1));
  const template = (dir: 'asc' | 'desc') =>
    JSON.stringify({
      v: 2,
      lines: [
        { id: 'names', kind: 'names' },
        { id: 'total', kind: 'total' },
      ],
      ranking: { line: 'total', dir, tiebreak: [] },
    });

  const lines: string[] = [
    '-- Przeliczanie osiągnięć na wspólnych przypadkach.',
    '-- PLIK GENEROWANY z packages/scoring/src/cases/achievements.ts — nie edytować ręcznie.',
    '-- Po zmianie przypadków: pnpm --filter @bg-club/scoring gen:sql.',
    '-- Te same przypadki przechodzi implementacja TypeScript (computeAchievements).',
    '-- Dane testowe są fikcyjne.',
    'begin;',
    '',
    'create extension if not exists pgtap with schema extensions;',
    '',
    `select plan(${cases.length});`,
    '',
    'insert into public.profiles (id, hook, first_name, last_name, role) values',
    [
      `  (${literal(admin)}, 'ada-adminowska-a001', 'Ada', 'Adminowska', 'admin')`,
      ...Array.from(
        { length: players },
        (_, i) =>
          `  (${literal(caseProfileId(i + 1))}, ${literal(`gracz-${i + 1}-testowy-${(0xa100 + i).toString(16)}`)}, 'Gracz', ${literal(`Testowy ${i + 1}`)}, 'player')`,
      ),
    ].join(',\n') + ';',
    '',
    '-- Gry z notesem w dwóch wersjach: „więcej = lepiej” i „mniej = lepiej”.',
  ];
  for (let g = 1; g <= games; g++) {
    lines.push(
      `insert into public.games (id, title, min_players, max_players, placement_points) values (${literal(caseGameId(g))}, ${literal(`Gra ${g}`)}, 2, 8, '{10,6,4,2,1,0,0,0}');`,
      `insert into public.scorepads (id, game_id, name) values (${literal(uuid('d000', g))}, ${literal(caseGameId(g))}, 'Notes');`,
      `insert into public.scorepad_versions (id, scorepad_id, template, player_slots) values (${literal(version(g, 'desc'))}, ${literal(uuid('d000', g))}, ${literal(template('desc'))}, 8), (${literal(version(g, 'asc'))}, ${literal(uuid('d000', g))}, ${literal(template('asc'))}, 8);`,
    );
  }
  lines.push('', 'set local session_replication_role = replica;', '');

  for (const { c, h } of histories) {
    const gameOf = new Map(
      c.meetings.flatMap((m, i) =>
        (m.plays ?? []).map((p, j) => [casePlayId(i + 1, j + 1), p.game ?? 1] as const),
      ),
    );
    lines.push(`-- ${c.name}`);
    lines.push(
      'insert into public.meetings (id, title, starts_at, status, voting_open, created_by, started_at, finished_at) values',
      h.meetings
        .map(
          (m) =>
            `  (${literal(m.id)}, 'Spotkanie', ${ts(m.startsAt)}, ${literal(m.finished ? 'finished' : 'in_progress')}, false, ${literal(admin)}, ${ts(m.startsAt)}, ${m.finished ? ts(m.startsAt) : 'null'})`,
        )
        .join(',\n') + ';',
    );
    if (h.plays.length > 0) {
      lines.push(
        'insert into public.plays (id, meeting_id, game_id, scorepad_version_id, status, points_snapshot, started_by, saved_at) values',
        h.plays
          .map((p) => {
            const game = gameOf.get(p.id) ?? 1;
            return `  (${literal(p.id)}, ${literal(p.meetingId)}, ${literal(p.gameId)}, ${literal(version(game, p.dir))}, 'saved', '{10,6,4,2,1,0,0,0}', ${literal(admin)}, ${ts(p.savedAt)})`;
          })
          .join(',\n') + ';',
        'insert into public.play_results (play_id, meeting_id, profile_id, seat, place, tied, points, is_win, ranking_value) values',
        h.plays
          .flatMap((p) =>
            p.results.map((r, k) => {
              const seat = r.seat ?? k + 1;
              // Remis: inna strona (miejsce na kartce) na tym samym miejscu w partii.
              const tied = p.results.some(
                (o, j) => o.place === r.place && (o.seat ?? j + 1) !== seat,
              );
              const value = r.rankingValue === null ? 'null' : String(r.rankingValue);
              return `  (${literal(p.id)}, ${literal(p.meetingId)}, ${literal(r.profileId)}, ${seat}, ${r.place}, ${bool(tied)}, ${r.points}, ${bool(r.place === 1)}, ${value})`;
            }),
          )
          .join(',\n') + ';',
      );
    }
    if (h.voters.length > 0)
      lines.push(
        'insert into private.meeting_voters (meeting_id, profile_id) values',
        h.voters.map((v) => `  (${literal(v.meetingId)}, ${literal(v.profileId)})`).join(',\n') +
          ';',
      );
    const only = c.only ?? ACHIEVEMENT_IDS;
    const query = [
      `  $$ select profile_id, achievement_id, meeting_id, play_id, unlocked_at from public.achievement_unlocks`,
      `      where achievement_id = any (array[${only.map(literal).join(', ')}])`,
      `      order by profile_id, achievement_id $$,`,
    ];
    const expected = expectedUnlocks(c);
    lines.push('select private.recalculate_achievements();');
    if (expected.length === 0) {
      lines.push('select is_empty(', ...query, `  ${literal(c.name)});`);
    } else {
      lines.push(
        'select results_eq(',
        ...query,
        `  $$ values ${expected
          .map(
            (e) =>
              `(${uuidLit(e.profileId)}, ${literal(e.achievementId)}, ${uuidLit(e.meetingId)}, ${uuidLit(e.playId)}, ${ts(e.unlockedAt)})`,
          )
          .join(',\n             ')} $$,`,
        `  ${literal(c.name)});`,
      );
    }
    lines.push(
      'delete from public.achievement_unlocks;',
      'delete from private.meeting_voters;',
      'delete from public.play_results;',
      'delete from public.plays;',
      'delete from public.meetings;',
      '',
    );
  }
  lines.push('select * from finish();', 'rollback;', '');
  return lines.join('\n');
}
