/** Jedyny klub instancji. */
export interface Club {
  readonly name: string;
  /** Adres logo do wyświetlenia; `null` = monogram nazwy. */
  readonly logoUrl: string | null;
  /** Strefa IANA: terminy spotkań i granice lat w rankingach. */
  readonly timezone: string;
}
