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
  type MockScorepad,
} from './support/supabaseMock';

/**
 * Nowa partia (PRD RUN-2, RUN-3, PAD-2, PAD-3, PAD-9, DS §15 „Step pills”, „Game / notes
 * pick row”, „Seat row”): gry opublikowane przed resztą, gry i notesy wyłączone z wyjaśnieniem,
 * gracze z uczestników bez duplikatów, awatar i pełne imię i nazwisko w miejscu, kilka partii
 * w toku naraz, dostęp tylko dla admina i prowadzącego w trwającym spotkaniu. API Supabase
 * jest atrapą; reguły bazy sprawdza test SQL 150_play_setup. Każdy test przechodzi na 360 px
 * i na desktopie, w motywie jasnym i ciemnym.
 */

const NOW = new Date('2026-11-12T19:00:00Z');
const CLUB = { name: 'Planszówki', logo_path: null, timezone: 'Europe/Warsaw' };
const BEA = member(2, 'Bea', 'Bobrowska');
const CEZARY = member(3, 'Cezary', 'Cichy');
const DAREK = member(4, 'Darek', 'Usunięty', true);

const AZUL = mockGame(1, 'Azul');
const ZOLWIE = mockGame(2, 'Żółwie Wyścigi', { min_players: 1, max_players: 2 });
const BRZDEK = mockGame(3, 'Brzdęk');
const LAKA = mockGame(4, 'Łąka', { min_players: 4, max_players: 5 });
const GAMES = [AZUL, ZOLWIE, BRZDEK, LAKA];

function pad(n: number, gameId: string, name: string, slots: number): MockScorepad {
  const id = `00000000-0000-4000-d000-${n.toString(16).padStart(12, '0')}`;
  return {
    id,
    game_id: gameId,
    name,
    created_at: `2026-11-0${n}T12:00:00Z`,
    current: {
      id: `00000000-0000-4000-e000-${n.toString(16).padStart(12, '0')}`,
      version: 1,
      image_path: `${gameId}/${id}.png`,
      player_slots: slots,
      created_at: `2026-11-0${n}T12:00:00Z`,
    },
    template: {},
    image: Buffer.alloc(0),
  };
}

const AZUL_PAD = pad(1, AZUL.id, 'Azul podstawowy', 4);
const AZUL_SOLO = pad(2, AZUL.id, 'Pasjans', 1);
const ZOLWIE_PAD = pad(3, ZOLWIE.id, 'Wyścig', 4);
const LAKA_PAD = pad(4, LAKA.id, 'Łąka', 5);
const PADS = [AZUL_PAD, AZUL_SOLO, ZOLWIE_PAD, LAKA_PAD];

const RUNNING = mockMeeting(6, 'Czwartkowe granie', {
  status: 'in_progress',
  voting_open: false,
  starts_at: '2026-11-12T17:00:00Z',
  started_at: '2026-11-12T17:05:00Z',
  participants: [ADA.id, BEA.id, CEZARY.id, DAREK.id],
  host_id: BEA.id,
});

const DRAFT: MockPlay = {
  id: '00000000-0000-4000-f000-000000000001',
  meeting_id: RUNNING.id,
  status: 'draft',
  started_at: '2026-11-12T18:30:00Z',
  saved_at: null,
  game_id: AZUL.id,
  play_results: [
    { profile_id: BEA.id, is_win: null },
    { profile_id: CEZARY.id, is_win: null },
  ],
};

async function openApp(page: Page, options: MockOptions, path = `/?p=meeting/${RUNNING.id}`) {
  await page.clock.setFixedTime(NOW);
  const mock = await mockSupabase(page, {
    club: CLUB,
    members: [BEA, CEZARY, DAREK],
    games: GAMES.map((g) => ({ ...g })),
    scorepads: PADS,
    meetings: [{ ...RUNNING }],
    meetingGames: [{ meeting_id: RUNNING.id, game_id: ZOLWIE.id }],
    ...options,
  });
  await storeSession(page, session());
  await page.goto(path);
  return mock;
}

