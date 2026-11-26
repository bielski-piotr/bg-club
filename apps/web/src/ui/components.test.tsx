import { captureArtifact, expectNoDiagnostics } from '@solidjs/diagnostics';
import { fireEvent, screen, within } from '@solidjs/testing-library';
import { action, createSignal, flush, For } from 'solid-js';
import { describe, expect, it, vi } from 'vitest';
import { t } from '../i18n';
import { renderWithProviders } from '../test/render';
import {
  AvatarStack,
  Avatar,
  Button,
  Checkbox,
  ChipGroup,
  createChunks,
  EmptyState,
  Menu,
  Modal,
  PasswordField,
  SearchField,
  SegmentedControl,
  Select,
  ShowMore,
  Slider,
  Stepper,
  Switch,
  Tabs,
  TextField,
} from './index';

/*
 * Zachowanie komponentów design systemu. DOM po zdarzeniu zmienia się w mikrozadaniu, więc po
 * interakcji `flush()`.
 */

const fire = <T extends unknown[]>(action: (...args: T) => unknown, ...args: T) => {
  action(...args);
  flush();
};

/** Zapisy z `onFlush` (np. zamknięcie menu) lądują w mikrozadaniu po zdarzeniu. */
const settle = async () => {
  await Promise.resolve();
  flush();
};

describe('Button', () => {
  it('w trakcie ładowania ignoruje kliknięcia i ogłasza stan', () => {
    const onClick = vi.fn();
    renderWithProviders(() => (
      <Button loading onClick={onClick}>
        Zapisz
      </Button>
    ));
    const button = screen.getByRole('button', { name: /Zapisz/ });
    fireEvent.click(button);
    expect(onClick).not.toHaveBeenCalled();
    expect(button).toHaveAttribute('aria-busy', 'true');
    expect(button).toHaveTextContent(t.ui.loading);
  });

  it('domyślnie nie wysyła formularza, a kliknięcie woła handler', () => {
    const onClick = vi.fn();
    renderWithProviders(() => <Button onClick={onClick}>Dalej</Button>);
    const button = screen.getByRole('button');
    expect(button).toHaveAttribute('type', 'button');
    fireEvent.click(button);
    expect(onClick).toHaveBeenCalledTimes(1);
  });
});

describe('TextField', () => {
  it('wiąże etykietę i komunikat błędu z polem', () => {
    renderWithProviders(() => <TextField label="Imię" error="Podaj imię." />);
    const input = screen.getByLabelText('Imię');
    expect(input).toHaveAttribute('aria-invalid', 'true');
    expect(input).toHaveAccessibleDescription('Podaj imię.');
  });

  it('pusty błąd nie ukrywa podpowiedzi ani nie psuje aria-describedby', () => {
    renderWithProviders(() => <TextField label="Imię" hint="Widzą je wszyscy." error="" />);
    const input = screen.getByLabelText('Imię');
    expect(input).toHaveAccessibleDescription('Widzą je wszyscy.');
    expect(input).not.toHaveAttribute('aria-invalid');
  });

  it('wpisany tekst idzie do sygnału rodzica (value + onInput) i zostaje przy zmianie błędu', () => {
    const [value, setValue] = createSignal('');
    const [error, setError] = createSignal<string | undefined>(undefined);
    renderWithProviders(() => (
      <TextField
        label="Tytuł"
        value={value()}
        error={error()}
        onInput={(event) => setValue(event.currentTarget.value)}
      />
    ));
    const input = screen.getByLabelText<HTMLInputElement>('Tytuł');
    fire(fireEvent.input, input, { target: { value: 'Azul' } });
    expect(value()).toBe('Azul');
    setError('Za krótki');
    flush();
    expect(input.value).toBe('Azul');
    expect(input).toHaveAccessibleDescription('Za krótki');
  });

  it('pole hasła pokazuje i ukrywa wartość', () => {
    renderWithProviders(() => <PasswordField label="Hasło" value="sekret" />);
    const input = screen.getByLabelText('Hasło');
    expect(input).toHaveAttribute('type', 'password');
    fire(fireEvent.click, screen.getByRole('button', { name: t.ui.showPassword }));
    expect(input).toHaveAttribute('type', 'text');
    expect(screen.getByRole('button', { name: t.ui.hidePassword })).toHaveAttribute(
      'aria-pressed',
      'true',
    );
  });

  it('ref z propsów dostaje element pola', () => {
    let element: HTMLInputElement | undefined;
    renderWithProviders(() => <TextField label="Hak" ref={(el) => (element = el)} />);
    expect(element).toBe(screen.getByLabelText('Hak'));
  });
});

