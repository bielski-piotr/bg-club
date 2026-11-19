import AxeBuilder from '@axe-core/playwright';
import { expect, test, type Page } from '@playwright/test';
import {
  EMPTY_PLAYER_ACHIEVEMENTS,
  member,
  mockGame,
  mockMeeting,
  mockSupabase,
  session,
  storeSession,
  type MockOptions,
  type MockPlay,
  type SupabaseMock,
} from './support/supabaseMock';

/**
 * Gablota osiągnięć w profilu i osiągnięcia spotkania: cały katalog, kolorowe odblokowane z datą,
 * wyszarzone z opisem albo postępem,
 * szczegóły odznaki z warunkiem i spotkaniem, lista spotkania oraz odświeżenie obu widoków po
 * usunięciu partii. Odblokowania i liczniki liczy baza (`player_achievements`,
 * `meeting_achievements`, testy pgTAP `230`, `240`); tu API Supabase jest atrapą. Każdy test
 * przechodzi na 360 px i na desktopie, w motywie jasnym i ciemnym.
 */

const NOW = new Date('2026-11-12T19:00:00Z');
const CLUB = { name: 'Planszówki', logo_path: null, timezone: 'Europe/Warsaw' };
const BEA = member(2, 'Bea', 'Bobrowska');
const CEZARY = member(3, 'Cezary', 'Cichy');
const ZOJA = member(4, 'Zoja', 'Zawada', true);
const AZUL = mockGame(1, 'Azul');
const WINGSPAN = mockGame(2, 'Wingspan');
const FINISHED = mockMeeting(5, 'Listopadowe granie', {
  status: 'finished',
  voting_open: false,
  starts_at: '2026-11-08T17:00:00Z',
  started_at: '2026-11-08T17:05:00Z',
  finished_at: '2026-11-08T21:00:00Z',
  participants: [BEA.id, CEZARY.id],
});

const playId = (n: number) => `00000000-0000-4000-f000-${n.toString(16).padStart(12, '0')}`;

/** Azul wygrywa Bea, Wingspan Cezary. */
function savedPlay(n: number): MockPlay {
  const azul = n === 1;
  return {
    id: playId(n),
    meeting_id: FINISHED.id,
    status: 'saved',
    started_at: '2026-11-08T18:00:00Z',
    saved_at: `2026-11-08T${18 + n}:00:00Z`,
    game_id: azul ? AZUL.id : WINGSPAN.id,
    sheet: { game: n, names: ['Bea Bobrowska', 'Cezary Cichy'], cells: {} },
    sheet_image_path: null,
    play_results: [
      { profile_id: BEA.id, is_win: azul, seat: 1, place: azul ? 1 : 2, points: azul ? 10 : 6 },
      { profile_id: CEZARY.id, is_win: !azul, seat: 2, place: azul ? 2 : 1, points: azul ? 6 : 10 },
    ],
  };
}

const unlock = (id: string, play: number | null) => ({
  achievement_id: id,
  unlocked_at: FINISHED.starts_at,
  meeting_id: FINISHED.id,
  meeting_title: FINISHED.title,
  play_id: play === null ? null : playId(play),
});

/**
 * Stan bazy po przeliczeniu: przed usunięciem partii Azul Bea ma Pierwszą wygraną i Hat-trick,
 * po usunięciu żadnej z nich. Liczniki: 7 z 10 spotkań do Stałego bywalca.
 */
function database(deleted: () => boolean): MockOptions {
  return {
    playerAchievements: (profileId) => {
      if (profileId === BEA.id) {
        return {
          unlocks: deleted()
            ? [unlock('meet-1', 2)]
            : [unlock('meet-1', 1), unlock('win-1', 1), unlock('hattrick', 1)],
          progress: { ...EMPTY_PLAYER_ACHIEVEMENTS.progress, meetings: 7, plays: 9, wins: 4 },
        };
      }
      if (profileId === ZOJA.id) {
        return {
          unlocks: [unlock('meet-1', 1)],
          progress: { ...EMPTY_PLAYER_ACHIEVEMENTS.progress, meetings: 1, plays: 1 },
        };
      }
      return EMPTY_PLAYER_ACHIEVEMENTS;
    },
    meetingAchievements: (meetingId) => {
      if (meetingId !== FINISHED.id) return [];
      const cezary = { profile_id: CEZARY.id, achievement_id: 'win-1', play_id: playId(2) };
      if (deleted()) return [cezary];
      return [
        { profile_id: BEA.id, achievement_id: 'win-1', play_id: playId(1) },
        { profile_id: BEA.id, achievement_id: 'hattrick', play_id: playId(1) },
        cezary,
      ];
    },
  };
}

