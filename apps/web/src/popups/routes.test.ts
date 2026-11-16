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

  it('zna kalendarz i popup spotkania (CAL-1, MTG-3)', () => {
    expect(parseStack(`?p=calendar&p=meeting/${ID.toUpperCase()}`)).toEqual([
      { kind: 'calendar' },
      { kind: 'meeting', id: ID },
    ]);
    expect(stackSearch('', [{ kind: 'calendar' }, { kind: 'meeting', id: ID }])).toBe(
      `?p=calendar&p=meeting/${ID}`,
    );
    for (const raw of ['calendar/2026-11', 'meeting/1', `meeting/${ID}/x`]) {
      expect(parseRoute(raw)).toEqual({ kind: 'invalid', raw });
    }
  });

  it('zna ranking z zakładką (LB-3)', () => {
    expect(parseStack('?p=leaderboard&p=leaderboard/streak')).toEqual([
      { kind: 'leaderboard' },
      { kind: 'leaderboard', tab: 'streak' },
    ]);
    expect(stackSearch('', [{ kind: 'leaderboard', tab: 'wins' }])).toBe('?p=leaderboard/wins');
    expect(stackSearch('', [{ kind: 'leaderboard' }])).toBe('?p=leaderboard');
    for (const raw of ['leaderboard/rok', 'leaderboard/points/2026']) {
      expect(parseRoute(raw)).toEqual({ kind: 'invalid', raw });
    }
  });

  it('zna rozpoczęcie, zakończenie i ponowne otwarcie spotkania (RUN-1, RUN-4, RUN-5)', () => {
    const stack = [
      { kind: 'meeting', id: ID },
      { kind: 'start-meeting', id: ID },
      { kind: 'finish-meeting', id: ID },
      { kind: 'reopen-meeting', id: ID },
    ] as const;
    const search = `?p=meeting/${ID}&p=meeting/${ID}/start&p=meeting/${ID}/finish&p=meeting/${ID}/reopen`;
    expect(parseStack(search)).toEqual(stack);
    expect(stackSearch('', stack)).toBe(search);
  });

  it('zna kreator nowej partii (RUN-2)', () => {
    const stack = [
      { kind: 'meeting', id: ID },
      { kind: 'new-play', meetingId: ID },
    ] as const;
    const search = `?p=meeting/${ID}&p=meeting/${ID}/plays/new`;
    expect(parseStack(search)).toEqual(stack);
    expect(stackSearch('', stack)).toBe(search);
    expect(parseRoute(`meeting/${ID.toUpperCase()}/plays/new`)).toEqual(stack[1]);
    for (const raw of [`meeting/${ID}/plays`, `meeting/${ID}/plays/x`, 'meeting/1/plays/new']) {
      expect(parseRoute(raw)).toEqual({ kind: 'invalid', raw });
    }
  });

  it('zna partię w toku i jej porzucenie (PAD-4, PAD-8)', () => {
    const stack = [
      { kind: 'meeting', id: ID },
      { kind: 'play', id: ID },
      { kind: 'discard-play', id: ID },
    ] as const;
    const search = `?p=meeting/${ID}&p=play/${ID}&p=play/${ID}/discard`;
    expect(parseStack(search)).toEqual(stack);
    expect(stackSearch('', stack)).toBe(search);
    expect(parseRoute(`play/${ID.toUpperCase()}`)).toEqual(stack[1]);
    for (const raw of ['play', 'play/1', `play/${ID}/x`, `play/${ID}/discard/x`]) {
      expect(parseRoute(raw)).toEqual({ kind: 'invalid', raw });
    }
  });

  it('zna usunięcie zapisanej partii (VIEW-6)', () => {
    const stack = [
      { kind: 'meeting', id: ID },
      { kind: 'delete-play', id: ID },
    ] as const;
    const search = `?p=meeting/${ID}&p=play/${ID}/delete`;
    expect(parseStack(search)).toEqual(stack);
    expect(stackSearch('', stack)).toBe(search);
    expect(parseRoute(`play/${ID.toUpperCase()}/delete`)).toEqual(stack[1]);
    for (const raw of ['play/1/delete', `play/${ID}/delete/x`]) {
      expect(parseRoute(raw)).toEqual({ kind: 'invalid', raw });
    }
  });

  it('zna planowanie, edycję i usuwanie spotkania (PLAN-1, PLAN-3)', () => {
    expect(parseStack(`?p=meetings/new&p=meeting/${ID}/edit&p=meeting/${ID}/delete`)).toEqual([
      { kind: 'add-meeting' },
      { kind: 'edit-meeting', id: ID },
      { kind: 'delete-meeting', id: ID },
    ]);
    expect(parseRoute('meetings/new/2026-11-28')).toEqual({
      kind: 'add-meeting',
      date: '2026-11-28',
    });
    expect(stackSearch('', [{ kind: 'add-meeting', date: '2026-11-28' }])).toBe(
      '?p=meetings/new/2026-11-28',
    );
    expect(stackSearch('', [{ kind: 'add-meeting' }])).toBe('?p=meetings/new');
    for (const raw of [
      'meetings/new/2026-02-30',
      'meetings/new/jutro',
      'meeting/1/edit',
      'meetings',
    ]) {
      expect(parseRoute(raw)).toEqual({ kind: 'invalid', raw });
    }
  });

  it('zna popup spotkania i publikację gier (VIEW-1, VOTE-5)', () => {
    expect(parseStack(`?p=meeting/${ID}&p=meeting/${ID.toUpperCase()}/publish`)).toEqual([
      { kind: 'meeting', id: ID },
      { kind: 'publish-games', id: ID },
    ]);
    expect(
      stackSearch('', [
        { kind: 'meeting', id: ID },
        { kind: 'publish-games', id: ID },
      ]),
    ).toBe(`?p=meeting/${ID}&p=meeting/${ID}/publish`);
    for (const raw of ['meeting/1', 'meeting/1/publish', `meeting/${ID}/votes`, 'meeting']) {
      expect(parseRoute(raw)).toEqual({ kind: 'invalid', raw });
    }
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
    // Szczegóły gry z galerią karteczek i karteczka partii (GAME-10, PAD-6, VIEW-3).
    expect(parseStack(`?p=games&p=game/${ID.toUpperCase()}&p=sheet/${ID}`)).toEqual([
      { kind: 'games' },
      { kind: 'game', id: ID },
      { kind: 'sheet', id: ID },
    ]);
    expect(
      stackSearch('', [
        { kind: 'game', id: ID },
        { kind: 'sheet', id: ID },
      ]),
    ).toBe(`?p=game/${ID}&p=sheet/${ID}`);
    expect(parseRoute('sheet/1')).toEqual({ kind: 'invalid', raw: 'sheet/1' });
    expect(parseRoute(`sheet/${ID}/3d`)).toEqual({ kind: 'invalid', raw: `sheet/${ID}/3d` });
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
