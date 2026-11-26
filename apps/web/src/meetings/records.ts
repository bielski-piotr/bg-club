import type { SupabaseClient } from '@supabase/supabase-js';
import { isUuid } from '../popups/routes';
import { meetingsKey } from './meetings';

/**
 * Rekordy w partiach (`20261113001800_game_stats.sql`): wynik partii, który w chwili rozegrania był
 * lepszy od wszystkich wcześniejszych w tej grze (rekord klubu) albo od wcześniejszych wyników
 * gracza (rekord osobisty). Kierunek „lepiej” i porównywalne partie jak w statystykach gry.
 */

export type RecordKind = 'club' | 'personal';

export interface PlayRecord {
  readonly play_id: string;
  readonly profile_id: string;
  readonly value: number;
  readonly club_record: boolean;
  readonly personal_record: boolean;
}

/** Rekord gracza do oznaczenia: rekord klubu ma pierwszeństwo przed osobistym. */
export function recordKind(record: Pick<PlayRecord, 'club_record' | 'personal_record'>) {
  if (record.club_record) return 'club' as const;
  return record.personal_record ? ('personal' as const) : null;
}

/** Rekordy jednej partii: gracz → rodzaj rekordu. */
export type PlayRecords = ReadonlyMap<string, RecordKind>;

/** Rekordy partii spotkania pogrupowane po partii. */
export function groupRecords(rows: readonly PlayRecord[]): ReadonlyMap<string, PlayRecords> {
  const byPlay = new Map<string, Map<string, RecordKind>>();
  for (const row of rows) {
    const kind = recordKind(row);
    if (!kind) continue;
    const play = byPlay.get(row.play_id) ?? new Map<string, RecordKind>();
    play.set(row.profile_id, kind);
    byPlay.set(row.play_id, play);
  }
  return byPlay;
}

/** Najważniejszy rekord partii (do znacznika na karteczce). */
export function topRecord(records: PlayRecords | undefined): RecordKind | null {
  if (!records || records.size === 0) return null;
  return [...records.values()].includes('club') ? 'club' : 'personal';
}

/** Klucz w `meetingsKey`: zapis i usunięcie partii odświeżają rekordy (§5.6.5). */
export const meetingRecordsKey = (id: string) => [...meetingsKey, 'records', id] as const;

/** Rekordy ustanowione w partiach spotkania (opcje zapytania). */
export function meetingRecordsQuery(client: SupabaseClient, meetingId: string, enabled = true) {
  return {
    queryKey: meetingRecordsKey(meetingId),
    enabled,
    queryFn: async (): Promise<ReadonlyMap<string, PlayRecords>> => {
      if (!isUuid(meetingId)) return new Map();
      const { data, error } = await client.rpc('meeting_play_records', { meeting_id: meetingId });
      if (error) throw error;
      return groupRecords((data ?? []) as PlayRecord[]);
    },
  };
}

/** Wynik do podglądu przed zapisem: gracz i jego wartość kategorii decydującej. */
export interface PreviewResult {
  readonly profileId: string;
  readonly value: number | null;
}

/**
 * Podgląd rekordów partii w toku przed zapisem (podsumowanie oderwanej karteczki). Bez danych
 * (błąd, wczytywanie) podsumowanie pokazuje się bez oznaczeń: zapis od nich nie zależy.
 */
export function recordPreviewQuery(
  client: SupabaseClient,
  playId: string,
  results: readonly PreviewResult[] | null,
) {
  const payload = (results ?? []).map((r) => ({ profile_id: r.profileId, value: r.value }));
  return {
    queryKey: [...meetingsKey, 'record-preview', playId, JSON.stringify(payload)] as const,
    enabled: results !== null && isUuid(playId),
    staleTime: Infinity,
    queryFn: async (): Promise<PlayRecords> => {
      const { data, error } = await client.rpc('play_record_preview', {
        play_id: playId,
        results: payload,
      });
      if (error) throw error;
      const records = new Map<string, RecordKind>();
      for (const row of (data ?? []) as Omit<PlayRecord, 'play_id'>[]) {
        const kind = recordKind(row);
        if (kind) records.set(row.profile_id, kind);
      }
      return records;
    },
  };
}
