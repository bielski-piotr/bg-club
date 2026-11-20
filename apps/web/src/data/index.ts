import type { Club } from '../model/club';
import type { Member } from '../model/member';
import { club, currentMemberId, members } from './fixtures';

/*
 * Jedyne miejsce, z którego interfejs pobiera dane. Teraz zwraca dane przykładowe;
 * po podłączeniu backendu funkcje zapytają Supabase i zmapują wiersze na typy z `src/model`.
 */

export function getClub(): Club {
  return club;
}

export function getCurrentMember(): Member {
  const me = members.find((m) => m.id === currentMemberId);
  if (!me) throw new Error('data: brak zalogowanego członka w danych');
  return me;
}
