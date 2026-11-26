import type { JSX } from '@solidjs/web';
import { fireEvent, render, screen, waitFor, within } from '@solidjs/testing-library';
import { createSignal, flush, Show, useContext } from 'solid-js';
import { describe, expect, it, vi } from 'vitest';
import { act } from '../test/render';
import { createLeaveGuard } from './leaveGuard';
import { PopupsContext } from './popupContext';
import { PopupHost } from './PopupHost';
import { PopupLink } from './PopupLink';
import { PopupModal } from './PopupModal';
import { PopupRouter } from './PopupRouter';
import type { PopupRoute } from './routes';

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

const ID = '00000000-0000-4000-a000-000000000002';

/** Proste popupy testowe: lista z linkiem do profilu i profil z polem tekstowym. */
function TestPopup(props: { readonly route: PopupRoute }) {
  const kind = () => props.route.kind;
  return (
    <Show
      when={kind() === 'members'}
      fallback={
        <Show
          when={kind() === 'profile'}
          fallback={
            <Show
              when={kind() === 'settings'}
              fallback={
                <PopupModal title="Nie znaleziono">
                  {props.route.kind === 'invalid' ? props.route.raw : null}
                </PopupModal>
              }
            >
              <PopupModal title="Ustawienia">ustawienia</PopupModal>
            </Show>
          }
        >
          <Guarded title="Profil">
            <label>
              Notatka <input />
            </label>
            <StackButtons />
          </Guarded>
        </Show>
      }
    >
      <Guarded title="Członkowie">
        <PopupLink to={{ kind: 'profile', id: ID }}>Ania</PopupLink>
      </Guarded>
    </Show>
  );
}

/** `backBy(2)` i `replace` z wnętrza popupu (np. dialog nad popupem, którego treść zniknęła). */
function StackButtons() {
  const popups = useContext(PopupsContext);
  return (
    <>
      <button type="button" onClick={() => popups.backBy(2)}>
        Zamknij dwa
      </button>
      <button type="button" onClick={() => popups.replace({ kind: 'settings' })}>
        Podmień
      </button>
    </>
  );
}

