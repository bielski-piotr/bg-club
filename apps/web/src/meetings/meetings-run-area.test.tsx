/** @jsxImportSource @solidjs/web */
import { captureArtifact, expectNoDiagnostics } from '@solidjs/diagnostics';
import { fireEvent, within } from '@solidjs/testing-library';
import { QueryClient } from '@tanstack/query-core';
import { flush } from 'solid-js';
import { describe, expect, it, vi } from 'vitest';
import type { AuthContextValue } from '../auth/authContext';
import type { OwnProfile } from '../auth/useOwnProfile';
import { gameSearchKey, type Game } from '../games/games';
import { clubKey } from '../club/club';
import { format, t } from '../i18n';
import type { PopupApi, PopupLevel } from '../popups/popupContext';
import { allProfilesKey, membersKey, type Profile } from '../profile/profileQueries';
import { renderSolid } from '../solid/testing';
import { MeetingPopup } from './MeetingPopup';
import { MeetingWidget } from './MeetingWidget';
import { hubMeetingKey, meetingKey, type Meeting } from './meetings';
import { meetingOverviewKey } from './overview';
import { meetingPlaysKey, type MeetingPlay } from './plays';
import { PublishGamesPopup } from './PublishGamesPopup';
import { meetingRecordsKey } from './records';
import { FinishMeetingDialog, ReopenMeetingDialog, StartMeetingDialog } from './RunMeetingDialogs';
import { meetingSummaryKey, type SummaryEntry } from './summary';
import { meetingGamesKey, meetingVotesKey } from './voting';

// Sekcja terminów należy do innej części etapu 6; tu wystarczy pusta atrapa.
/*
 * Obszar Spotkanie i przebieg spotkania w Solid (etap 6b, docs/solidjs-2-migration.md).
 * Zachowanie sprawdzają e2e (`meetings.spec.ts`, `meeting-run.spec.ts`, `voting.spec.ts`,
 * `hub.spec.ts`); tu bramka bez kodów diagnostyki Solid dla renderu i interakcji (skill
 * agent-loops, pętla 1). Dane są fikcyjne.
 */

const id = (group: string, n: number) =>
  `00000000-0000-4000-${group}-${String(n).padStart(12, '0')}`;

const ME: OwnProfile = {
  id: id('a000', 1),
  hook: 'ada-testowa-a001',
  first_name: 'Ada',
  last_name: 'Testowa',
  role: 'admin',
  avatar_path: null,
  deleted_at: null,
  theme: 'system',
  password_change_suggested: false,
};
const BOB: Profile = {
  id: id('a000', 2),
  hook: 'bob-testowy-a002',
  first_name: 'Bob',
  last_name: 'Testowy',
  role: 'player',
  avatar_path: null,
  deleted_at: null,
};

function game(n: number, title: string, extra: Partial<Game> = {}): Game {
  return {
    id: id('b000', n),
    title,
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
    ...extra,
  };
}

const AZUL = game(1, 'Azul');
const ROOT = game(2, 'Root', { min_players: 5, max_players: 6 });
const GAMES = [AZUL, ROOT];

function meeting(n: number, extra: Partial<Meeting> = {}): Meeting {
  return {
    id: id('d000', n),
    title: `Wieczór ${n}`,
    starts_at: '2030-11-27T17:00:00Z',
    status: 'planned',
    voting_open: true,
    date_voting_open: false,
    host_id: BOB.id,
    started_at: null,
    finished_at: null,
    participants: [ME.id, BOB.id],
    ...extra,
  };
}

const VOTING = meeting(1);
const CHOSEN = meeting(2, { voting_open: false });
const LIVE = meeting(3, {
  status: 'in_progress',
  voting_open: false,
  started_at: '2026-11-26T17:00:00Z',
});
const DONE = meeting(4, {
  status: 'finished',
  voting_open: false,
  finished_at: '2026-11-20T22:00:00Z',
});

function play(n: number, status: MeetingPlay['status'], at: string): MeetingPlay {
  return {
    id: id('c000', n),
    status,
    started_at: at,
    saved_at: status === 'saved' ? at : null,
    started_by: ME.id,
    sheet_image_path: null,
    game: { id: AZUL.id, title: AZUL.title, cover_path: null },
    results: [
      { profile_id: ME.id, seat: 0, ranking_value: 80, place: 1, points: 10, is_win: true },
      { profile_id: BOB.id, seat: 1, ranking_value: 60, place: 2, points: 6, is_win: false },
    ],
    expansion_ids: [],
  };
}

const SAVED = play(1, 'saved', '2026-11-26T18:00:00Z');
const DRAFT = play(2, 'draft', '2026-11-26T19:00:00Z');