describe('SearchField', () => {
  it('Esc czyści wpisany tekst i nie zamyka popupu', () => {
    const [value, setValue] = createSignal('azul');
    renderWithProviders(() => (
      <SearchField label="Szukaj gry" value={value()} onValueChange={setValue} />
    ));
    const input = screen.getByRole<HTMLInputElement>('searchbox', { name: 'Szukaj gry' });
    const notCanceled = fireEvent.keyDown(input, { key: 'Escape' });
    flush();
    expect(notCanceled).toBe(false);
    expect(input.value).toBe('');
    expect(screen.queryByRole('button', { name: t.ui.clearSearch })).not.toBeInTheDocument();
  });
});

describe('Stepper', () => {
  it('zmienia wartość strzałkami i trzyma się zakresu', () => {
    const [value, setValue] = createSignal(2);
    renderWithProviders(() => (
      <Stepper label="Gracze" value={value()} onChange={setValue} min={1} max={4} />
    ));
    const spin = screen.getByRole('spinbutton', { name: 'Gracze' });
    fire(fireEvent.keyDown, spin, { key: 'ArrowUp' });
    expect(spin).toHaveAttribute('aria-valuenow', '3');
    fire(fireEvent.keyDown, spin, { key: 'End' });
    expect(spin).toHaveAttribute('aria-valuenow', '4');
    fire(fireEvent.click, screen.getByRole('button', { name: t.ui.increase }));
    expect(spin).toHaveAttribute('aria-valuenow', '4');
    fire(fireEvent.keyDown, spin, { key: 'Home' });
    expect(spin).toHaveAttribute('aria-valuenow', '1');
    expect(screen.getByRole('button', { name: t.ui.decrease })).toBeDisabled();
  });
});

