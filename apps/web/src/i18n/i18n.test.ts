import { describe, expect, it } from 'vitest';
import { format, plural, t } from './index';

describe('format', () => {
  it('podstawia parametry', () => {
    expect(format('Brakujące zmienne: {names}.', { names: 'A, B' })).toBe(
      'Brakujące zmienne: A, B.',
    );
  });

  it('podstawia liczby i powtórzenia', () => {
    expect(format('{n} z {n}', { n: 3 })).toBe('3 z 3');
  });

  it('zostawia nieznany parametr bez zmian', () => {
    expect(format('Witaj, {name}', {})).toBe('Witaj, {name}');
  });
});

describe('słownik pl', () => {
  it('nie ma pustych tekstów', () => {
    const empty: string[] = [];
    const walk = (node: unknown, path: string): void => {
      if (typeof node === 'string') {
        if (node.trim() === '') empty.push(path);
        return;
      }
      for (const [key, value] of Object.entries(node as Record<string, unknown>)) {
        walk(value, path ? `${path}.${key}` : key);
      }
    };
    walk(t, '');
    expect(empty).toEqual([]);
  });
});

describe('plural', () => {
  const forms = { one: '{n} głos', few: '{n} głosy', many: '{n} głosów' };

  it('wybiera polską formę liczby mnogiej', () => {
    expect(plural(1, forms)).toBe('1 głos');
    expect(plural(2, forms)).toBe('2 głosy');
    expect(plural(4, forms)).toBe('4 głosy');
    expect(plural(5, forms)).toBe('5 głosów');
    expect(plural(12, forms)).toBe('12 głosów');
    expect(plural(22, forms)).toBe('22 głosy');
    expect(plural(0, forms)).toBe('0 głosów');
  });

  it('podstawia dodatkowe parametry', () => {
    expect(plural(8, t.ui.stackOthers, { names: 'Ania, Bartek' })).toBe(
      'Ania, Bartek i 8 innych osób',
    );
  });
});
