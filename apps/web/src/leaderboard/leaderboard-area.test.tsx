import { captureArtifact, expectNoDiagnostics } from '@solidjs/diagnostics';
import { fireEvent, within } from '@solidjs/testing-library';
import { QueryClient } from '@tanstack/query-core';
import { flush } from 'solid-js';
import { describe, expect, it, vi } from 'vitest';
import type { AuthContextValue } from '../auth/authContext';
import { gameSearchKey } from '../games/games';
import { clubKey } from '../club/club';
import type { PopupApi, PopupLevel } from '../popups/popupContext';
import { allProfilesKey, type Profile } from '../profile/profileQueries';
import { renderWithProviders } from '../test/render';
import { NO_FILTERS } from './filters';
import { leaderboardKey, type LeaderboardEntry } from './leaderboard';
import { LeaderboardPopup } from './LeaderboardPopup';
import { RankingWidget } from './RankingWidget';
import { TiesPopup } from './TiesPopup';

/*
 * Obszar Ranking. Zachowanie w hubie sprawdzają
 * `src/hub/Hub.test.tsx` i e2e `leaderboard.spec.ts`; tu bramka bez kodów diagnostyki Solid dla
 * renderu i interakcji (skill agent-loops, pętla 1).
 */

const id = (n: number) => `00000000-0000-4000-a000-${String(n).padStart(12, '0')}`;

const ME: Profile = {
  id: id(1),
  hook: 'ada-testowa-a001',
  first_name: 'Ada',
  last_name: 'Testowa',
  role: 'player',
  avatar_path: null,
  deleted_at: null,
};

function entry(n: number, place: number, first: string, value: number): LeaderboardEntry {
  return {
    place,
    profile_id: id(n),
    first_name: first,
    last_name: 'Testowa',
    avatar_path: null,
    deleted: false,
    podium: place <= 3,
    value,
    tied: false,
    reached_meeting_id: n === 1 ? 'm1' : null,
    reached_meeting_title: n === 1 ? 'Wieczór' : null,
    reached_at: n === 1 ? '2026-03-05T18:00:00Z' : null,
    reached_points: n === 1 ? 12 : null,
    wins: n,
  };
}

const BOARD = [
  entry(1, 1, 'Ada', 12),
  entry(2, 2, 'Bea', 12),
  entry(3, 3, 'Cela', 8),
  entry(4, 4, 'Dora', 5),
  entry(5, 5, 'Ewa', 3),
];

function host() {
  const queryClient = new QueryClient({ defaultOptions: { queries: { staleTime: Infinity } } });
  queryClient.setQueryData(leaderboardKey('points', NO_FILTERS), BOARD);
  queryClient.setQueryData(leaderboardKey('wins', NO_FILTERS), BOARD);
  queryClient.setQueryData(
    allProfilesKey,
    new Map(
      BOARD.map((e) => [e.profile_id, { ...ME, id: e.profile_id, first_name: e.first_name }]),
    ),
  );
  queryClient.setQueryData(clubKey, { name: 'Klub', logo_path: null, timezone: 'Europe/Warsaw' });
  queryClient.setQueryData(gameSearchKey(''), [{ id: 'g1', title: 'Azul' }]);
  const rpc = vi.fn(async () => ({ data: BOARD, error: null }));
  const popups: PopupApi = {
    stack: [{ kind: 'leaderboard' }],
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
    client: { rpc },
    state: { status: 'signedIn', session: { user: { id: ME.id } } },
    signOut: vi.fn(async () => undefined),
  } as unknown as AuthContextValue;
  return { queryClient, auth, popups, popupLevel, popupGuards: { set: vi.fn() } };
}

const settle = async () => {
  await Promise.resolve();
  flush();
};

describe('obszar Ranking bez diagnostyki Solid', () => {
  it('widżet z zakładkami i filtrami, pełny ranking, remisy', async () => {
    const { artifact } = await captureArtifact(
      async () => {
        const widget = renderWithProviders(() => <RankingWidget me={ME} />, host());
        await settle();
        const card = widget.container;
        expect(within(card).getByRole('list', { name: 'Podium' })).toHaveTextContent('Ada');
        expect(within(card).getByRole('link', { name: /Remisy/ })).toBeInTheDocument();
        fireEvent.click(within(card).getByRole('tab', { name: 'Wygrane' }));
        await settle();
        expect(within(card).getByRole('tab', { name: 'Wygrane' })).toHaveAttribute(
          'aria-selected',
          'true',
        );
        fireEvent.click(within(card).getAllByRole('button', { name: /Gry:/ })[0] as HTMLElement);
        await settle();
        fireEvent.click(within(card).getByRole('option', { name: 'Azul' }));
        await settle();
        expect(within(card).getByRole('button', { name: /Wyczyść filtry/ })).toBeInTheDocument();
        widget.unmount();

        const popup = renderWithProviders(
          () => <LeaderboardPopup me={ME} tab="wins" filters={undefined} />,
          host(),
        );
        await settle();
        const dialog = within(popup.container).getByRole('dialog');
        expect(dialog).toHaveTextContent('Ewa');
        fireEvent.click(
          within(dialog).getAllByRole('button', { name: /Zakres dat/ })[0] as HTMLElement,
        );
        await settle();
        fireEvent.click(
          dialog.querySelector(
            '.range-calendar__day:not(.range-calendar__day--outside)',
          ) as HTMLElement,
        );
        await settle();
        popup.unmount();

        const ties = renderWithProviders(() => <TiesPopup me={ME} tab="points" />, host());
        await settle();
        expect(within(ties.container).getByRole('dialog')).toHaveTextContent('Wieczór');
        ties.unmount();
      },
      { scenario: 'leaderboard-area' },
    );
    expectNoDiagnostics(artifact);
  });
});
