import { isLeaderboardKind, type LeaderboardKind } from '../leaderboard/kinds';

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
  /** Popup kolekcji gier (GAME-2), adres `games`. */
  | { readonly kind: 'games' }
  /** Formularz „Dodaj grę” (GAME-3, admin), adres `games/new`. */
  | { readonly kind: 'add-game' }
  /**
   * Szczegóły gry z galerią oderwanych karteczek od najnowszej (GAME-10), adres `game/<uuid>`.
   */
  | { readonly kind: 'game'; readonly id: string }
  /**
   * Zapisana karteczka partii (PAD-6, GAME-10, VIEW-3): powiększenie, wyniki, link do spotkania
   * i podgląd 3D tylko do odczytu, adres `sheet/<uuid partii>`.
   */
  | { readonly kind: 'sheet'; readonly id: string }
  /** Formularz „Edytuj grę” (GAME-3, admin), adres `game/<uuid>/edit`. */
  | { readonly kind: 'edit-game'; readonly id: string }
  /** Potwierdzenie „Usuń grę” (GAME-8, admin), adres `game/<uuid>/delete`. */
  | { readonly kind: 'delete-game'; readonly id: string }
  /** Notesy gry (GAME-7), adres `game/<uuid>/scorepads`. */
  | { readonly kind: 'scorepads'; readonly gameId: string }
  /** Edytor nowego notesu gry (GAME-7, EDT-1, admin), adres `game/<uuid>/scorepads/new`. */
  | { readonly kind: 'add-scorepad'; readonly gameId: string }
  /** Edytor notesu: zapis tworzy nową wersję (GAME-9, admin), adres `scorepad/<uuid>/edit`. */
  | { readonly kind: 'edit-scorepad'; readonly id: string }
  /** Zmiana nazwy notesu (GAME-7, admin), adres `scorepad/<uuid>/rename`. */
  | { readonly kind: 'rename-scorepad'; readonly id: string }
  /** Potwierdzenie „Usuń notes” (GAME-7, admin), adres `scorepad/<uuid>/delete`. */
  | { readonly kind: 'delete-scorepad'; readonly id: string }
  /**
   * „Zaplanuj spotkanie” (PLAN-1, admin), adres `meetings/new` albo `meetings/new/<RRRR-MM-DD>`
   * z wypełnioną datą (np. pusty dzień w kalendarzu, CAL-3).
   */
  | { readonly kind: 'add-meeting'; readonly date?: string | undefined }
  /**
   * Popup spotkania z głosowaniem i opublikowanymi grami (VIEW-1, VIEW-2), otwierany też
   * z timeline i kalendarza (MTG-3, CAL-1), adres `meeting/<uuid>`.
   */
  | { readonly kind: 'meeting'; readonly id: string }
  /** „Opublikuj gry” (VOTE-5, admin), adres `meeting/<uuid>/publish`. */
  | { readonly kind: 'publish-games'; readonly id: string }
  /** Potwierdzenie „Rozpocznij spotkanie” (RUN-1, admin lub prowadzący), `meeting/<uuid>/start`. */
  | { readonly kind: 'start-meeting'; readonly id: string }
  /** „Zakończ spotkanie” z listą partii w toku (RUN-4), adres `meeting/<uuid>/finish`. */
  | { readonly kind: 'finish-meeting'; readonly id: string }
  /**
   * Nowa partia: gra, notes, gracze i miejsca (RUN-2, admin lub prowadzący spotkania w trakcie),
   * adres `meeting/<uuid>/plays/new`.
   */
  | { readonly kind: 'new-play'; readonly meetingId: string }
  /**
   * Partia w toku z notesem i szkicem (PAD-4, PAD-9): admin lub prowadzący wpisuje wyniki,
   * także na innym urządzeniu; pozostali widzą „trwa partia”. Adres `play/<uuid>`.
   */
  | { readonly kind: 'play'; readonly id: string }
  /** Potwierdzenie „Porzuć partię” (PAD-8, admin lub prowadzący), adres `play/<uuid>/discard`. */
  | { readonly kind: 'discard-play'; readonly id: string }
  /** Potwierdzenie „Usuń partię” zapisanej partii (VIEW-6, admin), adres `play/<uuid>/delete`. */
  | { readonly kind: 'delete-play'; readonly id: string }
  /** Kalendarz spotkań (CAL-1…CAL-3), adres `calendar`. */
  | { readonly kind: 'calendar' }
  /**
   * Pełny ranking z filtrem roku (LB-3, LB-4), adres `leaderboard` albo `leaderboard/<zakładka>`
   * (`points`, `wins`, `streak`): zakładka startowa, z którą otworzył go widżet. Dalsze
   * przełączanie zakładek i roku jest stanem popupu (bez nowych wpisów historii).
   */
  | { readonly kind: 'leaderboard'; readonly tab?: LeaderboardKind | undefined }
  /** „Edytuj spotkanie” (PLAN-3, PLAN-4, admin), adres `meeting/<uuid>/edit`. */
  | { readonly kind: 'edit-meeting'; readonly id: string }
  /** Potwierdzenie „Usuń spotkanie” (PLAN-3, PLAN-5, admin), adres `meeting/<uuid>/delete`. */
  | { readonly kind: 'delete-meeting'; readonly id: string }
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

/** Data `RRRR-MM-DD`, która istnieje w kalendarzu (np. bez 2026-02-30). */
export function isIsoDate(value: string): boolean {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(value)) return false;
  const date = new Date(`${value}T00:00:00Z`);
  return !Number.isNaN(date.getTime()) && date.toISOString().startsWith(value);
}

