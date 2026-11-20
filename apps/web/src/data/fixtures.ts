import type { Club } from '../model/club';
import type { Member } from '../model/member';

/*
 * Dane przykładowe do pracy nad interfejsem. Fikcyjne, ale o kształcie i skrajnościach
 * z produkcji: długie nazwiska dwuczłonowe, polskie znaki, członek usunięty.
 */

export const club = {
  name: 'Planszówki na Woli',
  logoUrl: null,
  timezone: 'Europe/Warsaw',
} as const satisfies Club;

export const members = [
  {
    id: '00000000-0000-4000-a000-000000000001',
    hook: 'ada-adminowska-3f2a',
    firstName: 'Ada',
    lastName: 'Adminowska',
    role: 'admin',
    avatarUrl: null,
    removed: false,
  },
  {
    id: '00000000-0000-4000-a000-000000000002',
    hook: 'bartosz-zielinski-91c4',
    firstName: 'Bartosz',
    lastName: 'Zieliński',
    role: 'player',
    avatarUrl: null,
    removed: false,
  },
  {
    id: '00000000-0000-4000-a000-000000000003',
    hook: 'magdalena-wisniewska-kowalczyk-07be',
    firstName: 'Magdalena',
    lastName: 'Wiśniewska-Kowalczyk',
    role: 'player',
    avatarUrl: null,
    removed: false,
  },
  {
    id: '00000000-0000-4000-a000-000000000004',
    hook: 'lukasz-zak-5d10',
    firstName: 'Łukasz',
    lastName: 'Żak',
    role: 'player',
    avatarUrl: null,
    removed: false,
  },
  {
    id: '00000000-0000-4000-a000-000000000005',
    hook: 'ewa-ernst-c3a8',
    firstName: 'Ewa',
    lastName: 'Ernst',
    role: 'player',
    avatarUrl: null,
    removed: true,
  },
] as const satisfies readonly Member[];

/** Zalogowany użytkownik. */
export const currentMemberId: string = members[0].id;
