/** @jsxImportSource @solidjs/web */
import { captureArtifact, expectNoDiagnostics } from '@solidjs/diagnostics';
import { fireEvent, within } from '@solidjs/testing-library';
import { QueryClient } from '@tanstack/query-core';
import { flush } from 'solid-js';
import { describe, expect, it, vi } from 'vitest';
import type { AuthContextValue } from '../auth/authContext';
import type { OwnProfile } from '../auth/useOwnProfile';
import { SAMPLE_SCORE_PAD } from '../design-system/scorePadSample';
import { gameSearchKey, gamesKey, type Game } from '../games/games';
import { clubKey } from '../club/club';
import { format, t } from '../i18n';
import type { PopupApi, PopupLevel } from '../popups/popupContext';
import { allProfilesKey, type Profile } from '../profile/profileQueries';
import { scorepadsKey, type Scorepad } from '../score-pad/scorepads';
import { renderSolid } from '../solid/testing';
import { DeletePlayDialog } from './DeletePlayDialog';
import { DiscardPlayDialog } from './DiscardPlayDialog';
import { meetingKey, type Meeting } from './meetings';
import { NewPlayPopup } from './NewPlayPopup';
import type { PlaySummary } from './playSave';
import { PlayPopup } from './PlayPopup';
import { PlaySummaryDialog } from './PlaySummaryDialog';
import { meetingGamesKey } from './voting';

/*
 * Partie w Solid (etap 6c, docs/solidjs-2-migration.md): kreator nowej partii, notes partii,
 * podsumowanie oderwanej kartki i dialogi porzucenia oraz usunięcia. Zachowanie sprawdzają e2e
 * (`new-play.spec.ts`, `play-drafts.spec.ts`, `play-save.spec.ts`, `play-delete.spec.ts`,
 * `score-pad-entry.spec.ts`); tu bramka bez kodów diagnostyki Solid dla renderu i interakcji
 * (skill agent-loops, pętla 1). Dane są fikcyjne.
 */

const id = (group: string, n: number) =>
  `00000000-0000-4000-${group}-${String(n).padStart(12, '0')}`;

function person(n: number, first: string, role: 'admin' | 'member' = 'member'): OwnProfile {
  return {
    id: id('a000', n),
    hook: `${first.toLowerCase()}-a00${n}`,
    first_name: first,
    last_name: 'Testowa',
    role,
    avatar_path: null,
    deleted_at: null,
  } as OwnProfile;
}

const ADMIN = person(1, 'Ada', 'admin');
const BOB = person(2, 'Bob');
const CEL = person(3, 'Cela');
const PROFILES = new Map<string, Profile>([ADMIN, BOB, CEL].map((p) => [p.id, p]));

const AZUL: Game = {
  id: id('b000', 1),
  title: 'Azul',
  cover_path: null,
  min_players: 2,
  max_players: 4,
  placement_points: [10, 6, 4, 2],
  complexity: 2,
  created_at: '2026-10-01T12:00:00Z',
  last_played_at: null,
  base_game_id: null,
  cover_source_path: null,
  cover_crop: null,
  play_count: null,
  available: true,
};

const PAD: Scorepad = {
  id: id('c000', 1),
  game_id: AZUL.id,
  name: 'Podstawowy',
  created_at: '2026-10-02T12:00:00Z',
  current: {
    id: id('d000', 1),
    version: 1,
    image_path: null,
    player_slots: 4,
    created_at: '2026-10-02T12:00:00Z',
  },
} as Scorepad;

const MEETING: Meeting = {
  id: id('e000', 1),
  title: 'Wieczór',
  starts_at: '2026-11-26T17:00:00Z',
  status: 'in_progress',
  voting_open: false,
  date_voting_open: false,
  host_id: null,
  started_at: '2026-11-26T17:05:00Z',
  finished_at: null,
  participants: [ADMIN.id, BOB.id, CEL.id],
};

const PLAY_ID = id('f000', 1);

/** Wiersz `plays` z bazy (`playQuery`). */
function playRow(status: 'draft' | 'saved') {
  return {
    id: PLAY_ID,
    meeting_id: MEETING.id,
    status,
    started_at: '2026-11-26T17:10:00Z',
    sheet: null,
    draft_version: 0,
    draft_saved_at: null,
    draft_saved_by: null,
    points_snapshot: [10, 6, 4, 2],
    scorepad_version_id: PAD.current?.id,
    game_id: AZUL.id,
    games: { id: AZUL.id, title: AZUL.title, cover_path: null },
    scorepad_versions: { player_slots: 4, scorepads: { name: PAD.name } },
    play_results: [
      { profile_id: ADMIN.id, seat: 1 },
      { profile_id: BOB.id, seat: 2 },
    ],
  };
}

