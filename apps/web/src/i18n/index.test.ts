import { describe, expect, it } from 'vitest';
import { format, formatNumber, plural } from '.';

const partie = { one: '{n} partia', few: '{n} partie', many: '{n} partii' };

describe('plural', () => {
  it.each([
    [1, '1 partia'],
    [3, '3 partie'],
    [5, '5 partii'],
    [12, '12 partii'],
    [22, '22 partie'],
    [0, '0 partii'],
  ])('%i → %s', (n, expected) => {
    expect(plural(n, partie)).toBe(expected);
  });

  it('dla ułamka wybiera formę „many” i polski przecinek', () => {
    expect(plural(1.5, { one: '{n} pkt', few: '{n} pkt', many: '{n} pkt' })).toBe('1,5 pkt');
  });
});

describe('format', () => {
  it('zostawia nieznany parametr widoczny', () => {
    expect(format('{a} i {b}', { a: 'Ada' })).toBe('Ada i {b}');
  });

  it('formatuje liczby z najwyżej dwoma miejscami po przecinku', () => {
    expect(formatNumber(17.555)).toBe('17,56');
  });
});
