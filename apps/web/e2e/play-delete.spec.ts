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
  type MockOptions,
  type MockPlay,
} from './support/supabaseMock';

/**
 * Usunięcie partii (PRD VIEW-6, PLAN-5, §5.6.5, zadanie [031]): tylko admin, po potwierdzeniu,
 * z menu karty partii w spotkaniu albo z karteczki. Partia znika z listy, podsumowania
 * i timeline (odświeżenie zależnych widoków), obraz karteczki jest usuwany ze Storage, a błąd
 * Storage nie przywraca partii (ponowienie w dialogu). Zakończone spotkanie po ostatniej
 * usuniętej partii można usunąć. API Supabase jest atrapą; reguły bazy (uprawnienia, kaskady,
 * przeliczenie, sprzątanie) sprawdza test SQL 190. Każdy test przechodzi na 360 px i na
 * desktopie, w obu motywach.
 */

const NOW = new Date('2026-11-12T19:00:00Z');
const CLUB = { name: 'Planszówki', logo_path: null, timezone: 'Europe/Warsaw' };
const BEA = member(2, 'Bea', 'Bobrowska');
const CEZARY = member(3, 'Cezary', 'Cichy');
const AZUL = mockGame(1, 'Azul');
const WINGSPAN = mockGame(2, 'Wingspan');

const FINISHED = mockMeeting(5, 'Listopadowe granie', {
  status: 'finished',
  voting_open: false,
  starts_at: '2026-11-08T17:00:00Z',
  started_at: '2026-11-08T17:05:00Z',
  finished_at: '2026-11-08T21:00:00Z',
  participants: [ADA.id, BEA.id, CEZARY.id],
});

const playId = (n: number) => `00000000-0000-4000-f000-${n.toString(16).padStart(12, '0')}`;
const imagePath = (n: number) => `${FINISHED.id}/${playId(n)}-abcdefabcdef.webp`;

/** Zapisana partia: Azul wygrywa Bea (z obrazem), Wingspan Cezary (bez obrazu). */
function savedPlay(n: number, extra: Partial<MockPlay> = {}): MockPlay {
  const azul = n === 1;
  return {
    id: playId(n),
    meeting_id: FINISHED.id,
    status: 'saved',
    started_at: '2026-11-08T18:00:00Z',
    saved_at: `2026-11-08T${18 + n}:00:00Z`,
    game_id: azul ? AZUL.id : WINGSPAN.id,
    sheet: { game: n, names: ['Bea Bobrowska', 'Cezary Cichy'], cells: {} },
    sheet_image_path: azul ? imagePath(n) : null,
    play_results: [
      { profile_id: BEA.id, is_win: azul, seat: 1, place: azul ? 1 : 2, points: azul ? 10 : 6 },
      { profile_id: CEZARY.id, is_win: !azul, seat: 2, place: azul ? 2 : 1, points: azul ? 6 : 10 },
    ],
    ...extra,
  };
}

async function openApp(page: Page, url: string, options: MockOptions = {}) {
  await page.clock.setFixedTime(NOW);
  const mock = await mockSupabase(page, {
    club: CLUB,
    members: [BEA, CEZARY],
    games: [{ ...AZUL }, { ...WINGSPAN }],
    meetings: [{ ...FINISHED }],
    plays: [savedPlay(1), savedPlay(2)],
    ...options,
  });
  await storeSession(page, session());
  await page.goto(url);
  return mock;
}

async function check(page: Page) {
  await page.waitForFunction(() =>
    document.getAnimations().every((animation) => animation.playState !== 'running'),
  );
  expect(
    await page.evaluate(
      () => document.documentElement.scrollWidth - document.documentElement.clientWidth,
    ),
  ).toBe(0);
  const results = await new AxeBuilder({ page })
    .withTags(['wcag2a', 'wcag2aa', 'wcag21aa'])
    .analyze();
  expect(
    results.violations.map((v) => `${v.id}: ${v.nodes.map((n) => n.target).join(' | ')}`),
  ).toEqual([]);
}

const meetingDialog = (page: Page) => page.getByRole('dialog', { name: 'Listopadowe granie' });
const savedCards = (page: Page) =>
  meetingDialog(page).getByRole('list', { name: 'Zapisane partie' }).locator(':scope > li');
const deleteDialog = (page: Page) => page.getByRole('dialog', { name: 'Usunąć partię?' });

async function openDeleteFromCard(page: Page, title: string) {
  await meetingDialog(page)
    .getByRole('button', { name: `Akcje partii ${title}` })
    .click();
  await page.getByRole('menuitem', { name: 'Usuń partię' }).click();
  await expect(deleteDialog(page)).toBeVisible();
}

test('admin usuwa partię z menu karty: potwierdzenie, obraz ze Storage, odświeżone widoki', async ({
  page,
}) => {
  const mock = await openApp(page, `/?p=meeting/${FINISHED.id}`);
  await expect(savedCards(page)).toHaveCount(2);
  await expect(meetingDialog(page).getByText('2 rozegrane')).toBeVisible();
  // Zakończonego spotkania z partiami nie usuwa się (PLAN-5): admin nie ma akcji spotkania.
  await expect(meetingDialog(page).getByRole('button', { name: 'Akcje spotkania' })).toHaveCount(0);

  await openDeleteFromCard(page, 'Azul');
  const dialog = deleteDialog(page);
  await expect(dialog).toContainText('Partia Azul zostanie trwale usunięta');
  await check(page);

  // Anuluj niczego nie usuwa.
  await dialog.getByRole('button', { name: 'Anuluj' }).click();
  await expect(dialog).toHaveCount(0);
  expect(mock.playDeletes).toEqual([]);

  await openDeleteFromCard(page, 'Azul');
  await deleteDialog(page).getByRole('button', { name: 'Usuń partię' }).click();
  await expect(deleteDialog(page)).toHaveCount(0);
  await expect(page.getByText('Usunięto partię: Azul')).toBeVisible();
  expect(mock.playDeletes).toEqual([playId(1)]);
  expect(mock.sheetRemoved).toEqual([imagePath(1)]);
  // Lista partii i liczniki pobrane od nowa: zostaje Wingspan.
  await expect(savedCards(page)).toHaveCount(1);
  await expect(savedCards(page).nth(0)).toContainText('Wingspan');
  await expect(meetingDialog(page).getByText('1 rozegrana')).toBeVisible();
  await check(page);
});