describe('Select', () => {
  const options = [
    { value: 'all', label: 'Wszystkie lata' },
    { value: '2026', label: '2026' },
    { value: '2025', label: '2025', disabled: true },
    { value: '2024', label: '2024' },
  ] as const;
  type Year = (typeof options)[number]['value'];

  function renderYear(onChange?: (v: Year) => void) {
    const [value, setValue] = createSignal<Year>('all');
    renderWithProviders(() => (
      <Select
        label="Rok"
        options={options}
        value={value()}
        onChange={(v) => {
          setValue(() => v);
          onChange?.(v);
        }}
      />
    ));
  }

  it('obsługuje wybór z klawiatury i pomija wyłączone opcje', () => {
    const onChange = vi.fn();
    renderYear(onChange);
    const trigger = screen.getByRole('button', { name: /Rok/ });
    expect(trigger).toHaveAttribute('aria-expanded', 'false');

    fire(fireEvent.keyDown, trigger, { key: 'ArrowDown' });
    const list = screen.getByRole('listbox', { name: 'Rok' });
    expect(list).toHaveFocus();
    expect(list).toHaveAttribute('aria-activedescendant', screen.getAllByRole('option')[0]?.id);

    fire(fireEvent.keyDown, list, { key: 'ArrowDown' });
    fire(fireEvent.keyDown, list, { key: 'ArrowDown' });
    // „2025” jest wyłączony, więc zaznaczenie przeskakuje na „2024”.
    expect(list).toHaveAttribute(
      'aria-activedescendant',
      screen.getByRole('option', { name: '2024' }).id,
    );
    fire(fireEvent.keyDown, list, { key: 'Enter' });

    expect(onChange).toHaveBeenCalledWith('2024');
    expect(screen.queryByRole('listbox')).not.toBeInTheDocument();
    expect(trigger).toHaveFocus();
    expect(trigger).toHaveTextContent('2024');
  });

  it('Esc zamyka listę bez zmiany wartości, kliknięcie poza listą też', () => {
    const onChange = vi.fn();
    renderYear(onChange);
    const trigger = screen.getByRole('button', { name: /Rok/ });
    fire(fireEvent.click, trigger);
    fire(fireEvent.keyDown, screen.getByRole('listbox'), { key: 'Escape' });
    expect(screen.queryByRole('listbox')).not.toBeInTheDocument();
    fire(fireEvent.click, trigger);
    expect(screen.getByRole('listbox')).toBeInTheDocument();
    fire(fireEvent.pointerDown, document.body);
    expect(screen.queryByRole('listbox')).not.toBeInTheDocument();
    expect(onChange).not.toHaveBeenCalled();
  });

  it('Tab w otwartej liście oddaje fokus przyciskowi listy', () => {
    renderWithProviders(() => (
      <Select label="Rok" options={[{ value: 'a', label: 'A' }]} value="a" onChange={() => {}} />
    ));
    const trigger = screen.getByRole('button', { name: /Rok/ });
    fire(fireEvent.click, trigger);
    fire(fireEvent.keyDown, screen.getByRole('listbox'), { key: 'Tab' });
    expect(screen.queryByRole('listbox')).not.toBeInTheDocument();
    expect(trigger).toHaveFocus();
  });

  it('wyłączona wybrana opcja nie jest aktywna po otwarciu listy', () => {
    renderWithProviders(() => (
      <Select
        label="Rok"
        options={[
          { value: 'a', label: 'A' },
          { value: 'b', label: 'B', disabled: true },
        ]}
        value="b"
        onChange={() => {}}
      />
    ));
    fire(fireEvent.click, screen.getByRole('button', { name: /Rok/ }));
    expect(screen.getByRole('listbox')).toHaveAttribute(
      'aria-activedescendant',
      screen.getByRole('option', { name: 'A' }).id,
    );
  });

  it('z wyszukiwarką filtruje bez polskich znaków i wybiera Enterem (DS §17)', () => {
    const onChange = vi.fn();
    renderWithProviders(() => (
      <Select
        label="Strefa"
        options={[
          { value: 'Europe/Warsaw', label: 'Europe/Warsaw', meta: 'UTC+01:00' },
          { value: 'America/New_York', label: 'America/New_York', meta: 'UTC−05:00' },
          { value: 'Asia/Ho_Chi_Minh', label: 'Asia/Ho_Chi_Minh', meta: 'UTC+07:00' },
        ]}
        value="Europe/Warsaw"
        onChange={onChange}
        searchLabel="Szukaj strefy"
      />
    ));
    const trigger = screen.getByRole('button', { name: /Strefa/ });
    fire(fireEvent.click, trigger);
    const search = screen.getByRole('combobox', { name: 'Szukaj strefy' });
    expect(search).toHaveFocus();
    expect(screen.getAllByRole('option')).toHaveLength(3);
    expect(search).toHaveAttribute(
      'aria-activedescendant',
      screen.getByRole('option', { name: /Europe\/Warsaw/ }).id,
    );
    // Panel z wyszukiwarką jest pozycjonowany względem okna.
    expect(search.closest<HTMLElement>('.select__menu--search')?.style.position).toBe('fixed');

    fire(fireEvent.input, search, { target: { value: 'hó chi' } });
    expect(screen.getAllByRole('option').map((o) => o.textContent)).toEqual([
      'Asia/Ho_Chi_MinhUTC+07:00',
    ]);
    fire(fireEvent.input, search, { target: { value: 'xyz' } });
    expect(screen.queryAllByRole('option')).toHaveLength(0);
    expect(screen.getByText(t.ui.noOptions)).toBeInTheDocument();

    fire(fireEvent.input, search, { target: { value: 'america' } });
    fire(fireEvent.keyDown, search, { key: 'Enter' });
    expect(onChange).toHaveBeenCalledWith('America/New_York');
    expect(screen.queryByRole('listbox')).not.toBeInTheDocument();
    expect(trigger).toHaveFocus();

    // Esc zamyka listę i nie zamyka popupu wyżej (`PopupHost` pomija `defaultPrevented`).
    fire(fireEvent.click, trigger);
    expect(fireEvent.keyDown(screen.getByRole('combobox'), { key: 'Escape' })).toBe(false);
    flush();
    expect(screen.queryByRole('listbox')).not.toBeInTheDocument();
  });
});

