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

  it('zna formularz klubu (CLUB-2)', () => {
    expect(parseStack('?p=club')).toEqual([{ kind: 'club' }]);
    expect(stackSearch('', [{ kind: 'club' }])).toBe('?p=club');
    expect(parseRoute('club/1')).toEqual({ kind: 'invalid', raw: 'club/1' });
  });

  it('zna ustawienia, zmianę hasła i pierwsze logowanie (USR-5, AUTH-6)', () => {
    expect(parseStack(`?p=profile/${ID}&p=settings&p=settings/password`)).toEqual([
      { kind: 'profile', id: ID },
      { kind: 'settings' },
      { kind: 'change-password' },
    ]);
    expect(stackSearch('', [{ kind: 'settings' }, { kind: 'change-password' }])).toBe(
      '?p=settings&p=settings/password',
    );
    expect(stackSearch('', [{ kind: 'first-login' }])).toBe('?p=first-login');
    expect(parseRoute('first-login')).toEqual({ kind: 'first-login' });
    expect(parseRoute('settings/avatar')).toEqual({ kind: 'invalid', raw: 'settings/avatar' });
    expect(parseRoute(`settings/${ID}`)).toEqual({ kind: 'invalid', raw: `settings/${ID}` });
  });

  it('zna kolekcję gier, formularze i usuwanie gry (GAME-2, GAME-3, GAME-8)', () => {
    expect(parseStack(`?p=games&p=games/new`)).toEqual([{ kind: 'games' }, { kind: 'add-game' }]);
    expect(parseStack(`?p=games&p=game/${ID.toUpperCase()}/edit`)).toEqual([
      { kind: 'games' },
      { kind: 'edit-game', id: ID },
    ]);
    expect(parseRoute(`game/${ID}/delete`)).toEqual({ kind: 'delete-game', id: ID });
    expect(stackSearch('', [{ kind: 'games' }, { kind: 'edit-game', id: ID }])).toBe(
      `?p=games&p=game/${ID}/edit`,
    );
    expect(stackSearch('', [{ kind: 'delete-game', id: ID }])).toBe(`?p=game/${ID}/delete`);
    expect(stackSearch('', [{ kind: 'add-game' }])).toBe('?p=games/new');
    // Szczegóły gry (GAME-10) dochodzą w kolejnym zadaniu; do tego czasu adres jest nieznany.
    expect(parseRoute(`game/${ID}`)).toEqual({ kind: 'invalid', raw: `game/${ID}` });
    expect(parseRoute('game/1/edit')).toEqual({ kind: 'invalid', raw: 'game/1/edit' });
    expect(parseRoute(`game/${ID}/rename`)).toEqual({ kind: 'invalid', raw: `game/${ID}/rename` });
    expect(parseRoute('games/edit')).toEqual({ kind: 'invalid', raw: 'games/edit' });
  });

  it('zna notesy gry, edytor, zmianę nazwy i usuwanie notesu (GAME-7)', () => {
    const PAD = '00000000-0000-4000-d000-000000000001';
    expect(parseStack(`?p=games&p=game/${ID}/scorepads&p=game/${ID}/scorepads/new`)).toEqual([
      { kind: 'games' },
      { kind: 'scorepads', gameId: ID },
      { kind: 'add-scorepad', gameId: ID },
    ]);
    expect(parseRoute(`scorepad/${PAD.toUpperCase()}/edit`)).toEqual({
      kind: 'edit-scorepad',
      id: PAD,
    });
    expect(parseRoute(`scorepad/${PAD}/rename`)).toEqual({ kind: 'rename-scorepad', id: PAD });
    expect(parseRoute(`scorepad/${PAD}/delete`)).toEqual({ kind: 'delete-scorepad', id: PAD });
    for (const route of [
      { kind: 'scorepads', gameId: ID },
      { kind: 'add-scorepad', gameId: ID },
      { kind: 'edit-scorepad', id: PAD },
      { kind: 'rename-scorepad', id: PAD },
      { kind: 'delete-scorepad', id: PAD },
    ] as const) {
      expect(parseStack(stackSearch('', [route]))).toEqual([route]);
    }
    expect(parseRoute(`scorepad/${PAD}`)).toEqual({ kind: 'invalid', raw: `scorepad/${PAD}` });
    expect(parseRoute('scorepad/1/edit')).toEqual({ kind: 'invalid', raw: 'scorepad/1/edit' });
    expect(parseRoute(`game/${ID}/scorepads/edit`)).toEqual({
      kind: 'invalid',
      raw: `game/${ID}/scorepads/edit`,
    });
  });

  it('zna formularz dodawania członka (MEM-3)', () => {
    expect(parseStack('?p=members&p=members/new')).toEqual([
      { kind: 'members' },
      { kind: 'add-member' },
    ]);
    expect(stackSearch('', [{ kind: 'add-member' }])).toBe('?p=members/new');
    expect(parseRoute('members/nowy')).toEqual({ kind: 'invalid', raw: 'members/nowy' });
  });

  it('zna potwierdzenia usunięcia członka i własnego konta (MEM-4, USR-6)', () => {
    expect(parseStack(`?p=members&p=profile/${ID}&p=profile/${ID}/delete`)).toEqual([
      { kind: 'members' },
      { kind: 'profile', id: ID },
      { kind: 'delete-member', id: ID },
    ]);
    expect(stackSearch('', [{ kind: 'delete-member', id: ID }])).toBe(`?p=profile/${ID}/delete`);
    expect(parseRoute(`profile/${ID.toUpperCase()}/delete`)).toEqual({
      kind: 'delete-member',
      id: ID,
    });
    expect(parseStack('?p=settings&p=settings/delete')).toEqual([
      { kind: 'settings' },
      { kind: 'delete-account' },
    ]);
    expect(stackSearch('', [{ kind: 'delete-account' }])).toBe('?p=settings/delete');
    expect(parseRoute('profile/123/delete')).toEqual({
      kind: 'invalid',
      raw: 'profile/123/delete',
    });
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
