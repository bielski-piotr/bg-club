import { captureArtifact, expectNoDiagnostics } from '@solidjs/diagnostics';
import { fireEvent, screen, within } from '@solidjs/testing-library';
import { QueryClient } from '@tanstack/query-core';
import { flush } from 'solid-js';
import { describe, expect, it, vi } from 'vitest';
import type { AuthContextValue } from '../auth/authContext';
import type { PopupApi, PopupLevel } from '../popups/popupContext';
import { membersKey, profileKey, type Profile } from '../profile/profileQueries';
import { renderWithProviders } from '../test/render';
import { AddMemberPopup } from './AddMemberPopup';
import { DeleteMemberDialog } from './DeleteMemberDialog';
import { MembersPopup } from './MembersPopup';
import { MembersWidget } from './MembersWidget';

/*
 * Obszar Członkowie. Zachowanie w hubie sprawdza `src/hub/Hub.test.tsx`; tu bramka bez kodów diagnostyki
 * Solid dla renderu i interakcji (skill agent-loops, pętla 1).
 */

const person = (n: number, role: Profile['role'] = 'player'): Profile => ({
  id: `00000000-0000-4000-a000-0000000000${String(n).padStart(2, '0')}`,
  hook: `gracz-${n}`,
  first_name: `Imię${n}`,
  last_name: `Nazwisko${n}`,
  role,
  avatar_path: null,
  deleted_at: null,
});

const ME = person(1, 'admin');
const MEMBERS = [ME, ...Array.from({ length: 29 }, (_, i) => person(i + 2))];

function host() {
  const queryClient = new QueryClient({ defaultOptions: { queries: { staleTime: Infinity } } });
  queryClient.setQueryData(membersKey, MEMBERS);
  queryClient.setQueryData(profileKey(MEMBERS[3]?.id ?? ''), MEMBERS[3]);
  const popups: PopupApi = {
    stack: [{ kind: 'members' }],
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
    client: { functions: { invoke: vi.fn() } },
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

describe('obszar Członkowie bez diagnostyki Solid', () => {
  it('widżet, lista z wyszukiwaniem i porcjami, formularz i dialog usuwania', async () => {
    const { artifact } = await captureArtifact(
      async () => {
        const widget = renderWithProviders(() => <MembersWidget me={ME} />, host());
        expect(within(widget.container).getByText('30 osób')).toBeInTheDocument();
        widget.unmount();

        const list = renderWithProviders(() => <MembersPopup isAdmin />, host());
        expect(within(list.container).getAllByRole('listitem')).toHaveLength(24);
        fireEvent.click(screen.getByRole('button', { name: 'Pokaż więcej (6)' }));
        await settle();
        expect(within(list.container).getAllByRole('listitem')).toHaveLength(30);
        fireEvent.input(screen.getByRole('searchbox'), { target: { value: 'nazwisko7' } });
        await settle();
        expect(within(list.container).getAllByRole('listitem')).toHaveLength(1);
        list.unmount();

        const form = renderWithProviders(() => <AddMemberPopup />, host());
        fireEvent.input(screen.getByLabelText('Imię'), { target: { value: 'Ola' } });
        fireEvent.click(screen.getByRole('button', { name: 'Dodaj członka' }));
        await settle();
        expect(screen.getByText('Wpisz nazwisko.')).toBeInTheDocument();
        form.unmount();

        const dialog = renderWithProviders(
          () => <DeleteMemberDialog id={MEMBERS[3]?.id ?? ''} />,
          host(),
        );
        expect(within(dialog.container).getByRole('dialog')).toHaveTextContent('Imię4 Nazwisko4');
        dialog.unmount();
      },
      { scenario: 'members-area' },
    );
    expectNoDiagnostics(artifact);
  });
});
