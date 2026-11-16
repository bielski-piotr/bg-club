import { expect, test } from '@playwright/test';
import { ADA, mockSupabase, session, storeSession } from './support/supabaseMock';
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
  expect(game).toBeDefined();
  await page.goto(`/?p=game/${game!.id}/scorepads/new`);
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
  await dialog
    .getByLabel('Plik notesu (.json)')
    .setInputFiles({
      name: 'notes.json',
      mimeType: 'application/json',
      buffer: Buffer.from(JSON.stringify({ format: 'score-pad', version: 2, template })),
    });
  for (let i = 0; i < 4; i++) await dialog.getByRole('button', { name: 'Dalej' }).click();
  await dialog.getByRole('button', { name: 'Zapisz notes' }).click();
  await expect.poll(() => mock.scorepadSaves.length).toBe(1);
  // The shared API mock records this RPC but does not persist versions. Materialize its
  // recorded request for subsequent UI steps, without supplying expected scoring results.
  const saved = mock.scorepadSaves[0]!;
  mock.options.scorepads = [
    {
      id: saved.scorepad_id as string,
      game_id: game!.id,
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
  expect(meeting).toBeDefined();
  await page.goto(`/?p=meeting/${meeting!.id}`);
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
  await wizard.getByRole('radio', { name: /Gra regresji/ }).click();
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
  await page.goto(`/?p=profile/${ADA.id}`);
  await expect(page.getByRole('dialog', { name: 'Profil' })).toBeVisible();
  await expect(page.locator('[data-achievement]')).toHaveCount(29);
  expect(await page.evaluate(() => document.documentElement.scrollWidth > innerWidth)).toBe(false);
});
