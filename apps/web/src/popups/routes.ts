/**
 * Adresy popupów (PRD §4). Każdy popup na stosie to jeden parametr `p` w adresie, od dołu
 * stosu do góry, np. `/?p=members&p=profile/<uuid>`. Dzięki temu odświeżenie, link wysłany
 * komuś i przyciski Wstecz / Dalej odtwarzają cały stos.
 *
 * Kolejne zadania dopisują rodzaje popupów (gra, spotkanie, kalendarz…) do `PopupRoute`,
 * `parseRoute` i `serializeRoute`.
 */
export type PopupRoute =
  | { readonly kind: 'members' }
  | { readonly kind: 'profile'; readonly id: string }
  /** Adres, którego aplikacja nie zna albo który jest uszkodzony. Popup pokazuje czytelny stan. */
  | { readonly kind: 'invalid'; readonly raw: string };

/** Nazwa parametru adresu z popupami. */
export const POPUP_PARAM = 'p';

/** Najgłębszy stos z adresu. Dłuższy (np. spreparowany link) jest przycinany od góry. */
export const MAX_STACK_DEPTH = 8;

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

export function isUuid(value: string): boolean {
  return UUID.test(value);
}

/** Jeden wpis `p`, np. `profile/<uuid>`. Nieznany albo uszkodzony daje `invalid`. */
export function parseRoute(raw: string): PopupRoute {
  const [kind, ...args] = raw.split('/');
  if (kind === 'members' && args.length === 0) return { kind: 'members' };
  if (kind === 'profile' && args.length === 1 && isUuid(args[0] ?? '')) {
    return { kind: 'profile', id: (args[0] ?? '').toLowerCase() };
  }
  return { kind: 'invalid', raw };
}

export function serializeRoute(route: PopupRoute): string {
  switch (route.kind) {
    case 'members':
      return 'members';
    case 'profile':
      return `profile/${route.id}`;
    case 'invalid':
      return route.raw;
  }
}

/** Stos popupów z części `?…` adresu. */
export function parseStack(search: string): PopupRoute[] {
  return new URLSearchParams(search).getAll(POPUP_PARAM).slice(0, MAX_STACK_DEPTH).map(parseRoute);
}

/**
 * Część `?…` adresu ze stosem `stack`. Inne parametry zostają bez zmian. Ukośnik w wartości
 * nie jest kodowany (`?p=profile/<uuid>`), żeby link był czytelny.
 */
export function stackSearch(search: string, stack: readonly PopupRoute[]): string {
  const params = new URLSearchParams(search);
  params.delete(POPUP_PARAM);
  const parts = params.toString() ? [params.toString()] : [];
  for (const route of stack) {
    parts.push(`${POPUP_PARAM}=${encodeURIComponent(serializeRoute(route)).replace(/%2F/gi, '/')}`);
  }
  return parts.length > 0 ? `?${parts.join('&')}` : '';
}

/** Stały klucz popupu na danym poziomie stosu (klucz Reacta, porównania). */
export function routeKey(route: PopupRoute, level: number): string {
  return `${level}:${serializeRoute(route)}`;
}