const SUMMARY: SummaryEntry[] = [
  {
    profile_id: ME.id,
    deleted: false,
    points: 10,
    games: [{ game_id: AZUL.id, title: AZUL.title, deleted: false, points: 10 }],
    total_before: 20,
    place_before: 2,
    total_after: 30,
    place_after: 1,
  },
];

/** Łańcuch zapytań Supabase: każde wywołanie zwraca łańcuch, `await` daje `{ data, error }`. */
function chain(data: unknown): unknown {
  const result = Promise.resolve({ data, error: null });
  return new Proxy(() => undefined, {
    get: (_, key) => (key === 'then' ? result.then.bind(result) : () => chain(data)),
    apply: () => chain(data),
  });
}

function host(hub: Meeting | null = VOTING) {
  const queryClient = new QueryClient({ defaultOptions: { queries: { staleTime: Infinity } } });
  queryClient.setQueryData(hubMeetingKey, hub);
  for (const each of [VOTING, CHOSEN, LIVE, DONE]) {
    queryClient.setQueryData(meetingKey(each.id), each);
    queryClient.setQueryData(meetingVotesKey(each.id), [
      { game_id: AZUL.id, profile_id: ME.id },
      { game_id: ROOT.id, profile_id: BOB.id },
    ]);
    queryClient.setQueryData(meetingGamesKey(each.id), [
      { id: AZUL.id, title: AZUL.title, cover_path: null, min_players: 2, max_players: 4 },
    ]);
    queryClient.setQueryData(meetingOverviewKey(each.id), { ...each, playCount: 1, winners: [] });
    queryClient.setQueryData(
      meetingRecordsKey(each.id),
      new Map([[SAVED.id, new Map([[ME.id, 'club']])]]),
    );
    queryClient.setQueryData(meetingSummaryKey(each.id), SUMMARY);
  }
  queryClient.setQueryData(meetingPlaysKey(LIVE.id), [SAVED, DRAFT]);
  queryClient.setQueryData(meetingPlaysKey(DONE.id), [SAVED]);
  queryClient.setQueryData(gameSearchKey(''), GAMES);
  queryClient.setQueryData(membersKey, [ME, BOB]);
  queryClient.setQueryData(
    allProfilesKey,
    new Map([
      [ME.id, ME],
      [BOB.id, BOB],
    ]),
  );
  queryClient.setQueryData(clubKey, { name: 'Klub', logo_path: null, timezone: 'Europe/Warsaw' });
  const tables: Record<string, unknown> = {
    plays: [
      {
        ...DRAFT,
        game_id: AZUL.id,
        games: DRAFT.game,
        play_results: DRAFT.results,
      },
    ],
  };
  const client = {
    from: (table: string) => chain(tables[table] ?? []),
    rpc: () => chain(null),
    storage: { from: () => chain(null) },
  };
  const popups: PopupApi = {
    stack: [{ kind: 'meeting', id: VOTING.id }],
    open: vi.fn(),
    back: vi.fn(),
    backBy: vi.fn(),
    replace: vi.fn(),
    closeAll: vi.fn(),
    hrefFor: () => '/?p=x',
  };
  const popupLevel: PopupLevel = {
    level: 0,
    covered: false,
    onBack: undefined,
    onClose: vi.fn(),
    onScrimClick: vi.fn(),
  };
  const auth = {
    client,
    state: { status: 'signedIn', session: { user: { id: ME.id } } },
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

describe('obszar Spotkanie bez diagnostyki Solid', () => {
  it('widżet w każdym stanie, menu i odliczanie', async () => {
    const { artifact } = await captureArtifact(
      async () => {
        const voting = renderSolid(() => <MeetingWidget me={ME} />, host(VOTING));
        await settle();
        const card = within(voting.container);
        expect(card.getByRole('button', { name: VOTING.title })).toBeInTheDocument();
        expect(card.getByRole('list', { name: t.hub.meeting.topVotesLabel })).toBeInTheDocument();
        fireEvent.click(
          card.getByRole('button', {
            name: format(t.hub.meeting.actions, { title: VOTING.title }),
          }),
        );
        await settle();
        fireEvent.click(card.getByRole('menuitem', { name: t.meetings.menu.plan }));
        await settle();
        voting.unmount();

        const chosen = renderSolid(() => <MeetingWidget me={ME} />, host(CHOSEN));
        await settle();
        expect(within(chosen.container).getByText(AZUL.title)).toBeInTheDocument();
        chosen.unmount();

        const live = renderSolid(() => <MeetingWidget me={ME} />, host(LIVE));
        await settle();
        expect(within(live.container).getByText(t.hub.meeting.live)).toBeInTheDocument();
        const playsTray = within(live.container).getByRole('list', {
          name: t.hub.meeting.playsLabel,
        });
        expect(within(playsTray).getAllByRole('listitem')).toHaveLength(2);
        live.unmount();

        const empty = renderSolid(() => <MeetingWidget me={ME} />, host(null));
        await settle();
        fireEvent.click(within(empty.container).getByRole('button', { name: t.hub.meeting.plan }));
        empty.unmount();
      },
      { scenario: 'meeting-widget' },
    );
    expectNoDiagnostics(artifact);
  });

  it('popup spotkania: głosowanie, lista gier, partie i podsumowanie', async () => {
    const { artifact } = await captureArtifact(
      async () => {
        const voting = renderSolid(() => <MeetingPopup id={VOTING.id} me={ME} />, host());
        await settle();
        const view = within(voting.container).getByRole('dialog');
        expect(view).toHaveTextContent(VOTING.title);
        fireEvent.input(within(view).getByRole('searchbox'), { target: { value: 'ro' } });
        await vi.waitFor(() =>
          expect(
            within(view).queryByRole('button', {
              name: format(t.meetings.voting.voteOff, { title: AZUL.title }),
            }),
          ).toBeNull(),
        );
        const toggle = within(view).getByRole('button', {
          name: format(t.meetings.voting.voteOn, { title: ROOT.title }),
        });
        fireEvent.click(toggle);
        await settle();
        expect(toggle).toHaveAttribute('aria-pressed', 'true');
        fireEvent.click(within(view).getByRole('button', { name: t.meetings.view.actions }));
        await settle();
        expect(within(view).getAllByRole('menuitem').length).toBeGreaterThan(0);
        voting.unmount();

        const chosen = renderSolid(() => <MeetingPopup id={CHOSEN.id} me={ME} />, host());
        await settle();
        expect(
          within(chosen.container).getByRole('list', { name: t.meetings.voting.playingLabel }),
        ).toBeInTheDocument();
        chosen.unmount();

        const live = renderSolid(() => <MeetingPopup id={LIVE.id} me={ME} />, host());
        await settle();
        const run = within(live.container).getByRole('dialog');
        expect(
          within(run).getByRole('list', { name: t.meetings.plays.liveLabel }),
        ).toBeInTheDocument();
        expect(
          within(run).getByRole('table', { name: t.meetings.summary.label }),
        ).toBeInTheDocument();
        fireEvent.click(
          within(run).getAllByRole('button', { name: new RegExp(AZUL.title) })[0] as HTMLElement,
        );
        live.unmount();

        const done = renderSolid(() => <MeetingPopup id={DONE.id} me={ME} />, host());
        await settle();
        expect(within(done.container).getByRole('dialog')).toHaveTextContent(
          t.meetings.status.finished,
        );
        done.unmount();

        const missing = renderSolid(() => <MeetingPopup id={id('d000', 99)} me={ME} />, host());
        await settle();
        missing.unmount();
      },
      { scenario: 'meeting-popup' },
    );
    expectNoDiagnostics(artifact);
  });

  it('publikacja gier i dialogi przebiegu', async () => {
    const { artifact } = await captureArtifact(
      async () => {
        const publish = renderSolid(() => <PublishGamesPopup id={VOTING.id} me={ME} />, host());
        await settle();
        const form = within(publish.container).getByRole('dialog');
        const boxes = within(form).getAllByRole('checkbox');
        expect(boxes[0]).toBeChecked();
        fireEvent.click(boxes[1] as HTMLElement);
        await settle();
        expect(within(form).getAllByRole('checkbox')[1]).toBeChecked();
        fireEvent.input(within(form).getByRole('searchbox'), { target: { value: 'zzz' } });
        await settle();
        expect(within(form).queryAllByRole('checkbox')).toHaveLength(0);
        fireEvent.click(within(form).getByRole('button', { name: t.meetings.publish.submit }));
        await settle();
        publish.unmount();

        const start = renderSolid(() => <StartMeetingDialog id={VOTING.id} me={ME} />, host());
        await settle();
        expect(within(start.container).getByRole('dialog')).toHaveTextContent(
          t.meetings.run.startTitle,
        );
        fireEvent.click(
          within(start.container).getByRole('button', { name: t.meetings.run.confirmStart }),
        );
        await settle();
        start.unmount();

        const finish = renderSolid(() => <FinishMeetingDialog id={LIVE.id} me={ME} />, host());
        await settle();
        await vi.waitFor(() =>
          expect(within(finish.container).getByRole('dialog')).toHaveTextContent(
            t.meetings.run.draftsTitle,
          ),
        );
        finish.unmount();

        const reopen = renderSolid(() => <ReopenMeetingDialog id={DONE.id} />, host());
        await settle();
        expect(within(reopen.container).getByRole('dialog')).toHaveTextContent(
          t.meetings.run.reopenTitle,
        );
        reopen.unmount();
      },
      { scenario: 'meeting-run' },
    );
    expectNoDiagnostics(artifact);
  });
});
