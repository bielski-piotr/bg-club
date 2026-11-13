/**
 * Wspólne elementy odpowiedzi i żądań Edge Functions: CORS, odpowiedź JSON bez cache'u, token
 * sesji z nagłówka i treść JSON o ograniczonym rozmiarze. Bez zależności od Deno i supabase-js
 * (testy `deno test` wczytują je bez sieci).
 */

/** Aplikacja jest na innym adresie niż API (Cloudflare Pages), a dostęp daje token, nie ciasteczko. */
export const CORS_HEADERS: Readonly<Record<string, string>> = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
  'Access-Control-Allow-Methods': 'POST, OPTIONS',
  'Access-Control-Max-Age': '86400',
};

/**
 * Odpowiedź JSON. `no-store`: odpowiedzi niosą hasła (create-member) albo dotyczą kont, więc
 * nie zostają w żadnym cache'u.
 */
export function json(status: number, body: unknown): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: {
      ...CORS_HEADERS,
      'Content-Type': 'application/json; charset=utf-8',
      'Cache-Control': 'no-store',
    },
  });
}

/** Odpowiedź na preflight CORS (`OPTIONS`). */
export function preflight(): Response {
  return new Response(null, { status: 204, headers: CORS_HEADERS });
}

/** Token z nagłówka `Authorization: Bearer <token>` albo `null`. */
export function bearerToken(request: Request): string | null {
  const header = request.headers.get('Authorization') ?? '';
  const match = /^Bearer\s+(\S+)$/i.exec(header);
  return match?.[1] ?? null;
}

/**
 * Treść żądania jako obiekt JSON albo `null`, gdy jest za duża, nie jest JSON-em albo nie jest
 * obiektem. Zadeklarowana długość odrzuca duże żądanie przed wczytaniem; druga kontrola łapie
 * brak nagłówka `Content-Length`.
 */
export async function readJsonObject(
  request: Request,
  maxBytes: number,
): Promise<Record<string, unknown> | null> {
  const declared = Number(request.headers.get('Content-Length') ?? '0');
  if (declared > maxBytes) return null;
  const text = await request.text();
  if (new TextEncoder().encode(text).length > maxBytes) return null;
  let body: unknown;
  try {
    body = JSON.parse(text);
  } catch {
    return null;
  }
  if (typeof body !== 'object' || body === null || Array.isArray(body)) return null;
  return body as Record<string, unknown>;
}

/** Komunikat błędu do logów serwera (bez treści żądania). */
export function errorMessage(error: unknown): string {
  return error instanceof Error ? error.message : String(error);
}