/** Łańcuch zapytań Supabase zwracający stały wynik. */
function chain(result: { data: unknown; error: null }) {
  const done = () => Promise.resolve(result);
  const query: Record<string, unknown> = {};
  for (const name of ['select', 'eq', 'is', 'not', 'order']) query[name] = () => query;
  for (const name of ['returns', 'maybeSingle', 'single']) query[name] = done;
  return query;
}

function host(play: 'draft' | 'saved' = 'draft') {
  const queryClient = new QueryClient({ defaultOptions: { queries: { staleTime: Infinity } } });
  queryClient.setQueryData(meetingKey(MEETING.id), MEETING);
  queryClient.setQueryData(gameSearchKey(''), [AZUL]);
  queryClient.setQueryData(meetingGamesKey(MEETING.id), []);
  queryClient.setQueryData([...scorepadsKey, 'active'], [PAD]);
  queryClient.setQueryData([...gamesKey, 'expansions', 'all'], []);
  queryClient.setQueryData(allProfilesKey, PROFILES);
  queryClient.setQueryData(clubKey, { name: 'Klub', logo_path: null, timezone: 'Europe/Warsaw' });
  const from = vi.fn((table: string) =>
    chain(
      table === 'plays'
        ? { data: playRow(play), error: null }
        : table === 'scorepad_versions'
          ? { data: { template: SAMPLE_SCORE_PAD.template, image_path: null }, error: null }
          : { data: [], error: null },
    ),
  );
  const rpc = vi.fn(() => Promise.resolve({ data: [], error: null }));
  const popups: PopupApi = {
    stack: [
      { kind: 'meeting', id: MEETING.id },
      { kind: 'play', id: PLAY_ID },
    ],
    open: vi.fn(),
    back: vi.fn(),
    backBy: vi.fn(),
    replace: vi.fn(),
    closeAll: vi.fn(),
    hrefFor: () => '/?p=x',
  };
  const popupLevel: PopupLevel = {
    level: 1,
    covered: false,
    onBack: vi.fn(),
    onClose: vi.fn(),
    onScrimClick: vi.fn(),
  };
  const auth = {
    client: { from, rpc, storage: { from: () => ({ remove: vi.fn() }) } },
    state: { status: 'signedIn', session: { user: { id: ADMIN.id } } },
    signOut: vi.fn(async () => undefined),
  } as unknown as AuthContextValue;
  return {
    queryClient,
    auth,
    popups,
    popupLevel,
    popupGuards: { set: vi.fn() },
    toast: { show: vi.fn(() => 1), dismiss: vi.fn() },
  };
}

const settle = async () => {
  await Promise.resolve();
  flush();
};

const newPlay = t.meetings.newPlay;
const playText = t.meetings.play;