describe('Menu', () => {
  function renderMenu(onEdit = vi.fn(), onDelete = vi.fn()) {
    renderWithProviders(() => (
      <Menu
        label="Akcje"
        items={[
          { id: 'edit', label: 'Edytuj', icon: 'pencil', onSelect: onEdit },
          { id: 'delete', label: 'Usuń', icon: 'trash', destructive: true, onSelect: onDelete },
        ]}
        trigger={(props, open) => (
          <button type="button" {...props}>
            {open() ? 'Zamknij menu' : 'Więcej'}
          </button>
        )}
      />
    ));
    return { onEdit, onDelete };
  }

  it('↓ otwiera na pierwszym, ↑ ↓ krążą, Esc zamyka i oddaje fokus', () => {
    renderMenu();
    const trigger = screen.getByRole('button', { name: 'Więcej' });
    expect(trigger).toHaveAttribute('aria-expanded', 'false');
    fire(fireEvent.keyDown, trigger, { key: 'ArrowDown' });
    expect(trigger).toHaveAttribute('aria-expanded', 'true');
    expect(trigger).toHaveTextContent('Zamknij menu');
    const menu = screen.getByRole('menu', { name: 'Akcje' });
    expect(trigger).toHaveAttribute('aria-controls', menu.id);
    expect(screen.getByRole('menuitem', { name: 'Edytuj' })).toHaveFocus();
    fire(fireEvent.keyDown, menu, { key: 'ArrowUp' });
    expect(screen.getByRole('menuitem', { name: 'Usuń' })).toHaveFocus();
    fire(fireEvent.keyDown, menu, { key: 'ArrowDown' });
    expect(screen.getByRole('menuitem', { name: 'Edytuj' })).toHaveFocus();
    expect(fireEvent.keyDown(menu, { key: 'Escape' })).toBe(false);
    flush();
    expect(screen.queryByRole('menu')).not.toBeInTheDocument();
    expect(trigger).toHaveFocus();
  });

  it('wybór zamyka menu, oddaje fokus przyciskowi i woła akcję', async () => {
    const { onDelete } = renderMenu();
    const trigger = screen.getByRole('button', { name: 'Więcej' });
    fire(fireEvent.click, trigger);
    // Fokus na przycisku menu w chwili akcji: popup otwarty z akcji oddaje mu go po zamknięciu.
    onDelete.mockImplementation(() => expect(trigger).toHaveFocus());
    fire(fireEvent.click, screen.getByRole('menuitem', { name: 'Usuń' }));
    expect(onDelete).toHaveBeenCalledTimes(1);
    await settle();
    expect(screen.queryByRole('menu')).not.toBeInTheDocument();
  });

  it('menu zamyka się od razu, gdy akcja z menu trwa (action)', async () => {
    let finish!: () => void;
    const [saved, setSaved] = createSignal(false);
    const save = action(function* () {
      setSaved(true);
      yield new Promise<void>((resolve) => (finish = resolve));
    });
    renderMenu(
      vi.fn(),
      vi.fn(() => void save()),
    );
    fire(fireEvent.click, screen.getByRole('button', { name: 'Więcej' }));
    fire(fireEvent.click, screen.getByRole('menuitem', { name: 'Usuń' }));
    await settle();
    expect(screen.queryByRole('menu')).not.toBeInTheDocument();
    finish();
    await vi.waitFor(() => expect(saved()).toBe(true));
  });

  it('kliknięcie poza menu je zamyka', () => {
    renderMenu();
    fire(fireEvent.click, screen.getByRole('button', { name: 'Więcej' }));
    fire(fireEvent.pointerDown, document.body);
    expect(screen.queryByRole('menu')).not.toBeInTheDocument();
  });
});

describe('Modal', () => {
  it('Tab krąży w górnym oknie; przykryte okno jest wyłączone', () => {
    const [covered, setCovered] = createSignal(false);
    renderWithProviders(() => (
      <Modal title="Członkowie" onClose={() => {}} level={0} covered={covered()}>
        <button type="button">Pierwszy</button>
      </Modal>
    ));
    // Nasłuch klawiatury rejestruje efekt po pierwszym renderze.
    flush();
    const dialog = screen.getByRole('dialog', { name: 'Członkowie' });
    const close = within(dialog).getByRole('button', { name: t.ui.close });
    // jsdom nie liczy układu: `focusableIn` wymaga `getClientRects`.
    vi.spyOn(HTMLElement.prototype, 'getClientRects').mockReturnValue([
      {},
    ] as unknown as DOMRectList);
    const first = screen.getByRole('button', { name: 'Pierwszy' });
    first.focus();
    fireEvent.keyDown(first, { key: 'Tab' });
    expect(close).toHaveFocus();
    fireEvent.keyDown(close, { key: 'Tab', shiftKey: true });
    expect(first).toHaveFocus();
    setCovered(true);
    flush();
    expect(dialog.closest('[inert]')).not.toBeNull();
    expect(dialog.closest('.popup-layer')).toHaveClass('popup-layer--covered');
  });
});

