import { describe, expect, it } from 'vitest';
import { viewForPath } from './path';

describe('viewForPath', () => {
  it('hub pod adresem głównym, także z ukośnikiem na końcu i index.html', () => {
    expect(viewForPath('/')).toBe('app');
    expect(viewForPath('/index.html')).toBe('app');
    expect(viewForPath('//')).toBe('app');
  });

  it('każda inna ścieżka, także /design-system, to nieznana strona', () => {
    expect(viewForPath('/design-system')).toBe('notFound');
    expect(viewForPath('/members')).toBe('notFound');
  });
});
