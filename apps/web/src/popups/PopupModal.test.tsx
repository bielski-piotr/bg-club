import { fireEvent, render, screen, waitFor, within } from '@solidjs/testing-library';
import { act } from '../test/render';
import { describe, expect, it } from 'vitest';
import { t } from '../i18n';
import { createSignal, flush, Show } from 'solid-js';
import { createLeaveGuard } from './leaveGuard';
import { PopupHost } from './PopupHost';
import { PopupLink } from './PopupLink';
import { PopupModal } from './PopupModal';
import { PopupRouter } from './PopupRouter';
import type { PopupRoute } from './routes';
import { InvalidPopup } from './InvalidPopup';

// `PopupModal`, `InvalidPopup` i `createLeaveGuard` na stosie `PopupRouter`/`PopupHost`: ←, ×,
// linki, ochrona przed zamknięciem i fokus.

/** Popup na `PopupModal` z linkiem dalej i ochroną wyjścia przy niezapisanych zmianach. */
function GuardedPopup(props: { readonly title: string }) {
  const [dirty, setDirty] = createSignal(false);
  const [pending, setPending] = createSignal<(() => void) | null>(null);
  createLeaveGuard(() => (dirty() ? (leave) => setPending(() => leave) : null));
  return (
    <PopupModal title={props.title}>
      <PopupLink to={{ kind: 'settings' }}>Ustawienia</PopupLink>
      <label>
        Zmiany{' '}
        <input
          type="checkbox"
          checked={dirty()}
          onChange={(e) => setDirty(e.currentTarget.checked)}
        />
      </label>
      <Show when={pending()}>
        {(leave) => (
          <button type="button" onClick={() => leave()()}>
            Odrzuć zmiany
          </button>
        )}
      </Show>
    </PopupModal>
  );
}

/** Zdarzenie i jego skutki w DOM od razu (zapisy sygnałów stosuje `flush`). */
const fire = {
  click: (element: Element) => {
    fireEvent.click(element);
    flush();
  },
  keyDown: (element: Element | Node, init: KeyboardEventInit) => {
    fireEvent.keyDown(element, init);
    flush();
  },
};

function popstate() {
  return new Promise((resolve) => window.addEventListener('popstate', resolve, { once: true }));
}

function Popup(props: { readonly route: PopupRoute }) {
  return (
    <Show when={props.route.kind !== 'invalid'} fallback={<InvalidPopup />}>
      <GuardedPopup title={props.route.kind} />
    </Show>
  );
}

function renderStack() {
  render(() => (
    <PopupRouter>
      <PopupHost renderPopup={(route) => <Popup route={route} />} fallbackFocusId="main">
        <main id="main" tabindex={-1}>
          <PopupLink to={{ kind: 'members' }}>Członkowie klubu</PopupLink>
        </main>
      </PopupHost>
    </PopupRouter>
  ));
  flush();
}

const dialog = (name: string) => screen.getByRole('dialog', { name, hidden: true });

describe('popupy na stosie', () => {
  it('PopupModal: tytuł, link do kolejnego popupu, ← i × ze stosu', async () => {
    renderStack();
    const trigger = screen.getByRole('link', { name: 'Członkowie klubu' });
    trigger.focus();
    fire.click(trigger);
    expect(dialog('members')).toHaveFocus();
    // Na dole stosu nie ma ←.
    expect(within(dialog('members')).queryByRole('button', { name: t.ui.back })).toBeNull();

    const link = within(dialog('members')).getByRole('link', { name: 'Ustawienia' });
    expect(link).toHaveAttribute('href', '/?p=members&p=settings');
    link.focus();
    fire.click(link);
    expect(dialog('settings')).toHaveFocus();
    expect(dialog('members').closest('[inert]')).not.toBeNull();

    await act(async () => {
      fire.click(within(dialog('settings')).getByRole('button', { name: t.ui.back }));
      await popstate();
    });
    expect(window.location.search).toBe('?p=members');
    expect(within(dialog('members')).getByRole('link', { name: 'Ustawienia' })).toHaveFocus();

    await act(async () => {
      fire.click(within(dialog('members')).getByRole('button', { name: t.ui.close }));
      await popstate();
    });
    expect(screen.queryByRole('dialog')).not.toBeInTheDocument();
    expect(screen.getByRole('link', { name: 'Członkowie klubu' })).toHaveFocus();
  });

  it('createLeaveGuard: Esc przy zmianach pyta, a „Odrzuć zmiany” zamyka popup', async () => {
    renderStack();
    fire.click(screen.getByRole('link', { name: 'Członkowie klubu' }));
    fire.click(screen.getByRole('checkbox', { name: 'Zmiany' }));
    await waitFor(() => expect(screen.getByRole('checkbox', { name: 'Zmiany' })).toBeChecked());

    fire.keyDown(document.activeElement ?? document.body, { key: 'Escape' });
    const discard = await screen.findByRole('button', { name: 'Odrzuć zmiany' });
    expect(window.location.search).toBe('?p=members');

    await act(async () => {
      fire.click(discard);
      await popstate();
    });
    expect(window.location.search).toBe('');
    expect(screen.queryByRole('dialog')).not.toBeInTheDocument();
  });

  it('bez zmian ochrona nie zatrzymuje zamknięcia', async () => {
    renderStack();
    fire.click(screen.getByRole('link', { name: 'Członkowie klubu' }));
    await act(async () => {
      fire.keyDown(document.activeElement ?? document.body, { key: 'Escape' });
      await popstate();
    });
    expect(window.location.search).toBe('');
  });

  it('InvalidPopup zamyka cały stos', async () => {
    window.history.replaceState(null, '', '/?p=members&p=nieznany');
    renderStack();
    const invalid = dialog(t.popups.invalidTitle);
    expect(invalid).toHaveTextContent(t.popups.invalidBody);
    fire.click(within(invalid).getByRole('button', { name: t.popups.backToClub }));
    await waitFor(() => expect(window.location.search).toBe(''));
    expect(screen.queryByRole('dialog')).not.toBeInTheDocument();
  });
});
