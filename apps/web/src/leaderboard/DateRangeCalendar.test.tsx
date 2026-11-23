import { fireEvent, render, screen, within } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';
import { DateRangeCalendar } from './DateRangeCalendar';
import { pickDay, yearsPageStart } from './rangeCalendar';

function renderCalendar(from: string | null = null, to: string | null = null) {
  const onChange = vi.fn();
  render(<DateRangeCalendar from={from} to={to} today="2026-11-23" onChange={onChange} />);
  return onChange;
}

const day = (label: RegExp) => screen.getByRole('button', { name: label });

describe('kalendarz zakresu dat', () => {
  it('pierwsze kliknięcie wybiera dzień, drugie kończy zakres (w dowolnej kolejności)', () => {
    expect(pickDay(null, '2026-11-10')).toEqual({
      start: '2026-11-10',
      end: '2026-11-10',
      anchor: '2026-11-10',
    });
    expect(pickDay('2026-11-10', '2026-11-03')).toEqual({
      start: '2026-11-03',
      end: '2026-11-10',
      anchor: null,
    });
    const onChange = renderCalendar();
    fireEvent.click(day(/10 listopada 2026/));
    expect(onChange).toHaveBeenLastCalledWith('2026-11-10', '2026-11-10');
    fireEvent.click(day(/20 listopada 2026/));
    expect(onChange).toHaveBeenLastCalledWith('2026-11-10', '2026-11-20');
  });

  it('bez filtra nic nie jest zaznaczone; zakres zaznacza dni od–do', () => {
    renderCalendar();
    expect(screen.queryAllByRole('button', { pressed: true })).toHaveLength(0);
  });

  it('dzień następnego miesiąca widoczny w siatce przełącza kalendarz na ten miesiąc', () => {
    const onChange = renderCalendar();
    expect(
      screen.getByRole('button', { name: /Wybierz miesiąc \(Listopad\)/ }),
    ).toBeInTheDocument();
    // Siatka listopada 2026 kończy się w niedzielę 6 grudnia.
    fireEvent.click(day(/6 grudnia 2026/));
    expect(onChange).toHaveBeenLastCalledWith('2026-12-06', '2026-12-06');
    expect(
      screen.getByRole('button', { name: /Wybierz miesiąc \(Grudzień\)/ }),
    ).toBeInTheDocument();
  });

  it('nazwa miesiąca i rok otwierają szybki wybór', () => {
    renderCalendar('2026-03-05', '2026-03-09');
    fireEvent.click(screen.getByRole('button', { name: /Wybierz miesiąc/ }));
    const months = screen.getByRole('group', { name: 'Miesiące roku 2026' });
    fireEvent.click(within(months).getByRole('button', { name: 'Lipiec' }));
    expect(screen.getByRole('button', { name: /Wybierz miesiąc \(Lipiec\)/ })).toBeInTheDocument();

    fireEvent.click(screen.getByRole('button', { name: /Wybierz rok \(2026\)/ }));
    expect(yearsPageStart(2026)).toBe(2016);
    expect(screen.getByRole('group', { name: 'Lata 2016–2027' })).toBeInTheDocument();
    fireEvent.click(screen.getByRole('button', { name: 'Wcześniejsze lata' }));
    expect(screen.getByRole('group', { name: 'Lata 2004–2015' })).toBeInTheDocument();
    fireEvent.click(screen.getByRole('button', { name: '2010' }));
    expect(screen.getByRole('button', { name: /Wybierz rok \(2010\)/ })).toBeInTheDocument();
    expect(screen.getByRole('button', { name: /Wybierz miesiąc \(Lipiec\)/ })).toBeInTheDocument();
  });
});