async function axe(page: Page) {
  const results = await new AxeBuilder({ page })
    .withTags(['wcag2a', 'wcag2aa', 'wcag21aa'])
    .analyze();
  return results.violations.map((v) => `${v.id}: ${v.nodes.map((n) => n.target).join(' | ')}`);
}

async function horizontalOverflow(page: Page): Promise<number> {
  return page.evaluate(
    () => document.documentElement.scrollWidth - document.documentElement.clientWidth,
  );
}

async function settled(page: Page) {
  await page.waitForFunction(() =>
    document.getAnimations().every((animation) => animation.playState !== 'running'),
  );
}

async function check(page: Page) {
  await settled(page);
  expect(await horizontalOverflow(page)).toBe(0);
  expect(await axe(page)).toEqual([]);
}

const search = (page: Page) => page.evaluate(() => decodeURIComponent(window.location.search));

test('admin: gra, notes i gracze; partia w toku obok drugiej (RUN-2, RUN-3, PAD-2, PAD-3)', async ({
  page,
}) => {
  const mock = await openApp(page, { plays: [DRAFT] });
  const meeting = page.getByRole('dialog', { name: 'Czwartkowe granie' });
  await meeting.getByRole('button', { name: 'Nowa partia' }).click();

  const wizard = page.getByRole('dialog', { name: 'Nowa partia' });
  await expect(wizard).toBeVisible();
  expect(await search(page)).toBe(`?p=meeting/${RUNNING.id}&p=meeting/${RUNNING.id}/plays/new`);
  const steps = wizard.getByRole('list', { name: 'Kroki nowej partii' });
  await expect(steps.getByRole('listitem')).toHaveText(['1. Gra', '2. Notes', '3. Gracze']);

  // Opublikowane przed resztą kolekcji (alfabetycznie).
  const published = wizard.getByRole('list', { name: 'Gramy w' });
  await expect(published.getByRole('listitem')).toHaveCount(1);
  await expect(published).toContainText('Żółwie Wyścigi');
  const others = wizard.getByRole('list', { name: 'Pozostałe gry' });
  await expect(others.getByRole('listitem')).toHaveText([/Azul/, /Brzdęk/, /Łąka/]);
  await expect(others.getByRole('listitem').nth(0)).toContainText('2–4 graczy · 2 notesy');

  // Bez notesu i przy za małej liczbie aktywnych uczestników: wyłączone z wyjaśnieniem.
  const brzdek = wizard.getByRole('radio', { name: /Brzdęk/ });
  await expect(brzdek).toBeDisabled();
  await expect(others.getByRole('listitem').nth(1)).toContainText('Brak notesu.');
  await expect(wizard.getByRole('radio', { name: /Łąka/ })).toBeDisabled();
  await expect(others.getByRole('listitem').nth(2)).toContainText(
    'Gra wymaga 4 graczy. Aktywni uczestnicy spotkania: 3.',
  );
  const next = wizard.getByRole('button', { name: 'Dalej' });
  await expect(next).toBeDisabled();
  await check(page);

  await wizard.getByText('Azul', { exact: true }).click();
  await next.click();

  // Notes z jednym miejscem nie pasuje do partii (min 2 graczy, Q2).
  await expect(steps.getByRole('listitem').nth(1)).toHaveText('2. Notes');
  const notes = wizard.getByRole('list', { name: 'Notesy gry Azul' });
  await expect(notes.getByRole('listitem')).toHaveCount(2);
  await expect(wizard.getByRole('radio', { name: /Pasjans/ })).toBeDisabled();
  await expect(notes.getByRole('listitem').nth(1)).toContainText(
    'Notes ma 1 miejsce, a gra wymaga 2 graczy.',
  );
  await expect(next).toBeDisabled();
  await wizard.getByText('Azul podstawowy', { exact: true }).click();
  await expect(notes.getByRole('listitem').nth(0)).toContainText('4 miejsca · wersja 1');
  await check(page);
  await next.click();

  // Gracze: miejsca notesu, uczestnicy bez usuniętego, każdy najwyżej raz.
  await expect(wizard.getByRole('heading', { name: 'Gracze i miejsca w notesie' })).toBeVisible();
  await expect(wizard.getByText('Zajęte 0 z 4 miejsc')).toBeVisible();
  const startButton = wizard.getByRole('button', { name: 'Rozpocznij', exact: true });
  await expect(startButton).toBeDisabled();
  await expect(wizard.getByText('Wybierz co najmniej 2 graczy.')).toBeVisible();

  await wizard.getByRole('button', { name: 'Miejsce 1: wybierz gracza' }).click();
  const picker = wizard.getByRole('list', { name: 'Gracz na miejscu 1' });
  await expect(picker.getByRole('button')).toHaveText([
    /Ada Adminowska$/,
    /Bea Bobrowska$/,
    /Cezary Cichy$/,
  ]);
  await check(page);
  await picker.getByRole('button', { name: 'Bea Bobrowska' }).click();
  await expect(picker).toHaveCount(0);
  const seat1 = wizard.getByRole('button', { name: 'Miejsce 1: Bea Bobrowska. Zmień gracza' });
  await expect(seat1).toBeFocused();
  await expect(seat1).toContainText('Bea Bobrowska');

  // „Poza partią”: posadzenie na pierwszym wolnym miejscu.
  const outside = wizard.getByRole('list', { name: 'Uczestnicy poza partią' });
  await expect(outside.getByRole('listitem')).toHaveCount(2);
  await outside
    .getByRole('button', { name: 'Posadź Cezary Cichy na pierwszym wolnym miejscu' })
    .click();
  await expect(wizard.getByText('Zajęte 2 z 4 miejsc')).toBeVisible();

  // Przesiadka: Bea na miejsce 4 zwalnia miejsce 1 (bez duplikatów).
  await wizard.getByRole('button', { name: 'Miejsce 4: wybierz gracza' }).click();
  const picker4 = wizard.getByRole('list', { name: 'Gracz na miejscu 4' });
  await expect(picker4.getByRole('button', { name: /Bea Bobrowska/ })).toContainText('Miejsce 1');
  await picker4.getByRole('button', { name: /Bea Bobrowska/ }).click();
  await expect(wizard.getByRole('button', { name: 'Miejsce 1: wybierz gracza' })).toBeVisible();
  await expect(wizard.getByText('Zajęte 2 z 4 miejsc')).toBeVisible();
  await expect(startButton).toBeEnabled();
  await check(page);

  // Powrót do kroku gry z pigułki zachowuje wybór; wybór tej samej gry nie czyści miejsc.
  await wizard.getByRole('button', { name: 'Gra: gotowe, wróć do kroku' }).click();
  await expect(wizard.getByRole('radio', { name: /^Azul/ })).toBeChecked();
  await next.click();
  await next.click();
  await expect(wizard.getByText('Zajęte 2 z 4 miejsc')).toBeVisible();

  await startButton.click();
  await expect(page.getByText('Partia rozpoczęta: Azul')).toBeVisible();
  await expect(wizard).toHaveCount(0);
  expect(mock.playStarts).toHaveLength(1);
  expect(mock.playStarts[0]).toMatchObject({
    meeting_id: RUNNING.id,
    scorepad_id: AZUL_PAD.id,
    player_ids: [null, CEZARY.id, null, BEA.id],
  });
  // Kreator ustępuje notesowi nowej partii (PAD-4); Wstecz wraca do spotkania.
  const playId = mock.playStarts[0]?.play_id ?? '';
  await expect(page.getByRole('dialog', { name: 'Azul' })).toBeVisible();
  expect(await search(page)).toBe(`?p=meeting/${RUNNING.id}&p=play/${playId}`);
  await page.getByRole('dialog', { name: 'Azul' }).getByRole('button', { name: 'Wróć' }).click();
  await expect(page.getByRole('dialog', { name: 'Azul' })).toHaveCount(0);
  // Dwie partie w toku w tym samym spotkaniu (RUN-3).
  await expect(meeting.getByText('2 w toku')).toBeVisible();
  await expect(
    meeting.getByRole('list', { name: 'Partie w toku' }).getByRole('listitem'),
  ).toHaveCount(2);
});

