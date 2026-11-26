/** Proponowane terminy spotkania w formularzu (głosowanie na termin, `dateVoting.ts`). */

/** Propozycja terminu w formularzu: data i godzina w strefie klubu. */
export interface DateOptionValue {
  /** `RRRR-MM-DD`. */
  readonly date: string;
  /** `GG:MM`. */
  readonly time: string;
}

const optionKey = (option: DateOptionValue) => `${option.date} ${option.time}`;

/** Czy dwie listy propozycji to ten sam zestaw terminów (kolejność i powtórzenia bez znaczenia). */
export function sameDateOptions(
  a: readonly DateOptionValue[],
  b: readonly DateOptionValue[],
): boolean {
  const left = new Set(a.map(optionKey));
  const right = new Set(b.map(optionKey));
  return left.size === right.size && [...left].every((key) => right.has(key));
}

/** Indeksy propozycji, które powtarzają wcześniejszą (ten sam dzień i godzina). */
export function duplicateDateOptions(options: readonly DateOptionValue[]): ReadonlySet<number> {
  const seen = new Set<string>();
  const duplicates = new Set<number>();
  options.forEach((option, index) => {
    if (option.date === '' || option.time === '') return;
    const key = optionKey(option);
    if (seen.has(key)) duplicates.add(index);
    seen.add(key);
  });
  return duplicates;
}
