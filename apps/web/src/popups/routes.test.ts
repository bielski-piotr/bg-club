import { describe, expect, it } from 'vitest';
import { MAX_STACK_DEPTH, parseRoute, parseStack, routeKey, stackSearch } from './routes';

const ID = '00000000-0000-4000-a000-000000000001';

describe('adresy popupów (PRD §4)', () => {
  it('czyta stos od dołu do góry', () => {
    expect(parseStack(`?p=members&p=profile/${ID}`)).toEqual([
      { kind: 'members' },
      { kind: 'profile', id: ID },
    ]);
    expect(parseStack('')).toEqual([]);
    expect(parseStack('?x=1')).toEqual([]);
  });

  it('zapisuje stos czytelnie i zostawia inne parametry', () => {
    const search = stackSearch('?x=1&p=stare', [{ kind: 'members' }, { kind: 'profile', id: ID }]);
    expect(search).toBe(`?x=1&p=members&p=profile/${ID}`);
    expect(parseStack(search)).toHaveLength(2);
    expect(stackSearch(`?p=members`, [])).toBe('');
    expect(stackSearch('?x=1&p=members', [])).toBe('?x=1');
  });

  it('akceptuje zakodowany ukośnik i wielkie litery w uuid', () => {
    expect(parseStack(`?p=profile%2F${ID.toUpperCase()}`)).toEqual([{ kind: 'profile', id: ID }]);
  });

  it('oznacza nieznane i uszkodzone adresy jako nieprawidłowe', () => {
    for (const raw of ['', 'nieznany', 'members/1', 'profile', 'profile/123', `profile/${ID}/x`]) {
      expect(parseRoute(raw)).toEqual({ kind: 'invalid', raw });
    }
  });

  it('nieprawidłowy wpis zachowuje swój tekst w adresie', () => {
    const stack = parseStack('?p=co%C5%9B%20dziwnego');
    expect(stack).toEqual([{ kind: 'invalid', raw: 'coś dziwnego' }]);
    expect(parseStack(stackSearch('', stack))).toEqual(stack);
  });

  it('przycina zbyt głęboki stos', () => {
    const search = `?${Array.from({ length: 20 }, () => 'p=members').join('&')}`;
    expect(parseStack(search)).toHaveLength(MAX_STACK_DEPTH);
  });

  it('klucz zależy od poziomu i adresu', () => {
    expect(routeKey({ kind: 'members' }, 0)).not.toBe(routeKey({ kind: 'members' }, 1));
  });
});
