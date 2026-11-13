import { act, fireEvent, render, screen, within } from '@testing-library/react';
import { useState } from 'react';
import { describe, expect, it, vi } from 'vitest';
import { t } from '../i18n';
import {
  AvatarStack,
  Avatar,
  Button,
  ChipGroup,
  EmptyState,
  PasswordField,
  SearchField,
  SegmentedControl,
  Select,
  Slider,
  Stepper,
  Switch,
  Tabs,
  TextField,
  ToastProvider,
  useToast,
} from './index';

describe('Button', () => {
  it('w trakcie ładowania ignoruje kliknięcia i ogłasza stan', () => {
    const onClick = vi.fn();
    render(
      <Button loading onClick={onClick}>
        Zapisz
      </Button>,
    );
    const button = screen.getByRole('button', { name: /Zapisz/ });
    fireEvent.click(button);
    expect(onClick).not.toHaveBeenCalled();
    expect(button).toHaveAttribute('aria-busy', 'true');
    expect(button).toHaveTextContent(t.ui.loading);
  });

  it('domyślnie nie wysyła formularza', () => {
    render(<Button>Dalej</Button>);
    expect(screen.getByRole('button')).toHaveAttribute('type', 'button');
  });
});

describe('TextField', () => {
  it('wiąże etykietę i komunikat błędu z polem', () => {
    render(<TextField label="Imię" error="Podaj imię." defaultValue="" />);
    const input = screen.getByLabelText('Imię');
    expect(input).toHaveAttribute('aria-invalid', 'true');
    expect(input).toHaveAccessibleDescription('Podaj imię.');
  });

  it('pole hasła pokazuje i ukrywa wartość', () => {
    render(<PasswordField label="Hasło" defaultValue="sekret" />);
    const input = screen.getByLabelText('Hasło');
    expect(input).toHaveAttribute('type', 'password');
    fireEvent.click(screen.getByRole('button', { name: t.ui.showPassword }));
    expect(input).toHaveAttribute('type', 'text');
    expect(screen.getByRole('button', { name: t.ui.hidePassword })).toHaveAttribute(
      'aria-pressed',
      'true',
    );
  });
});

describe('SearchField', () => {
  it('Esc czyści wpisany tekst', () => {
    function Harness() {
      const [value, setValue] = useState('azul');
      return <SearchField label="Szukaj gry" value={value} onValueChange={setValue} />;
    }
    render(<Harness />);
    const input = screen.getByRole('searchbox', { name: 'Szukaj gry' });
    fireEvent.keyDown(input, { key: 'Escape' });
    expect(input).toHaveValue('');
  });
});

