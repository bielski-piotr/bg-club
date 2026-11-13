import { describe, expect, it } from 'vitest';
import { format, t } from './index';

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
