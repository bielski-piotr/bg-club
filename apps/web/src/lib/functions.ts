/**
 * Odczyt błędu z `client.functions.invoke` (Edge Functions, `supabase/functions`). Funkcje
 * odpowiadają `{ error: kod, … }` z kodem HTTP; brak połączenia supabase-js zgłasza jako
 * `FunctionsFetchError`, a odpowiedź spoza funkcji (bramka, przekroczony czas) nie ma `error`.
 */
export interface FunctionFailure {
  /** Brak połączenia: żądanie nie dotarło albo odpowiedź nie wróciła. */
  readonly network: boolean;
  /** Kod HTTP odpowiedzi; 0, gdy jej nie ma. */
  readonly status: number;
  /** Treść odpowiedzi funkcji (`{ error, … }`); pusta, gdy nie jest JSON-em. */
  readonly body: Readonly<Record<string, unknown>>;
}

export async function functionFailure(error: Error): Promise<FunctionFailure> {
  if (error.name === 'FunctionsFetchError') return { network: true, status: 0, body: {} };
  const context = (error as { context?: unknown }).context;
  if (!(context instanceof Response)) return { network: false, status: 0, body: {} };
  const body: unknown = await context.json().catch(() => ({}));
  return {
    network: false,
    status: context.status,
    body: typeof body === 'object' && body !== null ? (body as Record<string, unknown>) : {},
  };
}
