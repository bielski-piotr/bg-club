import { describe, expect, it } from 'vitest';
import { monogram } from './avatarUtils';

describe('monogram', () => {
  it('daje inicjały z polskich imion i nazwisk dwuczłonowych', () => {
    expect(monogram('Łukasz Żak')).toBe('ŁŻ');
    expect(monogram('Magdalena Wiśniewska-Kowalczyk')).toBe('MW');
  });

  it('z jednowyrazowej nazwy klubu daje jedną literę', () => {
    expect(monogram('Meeple')).toBe('M');
  });
});