test('prowadzący: jeden notes pomija krok, limit graczy gry, błąd bazy (PAD-3, PAD-9)', async ({
  page,
}) => {
  const mock = await openApp(
    page,
    {
      profile: { ...ADA, role: 'player' },
      meetings: [{ ...RUNNING, host_id: ADA.id }],
      startPlayError: {
        code: '23514',
        hint: 'plays_player_participant',
        message: 'players must be active participants of the meeting',
      },
    },
    `/?p=meeting/${RUNNING.id}&p=meeting/${RUNNING.id}/plays/new`,
  );
  const wizard = page.getByRole('dialog', { name: 'Nowa partia' });
  // Gra opublikowana z jednym notesem: od razu krok graczy.
  await wizard.getByText('Żółwie Wyścigi', { exact: true }).click();
  await wizard.getByRole('button', { name: 'Dalej' }).click();
  const steps = wizard.getByRole('list', { name: 'Kroki nowej partii' });
  await expect(steps.getByRole('listitem').nth(2)).toHaveText('3. Gracze');
  // Pominięty krok „Notes” jest ukończony, ale bez przycisku powrotu.
  await expect(steps.getByText('Notes: gotowe, gra ma jeden notes')).toBeAttached();
  await expect(steps.getByRole('button')).toHaveAccessibleName('Gra: gotowe, wróć do kroku');
  await expect(wizard.getByText('Żółwie Wyścigi · Wyścig · 2 graczy')).toBeVisible();

  const outside = wizard.getByRole('list', { name: 'Uczestnicy poza partią' });
  await outside.getByRole('button', { name: /Ada Adminowska/ }).click();
  await outside.getByRole('button', { name: /Bea Bobrowska/ }).click();
  // Gra ma max 2 graczy, a notes 4 miejsca: kolejnego nie da się dodać.
  await expect(
    wizard.getByText('Partia ma już najwięcej graczy, na ilu pozwala gra.'),
  ).toBeVisible();
  await expect(outside.getByRole('button', { name: /Cezary Cichy/ })).toBeDisabled();
  await wizard.getByRole('button', { name: 'Miejsce 3: wybierz gracza' }).click();
  const picker = wizard.getByRole('list', { name: 'Gracz na miejscu 3' });
  await expect(picker.getByRole('button', { name: 'Cezary Cichy' })).toBeDisabled();
  // Esc zamyka listę, a nie kreator.
  await page.keyboard.press('Escape');
  await expect(picker).toHaveCount(0);
  await expect(wizard).toBeVisible();
  await check(page);

  // Zamiana gracza na zajętym miejscu jest dozwolona.
  await wizard.getByRole('button', { name: 'Miejsce 2: Bea Bobrowska. Zmień gracza' }).click();
  await wizard
    .getByRole('list', { name: 'Gracz na miejscu 2' })
    .getByRole('button', { name: 'Cezary Cichy' })
    .click();
  await expect(
    wizard.getByRole('button', { name: 'Miejsce 2: Cezary Cichy. Zmień gracza' }),
  ).toBeVisible();

  await wizard.getByRole('button', { name: 'Rozpocznij', exact: true }).click();
  await expect(
    wizard.getByText('Jeden z graczy nie jest już uczestnikiem spotkania. Odśwież listę.'),
  ).toBeVisible();
  expect(mock.playStarts[0]?.player_ids).toEqual([ADA.id, CEZARY.id, null, null]);
  await check(page);
});