describe('Tabs', () => {
  it('strzałki przenoszą zaznaczenie i fokus (roving tabindex)', () => {
    const [tab, setTab] = createSignal<'a' | 'b' | 'c'>('a');
    renderWithProviders(() => (
      <Tabs
        label="Zakres"
        items={[
          { id: 'a', label: 'Punkty' },
          { id: 'b', label: 'Wygrane' },
          { id: 'c', label: 'Seria' },
        ]}
        value={tab()}
        onChange={setTab}
      >
        {(v) => <p>Panel {v}</p>}
      </Tabs>
    ));
    const first = screen.getByRole('tab', { name: 'Punkty' });
    expect(first).toHaveAttribute('tabindex', '0');
    fire(fireEvent.keyDown, first, { key: 'ArrowLeft' });
    const last = screen.getByRole('tab', { name: 'Seria' });
    expect(last).toHaveAttribute('aria-selected', 'true');
    expect(last).toHaveFocus();
    expect(first).toHaveAttribute('tabindex', '-1');
    expect(screen.getByRole('tabpanel', { name: 'Seria' })).toHaveTextContent('Panel c');
  });
});

describe('pola wyboru', () => {
  it('pigułki to grupa radio z podpisem', () => {
    const onChange = vi.fn();
    renderWithProviders(() => (
      <SegmentedControl
        legend="Kierunek"
        options={[
          { value: 'more', label: 'Więcej = lepiej' },
          { value: 'less', label: 'Mniej = lepiej' },
        ]}
        value="more"
        onChange={onChange}
      />
    ));
    const group = screen.getByRole('group', { name: 'Kierunek' });
    expect(within(group).getByRole('radio', { name: 'Więcej = lepiej' })).toBeChecked();
    fireEvent.click(within(group).getByRole('radio', { name: 'Mniej = lepiej' }));
    expect(onChange).toHaveBeenCalledWith('less');
  });

  it('chipy zwracają wybór w kolejności opcji i są sterowane propsem', () => {
    const onChange = vi.fn();
    renderWithProviders(() => (
      <ChipGroup
        legend="Sumuje kategorie"
        options={[
          { value: 'a', label: 'Ptaki' },
          { value: 'b', label: 'Jajka' },
          { value: 'c', label: 'Żywność' },
        ]}
        values={['c']}
        onChange={onChange}
      />
    ));
    const birds = screen.getByRole('checkbox', { name: 'Ptaki' });
    fire(fireEvent.click, birds);
    expect(onChange).toHaveBeenCalledWith(['a', 'c']);
    // Rodzic nie zmienił `values`: pole wraca do stanu z propsów.
    expect(birds).not.toBeChecked();
  });

  it('checkbox i switch są sterowane propsem', () => {
    const [checked, setChecked] = createSignal(false);
    const onSwitch = vi.fn();
    renderWithProviders(() => (
      <>
        <Checkbox label="Zgoda" checked={checked()} onCheckedChange={setChecked} />
        <Switch label="Wygładź krawędzie" checked={false} onCheckedChange={onSwitch} />
      </>
    ));
    const box = screen.getByRole('checkbox', { name: 'Zgoda' });
    fire(fireEvent.click, box);
    expect(checked()).toBe(true);
    expect(box).toBeChecked();
    const sw = screen.getByRole('switch', { name: 'Wygładź krawędzie' });
    expect(sw).toHaveAttribute('aria-checked', 'false');
    fireEvent.click(sw);
    expect(onSwitch).toHaveBeenCalledWith(true);
  });

  it('slider jest natywnym suwakiem z etykietą', () => {
    const onChange = vi.fn();
    renderWithProviders(() => (
      <Slider label="Siła" min={0} max={10} value={4} onValueChange={onChange} />
    ));
    const slider = screen.getByRole('slider', { name: 'Siła' });
    fireEvent.input(slider, { target: { value: '7' } });
    expect(onChange).toHaveBeenCalledWith(7);
  });
});

