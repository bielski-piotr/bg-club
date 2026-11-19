import type { Profile } from '../profile/profiles';

/** Przy więcej niż 5 członkach 4 awatary i licznik `+N`, przy 5 lub mniej wszystkie. */
export const MEMBERS_WIDGET_SLOTS = 5;

export function visibleMembers(members: readonly Profile[]) {
  const shown =
    members.length > MEMBERS_WIDGET_SLOTS ? members.slice(0, MEMBERS_WIDGET_SLOTS - 1) : members;
  return { shown, rest: members.length - shown.length };
}
