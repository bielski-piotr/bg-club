import AxeBuilder from '@axe-core/playwright';
import { expect, test, type Page } from '@playwright/test';
import {
  ADA,
  member,
  mockGame,
  mockMeeting,
  mockSupabase,
  session,
  storeSession,
} from './support/supabaseMock';

const AZUL = mockGame(1, 'Azul');
const BEA = member(2, 'Bea', 'Testowa');
const FIRST = mockMeeting(1, 'Pierwsze granie', { participants: [ADA.id, BEA.id] });
const SECOND = mockMeeting(2, 'Drugie granie', { participants: [ADA.id, BEA.id] });
const vote = (meeting = FIRST.id, profile = BEA.id) => ({
  meeting_id: meeting,
  game_id: AZUL.id,
  profile_id: profile,
});

async function openApp(page: Page) {
  const mock = await mockSupabase(page, {
    club: { name: 'Planszówki', logo_path: null, timezone: 'Europe/Warsaw' },
    members: [BEA],
    games: [{ ...AZUL }],
    meetings: [{ ...FIRST }, { ...SECOND }],
    votes: [],
  });
  await storeSession(page, session());
  await page.goto('/');
  return mock;
}

async function details(page: Page, count: number) {
  await page
    .getByRole('region', { name: 'Kolekcja', exact: true })
    .getByRole('link', { name: 'Zobacz więcej' })
    .click();
  await page.getByRole('button', { name: 'Szczegóły gry Azul' }).click();
  const dialog = page.getByRole('dialog', { name: 'Azul', exact: true });
  await expect(dialog.getByText(`Łącznie głosów: ${count}`, { exact: true })).toBeVisible();
  return dialog;
}

async function closeAll(page: Page) {
  // Zamknięcie szczegółów zamyka cały stos, jak pozostałe popupy aplikacji.
  await page
    .getByRole('dialog')
    .last()
    .getByRole('button', { name: 'Zamknij', exact: true })
    .click();
  await expect(page.getByRole('dialog')).toHaveCount(0);
}

test('zero, wiele spotkań, ponowne otwarcie i przeładowanie szczegółów', async ({ page }) => {
  const mock = await openApp(page);
  const dialog = await details(page, 0);
  await expect(dialog.getByText('Brak statystyk', { exact: true })).toBeVisible();
  await page.waitForFunction(() =>
    document.getAnimations().every((a) => a.playState !== 'running'),
  );
  expect(
    await page.evaluate(
      () => document.documentElement.scrollWidth - document.documentElement.clientWidth,
    ),
  ).toBe(0);
  expect(
    (await new AxeBuilder({ page }).withTags(['wcag2a', 'wcag2aa', 'wcag21aa']).analyze())
      .violations,
  ).toEqual([]);
  await closeAll(page);
  // Zmiana z innej sesji. Ta sama osoba w dwóch spotkaniach liczy się dwukrotnie.
  mock.options.votes = [vote(), vote(SECOND.id), vote(SECOND.id, ADA.id)];
  await details(page, 3);
  await page.reload();
  await expect(
    page.getByRole('dialog', { name: 'Azul', exact: true }).getByText('Łącznie głosów: 3'),
  ).toBeVisible();
});

test('głos, cofnięcie, publikacja i usunięcie planu odświeżają sumę', async ({ page }) => {
  const mock = await openApp(page);
  mock.options.votes = [vote(), vote(SECOND.id)];
  await details(page, 2);
  await closeAll(page);
  const widget = page.getByRole('region', { name: 'Spotkanie', exact: true });
  await widget.getByRole('button', { name: 'Pierwsze granie', exact: true }).click();
  const meeting = page.getByRole('dialog', { name: 'Pierwsze granie', exact: true });
  await meeting.getByRole('button', { name: 'Zagłosuj na Azul' }).click();
  await expect(page.getByText('Głos zapisany', { exact: true })).toBeVisible();
  await closeAll(page);
  await details(page, 3);
  await closeAll(page);
  await widget.getByRole('button', { name: 'Pierwsze granie', exact: true }).click();
  await meeting.getByRole('button', { name: 'Cofnij głos na Azul' }).click();
  await expect(page.getByText('Głos cofnięty', { exact: true })).toBeVisible();
  await meeting.getByRole('button', { name: 'Opublikuj gry' }).click();
  const publish = page.getByRole('dialog', { name: 'Opublikuj gry', exact: true });
  await publish.getByText('Azul', { exact: true }).click();
  await expect(publish.getByRole('checkbox', { name: /Azul/ })).toBeChecked();
  await publish.getByRole('button', { name: 'Opublikuj', exact: true }).click();
  await expect(meeting.getByText('Gry wybrane', { exact: true })).toBeVisible();
  await closeAll(page);
  await details(page, 2);
  await closeAll(page);
  await widget.getByRole('button', { name: 'Akcje spotkania Pierwsze granie' }).click();
  await page.getByRole('menuitem', { name: 'Usuń spotkanie' }).click();
  await page
    .getByRole('dialog', { name: 'Usunąć spotkanie?' })
    .getByRole('button', { name: 'Usuń', exact: true })
    .click();
  await expect(page.getByText('Usunięto spotkanie Pierwsze granie', { exact: true })).toBeVisible();
  await details(page, 1);
});

test('błąd agregatu ma polski komunikat i ponowienie, bez fałszywego zera', async ({ page }) => {
  await openApp(page);
  let fail = true;
  await page.route('**/rest/v1/rpc/game_vote_total', async (route) => {
    if (fail) await route.fulfill({ status: 500, json: { message: 'offline' } });
    else await route.fulfill({ json: 5 });
  });
  await page
    .getByRole('region', { name: 'Kolekcja', exact: true })
    .getByRole('link', { name: 'Zobacz więcej' })
    .click();
  await page.getByRole('button', { name: 'Szczegóły gry Azul' }).click();
  const dialog = page.getByRole('dialog', { name: 'Azul', exact: true });
  await expect(dialog.getByText('Łącznie głosów: 0')).toHaveCount(0);
  const retry = dialog.getByRole('button', { name: 'Spróbuj ponownie' });
  await expect(retry).toBeVisible();
  fail = false;
  await retry.click();
  await expect(dialog.getByText('Łącznie głosów: 5')).toBeVisible();
});