/** Jeden wpis `p`, np. `profile/<uuid>`. Nieznany albo uszkodzony daje `invalid`. */
export function parseRoute(raw: string): PopupRoute {
  const [kind, ...args] = raw.split('/');
  if (kind === 'members' && args.length === 0) return { kind: 'members' };
  if (kind === 'members' && args.length === 1 && args[0] === 'new') return { kind: 'add-member' };
  if (kind === 'club' && args.length === 0) return { kind: 'club' };
  if (kind === 'games' && args.length === 0) return { kind: 'games' };
  if (kind === 'games' && args.length === 1 && args[0] === 'new') return { kind: 'add-game' };
  if (kind === 'game' && args.length === 1 && isUuid(args[0] ?? '')) {
    return { kind: 'game', id: (args[0] ?? '').toLowerCase() };
  }
  if (kind === 'sheet' && args.length === 1 && isUuid(args[0] ?? '')) {
    return { kind: 'sheet', id: (args[0] ?? '').toLowerCase() };
  }
  if (kind === 'game' && args.length === 2 && isUuid(args[0] ?? '')) {
    const id = (args[0] ?? '').toLowerCase();
    if (args[1] === 'edit') return { kind: 'edit-game', id };
    if (args[1] === 'delete') return { kind: 'delete-game', id };
    if (args[1] === 'scorepads') return { kind: 'scorepads', gameId: id };
  }
  if (kind === 'game' && args.length === 3 && isUuid(args[0] ?? '')) {
    if (args[1] === 'scorepads' && args[2] === 'new') {
      return { kind: 'add-scorepad', gameId: (args[0] ?? '').toLowerCase() };
    }
  }
  if (kind === 'scorepad' && args.length === 2 && isUuid(args[0] ?? '')) {
    const id = (args[0] ?? '').toLowerCase();
    if (args[1] === 'edit') return { kind: 'edit-scorepad', id };
    if (args[1] === 'rename') return { kind: 'rename-scorepad', id };
    if (args[1] === 'delete') return { kind: 'delete-scorepad', id };
  }
  if (kind === 'meetings' && args[0] === 'new') {
    if (args.length === 1) return { kind: 'add-meeting' };
    if (args.length === 2 && isIsoDate(args[1] ?? ''))
      return { kind: 'add-meeting', date: args[1] };
  }
  if (kind === 'calendar' && args.length === 0) return { kind: 'calendar' };
  if (kind === 'leaderboard' && args.length === 0) return { kind: 'leaderboard' };
  if (kind === 'leaderboard' && args.length === 1 && isLeaderboardKind(args[0] ?? '')) {
    return { kind: 'leaderboard', tab: args[0] as LeaderboardKind };
  }
  if (kind === 'meeting' && args.length === 1 && isUuid(args[0] ?? '')) {
    return { kind: 'meeting', id: (args[0] ?? '').toLowerCase() };
  }
  if (kind === 'meeting' && args.length === 2 && isUuid(args[0] ?? '')) {
    const id = (args[0] ?? '').toLowerCase();
    if (args[1] === 'publish') return { kind: 'publish-games', id };
    if (args[1] === 'edit') return { kind: 'edit-meeting', id };
    if (args[1] === 'delete') return { kind: 'delete-meeting', id };
    if (args[1] === 'start') return { kind: 'start-meeting', id };
    if (args[1] === 'finish') return { kind: 'finish-meeting', id };
  }
  if (kind === 'meeting' && args.length === 3 && isUuid(args[0] ?? '')) {
    if (args[1] === 'plays' && args[2] === 'new') {
      return { kind: 'new-play', meetingId: (args[0] ?? '').toLowerCase() };
    }
  }
  if (kind === 'play' && args.length === 1 && isUuid(args[0] ?? '')) {
    return { kind: 'play', id: (args[0] ?? '').toLowerCase() };
  }
  if (kind === 'play' && args.length === 2 && isUuid(args[0] ?? '') && args[1] === 'discard') {
    return { kind: 'discard-play', id: (args[0] ?? '').toLowerCase() };
  }
  if (kind === 'play' && args.length === 2 && isUuid(args[0] ?? '') && args[1] === 'delete') {
    return { kind: 'delete-play', id: (args[0] ?? '').toLowerCase() };
  }
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
    case 'games':
      return 'games';
    case 'add-game':
      return 'games/new';
    case 'game':
      return `game/${route.id}`;
    case 'sheet':
      return `sheet/${route.id}`;
    case 'edit-game':
      return `game/${route.id}/edit`;
    case 'delete-game':
      return `game/${route.id}/delete`;
    case 'scorepads':
      return `game/${route.gameId}/scorepads`;
    case 'add-scorepad':
      return `game/${route.gameId}/scorepads/new`;
    case 'edit-scorepad':
      return `scorepad/${route.id}/edit`;
    case 'rename-scorepad':
      return `scorepad/${route.id}/rename`;
    case 'delete-scorepad':
      return `scorepad/${route.id}/delete`;
    case 'add-meeting':
      return route.date ? `meetings/new/${route.date}` : 'meetings/new';
    case 'meeting':
      return `meeting/${route.id}`;
    case 'calendar':
      return 'calendar';
    case 'leaderboard':
      return route.tab ? `leaderboard/${route.tab}` : 'leaderboard';
    case 'publish-games':
      return `meeting/${route.id}/publish`;
    case 'edit-meeting':
      return `meeting/${route.id}/edit`;
    case 'delete-meeting':
      return `meeting/${route.id}/delete`;
    case 'start-meeting':
      return `meeting/${route.id}/start`;
    case 'finish-meeting':
      return `meeting/${route.id}/finish`;
    case 'new-play':
      return `meeting/${route.meetingId}/plays/new`;
    case 'play':
      return `play/${route.id}`;
    case 'discard-play':
      return `play/${route.id}/discard`;
    case 'delete-play':
      return `play/${route.id}/delete`;
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
