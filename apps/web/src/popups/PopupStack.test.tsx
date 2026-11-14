import { act, fireEvent, render, screen, waitFor, within } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';
import { PopupLink } from './PopupLink';
import { PopupHost } from './PopupHost';
import { PopupModal } from './PopupModal';
import { PopupRouter } from './PopupRouter';
import type { PopupRoute } from './routes';
import { useLeaveGuard } from './useLeaveGuard';
import { useState } from 'react';

const ID = '00000000-0000-4000-a000-000000000002';

/** Proste popupy testowe: lista z linkiem do profilu i profil z polem tekstowym. */
function TestPopup({ route }: { readonly route: PopupRoute }) {
  if (route.kind === 'members') {
    return (
      <PopupModal title="Członkowie">
        <PopupLink to={{ kind: 'profile', id: ID }}>Ania</PopupLink>
      </PopupModal>
    );
  }
  if (route.kind === 'profile') return <GuardedProfile />;
  return (
    <PopupModal title="Nie znaleziono">{route.kind === 'invalid' ? route.raw : null}</PopupModal>
  );
}

/** Profil z ochroną: przy zaznaczonym „Zmiany” zamknięcie pyta o potwierdzenie. */
function GuardedProfile() {
  const [dirty, setDirty] = useState(false);
  const [pending, setPending] = useState<(() => void) | null>(null);
  useLeaveGuard(dirty ? (leave) => setPending(() => leave) : null);
  return (
    <PopupModal title="Profil">
      <label>
        Notatka <input />
      </label>
      <label>
        Zmiany <input type="checkbox" checked={dirty} onChange={() => setDirty(!dirty)} />
      </label>
      {pending ? (
        <button type="button" onClick={pending}>
          Odrzuć zmiany
        </button>
      ) : null}
    </PopupModal>
  );
}

function renderStack() {
  return render(
    <PopupRouter>
      <PopupHost renderPopup={(route) => <TestPopup route={route} />} fallbackFocusId="main">
        <main id="main" tabIndex={-1}>
          <PopupLink to={{ kind: 'members' }}>Członkowie klubu</PopupLink>
        </main>
      </PopupHost>
    </PopupRouter>,
  );
}

const dialog = (name: string) => screen.getByRole('dialog', { name });

async function goBack() {
  await act(async () => {
    window.history.back();
    await new Promise((resolve) => window.addEventListener('popstate', resolve, { once: true }));
  });
}

