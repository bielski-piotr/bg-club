import type { SupabaseClient } from '@supabase/supabase-js';

/** Podpisany URL ważny godzinę; zapytanie odświeża go 10 minut przed wygaśnięciem. */
export const SIGNED_URL_SECONDS = 60 * 60;

/**
 * Zapytanie TanStack o adres pliku z prywatnego bucketu (logo klubu, zdjęcia profilowe).
 * Bez ścieżki zapytanie jest wyłączone. Nazwy plików są przy każdym wgraniu nowe, więc adres
 * z cache'u nigdy nie pokaże starego obrazu.
 */
export function signedUrlQuery(client: SupabaseClient, bucket: string, path: string | null) {
  return {
    queryKey: ['storage', bucket, path] as const,
    enabled: path !== null,
    staleTime: (SIGNED_URL_SECONDS - 10 * 60) * 1000,
    queryFn: async (): Promise<string> => {
      const { data, error } = await client.storage
        .from(bucket)
        .createSignedUrl(path ?? '', SIGNED_URL_SECONDS);
      if (error) throw error;
      return data.signedUrl;
    },
  };
}
