/** Łączy nazwy klas, pomijając wartości fałszywe. */
export function cx(...names: ReadonlyArray<string | false | null | undefined>): string {
  return names.filter(Boolean).join(' ');
}