/** Popup z ochroną: przy zaznaczonym „Zmiany” zamknięcie pyta (licznik pytań i „Odrzuć zmiany”). */
function Guarded(props: { readonly title: string; readonly children: JSX.Element }) {
  const [dirty, setDirty] = createSignal(false);
  const [asked, setAsked] = createSignal(0);
  const [pending, setPending] = createSignal<(() => void) | null>(null);
  createLeaveGuard(() =>
    dirty()
      ? (leave) => {
          setAsked((n) => n + 1);
          setPending(() => leave);
        }
      : null,
  );
  return (
    <PopupModal title={props.title}>
      {props.children}
      <label>
        Zmiany <input type="checkbox" checked={dirty()} onChange={() => setDirty(!dirty())} />
      </label>
      <p>Pytania: {asked()}</p>
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

function renderStack() {
  const view = render(() => (
    <PopupRouter>
      <PopupHost renderPopup={(route) => <TestPopup route={route} />} fallbackFocusId="main">
        <main id="main" tabindex={-1}>
          <PopupLink to={{ kind: 'members' }}>Członkowie klubu</PopupLink>
        </main>
      </PopupHost>
    </PopupRouter>
  ));
  flush();
  return view;
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

    fire.click(trigger);
    expect(window.location.search).toBe('?p=members');
    expect(dialog('Członkowie')).toHaveFocus();
    expect(screen.getByRole('main', { hidden: true }).closest('[inert]')).not.toBeNull();

    fire.click(screen.getByRole('link', { name: 'Ania' }));
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
    fire.click(screen.getByRole('link', { name: 'Członkowie klubu' }));
    const ania = screen.getByRole('link', { name: 'Ania' });
    ania.focus();
    fire.click(ania);

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
    fire.click(trigger);
    fire.click(screen.getByRole('link', { name: 'Ania' }));

    fire.keyDown(document.activeElement ?? document.body, { key: 'Escape' });
    await waitFor(() => expect(window.location.search).toBe('?p=members'));

    fire.click(screen.getByRole('link', { name: 'Ania' }));
    await act(async () => {
      fire.click(within(dialog('Profil')).getByRole('button', { name: 'Zamknij' }));
      await new Promise((resolve) => window.addEventListener('popstate', resolve, { once: true }));
    });
    expect(window.location.search).toBe('');
    expect(screen.queryByRole('dialog')).not.toBeInTheDocument();
    expect(screen.getByRole('link', { name: 'Członkowie klubu' })).toHaveFocus();
  });

  it('backBy(2) zamyka dwa górne popupy jednym cofnięciem historii', async () => {
    renderStack();
    fire.click(screen.getByRole('link', { name: 'Członkowie klubu' }));
    fire.click(screen.getByRole('link', { name: 'Ania' }));
    const go = vi.spyOn(window.history, 'go');
    await act(async () => {
      fire.click(screen.getByRole('button', { name: 'Zamknij dwa' }));
      await new Promise((resolve) => window.addEventListener('popstate', resolve, { once: true }));
    });
    expect(go).toHaveBeenCalledWith(-2);
    expect(window.location.search).toBe('');
    expect(screen.queryByRole('dialog')).not.toBeInTheDocument();
    go.mockRestore();
  });

  it('backBy(2) ze stosu z linku podmienia adres bez wychodzenia z aplikacji', () => {
    window.history.replaceState(null, '', `/?p=members&p=profile/${ID}`);
    const before = window.history.length;
    renderStack();
    fire.click(screen.getByRole('button', { name: 'Zamknij dwa' }));
    expect(window.location.search).toBe('');
    expect(window.history.length).toBe(before);
    expect(screen.queryByRole('dialog')).not.toBeInTheDocument();
  });

  it('replace podmienia górny popup bez nowego wpisu historii', async () => {
    renderStack();
    fire.click(screen.getByRole('link', { name: 'Członkowie klubu' }));
    fire.click(screen.getByRole('link', { name: 'Ania' }));
    const before = window.history.length;
    fire.click(screen.getByRole('button', { name: 'Podmień' }));
    expect(window.location.search).toBe('?p=members&p=settings');
    expect(window.history.length).toBe(before);
    expect(dialog('Ustawienia')).toBeInTheDocument();
    // Wstecz wraca pod podmieniony popup, a nie do profilu.
    await goBack();
    expect(window.location.search).toBe('?p=members');
  });

  it('szybkie podwójne Esc nie cofa historii poza aplikację', async () => {
    renderStack();
    fire.click(screen.getByRole('link', { name: 'Członkowie klubu' }));
    const back = vi.spyOn(window.history, 'back');
    await act(async () => {
      fire.keyDown(document.body, { key: 'Escape' });
      fire.keyDown(document.body, { key: 'Escape' });
      fire.click(screen.getByRole('button', { name: 'Zamknij' }));
      await new Promise((resolve) => window.addEventListener('popstate', resolve, { once: true }));
    });
    expect(back).toHaveBeenCalledTimes(1);
    expect(window.location.search).toBe('');
    expect(screen.queryByRole('dialog')).not.toBeInTheDocument();
  });

  it('Esc obsłużone przez pole w popupie nie zamyka popupu', () => {
    renderStack();
    fire.click(screen.getByRole('link', { name: 'Członkowie klubu' }));
    const link = screen.getByRole('link', { name: 'Ania' });
    link.addEventListener('keydown', (event) => event.preventDefault());
    fire.keyDown(link, { key: 'Escape' });
    expect(window.location.search).toBe('?p=members');
  });

  it('odtwarza stos z linku i zamyka go bez wychodzenia z aplikacji', async () => {
    window.history.replaceState(null, '', `/?p=members&p=profile/${ID}`);
    const before = window.history.length;
    renderStack();
    expect(dialog('Profil')).toHaveFocus();

    fire.click(screen.getByRole('button', { name: 'Wróć' }));
    // Popup z linku nie ma wpisu historii pod sobą, więc adres jest podmieniany.
    expect(window.location.search).toBe('?p=members');
    expect(window.history.length).toBe(before);
    expect(dialog('Członkowie')).toHaveFocus();

    fire.click(screen.getByRole('button', { name: 'Zamknij' }));
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
    fire.keyDown(top, { key: 'Tab' });
    expect(back).toHaveFocus();
    fire.keyDown(top, { key: 'Tab', shiftKey: true });
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

  describe('ochrona przed zamknięciem (createLeaveGuard)', () => {
    function openGuarded() {
      renderStack();
      fire.click(screen.getByRole('link', { name: 'Członkowie klubu' }));
      fire.click(screen.getByRole('link', { name: 'Ania' }));
      fire.click(within(dialog('Profil')).getByRole('checkbox', { name: 'Zmiany' }));
    }

    it('bez zmian popup zamyka się od razu', () => {
      renderStack();
      fire.click(screen.getByRole('link', { name: 'Członkowie klubu' }));
      fire.click(screen.getByRole('link', { name: 'Ania' }));
      const back = vi.spyOn(window.history, 'back');
      fire.click(screen.getByRole('button', { name: 'Wróć' }));
      expect(back).toHaveBeenCalledTimes(1);
    });

    it('Esc, ← i × pytają ochronę; potwierdzenie zamyka popup', async () => {
      openGuarded();
      const back = vi.spyOn(window.history, 'back');
      const go = vi.spyOn(window.history, 'go');
      fire.keyDown(document.activeElement ?? document.body, { key: 'Escape' });
      fire.click(within(dialog('Profil')).getByRole('button', { name: 'Wróć' }));
      fire.click(within(dialog('Profil')).getByRole('button', { name: 'Zamknij' }));
      expect(back).not.toHaveBeenCalled();
      expect(go).not.toHaveBeenCalled();
      expect(dialog('Profil')).toBeInTheDocument();

      // Ostatnie pytanie pochodziło z ×: potwierdzenie zamyka cały stos.
      go.mockRestore();
      await act(async () => {
        fire.click(within(dialog('Profil')).getByRole('button', { name: 'Odrzuć zmiany' }));
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
      expect(within(dialog('Profil')).getByRole('checkbox', { name: 'Zmiany' })).toBeChecked();

      await act(async () => {
        fire.click(within(dialog('Profil')).getByRole('button', { name: 'Odrzuć zmiany' }));
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
      fire.click(within(dialog('Profil')).getByRole('checkbox', { name: 'Zmiany' }));
      const clean = new Event('beforeunload', { cancelable: true });
      window.dispatchEvent(clean);
      expect(clean.defaultPrevented).toBe(false);
    });

    it('× pyta każdy chroniony popup; anulowanie niżej zostawia ochronę wyższego', () => {
      renderStack();
      fire.click(screen.getByRole('link', { name: 'Członkowie klubu' }));
      fire.click(within(dialog('Członkowie')).getByRole('checkbox', { name: 'Zmiany' }));
      fire.click(screen.getByRole('link', { name: 'Ania' }));
      const profile = dialog('Profil');
      fire.click(within(profile).getByRole('checkbox', { name: 'Zmiany' }));
      const go = vi.spyOn(window.history, 'go');

      fire.click(within(profile).getByRole('button', { name: 'Zamknij' }));
      expect(within(profile).getByText('Pytania: 1')).toBeInTheDocument();
      fire.click(within(profile).getByRole('button', { name: 'Odrzuć zmiany' }));
      // Po zgodzie górnego pyta niższy; bez jego zgody nic się nie zamyka.
      const members = screen.getByRole('dialog', { name: 'Członkowie', hidden: true });
      expect(within(members).getByText('Pytania: 1')).toBeInTheDocument();
      expect(go).not.toHaveBeenCalled();

      // Górny popup nadal ma ochronę: Esc znowu pyta.
      fire.keyDown(profile, { key: 'Escape' });
      expect(within(profile).getByText('Pytania: 2')).toBeInTheDocument();
      expect(window.location.search).toBe(`?p=members&p=profile/${ID}`);
    });
  });
});
