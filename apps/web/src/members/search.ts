import type { Profile } from '../profile/profiles';
import { normalizeSearch } from '../ui';

/**
 * Członkowie pasujący do wyszukiwania (MEM-2): każde słowo zapytania musi wystąpić w imieniu,
 * nazwisku albo hooku, bez rozróżniania wielkości liter i polskich znaków („lukasz zol”
 * znajdzie Łukasza Żółwia, „7c1e” jego hook). Puste zapytanie zwraca wszystkich.
 */
export function filterMembers(members: readonly Profile[], query: string): readonly Profile[] {
  const words = normalizeSearch(query.replace(/-/g, ' '))
    .split(' ')
    .filter((word) => word !== '');
  if (words.length === 0) return members;
  return members.filter((member) => {
    const haystack = normalizeSearch(
      `${member.first_name} ${member.last_name} ${member.hook.replace(/-/g, ' ')}`,
    );
    return words.every((word) => haystack.includes(word));
  });
}
