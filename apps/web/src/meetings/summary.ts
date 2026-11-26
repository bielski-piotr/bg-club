import type { SupabaseClient } from '@supabase/supabase-js';
import { keepPreviousData } from '@tanstack/query-core';
import { format, t } from '../i18n';
import { normalizeGames } from '../leaderboard/filters';
import { isUuid } from '../popups/routes';
import { meetingsKey } from './meetings';
import type { MeetingPlay } from './plays';

/**
 * Podsumowanie spotkania: zmiany w klasyfikacji punktów z funkcji SQL
 * `meeting_leaderboard_changes(meeting_id, game_ids)` (migracja `20261125000000`). Baza liczy
 * punkty zdobyte na spotkaniu i miejsca przed spotkaniem i po nim (jak ranking punktów, także
 * z filtrem gier); tu tylko teksty i lista gier spotkania do filtra.
 */

/** Wkład jednej gry spotkania w punkty gracza. */
export interface SummaryGame {
  readonly game_id: string;
  readonly title: string;
  /** Gra usunięta z kolekcji zostaje w historii z oznaczeniem (GAME-8). */
  readonly deleted: boolean;
  readonly points: number;
}

export interface SummaryEntry {
  readonly profile_id: string;
  readonly deleted: boolean;
  /** Punkty zdobyte na spotkaniu (w wybranych grach). */
  readonly points: number;
  /** Gry w kolejności pierwszej partii gry w spotkaniu (§5.6.6). */
  readonly games: readonly SummaryGame[];
  /** Suma i miejsce w klasyfikacji punktów przed spotkaniem; `null` = bez wcześniejszych partii. */
  readonly total_before: number | null;
  readonly place_before: number | null;
  /** Suma i miejsce po spotkaniu (z partiami do tego spotkania włącznie). */
  readonly total_after: number;
  readonly place_after: number;
}

/** Klucz w `meetingsKey`: zapis i usunięcie partii odświeżają podsumowanie (§5.6.5). */
export const meetingSummaryKey = (id: string, games: readonly string[] = []) =>
  [...meetingsKey, 'summary', id, normalizeGames(games).join(',')] as const;

export function meetingSummaryQuery(
  client: SupabaseClient,
  meetingId: string,
  games: readonly string[] = [],
) {
  return {
    queryKey: meetingSummaryKey(meetingId, games),
    // Zmiana filtra zostawia poprzednią tabelę do czasu nowych danych (bez migania).
    placeholderData: keepPreviousData,
    queryFn: async (): Promise<readonly SummaryEntry[]> => {
      if (!isUuid(meetingId)) return [];
      const { data, error } = await client.rpc('meeting_leaderboard_changes', {
        meeting_id: meetingId,
        game_ids: games.length > 0 ? normalizeGames(games) : null,
      });
      if (error) throw error;
      return (data ?? []) as SummaryEntry[];
    },
  };
}

/** Gry zapisanych partii spotkania do filtra, w kolejności pierwszej partii (§5.6.6). */
export function meetingGames(
  saved: readonly Pick<MeetingPlay, 'game'>[],
): { readonly id: string; readonly title: string }[] {
  const seen = new Map<string, string>();
  for (const play of saved) {
    if (!seen.has(play.game.id)) seen.set(play.game.id, play.game.title);
  }
  return [...seen].map(([id, title]) => ({ id, title }));
}

const text = t.meetings.summary;

export type PlaceChange =
  | { readonly kind: 'new' }
  | { readonly kind: 'same' }
  | { readonly kind: 'up' | 'down'; readonly by: number };

/** Zmiana miejsca w klasyfikacji: awans, spadek, bez zmian albo nowy gracz w rankingu. */
export function placeChange(
  entry: Pick<SummaryEntry, 'place_before' | 'place_after'>,
): PlaceChange {
  if (entry.place_before === null) return { kind: 'new' };
  const by = entry.place_before - entry.place_after;
  if (by === 0) return { kind: 'same' };
  return by > 0 ? { kind: 'up', by } : { kind: 'down', by: -by };
}

/** „▲ 2”, „▼ 1”, „–”, „nowy” (tekst widoczny) i opis dla czytnika ekranu. */
export function placeChangeLabel(change: PlaceChange): { short: string; long: string } {
  switch (change.kind) {
    case 'new':
      return { short: text.placeNew, long: text.placeNewLabel };
    case 'same':
      return { short: '–', long: text.placeSameLabel };
    case 'up':
      return {
        short: format(text.placeUp, { n: change.by }),
        long: format(text.placeUpLabel, { n: change.by }),
      };
    case 'down':
      return {
        short: format(text.placeDown, { n: change.by }),
        long: format(text.placeDownLabel, { n: change.by }),
      };
  }
}

function gameTitle(game: SummaryGame): string {
  return game.deleted ? format(text.deletedGame, { title: game.title }) : game.title;
}

/** Rozbicie punktów na gry: „Wingspan +8, Azul +4”. */
export function pointsBreakdown(games: readonly SummaryGame[]): string {
  return games
    .map((game) => format(text.gamePoints, { title: gameTitle(game), n: game.points }))
    .join(', ');
}
