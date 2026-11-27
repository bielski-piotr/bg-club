import type { SupabaseClient } from '@supabase/supabase-js';

/** Podpisany URL ważny godzinę; zapytanie odświeża go 10 minut przed wygaśnięciem. */
export const SIGNED_URL_SECONDS = 60 * 60;

/*
 * Signed URLs survive a reload in `localStorage`. The same URL lets the browser take the image
 * from its HTTP cache, so the avatar in the header chip and logos show on the first paint instead
 * of after the signing request and the download.
 */
const SIGNED_URLS_KEY = 'bg-club.signed-urls';
/** A remembered URL is used while it stays valid for at least another minute. */
const SIGNED_URL_USABLE_MS = (SIGNED_URL_SECONDS - 60) * 1000;

type SignedUrls = Record<string, { readonly url: string; readonly signedAt: number }>;

function usableSignedUrls(): SignedUrls {
  try {
    const all = JSON.parse(localStorage.getItem(SIGNED_URLS_KEY) ?? '{}') as SignedUrls;
    const now = Date.now();
    return Object.fromEntries(
      Object.entries(all).filter(([, entry]) => now - entry.signedAt < SIGNED_URL_USABLE_MS),
    );
  } catch {
    // No storage (private mode, blocked) or a damaged entry: URLs are signed again.
    return {};
  }
}

function rememberSignedUrl(key: string, url: string) {
  const urls = usableSignedUrls();
  urls[key] = { url, signedAt: Date.now() };
  try {
    localStorage.setItem(SIGNED_URLS_KEY, JSON.stringify(urls));
  } catch {
    // Storage full or unavailable: the URL is only not remembered for the next reload.
  }
}

/**
 * Zapytanie TanStack o adres pliku z prywatnego bucketu (logo klubu, zdjęcia profilowe).
 * Bez ścieżki zapytanie jest wyłączone. Nazwy plików są przy każdym wgraniu nowe, więc adres
 * z cache'u nigdy nie pokaże starego obrazu.
 */
export function signedUrlQuery(client: SupabaseClient, bucket: string, path: string | null) {
  const key = `${bucket}/${path}`;
  return {
    queryKey: ['storage', bucket, path] as const,
    enabled: path !== null,
    staleTime: (SIGNED_URL_SECONDS - 10 * 60) * 1000,
    initialData: () => usableSignedUrls()[key]?.url,
    initialDataUpdatedAt: () => usableSignedUrls()[key]?.signedAt,
    queryFn: async (): Promise<string> => {
      const { data, error } = await client.storage
        .from(bucket)
        .createSignedUrl(path ?? '', SIGNED_URL_SECONDS);
      if (error) throw error;
      rememberSignedUrl(key, data.signedUrl);
      return data.signedUrl;
    },
  };
}