describe('stos popupów', () => {
  it('otwiera popupy jeden na drugim i zapisuje je w adresie', () => {
    renderStack();
    const trigger = screen.getByRole('link', { name: 'Członkowie klubu' });
    expect(trigger).toHaveAttribute('href', '/?p=members');

    fireEvent.click(trigger);
    expect(window.location.search).toBe('?p=members');
    expect(dialog('Członkowie')).toHaveFocus();
    expect(screen.getByRole('main', { hidden: true }).closest('[inert]')).not.toBeNull();

    fireEvent.click(screen.getByRole('link', { name: 'Ania' }));
    expect(window.location.search).toBe(`?p=members&p=profile/${ID}`);
    expect(dialog('Profil')).toHaveFocus();
    // Niższy popup zostaje zamontowany, ale jest przykryty i wyłączony.
    expect(
      screen.getByRole('dialog', { name: 'Członkowie', hidden: true }).closest('[inert]'),
    ).not.toBeNull();
    expect(screen.getByRole('button', { name: 'Wróć' })).toBeInTheDocument();
  });

  it('Wstecz w przeglądarce zamyka górny popup i oddaje fokus otwierającemu', async () => {
    renderStack();
    fireEvent.click(screen.getByRole('link', { name: 'Członkowie klubu' }));
    const ania = screen.getByRole('link', { name: 'Ania' });
    ania.focus();
    fireEvent.click(ania);

    await goBack();
    expect(window.location.search).toBe('?p=members');
    expect(screen.queryByRole('dialog', { name: 'Profil' })).not.toBeInTheDocument();
    expect(screen.getByRole('link', { name: 'Ania' })).toHaveFocus();

    await act(async () => {
      window.history.forward();
      await new Promise((resolve) => window.addEventListener('popstate', resolve, { once: true }));
    });
    expect(dialog('Profil')).toBeInTheDocument();
  });

  it('Esc zamyka górny popup, × zamyka cały stos', async () => {
    renderStack();
    const trigger = screen.getByRole('link', { name: 'Członkowie klubu' });
    trigger.focus();
    fireEvent.click(trigger);
    fireEvent.click(screen.getByRole('link', { name: 'Ania' }));

    fireEvent.keyDown(document.activeElement ?? document.body, { key: 'Escape' });
    await waitFor(() => expect(window.location.search).toBe('?p=members'));

    fireEvent.click(screen.getByRole('link', { name: 'Ania' }));
    await act(async () => {
      fireEvent.click(within(dialog('Profil')).getByRole('button', { name: 'Zamknij' }));
      await new Promise((resolve) => window.addEventListener('popstate', resolve, { once: true }));
    });
    expect(window.location.search).toBe('');
    expect(screen.queryByRole('dialog')).not.toBeInTheDocument();
    expect(screen.getByRole('link', { name: 'Członkowie klubu' })).toHaveFocus();
  });

  it('szybkie podwójne Esc nie cofa historii poza aplikację', async () => {
    renderStack();
    fireEvent.click(screen.getByRole('link', { name: 'Członkowie klubu' }));
    const back = vi.spyOn(window.history, 'back');
    await act(async () => {
      fireEvent.keyDown(document.body, { key: 'Escape' });
      fireEvent.keyDown(document.body, { key: 'Escape' });
      fireEvent.click(screen.getByRole('button', { name: 'Zamknij' }));
      await new Promise((resolve) => window.addEventListener('popstate', resolve, { once: true }));
    });
    expect(back).toHaveBeenCalledTimes(1);
    expect(window.location.search).toBe('');
    expect(screen.queryByRole('dialog')).not.toBeInTheDocument();
  });

  it('Esc obsłużone przez pole w popupie nie zamyka popupu', () => {
    renderStack();
    fireEvent.click(screen.getByRole('link', { name: 'Członkowie klubu' }));
    const link = screen.getByRole('link', { name: 'Ania' });
    link.addEventListener('keydown', (event) => event.preventDefault());
    fireEvent.keyDown(link, { key: 'Escape' });
    expect(window.location.search).toBe('?p=members');
  });

  it('odtwarza stos z linku i zamyka go bez wychodzenia z aplikacji', async () => {
    window.history.replaceState(null, '', `/?p=members&p=profile/${ID}`);
    const before = window.history.length;
    renderStack();
    expect(dialog('Profil')).toHaveFocus();

    fireEvent.click(screen.getByRole('button', { name: 'Wróć' }));
    // Popup z linku nie ma wpisu historii pod sobą, więc adres jest podmieniany.
    expect(window.location.search).toBe('?p=members');
    expect(window.history.length).toBe(before);
    expect(dialog('Członkowie')).toHaveFocus();

    fireEvent.click(screen.getByRole('button', { name: 'Zamknij' }));
    expect(window.location.search).toBe('');
    expect(screen.getByRole('main')).toHaveFocus();
  });

  it('nieznany adres otwiera popup z czytelnym stanem', () => {
    window.history.replaceState(null, '', '/?p=nieznany');
    renderStack();
    expect(dialog('Nie znaleziono')).toHaveTextContent('nieznany');
  });

  it('Tab i Shift+Tab krążą w popupie', () => {
    window.history.replaceState(null, '', `/?p=members&p=profile/${ID}`);
    renderStack();
    const top = dialog('Profil');
    const back = screen.getByRole('button', { name: 'Wróć' });
    const input = screen.getByLabelText('Notatka');

    // jsdom nie liczy układu, więc każdy element jest „niewidoczny”; udajemy prostokąty.
    for (const el of [back, within(top).getByRole('button', { name: 'Zamknij' }), input]) {
      el.getClientRects = () => [new DOMRect(0, 0, 10, 10)] as unknown as DOMRectList;
    }
    input.focus();
    fireEvent.keyDown(top, { key: 'Tab' });
    expect(back).toHaveFocus();
    fireEvent.keyDown(top, { key: 'Tab', shiftKey: true });
    expect(input).toHaveFocus();
  });

  it('kliknięcie z Ctrl zostawia link przeglądarce (nowa karta)', () => {
    renderStack();
    const trigger = screen.getByRole('link', { name: 'Członkowie klubu' });
    const event = new MouseEvent('click', { bubbles: true, cancelable: true, ctrlKey: true });
    trigger.dispatchEvent(event);
    expect(window.location.search).toBe('');
    expect(screen.queryByRole('dialog')).not.toBeInTheDocument();
  });

  describe('ochrona przed zamknięciem (useLeaveGuard)', () => {
    function openGuarded() {
      renderStack();
      fireEvent.click(screen.getByRole('link', { name: 'Członkowie klubu' }));
      fireEvent.click(screen.getByRole('link', { name: 'Ania' }));
      fireEvent.click(screen.getByRole('checkbox', { name: 'Zmiany' }));
    }

    it('bez zmian popup zamyka się od razu', () => {
      renderStack();
      fireEvent.click(screen.getByRole('link', { name: 'Członkowie klubu' }));
      fireEvent.click(screen.getByRole('link', { name: 'Ania' }));
      const back = vi.spyOn(window.history, 'back');
      fireEvent.click(screen.getByRole('button', { name: 'Wróć' }));
      expect(back).toHaveBeenCalledTimes(1);
    });

    it('Esc, ← i × pytają ochronę; potwierdzenie zamyka popup', async () => {
      openGuarded();
      const back = vi.spyOn(window.history, 'back');
      const go = vi.spyOn(window.history, 'go');
      fireEvent.keyDown(document.activeElement ?? document.body, { key: 'Escape' });
      fireEvent.click(within(dialog('Profil')).getByRole('button', { name: 'Wróć' }));
      fireEvent.click(within(dialog('Profil')).getByRole('button', { name: 'Zamknij' }));
      expect(back).not.toHaveBeenCalled();
      expect(go).not.toHaveBeenCalled();
      expect(dialog('Profil')).toBeInTheDocument();

      // Ostatnie pytanie pochodziło z ×: potwierdzenie zamyka cały stos.
      go.mockRestore();
      await act(async () => {
        fireEvent.click(screen.getByRole('button', { name: 'Odrzuć zmiany' }));
        await new Promise((resolve) =>
          window.addEventListener('popstate', resolve, { once: true }),
        );
      });
      await waitFor(() => expect(window.location.search).toBe(''));
    });

    it('Wstecz w przeglądarce przywraca popup z ochroną i pyta o potwierdzenie', async () => {
      openGuarded();
      const url = window.location.search;
      await goBack();
      expect(window.location.search).toBe(url);
      expect(dialog('Profil')).toBeInTheDocument();
      expect(screen.getByRole('checkbox', { name: 'Zmiany' })).toBeChecked();

      await act(async () => {
        fireEvent.click(screen.getByRole('button', { name: 'Odrzuć zmiany' }));
        await new Promise((resolve) =>
          window.addEventListener('popstate', resolve, { once: true }),
        );
      });
      await waitFor(() => expect(window.location.search).toBe('?p=members'));
      expect(dialog('Członkowie')).toBeInTheDocument();
    });

    it('zamknięcie karty z niezapisanymi zmianami pyta przeglądarkę', () => {
      openGuarded();
      const event = new Event('beforeunload', { cancelable: true });
      window.dispatchEvent(event);
      expect(event.defaultPrevented).toBe(true);
      fireEvent.click(screen.getByRole('checkbox', { name: 'Zmiany' }));
      const clean = new Event('beforeunload', { cancelable: true });
      window.dispatchEvent(clean);
      expect(clean.defaultPrevented).toBe(false);
    });
  });
});
