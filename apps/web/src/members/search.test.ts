import { describe, expect, it } from 'vitest';
import type { Profile } from '../profile/profiles';
import { filterMembers } from './search';

const member = (first: string, last: string, hook: string): Profile => ({
  id: hook,
  hook,
  first_name: first,
  last_name: last,
  role: 'player',
  avatar_path: null,
  deleted_at: null,
});

const LUKASZ = member('Łukasz', 'Żółw', 'lukasz-zolw-7c1e');
const ANNA = member('Anna', 'Kowalska-Ćwik', 'anna-kowalska-cwik-0a1b');
const ALL = [LUKASZ, ANNA];

describe('wyszukiwanie członków (MEM-2)', () => {
  it('puste zapytanie zwraca wszystkich', () => {
    expect(filterMembers(ALL, '   ')).toBe(ALL);
  });

  it('nie rozróżnia polskich znaków ani wielkości liter', () => {
    expect(filterMembers(ALL, 'ŁUKASZ')).toEqual([LUKASZ]);
    expect(filterMembers(ALL, 'zolw')).toEqual([LUKASZ]);
    expect(filterMembers(ALL, 'ćwik')).toEqual([ANNA]);
  });

  it('każde słowo musi pasować, w dowolnej kolejności', () => {
    expect(filterMembers(ALL, 'żółw łuk')).toEqual([LUKASZ]);
    expect(filterMembers(ALL, 'anna zolw')).toEqual([]);
  });

  it('szuka też po hooku, także z myślnikami', () => {
    expect(filterMembers(ALL, '7c1e')).toEqual([LUKASZ]);
    expect(filterMembers(ALL, 'kowalska-cwik-0a1b')).toEqual([ANNA]);
  });
});
