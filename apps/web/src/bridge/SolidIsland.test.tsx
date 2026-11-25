import { QueryClient, QueryClientProvider, useQuery } from '@tanstack/react-query';
import { act, fireEvent, render, screen, waitFor } from '@testing-library/react';
import { useState } from 'react';
import { describe, expect, it, vi } from 'vitest';
import { PopupHost } from '../popups/PopupHost';
import { PopupLink } from '../popups/PopupLink';
import { PopupRouter } from '../popups/PopupRouter';
import { CachedValue, Echo, LocalCounter, StackPopup } from '../solid/__tests__/fixtures';
import { SolidIsland } from './SolidIsland';

function popstate() {
  return new Promise((resolve) => window.addEventListener('popstate', resolve, { once: true }));
}

describe('SolidIsland', () => {
  it('przekazuje propsy z Reacta bez ponownego montowania i od razu aktualizuje DOM', () => {
    const onMount = vi.fn();
    function Host() {
      const [count, setCount] = useState(0);
      return (
        <>
          <button type="button" onClick={() => setCount((n) => n + 1)}>
            Więcej
          </button>
          <SolidIsland component={Echo} props={{ label: 'Licznik', count, onMount }} />
        </>
      );
    }
    render(<Host />);
    expect(screen.getByTestId('echo')).toHaveTextContent('Licznik: 0');
    fireEvent.click(screen.getByRole('button', { name: 'Więcej' }));
    // Bez `waitFor`: wyspa dostaje propsy w fazie layoutu Reacta.
    expect(screen.getByTestId('echo')).toHaveTextContent('Licznik: 1');
    fireEvent.click(screen.getByRole('button', { name: 'Więcej' }));
    expect(screen.getByTestId('echo')).toHaveTextContent('Licznik: 2');
    expect(onMount).toHaveBeenCalledTimes(1);
  });

  it('zachowuje stan Solid przy nowych propsach', async () => {
    function Host() {
      const [label, setLabel] = useState('Kliknięcia');
      return (
        <>
          <button type="button" onClick={() => setLabel('Razem')}>
            Zmień etykietę
          </button>
          <SolidIsland component={LocalCounter} props={{ label }} />
        </>
      );
    }
    render(<Host />);
    // Zmiana sygnału w Solid trafia do DOM w mikrozadaniu, stąd `findBy…`.
    fireEvent.click(screen.getByRole('button', { name: 'Kliknięcia 0' }));
    fireEvent.click(await screen.findByRole('button', { name: 'Kliknięcia 1' }));
    await screen.findByRole('button', { name: 'Kliknięcia 2' });
    fireEvent.click(screen.getByRole('button', { name: 'Zmień etykietę' }));
    expect(screen.getByRole('button', { name: 'Razem 2' })).toBeInTheDocument();
  });

  it('odmontowanie w React usuwa wyspę i uruchamia jej sprzątanie', () => {
    const onDispose = vi.fn();
    const { container, unmount } = render(
      <SolidIsland
        component={Echo}
        props={{ label: 'x', count: 1, onDispose }}
        className="hub__slot-content"
      />,
    );
    expect(container.querySelector('.hub__slot-content')).toContainElement(
      screen.getByTestId('echo'),
    );
    unmount();
    expect(onDispose).toHaveBeenCalledTimes(1);
    expect(screen.queryByTestId('echo')).not.toBeInTheDocument();
  });

  it('dzieli cache zapytań z Reactem', async () => {
    const client = new QueryClient();
    client.setQueryData(['shared'], 'z cache');
    function ReactValue() {
      const query = useQuery({
        queryKey: ['shared'],
        queryFn: () => 'z sieci',
        staleTime: Infinity,
      });
      return <p data-testid="react-value">{query.data}</p>;
    }
    render(
      <QueryClientProvider client={client}>
        <ReactValue />
        <SolidIsland component={CachedValue} props={{ queryKey: 'shared' }} />
      </QueryClientProvider>,
    );
    expect(screen.getByTestId('solid-value')).toHaveTextContent('z cache');
    act(() => client.setQueryData(['shared'], 'po zapisie'));
    // Obie strony dostają powiadomienie z `notifyManager` (setTimeout 0).
    await waitFor(() => expect(screen.getByTestId('react-value')).toHaveTextContent('po zapisie'));
    await waitFor(() => expect(screen.getByTestId('solid-value')).toHaveTextContent('po zapisie'));
  });

  describe('popup Solid na stosie Reacta', () => {
    function renderStack() {
      return render(
        <PopupRouter>
          <PopupHost
            renderPopup={(route) => (
              <SolidIsland component={StackPopup} props={{ title: route.kind }} />
            )}
            fallbackFocusId="main"
          >
            <main id="main" tabIndex={-1}>
              <PopupLink to={{ kind: 'members' }}>Członkowie klubu</PopupLink>
            </main>
          </PopupHost>
        </PopupRouter>,
      );
    }
    const dialog = (name: string) => screen.getByRole('dialog', { name, hidden: true });

    it('dostaje fokus, przykrycie i stos z adresu, a po zamknięciu oddaje fokus', async () => {
      renderStack();
      const trigger = screen.getByRole('link', { name: 'Członkowie klubu' });
      trigger.focus();
      fireEvent.click(trigger);
      expect(dialog('members')).toHaveFocus();
      expect(dialog('members')).toHaveTextContent('Popupów: 1');
      expect(screen.getByRole('main', { hidden: true }).closest('[inert]')).not.toBeNull();

      // Otwarcie z wnętrza wyspy przez `usePopups` Reacta.
      const settings = screen.getByRole('button', { name: 'Ustawienia' });
      settings.focus();
      fireEvent.click(settings);
      expect(window.location.search).toBe('?p=members&p=settings');
      expect(dialog('settings')).toHaveFocus();
      // Niższa wyspa dostaje `covered` reaktywnie i jest wyłączona.
      expect(dialog('members').closest('[inert]')).not.toBeNull();
      expect(dialog('members')).toHaveTextContent('Popupów: 2');

      // Esc obsługuje `PopupHost`: fokus wraca do przycisku w wyspie, która otworzyła popup.
      await act(async () => {
        fireEvent.keyDown(document.activeElement ?? document.body, { key: 'Escape' });
        await popstate();
      });
      expect(window.location.search).toBe('?p=members');
      expect(screen.queryByRole('dialog', { name: 'settings' })).not.toBeInTheDocument();
      expect(dialog('members').closest('[inert]')).toBeNull();
      expect(screen.getByRole('button', { name: 'Ustawienia' })).toHaveFocus();
      expect(dialog('members')).toHaveTextContent('Popupów: 1');

      // `back` z wyspy zamyka ostatni popup; fokus wraca do linku w hubie.
      await act(async () => {
        fireEvent.click(screen.getByRole('button', { name: 'Wróć' }));
        await popstate();
      });
      expect(window.location.search).toBe('');
      expect(screen.queryByRole('dialog')).not.toBeInTheDocument();
      expect(screen.getByRole('link', { name: 'Członkowie klubu' })).toHaveFocus();
    });
  });
});