test('gracz i spotkanie poza trwaniem: bez akcji, link pokazuje wyjaśnienie (PAD-9)', async ({
  page,
}) => {
  await openApp(page, { profile: { ...ADA, role: 'player' } });
  const meeting = page.getByRole('dialog', { name: 'Czwartkowe granie' });
  await expect(meeting.getByText('Trwa', { exact: true })).toBeVisible();
  await expect(meeting.getByRole('button', { name: 'Nowa partia' })).toHaveCount(0);

  await page.goto(`/?p=meeting/${RUNNING.id}/plays/new`);
  const wizard = page.getByRole('dialog', { name: 'Nowa partia' });
  await expect(
    wizard.getByText('Partię rozpoczyna administrator albo prowadzący spotkania.'),
  ).toBeVisible();
  await expect(wizard.getByRole('button', { name: 'Rozpocznij', exact: true })).toHaveCount(0);
  await check(page);

  const planned = mockMeeting(7, 'Sobotnie granie', { participants: [ADA.id, BEA.id] });
  await openApp(page, { meetings: [planned] }, `/?p=meeting/${planned.id}/plays/new`);
  await expect(
    page
      .getByRole('dialog', { name: 'Nowa partia' })
      .getByText('Partie można rozpoczynać tylko w trwającym spotkaniu.'),
  ).toBeVisible();
});