describe('obszar Partie bez diagnostyki Solid', () => {
  it('kreator nowej partii: gra, pominięty notes, gracze na miejscach', async () => {
    const { artifact } = await captureArtifact(
      async () => {
        const popup = renderSolid(() => <NewPlayPopup meetingId={MEETING.id} me={ADMIN} />, host());
        await settle();
        const dialog = within(popup.container).getByRole('dialog');
        expect(dialog).toHaveTextContent('Azul');
        const next = within(dialog).getByRole('button', { name: newPlay.next });
        expect(next).toBeDisabled();
        fireEvent.click(within(dialog).getByRole('radio'));
        await settle();
        expect(next).toBeEnabled();
        fireEvent.click(next);
        await settle();
        // Jeden pasujący notes: od razu gracze.
        expect(dialog.querySelector('.step-pill--current')).toHaveTextContent(
          newPlay.steps.players,
        );
        const start = within(dialog).getByRole('button', { name: newPlay.start });
        expect(start).toBeDisabled();
        for (const name of ['Ada Testowa', 'Bob Testowa']) {
          fireEvent.click(
            within(dialog).getByRole('button', { name: format(newPlay.addToSeat, { name }) }),
          );
          await settle();
        }
        expect(start).toBeEnabled();
        const seat = within(dialog).getAllByRole('button', { expanded: false })[2] as HTMLElement;
        fireEvent.click(seat);
        await settle();
        expect(seat).toHaveAttribute('aria-expanded', 'true');
        fireEvent.keyDown(seat, { key: 'Escape' });
        await settle();
        expect(seat).toHaveAttribute('aria-expanded', 'false');
        // Zamknięta lista oddaje fokus polu miejsca.
        expect(seat).toHaveFocus();
        fireEvent.click(within(dialog).getByRole('button', { name: newPlay.back }));
        await settle();
        expect(within(dialog).getByRole('radio')).toBeChecked();
        popup.unmount();

        const blocked = renderSolid(() => <NewPlayPopup meetingId={MEETING.id} me={CEL} />, host());
        await settle();
        expect(blocked.container).toHaveTextContent(newPlay.notRunner);
        expect(blocked.container.querySelector('.modal__footer')).toBeNull();
        blocked.unmount();
      },
      { scenario: 'new-play' },
    );
    expectNoDiagnostics(artifact);
  });

  it('notes partii, „Trwa partia” i podsumowanie oderwanej kartki', async () => {
    const { artifact } = await captureArtifact(
      async () => {
        const pad = renderSolid(() => <PlayPopup id={PLAY_ID} me={ADMIN} />, host());
        await vi.waitFor(() =>
          expect(pad.container.querySelector('.play-pad__status')).not.toBeNull(),
        );
        const dialog = within(pad.container).getByRole('dialog');
        expect(dialog).toHaveTextContent('Azul');
        expect(dialog).toHaveClass('modal--1120');
        await vi.waitFor(() =>
          expect(pad.container.querySelector('.score-pad-view')).not.toBeNull(),
        );
        fireEvent.click(
          within(dialog).getByRole('button', {
            name: format(playText.discardLabel, { title: 'Azul' }),
          }),
        );
        await settle();
        pad.unmount();

        const live = renderSolid(() => <PlayPopup id={PLAY_ID} me={CEL} />, host());
        await vi.waitFor(() => expect(live.container).toHaveTextContent(playText.notRunner));
        expect(live.container).toHaveTextContent('Ada Testowa, Bob Testowa');
        live.unmount();

        const summary: PlaySummary = {
          rows: [
            {
              seat: 1,
              profileId: ADMIN.id,
              place: 1,
              tied: false,
              value: 50,
              points: 10,
              win: true,
            },
            {
              seat: 2,
              profileId: BOB.id,
              place: 2,
              tied: false,
              value: null,
              points: 6,
              win: false,
            },
          ],
          results: [],
          sheet: {} as PlaySummary['sheet'],
        };
        const onCancel = vi.fn();
        const onConfirm = vi.fn();
        const dialogs = renderSolid(
          () => (
            <PlaySummaryDialog
              title="Azul"
              playId={PLAY_ID}
              startedAt="2026-11-26T17:10:00Z"
              timeZone="Europe/Warsaw"
              summary={summary}
              profiles={PROFILES}
              saving={false}
              failure={null}
              onCancel={onCancel}
              onConfirm={onConfirm}
            />
          ),
          host(),
        );
        await settle();
        const card = within(dialogs.container).getByRole('dialog');
        expect(within(card).getAllByRole('listitem')).toHaveLength(2);
        expect(document.activeElement).toHaveTextContent(playText.summary.cancel);
        fireEvent.click(within(card).getByRole('button', { name: playText.summary.submit }));
        expect(onConfirm).toHaveBeenCalledWith(summary);
        fireEvent.keyDown(card, { key: 'Escape' });
        expect(onCancel).toHaveBeenCalled();
        dialogs.unmount();
      },
      { scenario: 'play-pad' },
    );
    expectNoDiagnostics(artifact);
  });

  it('porzucenie szkicu i usunięcie zapisanej partii', async () => {
    const { artifact } = await captureArtifact(
      async () => {
        const discard = renderSolid(() => <DiscardPlayDialog id={PLAY_ID} me={ADMIN} />, host());
        await vi.waitFor(() => expect(discard.container).toHaveTextContent('Azul'));
        expect(
          within(discard.container).getByRole('button', {
            name: playText.discardDialog.submit,
          }),
        ).toBeEnabled();
        discard.unmount();

        const remove = renderSolid(() => <DeletePlayDialog id={PLAY_ID} />, host('saved'));
        await vi.waitFor(() => expect(remove.container).toHaveTextContent('Azul'));
        expect(
          within(remove.container).getByRole('button', {
            name: t.meetings.plays.deleteDialog.submit,
          }),
        ).toBeEnabled();
        remove.unmount();

        // Szkic nie jest zapisaną partią: usunięcie z linku pokazuje „Nie znaleziono”.
        const invalid = renderSolid(() => <DeletePlayDialog id={PLAY_ID} />, host('draft'));
        await vi.waitFor(() =>
          expect(
            within(invalid.container).queryByRole('button', {
              name: t.meetings.plays.deleteDialog.submit,
            }),
          ).toBeNull(),
        );
        invalid.unmount();
      },
      { scenario: 'play-dialogs' },
    );
    expectNoDiagnostics(artifact);
  });
});
