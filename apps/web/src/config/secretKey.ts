// Bez zależności od DOM i Vite: używają go aplikacja (komunikat) i vite.config.ts (blokada buildu).

/**
 * Czy klucz jest sekretnym kluczem serwera (NFR-9, PRD §6.1). Klucz `service_role` omija RLS,
 * więc w bundlu SPA dałby każdemu pełny dostęp do bazy. Rozpoznajemy oba formaty Supabase:
 * nowy (`sb_secret_…`) i starszy JWT z `"role": "service_role"`.
 */
export function isSecretKey(key: string): boolean {
  if (key.startsWith('sb_secret_')) return true;
  const parts = key.split('.');
  const payload = parts[1];
  if (parts.length !== 3 || !payload) return false;
  try {
    const base64 = payload.replace(/-/g, '+').replace(/_/g, '/');
    const claims: unknown = JSON.parse(atob(base64.padEnd(Math.ceil(base64.length / 4) * 4, '=')));
    return (
      typeof claims === 'object' &&
      claims !== null &&
      (claims as { role?: unknown }).role === 'service_role'
    );
  } catch {
    return false;
  }
}
