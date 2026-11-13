import { format, plural, t } from '../i18n';
import { ScorepadError, type ScorepadFailure } from './scorepads';

const ERRORS: Readonly<Record<ScorepadFailure, string>> = t.scorepads.errors;

/** Komunikat błędu zapisu, importu lub zmiany notesu. */
export function scorepadErrorMessage(error: unknown): string {
  return error instanceof ScorepadError ? ERRORS[error.reason] : ERRORS.save;
}

/**
 * Ostrzeżenie EDT-6: notes ma mniej miejsc dla graczy niż max. liczba graczy gry, więc nadaje
 * się tylko do mniejszych partii. `undefined`, gdy miejsc wystarcza.
 */
export function fewerSeatsMessage(seats: number, maxPlayers: number): string | undefined {
  if (seats >= maxPlayers) return undefined;
  return format(t.scorepads.fewerSeatsWarning, {
    seats: plural(seats, t.scorepads.list.seats),
    max: maxPlayers,
    n: seats,
  });
}
