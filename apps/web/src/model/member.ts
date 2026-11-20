export type MemberRole = 'admin' | 'player';

/** Członek klubu. */
export interface Member {
  readonly id: string;
  /**
   * Stały, niezmienny identyfikator czytelny dla ludzi (np. `ada-nowak-3f2a`).
   * Wyznacza kolor monogramu, więc kolor nie zmienia się po zmianie imienia.
   */
  readonly hook: string;
  readonly firstName: string;
  readonly lastName: string;
  readonly role: MemberRole;
  /** Adres zdjęcia profilowego; `null` = monogram z inicjałów. */
  readonly avatarUrl: string | null;
  /** Usunięty członek zostaje w historii, ale jego profil jest tylko do odczytu. */
  readonly removed: boolean;
}

export function fullName(member: Pick<Member, 'firstName' | 'lastName'>): string {
  return `${member.firstName} ${member.lastName}`;
}