describe('Stepper', () => {
  it('zmienia wartość strzałkami i trzyma się zakresu', () => {
    function Harness() {
      const [value, setValue] = useState(2);
      return <Stepper label="Gracze" value={value} onChange={setValue} min={1} max={4} />;
    }
    render(<Harness />);
    const spin = screen.getByRole('spinbutton', { name: 'Gracze' });
    fireEvent.keyDown(spin, { key: 'ArrowUp' });
    expect(spin).toHaveAttribute('aria-valuenow', '3');
    fireEvent.keyDown(spin, { key: 'End' });
    expect(spin).toHaveAttribute('aria-valuenow', '4');
    fireEvent.click(screen.getByRole('button', { name: t.ui.increase }));
    expect(spin).toHaveAttribute('aria-valuenow', '4');
    fireEvent.keyDown(spin, { key: 'Home' });
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

  function Harness({ onChange }: { onChange?: (v: string) => void }) {
    const [value, setValue] = useState<string>('all');
    return (
      <Select
        label="Rok"
        options={options}
        value={value}
        onChange={(v) => {
          setValue(v);
          onChange?.(v);
        }}
      />
    );
  }

  it('obsługuje wybór z klawiatury i pomija wyłączone opcje', () => {
    const onChange = vi.fn();
    render(<Harness onChange={onChange} />);
    const trigger = screen.getByRole('button', { name: /Rok/ });
    expect(trigger).toHaveAttribute('aria-expanded', 'false');

    fireEvent.keyDown(trigger, { key: 'ArrowDown' });
    const list = screen.getByRole('listbox', { name: 'Rok' });
    expect(list).toHaveFocus();
    expect(list).toHaveAttribute('aria-activedescendant', screen.getAllByRole('option')[0]?.id);

    fireEvent.keyDown(list, { key: 'ArrowDown' });
    fireEvent.keyDown(list, { key: 'ArrowDown' });
    // „2025” jest wyłączony, więc zaznaczenie przeskakuje na „2024”.
    expect(list).toHaveAttribute(
      'aria-activedescendant',
      screen.getByRole('option', { name: '2024' }).id,
    );
    fireEvent.keyDown(list, { key: 'Enter' });

    expect(onChange).toHaveBeenCalledWith('2024');
    expect(screen.queryByRole('listbox')).not.toBeInTheDocument();
    expect(trigger).toHaveFocus();
    expect(trigger).toHaveTextContent('2024');
  });

  it('Esc zamyka listę bez zmiany wartości', () => {
    const onChange = vi.fn();
    render(<Harness onChange={onChange} />);
    const trigger = screen.getByRole('button', { name: /Rok/ });
    fireEvent.click(trigger);
    fireEvent.keyDown(screen.getByRole('listbox'), { key: 'Escape' });
    expect(screen.queryByRole('listbox')).not.toBeInTheDocument();
    expect(onChange).not.toHaveBeenCalled();
  });

  it('kliknięcie poza listą ją zamyka', () => {
    render(<Harness />);
    fireEvent.click(screen.getByRole('button', { name: /Rok/ }));
    expect(screen.getByRole('listbox')).toBeInTheDocument();
    fireEvent.pointerDown(document.body);
    expect(screen.queryByRole('listbox')).not.toBeInTheDocument();
  });
});

describe('Tabs', () => {
  it('strzałki przenoszą zaznaczenie i fokus (roving tabindex)', () => {
    function Harness() {
      const [tab, setTab] = useState<'a' | 'b' | 'c'>('a');
      return (
        <Tabs
          label="Zakres"
          items={[
            { id: 'a', label: 'Punkty' },
            { id: 'b', label: 'Wygrane' },
            { id: 'c', label: 'Seria' },
          ]}
          value={tab}
          onChange={setTab}
        >
          {(v) => <p>Panel {v}</p>}
        </Tabs>
      );
    }
    render(<Harness />);
    const first = screen.getByRole('tab', { name: 'Punkty' });
    expect(first).toHaveAttribute('tabindex', '0');
    fireEvent.keyDown(first, { key: 'ArrowLeft' });
    const last = screen.getByRole('tab', { name: 'Seria' });
    expect(last).toHaveAttribute('aria-selected', 'true');
    expect(last).toHaveFocus();
    expect(first).toHaveAttribute('tabindex', '-1');
    expect(screen.getByRole('tabpanel', { name: 'Seria' })).toHaveTextContent('Panel c');
  });
});

describe('SegmentedControl i ChipGroup', () => {
  it('pigułki to grupa radio z podpisem', () => {
    const onChange = vi.fn();
    render(
      <SegmentedControl
        legend="Kierunek"
        options={[
          { value: 'more', label: 'Więcej = lepiej' },
          { value: 'less', label: 'Mniej = lepiej' },
        ]}
        value="more"
        onChange={onChange}
      />,
    );
    const group = screen.getByRole('group', { name: 'Kierunek' });
    expect(within(group).getByRole('radio', { name: 'Więcej = lepiej' })).toBeChecked();
    fireEvent.click(within(group).getByRole('radio', { name: 'Mniej = lepiej' }));
    expect(onChange).toHaveBeenCalledWith('less');
  });

  it('chipy zwracają wybór w kolejności opcji', () => {
    const onChange = vi.fn();
    render(
      <ChipGroup
        legend="Sumuje kategorie"
        options={[
          { value: 'a', label: 'Ptaki' },
          { value: 'b', label: 'Jajka' },
          { value: 'c', label: 'Żywność' },
        ]}
        values={['c']}
        onChange={onChange}
      />,
    );
    fireEvent.click(screen.getByRole('checkbox', { name: 'Ptaki' }));
    expect(onChange).toHaveBeenCalledWith(['a', 'c']);
  });
});

describe('Switch i Slider', () => {
  it('switch ma rolę i stan', () => {
    const onChange = vi.fn();
    render(<Switch label="Wygładź krawędzie" checked={false} onCheckedChange={onChange} />);
    const sw = screen.getByRole('switch', { name: 'Wygładź krawędzie' });
    expect(sw).toHaveAttribute('aria-checked', 'false');
    fireEvent.click(sw);
    expect(onChange).toHaveBeenCalledWith(true);
  });

  it('slider jest natywnym suwakiem z etykietą', () => {
    const onChange = vi.fn();
    render(<Slider label="Siła" min={0} max={10} value={4} onValueChange={onChange} />);
    const slider = screen.getByRole('slider', { name: 'Siła' });
    fireEvent.change(slider, { target: { value: '7' } });
    expect(onChange).toHaveBeenCalledWith(7);
  });
});

describe('Avatar', () => {
  it('ma tekst alternatywny z imieniem i monogram', () => {
    render(<Avatar name="Łukasz Żak" />);
    const avatar = screen.getByRole('img', { name: 'Łukasz Żak' });
    expect(avatar).toHaveTextContent('ŁŻ');
  });

  it('usunięty członek ma dopisek w opisie', () => {
    render(<Avatar name="Jan Kowalski" removed />);
    expect(
      screen.getByRole('img', { name: `Jan Kowalski ${t.ui.removedSuffix}` }),
    ).toBeInTheDocument();
  });

  it('stos opisuje pokazane osoby i liczbę pozostałych', () => {
    const people = ['Ania A', 'Bartek B', 'Ewa E', 'Julia J', 'Ola O'].map((name) => ({ name }));
    render(<AvatarStack people={people} size={64} max={2} showOverflow />);
    const stack = screen.getByRole('img', { name: 'Ania A, Bartek B i 3 inne osoby' });
    expect(stack).toHaveTextContent('+3');
  });
});

describe('ToastProvider', () => {
  function Trigger() {
    const toast = useToast();
    return (
      <>
        <button onClick={() => toast.show('Głos zapisany')}>ok</button>
        <button onClick={() => toast.show('Trwa już inne spotkanie.', 'error')}>błąd</button>
      </>
    );
  }

  it('pokazuje toasty w regionach aria-live i chowa je po czasie', () => {
    vi.useFakeTimers();
    try {
      render(
        <ToastProvider duration={1000}>
          <Trigger />
        </ToastProvider>,
      );
      fireEvent.click(screen.getByRole('button', { name: 'ok' }));
      fireEvent.click(screen.getByRole('button', { name: 'błąd' }));
      const region = screen.getByRole('region', { name: t.ui.notifications });
      expect(within(region).getByText('Głos zapisany').closest('[aria-live]')).toHaveAttribute(
        'aria-live',
        'polite',
      );
      expect(
        within(region).getByText('Trwa już inne spotkanie.').closest('[aria-live]'),
      ).toHaveAttribute('aria-live', 'assertive');

      act(() => vi.advanceTimersByTime(1000));
      expect(screen.queryByText('Głos zapisany')).not.toBeInTheDocument();
      // Błąd zostaje dwa razy dłużej.
      expect(screen.getByText('Trwa już inne spotkanie.')).toBeInTheDocument();
      act(() => vi.advanceTimersByTime(1000));
      expect(screen.queryByText('Trwa już inne spotkanie.')).not.toBeInTheDocument();
    } finally {
      vi.useRealTimers();
    }
  });

  it('useToast bez providera zgłasza błąd', () => {
    vi.spyOn(console, 'error').mockImplementation(() => {});
    expect(() => render(<Trigger />)).toThrow('useToast wymaga ToastProvider');
  });
});

describe('poprawki po code review', () => {
  it('pusty błąd nie ukrywa podpowiedzi ani nie psuje aria-describedby', () => {
    render(<TextField label="Imię" hint="Widzą je wszyscy." error="" defaultValue="" />);
    const input = screen.getByLabelText('Imię');
    expect(input).toHaveAccessibleDescription('Widzą je wszyscy.');
    expect(input).not.toHaveAttribute('aria-invalid');
  });

  it('z wyszukiwarką filtruje bez polskich znaków i wybiera Enterem (DS §17)', () => {
    const onChange = vi.fn();
    render(
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
      />,
    );
    const trigger = screen.getByRole('button', { name: /Strefa/ });
    fireEvent.click(trigger);
    const search = screen.getByRole('combobox', { name: 'Szukaj strefy' });
    expect(search).toHaveFocus();
    expect(screen.getAllByRole('option')).toHaveLength(3);
    // Zaznaczona jest bieżąca wartość.
    expect(search).toHaveAttribute(
      'aria-activedescendant',
      screen.getByRole('option', { name: /Europe\/Warsaw/ }).id,
    );

    fireEvent.change(search, { target: { value: 'hó chi' } });
    expect(screen.getAllByRole('option').map((o) => o.textContent)).toEqual([
      'Asia/Ho_Chi_MinhUTC+07:00',
    ]);
    fireEvent.change(search, { target: { value: 'xyz' } });
    expect(screen.queryAllByRole('option')).toHaveLength(0);
    expect(screen.getByText(t.ui.noOptions)).toBeInTheDocument();

    fireEvent.change(search, { target: { value: 'america' } });
    fireEvent.keyDown(search, { key: 'Enter' });
    expect(onChange).toHaveBeenCalledWith('America/New_York');
    expect(screen.queryByRole('listbox')).not.toBeInTheDocument();
    expect(trigger).toHaveFocus();

    // Esc zamyka listę i nie zamyka popupu wyżej (stopPropagation).
    fireEvent.click(trigger);
    // `fireEvent` zwraca `false`, gdy obsługa wywołała `preventDefault`.
    expect(fireEvent.keyDown(screen.getByRole('combobox'), { key: 'Escape' })).toBe(false);
    expect(screen.queryByRole('listbox')).not.toBeInTheDocument();
  });

  it('Tab w otwartej liście oddaje fokus przyciskowi listy', () => {
    render(
      <Select label="Rok" options={[{ value: 'a', label: 'A' }]} value="a" onChange={() => {}} />,
    );
    const trigger = screen.getByRole('button', { name: /Rok/ });
    fireEvent.click(trigger);
    fireEvent.keyDown(screen.getByRole('listbox'), { key: 'Tab' });
    expect(screen.queryByRole('listbox')).not.toBeInTheDocument();
    expect(trigger).toHaveFocus();
  });

  it('wyłączona wybrana opcja nie jest aktywna po otwarciu listy', () => {
    render(
      <Select
        label="Rok"
        options={[
          { value: 'a', label: 'A' },
          { value: 'b', label: 'B', disabled: true },
        ]}
        value="b"
        onChange={() => {}}
      />,
    );
    fireEvent.click(screen.getByRole('button', { name: /Rok/ }));
    expect(screen.getByRole('listbox')).toHaveAttribute(
      'aria-activedescendant',
      screen.getByRole('option', { name: 'A' }).id,
    );
  });

  it('zamknięcie toastu przyciskiem z fokusem nie wstrzymuje kolejnych', () => {
    vi.useFakeTimers();
    try {
      function Trigger() {
        const toast = useToast();
        return <button onClick={() => toast.show('Głos zapisany')}>pokaż</button>;
      }
      render(
        <ToastProvider duration={1000}>
          <Trigger />
        </ToastProvider>,
      );
      fireEvent.click(screen.getByRole('button', { name: 'pokaż' }));
      const close = screen.getByRole('button', { name: t.ui.dismissToast });
      act(() => close.focus());
      fireEvent.click(close);
      expect(screen.queryByText('Głos zapisany')).not.toBeInTheDocument();

      fireEvent.click(screen.getByRole('button', { name: 'pokaż' }));
      act(() => vi.advanceTimersByTime(1000));
      expect(screen.queryByText('Głos zapisany')).not.toBeInTheDocument();
    } finally {
      vi.useRealTimers();
    }
  });

  it('pusty stan pokazuje ikonę albo własny element', () => {
    const { container } = render(
      <>
        <EmptyState icon="dice" title="Kolekcja jest pusta" />
        <EmptyState lead={<span>🎲</span>} title="Inny" />
      </>,
    );
    expect(container.querySelectorAll('.empty-state__lead svg')).toHaveLength(1);
    expect(screen.getByText('🎲')).toBeInTheDocument();
  });
});
