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
  /** Formularz „Dodaj członka” (MEM-3, admin), adres `members/new`. */
  | { readonly kind: 'add-member' }
  | { readonly kind: 'profile'; readonly id: string }
  /** Potwierdzenie „Usuń członka” (MEM-4, admin), adres `profile/<uuid>/delete`. */
  | { readonly kind: 'delete-member'; readonly id: string }
  /** Ustawienia własnego profilu (USR-5), adres `settings`. Zawsze dotyczą zalogowanego. */
  | { readonly kind: 'settings' }
  /** Zmiana hasła (USR-5), adres `settings/password`. */
  | { readonly kind: 'change-password' }
  /** Usunięcie własnego konta z potwierdzeniem hasłem (USR-6), adres `settings/delete`. */
  | { readonly kind: 'delete-account' }
  /** Propozycja własnego hasła przy pierwszym logowaniu (AUTH-6), adres `first-login`. */
  | { readonly kind: 'first-login' }
  /** Formularz klubu: „Dodaj klub” przed założeniem, „Edytuj klub” potem (CLUB-2, admin). */
  | { readonly kind: 'club' }
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
  if (kind === 'members' && args.length === 1 && args[0] === 'new') return { kind: 'add-member' };
  if (kind === 'club' && args.length === 0) return { kind: 'club' };
  if (kind === 'settings' && args.length === 0) return { kind: 'settings' };
  if (kind === 'settings' && args.length === 1 && args[0] === 'password') {
    return { kind: 'change-password' };
  }
  if (kind === 'settings' && args.length === 1 && args[0] === 'delete') {
    return { kind: 'delete-account' };
  }
  if (kind === 'first-login' && args.length === 0) return { kind: 'first-login' };
  if (kind === 'profile' && args.length === 1 && isUuid(args[0] ?? '')) {
    return { kind: 'profile', id: (args[0] ?? '').toLowerCase() };
  }
  if (kind === 'profile' && args.length === 2 && isUuid(args[0] ?? '') && args[1] === 'delete') {
    return { kind: 'delete-member', id: (args[0] ?? '').toLowerCase() };
  }
  return { kind: 'invalid', raw };
}

export function serializeRoute(route: PopupRoute): string {
  switch (route.kind) {
    case 'members':
      return 'members';
    case 'add-member':
      return 'members/new';
    case 'club':
      return 'club';
    case 'profile':
      return `profile/${route.id}`;
    case 'delete-member':
      return `profile/${route.id}/delete`;
    case 'settings':
      return 'settings';
    case 'change-password':
      return 'settings/password';
    case 'delete-account':
      return 'settings/delete';
    case 'first-login':
      return 'first-login';
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
