/** @jsxImportSource @solidjs/web */
import { captureArtifact, expectNoDiagnostics } from '@solidjs/diagnostics';
import { fireEvent, screen, within } from '@solidjs/testing-library';
import { QueryClient } from '@tanstack/query-core';
import { flush } from 'solid-js';
import { describe, expect, it, vi } from 'vitest';
import type { AuthContextValue } from '../auth/authContext';
import type { OwnProfile } from '../auth/useOwnProfile';
import { gameSearchKey } from '../games/games';
import { clubKey } from '../club/club';
import { NO_FILTERS } from '../leaderboard/filters';
import type { PopupApi, PopupLevel } from '../popups/popupContext';
import { renderSolid } from '../solid/testing';
import { DeleteAccountDialog } from './DeleteAccountDialog';
import { PasswordPopup } from './PasswordPopup';
import { playerRecordsKey, type PlayerRecord } from './playerRecordsData';
import { playerStatsKey, type PlayerStats } from './playerStatsData';
import { profileKey } from './profileQueries';
import { ProfilePopup } from './ProfilePopup';
import { SettingsPopup } from './SettingsPopup';

/*
 * Obszar Profil w Solid (etap 3, docs/solidjs-2-migration.md). Zachowanie w hubie sprawdzają
 * `src/hub/Hub.test.tsx` i `src/hub/ProfileSettings.test.tsx`; tu bramka bez kodów diagnostyki
 * Solid dla renderu i interakcji (skill agent-loops, pętla 1).
 */

const ME: OwnProfile = {
  id: '00000000-0000-4000-a000-000000000001',
  hook: 'ada-testowa-a001',
  first_name: 'Ada',
  last_name: 'Testowa',
  role: 'player',
  avatar_path: null,
  deleted_at: null,
  theme: 'system',
  password_change_suggested: false,
};

const STATS: PlayerStats = {
  meetings: 3,
  plays: 7,
  wins: 2,
  points: 41,
  wins_total: 2,
  streak_record: 2,
  streak_current: 1,
  places: { points: 2, wins: null },
  favorite_game: { game_id: 'g1', title: 'Azul', cover_path: null, plays: 4, wins: 1 },
  best_game: null,
  recent_meetings: [
    {
      meeting_id: 'm1',
      title: 'Wieczór',
      starts_at: '2026-03-05T18:00:00Z',
      plays: 3,
      wins: 1,
      points: 12,
    },
  ],
};

const RECORDS: PlayerRecord[] = [
  {
    game_id: 'g1',
    title: 'Azul',
    cover_path: null,
    game_deleted: false,
    dir: 'desc',
    value: 87,
    play_id: 'p1',
    meeting_id: 'm1',
    meeting_title: 'Wieczór',
    starts_at: '2026-03-05T18:00:00Z',
    club_record: true,
    expansions: [{ id: 'e1', title: 'Witraże' }],
  },
];

function host() {
  const queryClient = new QueryClient({ defaultOptions: { queries: { staleTime: Infinity } } });
  queryClient.setQueryData(profileKey(ME.id), ME);
  queryClient.setQueryData(playerStatsKey(ME.id, NO_FILTERS), STATS);
  queryClient.setQueryData(playerRecordsKey(ME.id, NO_FILTERS), RECORDS);
  queryClient.setQueryData(clubKey, { name: 'Klub', logo_path: null, timezone: 'Europe/Warsaw' });
  queryClient.setQueryData(gameSearchKey(''), [{ id: 'g1', title: 'Azul' }]);
  const rpc = vi.fn(async (name: string) => ({
    data: name === 'player_stats' ? STATS : RECORDS,
    error: null,
  }));
  const from = vi.fn(() => ({ update: () => ({ eq: async () => ({ error: null }) }) }));
  const popups: PopupApi = {
    stack: [{ kind: 'profile', id: ME.id }],
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
    client: { rpc, from, auth: { updateUser: vi.fn(async () => ({ data: {}, error: null })) } },
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

describe('obszar Profil bez diagnostyki Solid', () => {
  it('profil ze statystykami, rekordami i filtrami, ustawienia, hasło, usunięcie konta', async () => {
    const { artifact } = await captureArtifact(
      async () => {
        const profile = renderSolid(() => <ProfilePopup id={ME.id} isAdmin={false} />, host());
        const dialog = within(profile.container).getByRole('dialog');
        expect(dialog).toHaveTextContent('Ada Testowa');
        expect(dialog).toHaveTextContent('Wieczór');
        expect(dialog).toHaveTextContent('Witraże');
        // Filtry: kalendarz (wybór dnia) i lista gier w obu sekcjach.
        const dates = within(dialog).getAllByRole('button', { name: /Zakres dat/ })[0];
        fireEvent.click(dates as HTMLElement);
        await settle();
        // Bez filtrów kalendarz pokazuje bieżący miesiąc: pierwszy dzień z tego miesiąca.
        fireEvent.click(
          dialog.querySelector(
            '.range-calendar__day:not(.range-calendar__day--outside)',
          ) as HTMLElement,
        );
        await settle();
        fireEvent.keyDown(within(dialog).getByRole('dialog', { name: 'Zakres dat' }), {
          key: 'Escape',
        });
        await settle();
        fireEvent.click(within(dialog).getAllByRole('button', { name: /Gry:/ })[1] as HTMLElement);
        await settle();
        fireEvent.click(within(dialog).getByRole('option', { name: 'Azul' }));
        await settle();
        profile.unmount();

        const settings = renderSolid(() => <SettingsPopup me={ME} />, host());
        fireEvent.input(within(settings.container).getByLabelText('Imię'), {
          target: { value: 'Adela' },
        });
        fireEvent.click(within(settings.container).getByRole('radio', { name: 'Ciemny' }));
        await settle();
        expect(within(settings.container).getByLabelText('Imię')).toHaveValue('Adela');
        settings.unmount();

        const password = renderSolid(() => <PasswordPopup me={ME} variant="first" />, host());
        fireEvent.click(screen.getByRole('button', { name: 'Zmień hasło' }));
        await settle();
        expect(screen.getByText('Wpisz obecne hasło.')).toBeInTheDocument();
        password.unmount();

        const remove = renderSolid(() => <DeleteAccountDialog me={ME} />, host());
        fireEvent.input(screen.getByLabelText('Hasło'), { target: { value: 'tajne' } });
        await settle();
        remove.unmount();
      },
      { scenario: 'profile-area' },
    );
    expectNoDiagnostics(artifact);
  });
});