test('ostatnia usunięta partia: zakończone spotkanie można usunąć (PLAN-5, Q4)', async ({
  page,
}) => {
  const mock = await openApp(page, `/?p=meeting/${FINISHED.id}`, { plays: [savedPlay(2)] });
  await openDeleteFromCard(page, 'Wingspan');
  await deleteDialog(page).getByRole('button', { name: 'Usuń partię' }).click();
  await expect(deleteDialog(page)).toHaveCount(0);
  // Partia bez obrazu: nie ma czego usuwać ze Storage.
  expect(mock.sheetRemoved).toEqual([]);
  await expect(meetingDialog(page).getByText('Brak zapisanych partii.')).toBeVisible();

  await meetingDialog(page).getByRole('button', { name: 'Akcje spotkania' }).click();
  await page.getByRole('menuitem', { name: 'Usuń spotkanie' }).click();
  await page
    .getByRole('dialog', { name: 'Usunąć spotkanie?' })
    .getByRole('button', { name: 'Usuń', exact: true })
    .click();
  await expect(page.getByText('Usunięto spotkanie Listopadowe granie')).toBeVisible();
  expect(mock.meetingDeletes).toEqual([FINISHED.id]);
});

test('błąd Storage: partia zostaje usunięta, obraz można usunąć ponownie', async ({ page }) => {
  const mock = await openApp(page, `/?p=meeting/${FINISHED.id}`, { sheetRemoveFailures: 1 });
  await openDeleteFromCard(page, 'Azul');
  const dialog = deleteDialog(page);
  await dialog.getByRole('button', { name: 'Usuń partię' }).click();
  await expect(dialog.getByText(/nie udało się usunąć obrazu karteczki/)).toBeVisible();
  // Wynik nie wraca: partia już zniknęła z listy pod dialogiem.
  await expect(savedCards(page)).toHaveCount(1);
  expect(mock.sheetRemoved).toEqual([]);
  await check(page);

  await dialog.getByRole('button', { name: 'Usuń obraz ponownie' }).click();
  await expect(dialog).toHaveCount(0);
  expect(mock.sheetRemoved).toEqual([imagePath(1)]);
  expect(mock.playDeletes).toEqual([playId(1)]);
});

test('admin usuwa partię z karteczki: zamyka dialog i karteczkę', async ({ page }) => {
  const mock = await openApp(page, `/?p=meeting/${FINISHED.id}&p=sheet/${playId(1)}`);
  const sheet = page.getByRole('dialog', { name: 'Azul' });
  await sheet.getByRole('button', { name: 'Usuń partię' }).click();
  await deleteDialog(page).getByRole('button', { name: 'Usuń partię' }).click();
  await expect(deleteDialog(page)).toHaveCount(0);
  await expect(sheet).toHaveCount(0);
  await expect(savedCards(page)).toHaveCount(1);
  expect(mock.playDeletes).toEqual([playId(1)]);
  await expect(page).toHaveURL(new RegExp(`\\?p=meeting/${FINISHED.id}$`));
});

test('gracz nie usuwa partii: bez menu, bez przycisku, link do potwierdzenia nieprawidłowy', async ({
  page,
}) => {
  const mock = await openApp(page, `/?p=meeting/${FINISHED.id}`, {
    profile: { ...ADA, role: 'player' },
  });
  await expect(savedCards(page)).toHaveCount(2);
  await expect(meetingDialog(page).getByRole('button', { name: /^Akcje partii/ })).toHaveCount(0);
  await expect(
    savedCards(page).nth(0).getByRole('button', { name: 'Karteczka partii Azul' }),
  ).toBeVisible();

  await page.goto(`/?p=sheet/${playId(1)}`);
  await expect(page.getByRole('dialog', { name: 'Azul' })).toBeVisible();
  await expect(page.getByRole('button', { name: 'Usuń partię' })).toHaveCount(0);

  await page.goto(`/?p=play/${playId(1)}/delete`);
  await expect(page.getByRole('dialog', { name: 'Nie znaleziono' })).toBeVisible();
  expect(mock.playDeletes).toEqual([]);
});

test('partia w toku albo nieistniejąca: link do usunięcia nieprawidłowy', async ({ page }) => {
  const draft = savedPlay(3, { status: 'draft', saved_at: null });
  const mock = await openApp(page, `/?p=play/${draft.id}/delete`, {
    plays: [savedPlay(1), draft],
  });
  await expect(page.getByRole('dialog', { name: 'Nie znaleziono' })).toBeVisible();
  await page.goto(`/?p=play/${playId(9)}/delete`);
  await expect(page.getByRole('dialog', { name: 'Nie znaleziono' })).toBeVisible();
  expect(mock.playDeletes).toEqual([]);
});
