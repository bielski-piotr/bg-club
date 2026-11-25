import { act, fireEvent, render, screen, waitFor, within } from '@testing-library/react';
import { describe, expect, it } from 'vitest';
import { t } from '../i18n';
import { PopupHost } from '../popups/PopupHost';
import { PopupLink } from '../popups/PopupLink';
import { PopupRouter } from '../popups/PopupRouter';
import type { PopupRoute } from '../popups/routes';
import { GuardedPopup } from '../solid/__tests__/fixtures';
import { InvalidPopup } from '../solid/popups/InvalidPopup';
import { SolidIsland } from './SolidIsland';

// Popupy Solid (`src/solid/popups`) na stosie `PopupRouter`/`PopupHost` Reacta: ←, ×, linki,
// ochrona przed zamknięciem i fokus (etap 1, docs/solidjs-2-migration.md).

function popstate() {
  return new Promise((resolve) => window.addEventListener('popstate', resolve, { once: true }));
}

function Popup({ route }: { readonly route: PopupRoute }) {
  if (route.kind === 'invalid') return <SolidIsland component={InvalidPopup} props={{}} />;
  return <SolidIsland component={GuardedPopup} props={{ title: route.kind }} />;
}

function renderStack() {
  return render(
    <PopupRouter>
      <PopupHost renderPopup={(route) => <Popup route={route} />} fallbackFocusId="main">
        <main id="main" tabIndex={-1}>
          <PopupLink to={{ kind: 'members' }}>Członkowie klubu</PopupLink>
        </main>
      </PopupHost>
    </PopupRouter>,
  );
}

const dialog = (name: string) => screen.getByRole('dialog', { name, hidden: true });

describe('popupy Solid na stosie Reacta', () => {
  it('PopupModal: tytuł, link do kolejnego popupu, ← i × ze stosu', async () => {
    renderStack();
    const trigger = screen.getByRole('link', { name: 'Członkowie klubu' });
    trigger.focus();
    fireEvent.click(trigger);
    expect(dialog('members')).toHaveFocus();
    // Na dole stosu nie ma ←.
    expect(within(dialog('members')).queryByRole('button', { name: t.ui.back })).toBeNull();

    const link = within(dialog('members')).getByRole('link', { name: 'Ustawienia' });
    expect(link).toHaveAttribute('href', '/?p=members&p=settings');
    link.focus();
    fireEvent.click(link);
    expect(dialog('settings')).toHaveFocus();
    expect(dialog('members').closest('[inert]')).not.toBeNull();

    await act(async () => {
      fireEvent.click(within(dialog('settings')).getByRole('button', { name: t.ui.back }));
      await popstate();
    });
    expect(window.location.search).toBe('?p=members');
    expect(within(dialog('members')).getByRole('link', { name: 'Ustawienia' })).toHaveFocus();

    await act(async () => {
      fireEvent.click(within(dialog('members')).getByRole('button', { name: t.ui.close }));
      await popstate();
    });
    expect(screen.queryByRole('dialog')).not.toBeInTheDocument();
    expect(screen.getByRole('link', { name: 'Członkowie klubu' })).toHaveFocus();
  });

  it('createLeaveGuard: Esc przy zmianach pyta, a „Odrzuć zmiany” zamyka popup', async () => {
    renderStack();
    fireEvent.click(screen.getByRole('link', { name: 'Członkowie klubu' }));
    fireEvent.click(screen.getByRole('checkbox', { name: 'Zmiany' }));
    await waitFor(() => expect(screen.getByRole('checkbox', { name: 'Zmiany' })).toBeChecked());

    fireEvent.keyDown(document.activeElement ?? document.body, { key: 'Escape' });
    const discard = await screen.findByRole('button', { name: 'Odrzuć zmiany' });
    expect(window.location.search).toBe('?p=members');

    await act(async () => {
      fireEvent.click(discard);
      await popstate();
    });
    expect(window.location.search).toBe('');
    expect(screen.queryByRole('dialog')).not.toBeInTheDocument();
  });

  it('bez zmian ochrona nie zatrzymuje zamknięcia', async () => {
    renderStack();
    fireEvent.click(screen.getByRole('link', { name: 'Członkowie klubu' }));
    await act(async () => {
      fireEvent.keyDown(document.activeElement ?? document.body, { key: 'Escape' });
      await popstate();
    });
    expect(window.location.search).toBe('');
  });

  it('InvalidPopup zamyka cały stos', async () => {
    window.history.replaceState(null, '', '/?p=members&p=nieznany');
    renderStack();
    const invalid = dialog(t.popups.invalidTitle);
    expect(invalid).toHaveTextContent(t.popups.invalidBody);
    fireEvent.click(within(invalid).getByRole('button', { name: t.popups.backToClub }));
    await waitFor(() => expect(window.location.search).toBe(''));
    expect(screen.queryByRole('dialog')).not.toBeInTheDocument();
  });
});
