/** @jsxImportSource @solidjs/web */
import { captureArtifact, expectNoDiagnostics } from '@solidjs/diagnostics';
import { QueryClient } from '@tanstack/query-core';
import { describe, expect, it, vi } from 'vitest';
import type { PopupApi, PopupLevel } from '../popups/popupContext';
import type { PopupRoute } from '../popups/routes';
import { CachedValue, Echo, StackPopup } from './__tests__/fixtures';
import { mountIsland } from './island';

function popups(stack: readonly PopupRoute[]): PopupApi {
  return {
    stack,
    open: vi.fn(),
    back: vi.fn(),
    backBy: vi.fn(),
    replace: vi.fn(),
    closeAll: vi.fn(),
    hrefFor: () => '/',
  };
}

function level(covered: boolean): PopupLevel {
  return { level: 0, covered, onBack: undefined, onClose: vi.fn(), onScrimClick: vi.fn() };
}

// Pętla „generation” z `@solidjs/diagnostics` (skill agent-loops): mostek nie może wywoływać
// kodów diagnostyki Solid, bo każda wyspa by je dziedziczyła.
describe('mountIsland bez diagnostyki Solid', () => {
  it('montowanie, aktualizacja propsów i kontekstów, odmontowanie', async () => {
    const element = document.createElement('div');
    document.body.append(element);
    const queryClient = new QueryClient();
    queryClient.setQueryData(['k'], 'wartość');

    const { artifact } = await captureArtifact(
      () => {
        const popup = mountIsland(
          element,
          StackPopup,
          { title: 'members' },
          {
            queryClient,
            popups: popups([{ kind: 'members' }]),
            popupLevel: level(false),
          },
        );
        popup.update(
          { title: 'members' },
          {
            queryClient,
            popups: popups([{ kind: 'members' }, { kind: 'settings' }]),
            popupLevel: level(true),
          },
        );
        expect(element.querySelector('[inert]')).not.toBeNull();
        expect(element).toHaveTextContent('Popupów: 2');
        popup.dispose();

        const echo = mountIsland(element, Echo, { label: 'a', count: 1 }, { queryClient });
        echo.update({ label: 'b', count: 2 }, { queryClient });
        expect(element).toHaveTextContent('b: 2');
        echo.dispose();

        const cached = mountIsland(element, CachedValue, { queryKey: 'k' }, { queryClient });
        expect(element).toHaveTextContent('wartość');
        cached.dispose();
      },
      { scenario: 'solid-island' },
    );
    expectNoDiagnostics(artifact);
    element.remove();
  });
});