describe('Avatar i EmptyState', () => {
  it('awatar ma tekst alternatywny, a po błędzie zdjęcia monogram', () => {
    renderWithProviders(() => <Avatar name="Łukasz Żak" src="/brak.png" />);
    const avatar = screen.getByRole('img', { name: 'Łukasz Żak' });
    const img = avatar.querySelector('img');
    expect(img).not.toBeNull();
    fire(fireEvent.error, img as HTMLImageElement);
    expect(avatar.querySelector('img')).toBeNull();
    expect(avatar).toHaveTextContent('ŁŻ');
  });

  it('stos opisuje pokazane osoby i liczbę pozostałych', () => {
    const people = ['Ania A', 'Bartek B', 'Ewa E', 'Julia J', 'Ola O'].map((name) => ({ name }));
    renderWithProviders(() => <AvatarStack people={people} size={64} max={2} showOverflow />);
    const stack = screen.getByRole('img', { name: 'Ania A, Bartek B i 3 inne osoby' });
    expect(stack).toHaveTextContent('+3');
  });

  it('pusty stan pokazuje ikonę albo własny element', () => {
    const { container } = renderWithProviders(() => (
      <>
        <EmptyState icon="dice" title="Kolekcja jest pusta" />
        <EmptyState lead={<span>🎲</span>} title="Inny" />
      </>
    ));
    expect(container.querySelectorAll('.empty-state__lead svg')).toHaveLength(1);
    expect(screen.getAllByText('🎲')).toHaveLength(1);
  });
});

describe('createChunks', () => {
  function List(props: { readonly items: readonly string[]; readonly query: string }) {
    const chunks = createChunks(
      () => props.items,
      () => props.query,
      2,
    );
    return (
      <>
        <ul>
          <For each={chunks.visible()}>
            {(item, index) => (
              <li data-chunk-start={chunks.chunkStart(index())}>
                <button type="button">{item}</button>
              </li>
            )}
          </For>
        </ul>
        <ShowMore hidden={chunks.hidden()} onClick={chunks.showMore} />
      </>
    );
  }
  const items = ['a', 'b', 'c', 'd', 'e'];

  it('dorysowuje kolejne porcje, przenosi fokus na pierwszą nową i wraca po zmianie frazy', () => {
    const [query, setQuery] = createSignal('');
    renderWithProviders(() => <List items={items} query={query()} />);
    expect(screen.getAllByRole('listitem')).toHaveLength(2);
    fire(fireEvent.click, screen.getByRole('button', { name: 'Pokaż więcej (3)' }));
    expect(screen.getAllByRole('listitem')).toHaveLength(4);
    expect(screen.getByRole('button', { name: 'c' })).toHaveFocus();
    fire(fireEvent.click, screen.getByRole('button', { name: 'Pokaż więcej (1)' }));
    expect(screen.getAllByRole('listitem')).toHaveLength(5);
    expect(screen.getByRole('button', { name: 'e' })).toHaveFocus();
    expect(screen.queryByRole('button', { name: /Pokaż więcej/ })).toBeNull();
    setQuery('x');
    flush();
    expect(screen.getAllByRole('listitem')).toHaveLength(2);
  });
});

describe('bez diagnostyki Solid', () => {
  it('render i interakcje komponentów nie zgłaszają kodów', async () => {
    const { artifact } = await captureArtifact(
      () => {
        const [value, setValue] = createSignal<'a' | 'b'>('a');
        const [text, setText] = createSignal('');
        renderWithProviders(() => (
          <Modal title="Formularz" onClose={() => {}} footer={<Button>Zapisz</Button>}>
            <TextField
              label="Tytuł"
              value={text()}
              onInput={(e) => setText(e.currentTarget.value)}
            />
            <Select
              label="Opcja"
              options={[
                { value: 'a', label: 'A' },
                { value: 'b', label: 'B' },
              ]}
              value={value()}
              onChange={setValue}
              searchLabel="Szukaj"
            />
            <Menu
              label="Akcje"
              items={[{ id: 'x', label: 'X', onSelect: () => {} }]}
              trigger={(props) => (
                <button type="button" {...props}>
                  ⋯
                </button>
              )}
            />
            <AvatarStack people={[{ name: 'Ania A' }, { name: 'Bartek B' }]} max={1} showOverflow />
          </Modal>
        ));
        fire(fireEvent.input, screen.getByLabelText('Tytuł'), { target: { value: 'Azul' } });
        fire(fireEvent.click, screen.getByRole('button', { name: /Opcja/ }));
        fire(fireEvent.keyDown, screen.getByRole('combobox'), { key: 'ArrowDown' });
        fire(fireEvent.keyDown, screen.getByRole('combobox'), { key: 'Enter' });
        fire(fireEvent.click, screen.getByRole('button', { name: '⋯' }));
        fire(fireEvent.click, screen.getByRole('menuitem', { name: 'X' }));
      },
      { scenario: 'ui-components' },
    );
    expectNoDiagnostics(artifact);
  });
});
