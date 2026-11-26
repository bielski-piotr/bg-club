import { captureArtifact, expectNoDiagnostics } from '@solidjs/diagnostics';
import { fireEvent, screen, within } from '@solidjs/testing-library';
import { QueryClient } from '@tanstack/query-core';
import { flush } from 'solid-js';
import { describe, expect, it, vi } from 'vitest';
import type { AuthContextValue } from '../auth/authContext';
import type { PopupApi, PopupLevel } from '../popups/popupContext';
import type { Profile } from '../profile/profileQueries';
import { renderWithProviders } from '../test/render';
import { AppHeader } from './AppHeader';
import { clubKey, type Club } from './club';
import { ClubLogo } from './ClubLogo';
import { ClubPopup } from './ClubPopup';
import { FirstRun } from './FirstRun';

/*
 * Klub i nagłówek. Zachowanie w hubie sprawdza `src/hub/Hub.test.tsx`; tu bramka bez kodów diagnostyki
 * Solid dla renderu i interakcji (skill agent-loops, pętla 1).
 */

const ME: Profile = {
  id: '00000000-0000-4000-a000-000000000001',
  hook: 'ada',
  first_name: 'Ada',
  last_name: 'Testowa',
  role: 'admin',
  avatar_path: null,
  deleted_at: null,
};

const CLUB: Club = { name: 'Planszówki', logo_path: null, timezone: 'Europe/Warsaw' };

function host() {
  const queryClient = new QueryClient({ defaultOptions: { queries: { staleTime: Infinity } } });
  queryClient.setQueryData(clubKey, CLUB);
  const popups: PopupApi = {
    stack: [{ kind: 'club' }],
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
    client: {},
    signOut: vi.fn(async () => undefined),
    state: { status: 'signedIn', session: { user: { id: ME.id } } },
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

describe('obszar Klub bez diagnostyki Solid', () => {
  it('nagłówek, pierwsze uruchomienie, logo i formularz klubu', async () => {
    const { artifact } = await captureArtifact(
      async () => {
        const loading = renderWithProviders(() => <AppHeader club={undefined} me={ME} />, host());
        expect(within(loading.container).getByText('Ładowanie…')).toBeInTheDocument();
        loading.unmount();

        const bare = renderWithProviders(() => <AppHeader club="none" me={ME} />, host());
        expect(bare.container.querySelector('.app-header--bare')).toBeInTheDocument();
        bare.unmount();

        const shared = host();
        const header = renderWithProviders(() => <AppHeader club={CLUB} me={ME} />, shared);
        expect(
          within(header.container).getByRole('heading', { level: 1, name: 'Planszówki' }),
        ).toBeInTheDocument();
        fireEvent.click(screen.getByRole('button', { name: 'Edytuj klub' }));
        expect(shared.popups.open).toHaveBeenCalledWith({ kind: 'club' });
        fireEvent.click(screen.getByRole('button', { name: 'Twoje konto: Ada Testowa' }));
        await settle();
        fireEvent.click(screen.getByRole('menuitem', { name: 'Wyloguj się' }));
        await settle();
        expect(shared.auth.signOut).toHaveBeenCalled();
        header.unmount();

        const firstRun = renderWithProviders(() => <FirstRun isAdmin />, host());
        expect(firstRun.container.querySelector('.first-run__art')).toBeInTheDocument();
        expect(screen.getByRole('button', { name: 'Dodaj klub' })).toBeInTheDocument();
        firstRun.unmount();

        const logo = renderWithProviders(
          () => <ClubLogo name="Planszówki" src="/zly.png" size={36} />,
          host(),
        );
        const img = logo.container.querySelector('img');
        expect(img).toBeInTheDocument();
        fireEvent.error(img as HTMLImageElement);
        await settle();
        expect(logo.container.querySelector('img')).not.toBeInTheDocument();
        expect(logo.container).toHaveTextContent('P');
        logo.unmount();

        const popup = renderWithProviders(() => <ClubPopup />, host());
        const dialog = screen.getByRole('dialog', { name: 'Edytuj klub' });
        const name = within(dialog).getByLabelText('Nazwa klubu');
        expect(name).toHaveValue('Planszówki');
        fireEvent.input(name, { target: { value: '' } });
        fireEvent.click(within(dialog).getByRole('button', { name: 'Zapisz' }));
        await settle();
        expect(within(dialog).getByText('Wpisz nazwę klubu.')).toBeInTheDocument();
        fireEvent.click(within(dialog).getByRole('button', { name: /Strefa czasowa/ }));
        await settle();
        fireEvent.input(within(dialog).getByRole('combobox', { name: 'Szukaj strefy' }), {
          target: { value: 'new york' },
        });
        await settle();
        expect(within(dialog).getAllByRole('option')).toHaveLength(1);
        popup.unmount();
      },
      { scenario: 'club-area' },
    );
    expectNoDiagnostics(artifact);
  });
});
