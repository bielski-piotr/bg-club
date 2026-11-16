import { expect, test } from '@playwright/test';
import {
  ADA,
  EMPTY_PLAYER_ACHIEVEMENTS,
  mockSupabase,
  session,
  storeSession,
} from './support/supabaseMock';
import { png } from './support/png';

/** Stateful UI regression. API responses are mocked; SQL/Auth suites prove server permissions. */
test('MVP: pusty klub, członek, gra, notes, głosowanie, szkic i zapisana partia', async ({
  page,
}) => {
  test.setTimeout(120_000);
  const mock = await mockSupabase(page, { club: null, members: [], games: [], meetings: [] });
  await storeSession(page, session());
  await page.goto('/');
  await page.getByRole('button', { name: 'Dodaj klub' }).click();
  let dialog = page.getByRole('dialog', { name: 'Dodaj klub' });
  await dialog.getByLabel('Nazwa klubu').fill('Klub regresji');
  await dialog.getByRole('button', { name: 'Zapisz', exact: true }).click();
  await expect(page.getByRole('heading', { level: 1, name: 'Klub regresji' })).toBeVisible();
  await page.getByRole('button', { name: 'Dodaj członka' }).click();
  dialog = page.getByRole('dialog', { name: 'Dodaj członka' });
  await dialog.getByLabel('Imię', { exact: true }).fill('Bea');
  await dialog.getByLabel('Nazwisko').fill('Testowa');
  await dialog.getByRole('button', { name: 'Dodaj członka' }).click();
  await expect(page.getByRole('dialog', { name: 'Członek dodany' })).toBeVisible();
  await page.goto('/');
  await page.getByRole('button', { name: 'Dodaj grę' }).click();
  dialog = page.getByRole('dialog', { name: 'Dodaj grę' });
  await dialog.getByLabel('Tytuł').fill('Gra regresji');
  for (const [i, points] of ['10', '6', '4', '2'].entries()) {
    await dialog.getByLabel(`${i + 1}. miejsce`).fill(points);
  }
  await dialog.getByRole('button', { name: 'Zapisz', exact: true }).click();
  await expect(dialog).toBeHidden();
  const game = mock.options.games?.[0];
  if (!game) throw new Error('Missing created game');
  await page.goto(`/?p=game/${game.id}/scorepads/new`);
  dialog = page.getByRole('dialog', { name: /notes/i });
  const template = {
    v: 2,
    id: 'regression',
    name: 'Notes regresji',
    size: { w: 10, h: 14 },
    tape: '#2c3a46',
    image: `data:image/png;base64,${png(300, 420).toString('base64')}`,
    grid: { x: [0, 0.25, 0.5, 0.75, 1], y: [0, 0.5, 1], players: 'cols', labels: 1 },
    lines: [
      { id: 'names', label: 'Gracze', kind: 'names' },
      { id: 'a', label: 'Punkty', kind: 'input', free: true },
    ],
  };
  await dialog.getByLabel('Plik notesu (.json)').setInputFiles({
    name: 'notes.json',
    mimeType: 'application/json',
    buffer: Buffer.from(JSON.stringify({ format: 'score-pad', version: 2, template })),
  });
  for (let i = 0; i < 4; i++) await dialog.getByRole('button', { name: 'Dalej' }).click();
  await dialog.getByRole('button', { name: 'Zapisz notes' }).click();
  await expect.poll(() => mock.scorepadSaves.length).toBe(1);
  // The shared API mock records this RPC but does not persist versions. Materialize its
  // recorded request for subsequent UI steps, without supplying expected scoring results.
  const saved = mock.scorepadSaves[0];
  if (!saved) throw new Error('Missing saved scorepad');
  mock.options.scorepads = [
    {
      id: saved.scorepad_id as string,
      game_id: game.id,
      name: saved.name as string,
      created_at: new Date().toISOString(),
      current: {
        id: '00000000-0000-4000-e000-000000000044',
        version: 1,
        image_path: saved.image_path as string,
        player_slots: saved.player_slots as number,
        created_at: new Date().toISOString(),
      },
      template: saved.template as Record<string, unknown>,
      image: png(300, 420),
    },
  ];
  await page.goto('/?p=meetings/new');
  dialog = page.getByRole('dialog', { name: 'Zaplanuj spotkanie' });
  await dialog.getByLabel('Tytuł').fill('Spotkanie regresji');
  await dialog.getByLabel('Data').fill('2030-11-30');
  await dialog.getByRole('button', { name: /^Godzina/ }).click();
  await page.getByRole('option', { name: '19:30', exact: true }).click();
  await dialog.getByRole('button', { name: 'Zaznacz wszystkich' }).click();
  await dialog.getByRole('button', { name: 'Zaplanuj', exact: true }).click();
  await expect(dialog).toBeHidden();
  const meeting = mock.options.meetings?.[0];
  if (!meeting) throw new Error('Missing created meeting');
  await page.goto(`/?p=meeting/${meeting.id}`);
  dialog = page.getByRole('dialog', { name: 'Spotkanie regresji' });
  await dialog.getByRole('button', { name: 'Zagłosuj na Gra regresji' }).click();
  await expect(dialog.getByText('Twoje głosy: 1')).toBeVisible();
  await dialog.getByRole('button', { name: 'Rozpocznij spotkanie' }).click();
  await page
    .getByRole('dialog', { name: 'Rozpocząć spotkanie?' })
    .getByRole('button', { name: 'Rozpocznij', exact: true })
    .click();
  await dialog.getByRole('button', { name: 'Nowa partia' }).click();
  const wizard = page.getByRole('dialog', { name: 'Nowa partia' });
  await wizard.getByText('Gra regresji', { exact: true }).click();
  await wizard.getByRole('button', { name: 'Dalej' }).click();
  const outside = wizard.getByRole('list', { name: 'Uczestnicy poza partią' });
  await outside.getByRole('button', { name: /Ada Adminowska/ }).click();
  await outside.getByRole('button', { name: /Bea Testowa/ }).click();
  await wizard.getByRole('button', { name: 'Rozpocznij', exact: true }).click();
  const pad = page.getByRole('dialog', { name: 'Gra regresji' });
  await expect(pad.locator('score-pad .sp.ready')).toBeVisible({ timeout: 30_000 });
  await page.evaluate(() => {
    const el = document.querySelector('score-pad') as HTMLElement & {
      pad: {
        exportConfig(o: { sheet: boolean }): { sheet: { names: unknown } };
        setSheet(s: unknown): void;
      };
    };
    el.pad.setSheet({
      game: 1,
      names: el.pad.exportConfig({ sheet: true }).sheet.names,
      cells: { a: [12, 7, null] },
    });
  });
  await expect.poll(() => mock.draftSaves.length).toBeGreaterThan(0);
  await page.reload();
  await expect(pad.locator('score-pad .sp.ready')).toBeVisible({ timeout: 30_000 });
  await page.getByRole('button', { name: 'Oderwij kartkę i zakończ partię Gra regresji' }).click();
  const summary = page.getByRole('dialog', { name: 'Podsumowanie partii' });
  await expect(summary).toContainText('+10 pkt');
  await expect(summary).toContainText('+6 pkt');
  await summary.getByRole('button', { name: 'Zapisz partię' }).click();
  await expect(page.getByText('Partia zapisana: Gra regresji')).toBeVisible();
  expect(mock.playSaves).toHaveLength(1);
  const savedPlay = mock.options.plays?.find((p) => p.status === 'saved');
  if (!savedPlay) throw new Error('Missing saved play');
  expect(savedPlay.play_results?.map((r) => r.points)).toEqual([10, 6]);
  await expect(dialog.getByRole('list', { name: 'Zapisane partie' })).toContainText('Gra regresji');
  await dialog.getByRole('button', { name: 'Zakończ spotkanie' }).click();
  await page
    .getByRole('dialog', { name: 'Zakończyć spotkanie?' })
    .getByRole('button', { name: 'Zakończ', exact: true })
    .click();
  await page.goto('/');
  await expect(page.getByRole('region', { name: 'Timeline', exact: true })).toContainText(
    'Spotkanie regresji',
  );
  await page.goto(`/?p=meeting/${meeting.id}`);
  await expect(page.getByRole('list', { name: 'Zapisane partie' })).toContainText('Gra regresji');
  // These RPC responses model server projections after save. Their computation is
  // covered by the SQL fixtures, independently of this UI navigation regression.
  mock.options.leaderboard = () =>
    (savedPlay?.play_results ?? []).map((r, i) => ({
      place: i + 1,
      profile_id: r.profile_id,
      first_name: i === 0 ? 'Ada' : 'Bea',
      last_name: i === 0 ? 'Adminowska' : 'Testowa',
      avatar_path: null,
      deleted: false,
      podium: true,
      value: r.points ?? 0,
    }));
  await page.goto('/?p=leaderboard/points');
  const ranking = page.getByRole('dialog', { name: 'Ranking' });
  await expect(ranking.getByRole('list', { name: 'Podium' })).toContainText('Ada');
  await expect(ranking.getByRole('list', { name: 'Podium' })).toContainText('10');
  mock.options.playerAchievements = () => ({
    ...EMPTY_PLAYER_ACHIEVEMENTS,
    unlocks: [
      {
        achievement_id: 'win-1',
        unlocked_at: meeting.starts_at,
        meeting_id: meeting.id,
        meeting_title: meeting.title,
        play_id: savedPlay.id,
      },
    ],
    progress: { ...EMPTY_PLAYER_ACHIEVEMENTS.progress, plays: 1, wins: 1, points: 10 },
  });
  await page.goto(`/?p=profile/${ADA.id}`);
  await expect(page.getByRole('dialog', { name: 'Profil' })).toBeVisible();
  await expect(page.locator('[data-achievement]')).toHaveCount(29);
  await expect(page.locator('[data-achievement="win-1"]')).toHaveAttribute('data-unlocked', 'true');
  expect(await page.evaluate(() => document.documentElement.scrollWidth > innerWidth)).toBe(false);
});