async function openApp(page: Page, url: string, options: MockOptions = {}) {
  await page.clock.setFixedTime(NOW);
  const holder: { mock?: SupabaseMock } = {};
  const mock = await mockSupabase(page, {
    club: CLUB,
    members: [BEA, CEZARY, ZOJA],
    games: [{ ...AZUL }, { ...WINGSPAN }],
    meetings: [{ ...FINISHED }],
    plays: [savedPlay(1), savedPlay(2)],
    ...database(() => (holder.mock?.playDeletes.length ?? 0) > 0),
    ...options,
  });
  holder.mock = mock;
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

const profileDialog = (page: Page) => page.getByRole('dialog', { name: 'Profil' });
const showcase = (page: Page) =>
  profileDialog(page).getByRole('region', { name: 'Gablota osiągnięć' });
const tile = (page: Page, id: string) => showcase(page).locator(`[data-achievement="${id}"]`);

test('gablota: cały katalog, odblokowane z datą, wyszarzone z opisem i postępem', async ({
  page,
}) => {
  await openApp(page, `/?p=profile/${BEA.id}`);
  await expect(showcase(page)).toContainText('3 z 29');
  await expect(showcase(page).locator('[data-achievement]')).toHaveCount(29);
  await expect(showcase(page).locator('[data-unlocked="true"]')).toHaveCount(3);
  await expect(showcase(page).getByRole('heading', { level: 4 })).toHaveText([
    'Spotkania',
    'Partie',
    'Wygrane',
    'Serie',
    'Różnorodność',
    'Wyjątkowe',
    'Punkty',
    'Klub',
  ]);

  await expect(tile(page, 'hattrick')).toHaveAccessibleName(
    'Hat-trick, Odblokowane 8 lis 2026. Pokaż szczegóły',
  );
  await expect(tile(page, 'hattrick')).toContainText('8 lis 2026');
  await expect(tile(page, 'meet-10')).toContainText('7/10');
  await expect(tile(page, 'meet-10')).toHaveAccessibleName(
    'Stały bywalec, Postęp: 7 z 10. Pokaż szczegóły',
  );
  await expect(tile(page, 'flawless')).toContainText(
    'Wygrane wszystkie partie spotkania (co najmniej 3 partie)',
  );
  await check(page);

  // Szczegóły odblokowanej odznaki: warunek, data i link do spotkania.
  await tile(page, 'hattrick').click();
  const details = page.getByRole('dialog', { name: 'Hat-trick' });
  await expect(details).toContainText('Co najmniej 3 wygrane na jednym spotkaniu');
  await expect(details).toContainText('Odblokowane 8 lis 2026 na spotkaniu Listopadowe granie');
  await check(page);
  await details
    .getByRole('link', { name: 'Otwórz spotkanie: Listopadowe granie, 8 lis 2026' })
    .click();
  await expect(page.getByRole('dialog', { name: /Listopadowe granie/ })).toBeVisible();
  await page.goBack();
  await details.getByRole('button', { name: 'Zamknij' }).click();
  await expect(details).toHaveCount(0);

  // Szczegóły nieodblokowanej: warunek i postęp; adres da się otworzyć z linku.
  await tile(page, 'meet-10').click();
  const locked = page.getByRole('dialog', { name: 'Stały bywalec' });
  await expect(locked).toContainText('10 spotkań z co najmniej jedną partią');
  await expect(locked).toContainText('Jeszcze nie odblokowane.');
  await expect(locked).toContainText('Postęp: 7 z 10');
  expect(page.url()).toContain(`p=profile/${BEA.id}/achievement/meet-10`);
  await check(page);
});

test('pusta gablota i profil usuniętego członka', async ({ page }) => {
  await openApp(page, `/?p=profile/${CEZARY.id}`);
  await expect(showcase(page)).toContainText('0 z 29');
  await expect(showcase(page).getByText('Gablota jest jeszcze pusta')).toBeVisible();
  await expect(showcase(page).locator('[data-unlocked="false"]')).toHaveCount(29);
  await check(page);

  await page.goto(`/?p=profile/${ZOJA.id}`);
  await expect(profileDialog(page)).toContainText('Profil jest tylko do odczytu.');
  await expect(showcase(page)).toContainText('1 z 29');
  await tile(page, 'win-1').click();
  const details = page.getByRole('dialog', { name: 'Pierwsza wygrana' });
  await expect(details).toContainText('Zoja Zawada');
  await expect(details).toContainText('Ten członek został usunięty z klubu');
  await check(page);
});

test('spotkanie pokazuje odblokowane osiągnięcia, a usunięcie partii odświeża je i gablotę', async ({
  page,
}) => {
  const mock = await openApp(page, `/?p=profile/${BEA.id}&p=meeting/${FINISHED.id}`);
  const meeting = page.getByRole('dialog', { name: 'Listopadowe granie' });
  const rows = meeting.getByRole('list', { name: 'Osiągnięcia odblokowane na tym spotkaniu' });
  await expect(rows.getByRole('link')).toHaveText([
    /Nowe osiągnięcie · Bea Bobrowska\s*Pierwsza wygrana/,
    /Nowe osiągnięcie · Bea Bobrowska\s*Hat-trick/,
    /Nowe osiągnięcie · Cezary Cichy\s*Pierwsza wygrana/,
  ]);
  await check(page);

  // Wiersz otwiera szczegóły odznaki w gablocie gracza.
  await rows
    .getByRole('link', { name: 'Bea Bobrowska odblokowuje: Hat-trick. Pokaż szczegóły' })
    .click();
  await expect(page.getByRole('dialog', { name: 'Hat-trick' })).toContainText('Listopadowe granie');
  await page.goBack();

  await meeting.getByRole('button', { name: 'Akcje partii Azul' }).click();
  await page.getByRole('menuitem', { name: 'Usuń partię' }).click();
  await page
    .getByRole('dialog', { name: 'Usunąć partię?' })
    .getByRole('button', { name: 'Usuń partię' })
    .click();
  await expect(page.getByText('Usunięto partię: Azul')).toBeVisible();
  expect(mock.playDeletes).toEqual([playId(1)]);
  await expect(rows.getByRole('link')).toHaveText([
    /Nowe osiągnięcie · Cezary Cichy\s*Pierwsza wygrana/,
  ]);

  // Gablota pod spotkaniem też jest pobrana od nowa: bez nieaktualnych odznak.
  await page.keyboard.press('Escape');
  await expect(meeting).toHaveCount(0);
  await expect(showcase(page)).toContainText('1 z 29');
  await expect(tile(page, 'hattrick')).toHaveAttribute('data-unlocked', 'false');
  await expect(tile(page, 'win-1')).toHaveAttribute('data-unlocked', 'false');
});
