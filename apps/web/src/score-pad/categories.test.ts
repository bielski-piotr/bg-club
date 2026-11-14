import { describe, expect, it } from 'vitest';
import {
  categoryIssueMessages,
  issueMessage,
  issueMessages,
  lineLabel,
  parseInteger,
  parseIntegers,
} from './categories';

/** Pomocniki kroku 4 „Kategorie” (EDT-13): liczby z pól i komunikaty walidatora. */

const LINES = [{ label: 'Gracze' }, { label: 'Ptaki' }, { label: ' ' }];

describe('liczby z pól', () => {
  it('liczba całkowita, także ujemna z typograficznym minusem', () => {
    expect(parseInteger(' 12 ')).toBe(12);
    expect(parseInteger('-5')).toBe(-5);
    expect(parseInteger('−5')).toBe(-5);
    expect(parseInteger('')).toBeNull();
    expect(parseInteger('-')).toBeNull();
    expect(parseInteger('2,5')).toBeNull();
    expect(parseInteger('1e3')).toBeNull();
  });

  it('lista wartości oddzielonych przecinkami, średnikami albo spacjami', () => {
    expect(parseIntegers('0, 3;7  10')).toEqual([0, 3, 7, 10]);
    expect(parseIntegers('')).toEqual([]);
    expect(parseIntegers('1, x')).toBeNull();
  });
});

describe('komunikaty walidatora', () => {
  it('po polsku, z nazwą kategorii', () => {
    expect(issueMessage({ code: 'invalid-range', path: 'lines[1]' }, LINES)).toBe(
      'Kategoria „Ptaki”: min nie może być większe od max, a krok musi wynosić co najmniej 1.',
    );
    expect(issueMessage({ code: 'cycle', path: 'lines[2]' }, LINES)).toBe(
      'Suma „Kategoria 3” liczy samą siebie. Odznacz sumę, która ją zawiera.',
    );
    expect(issueMessage({ code: 'not-numeric', path: 'ranking.line' }, LINES)).toBe(
      'O miejscu może decydować tylko punktacja albo suma.',
    );
    expect(issueMessage({ code: 'no-input', path: 'lines' }, LINES)).toBe(
      'Notes musi mieć co najmniej jedną kategorię typu „Punktacja”.',
    );
  });

  it('bez powtórzeń; problemy jednej kategorii osobno', () => {
    const issues = [
      { code: 'cycle', path: 'lines[1]' },
      { code: 'cycle', path: 'lines[1]' },
      { code: 'names-count', path: 'lines' },
    ] as const;
    expect(issueMessages(issues, LINES)).toHaveLength(2);
    expect(categoryIssueMessages(issues, LINES, 1)).toEqual([
      'Suma „Ptaki” liczy samą siebie. Odznacz sumę, która ją zawiera.',
    ]);
    expect(categoryIssueMessages(issues, LINES, 0)).toEqual([]);
  });

  it('nazwa domyślna pustej kategorii', () => {
    expect(lineLabel({ label: '' }, 4)).toBe('Kategoria 5');
  });
});
