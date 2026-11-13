import type { SupabaseClient } from '@supabase/supabase-js';
import { useQuery } from '@tanstack/react-query';
import type { ScaledImage } from '../club/image';
import { signedUrlQuery } from '../lib/storage';

/** Jedyny klub instancji (PRD §1.1, CLUB-2). */
export interface Club {
  readonly name: string;
  /** Ścieżka w buckecie `covers`; `null` = monogram nazwy. */
  readonly logo_path: string | null;
  /** Strefa IANA do wyświetlania dat i granic roku (NFR-10). */
  readonly timezone: string;
}

export const clubKey = ['club'] as const;

/** Bucket z okładkami gier i logo klubu (prywatny, zapis: admin). */
export const COVERS_BUCKET = 'covers';
/** Najdłuższa nazwa klubu (CHECK `club_name_length`). */
export const CLUB_NAME_MAX = 80;

const CLUB_COLUMNS = 'name, logo_path, timezone';

/** Klub albo `null`, gdy nie został jeszcze założony (CLUB-1). */
export function useClub(client: SupabaseClient) {
  return useQuery({
    queryKey: clubKey,
    queryFn: async (): Promise<Club | null> => {
      const { data, error } = await client.from('club').select(CLUB_COLUMNS).maybeSingle<Club>();
      if (error) throw error;
      return data;
    },
  });
}

/** Adres pliku z prywatnego bucketu `covers` (logo klubu). Bez ścieżki: brak zapytania. */
export function useCoverUrl(client: SupabaseClient, path: string | null) {
  return useQuery(signedUrlQuery(client, COVERS_BUCKET, path));
}

/** Co zrobić z logo przy zapisie formularza. */
export type LogoChange =
  | { readonly kind: 'keep' }
  | { readonly kind: 'remove' }
  | { readonly kind: 'new'; readonly image: ScaledImage };

export interface ClubDraft {
  readonly name: string;
  readonly timezone: string;
  readonly logo: LogoChange;
}

/** Powód nieudanego zapisu klubu (komunikat w `t.club.form.errors`). */
export type ClubSaveFailure = 'exists' | 'forbidden' | 'upload' | 'save';

export class ClubSaveError extends Error {
  constructor(readonly reason: ClubSaveFailure) {
    super(`club: ${reason}`);
    this.name = 'ClubSaveError';
  }
}

/** Nazwa nowego pliku logo: zawsze nowa, więc podpisany URL starego nie pokaże nowego obrazu. */
export function newLogoPath(extension: string): string {
  return `club/logo-${crypto.randomUUID()}.${extension}`;
}

interface PostgrestLikeError {
  readonly code?: string | undefined;
}

function failureFor(error: PostgrestLikeError): ClubSaveFailure {
  // 23505: klucz główny `club_pkey` (klub już jest, np. równoległa próba, CLUB-2).
  if (error.code === '23505') return 'exists';
  // 42501: RLS lub brak uprawnień; PGRST116: UPDATE nie objął wiersza (RLS ukrył klub).
  if (error.code === '42501' || error.code === 'PGRST116') return 'forbidden';
  return 'save';
}

/**
 * Zakłada klub (gdy `existing` = `null`) albo zapisuje zmiany (CLUB-2). Nowe logo trafia do
 * Storage przed zapisem wiersza; gdy zapis wiersza się nie uda, wysłany plik jest usuwany,
 * a po udanym zapisie usuwany jest poprzedni plik logo. Drugi klub odrzuca baza (`23505`).
 * Zmiana strefy zmienia tylko wartość `club.timezone`, nie terminy spotkań (NFR-10).
 */
export async function saveClub(
  client: SupabaseClient,
  existing: Club | null,
  draft: ClubDraft,
): Promise<Club> {
  const storage = client.storage.from(COVERS_BUCKET);
  let uploaded: string | null = null;
  if (draft.logo.kind === 'new') {
    const { image } = draft.logo;
    const path = newLogoPath(image.extension);
    const { error } = await storage.upload(path, image.blob, {
      contentType: image.blob.type,
      upsert: false,
    });
    if (error) throw new ClubSaveError('upload');
    uploaded = path;
  }

  const logoPath =
    draft.logo.kind === 'keep'
      ? (existing?.logo_path ?? null)
      : draft.logo.kind === 'new'
        ? uploaded
        : null;
  const row = { name: draft.name.trim(), timezone: draft.timezone, logo_path: logoPath };
  const result = existing
    ? await client.from('club').update(row).eq('id', 1).select(CLUB_COLUMNS).single<Club>()
    : await client.from('club').insert(row).select(CLUB_COLUMNS).single<Club>();

  if (result.error) {
    if (uploaded) await storage.remove([uploaded]).catch(() => undefined);
    throw new ClubSaveError(failureFor(result.error));
  }

  const previous = existing?.logo_path ?? null;
  if (previous && previous !== result.data.logo_path) {
    // Stary plik jest już nieużywany; błąd usuwania nie psuje zapisu (zostaje sierotą).
    await storage.remove([previous]).catch(() => undefined);
  }
  return result.data;
}
