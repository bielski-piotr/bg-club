import { describe, expect, it } from 'vitest';
import { compareByDirection } from './index';

describe('compareByDirection', () => {
  it('przy „więcej = lepiej” stawia wyższy wynik wyżej', () => {
    expect([3, 10, 7].sort((a, b) => compareByDirection(a, b, 'higher'))).toEqual([10, 7, 3]);
  });

  it('przy „mniej = lepiej” stawia niższy wynik wyżej', () => {
    expect([3, 10, 7].sort((a, b) => compareByDirection(a, b, 'lower'))).toEqual([3, 7, 10]);
  });

  it('zwraca 0 przy remisie', () => {
    expect(compareByDirection(5, 5, 'higher')).toBe(0);
    expect(compareByDirection(5, 5, 'lower')).toBe(0);
  });
});