test('dodatki partii: krok „Dodatki”, notes dodatku, więcej graczy i punktacja (dodatki)', async ({
  page,
}) => {
  const TURBO = mockGame(7, 'Żółwie: Turbo', {
    base_game_id: ZOLWIE.id,
    min_players: 2,
    max_players: 4,
    complexity: 3,
  });
  const TURBO_PAD = pad(7, TURBO.id, 'Turbo', 4);
  const mock = await openApp(page, {
    games: [...GAMES, TURBO].map((g) => ({ ...g })),
    scorepads: [...PADS, TURBO_PAD],
  });
  const meeting = page.getByRole('dialog', { name: 'Czwartkowe granie' });
  await meeting.getByRole('button', { name: 'Nowa partia' }).click();
  const wizard = page.getByRole('dialog', { name: 'Nowa partia' });
  // Dodatku nie ma na liście gier.
  await expect(wizard.getByRole('radio', { name: /Turbo/ })).toHaveCount(0);
  await wizard.getByText('Żółwie Wyścigi', { exact: true }).click();
  const steps = wizard.getByRole('list', { name: 'Kroki nowej partii' });
  await expect(steps.getByRole('listitem')).toHaveText([
    '1. Gra',
    '2. Dodatki',
    '3. Notes',
    '4. Gracze',
  ]);
  const next = wizard.getByRole('button', { name: 'Dalej' });
  await next.click();

  const list = wizard.getByRole('list', { name: 'Dodatki gry Żółwie Wyścigi' });
  await expect(list.getByRole('listitem')).toHaveText([/Żółwie: Turbo.*2–4 graczy/]);
  await wizard.getByRole('checkbox', { name: /Żółwie: Turbo/ }).check();
  await check(page);
  await next.click();

  // Notesy gry i zaznaczonego dodatku.
  const notes = wizard.getByRole('list', { name: 'Notesy gry Żółwie Wyścigi' });
  await expect(notes.getByRole('listitem')).toHaveText([/^Wyścig/, /Turbo · Żółwie: Turbo/]);
  await wizard.getByText('Turbo · Żółwie: Turbo', { exact: true }).click();
  await next.click();

  // Dodatek rozszerza grę do 4 graczy; punktacja z wyżej skomplikowanego dodatku.
  await expect(
    wizard.getByText(/Żółwie Wyścigi z dodatkami: Żółwie: Turbo · Turbo · 2–4 graczy/),
  ).toBeVisible();
  const outside = wizard.getByRole('list', { name: 'Uczestnicy poza partią' });
  for (const name of ['Ada Adminowska', 'Bea Bobrowska', 'Cezary Cichy']) {
    await outside
      .getByRole('button', { name: `Posadź ${name} na pierwszym wolnym miejscu` })
      .click();
  }
  await expect(wizard.getByText('Zajęte 3 z 4 miejsc')).toBeVisible();
  await expect(wizard.getByText('Punktacja: Żółwie: Turbo')).toBeVisible();
  await check(page);
  await wizard.getByRole('button', { name: 'Rozpocznij', exact: true }).click();
  await expect(page.getByText('Partia rozpoczęta: Żółwie Wyścigi')).toBeVisible();
  expect(mock.playStarts[0]).toMatchObject({
    scorepad_id: TURBO_PAD.id,
    expansion_ids: [TURBO.id],
  });
  const play = page.getByRole('dialog', { name: 'Żółwie Wyścigi' });
  await play.getByRole('button', { name: 'Wróć' }).click();
  // Widok spotkania: partia w toku z dodatkami.
  await expect(
    meeting.getByRole('list', { name: 'Partie w toku' }).getByText('z dodatkami: Żółwie: Turbo'),
  ).toBeVisible();
});
