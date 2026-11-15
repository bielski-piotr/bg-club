/*
 * Service worker BG Club (PRD NFR-3). Plik jest szablonem: plugin `pwaPlugin` (vite.config.ts)
 * podstawia przy buildzie wersję i listę plików powłoki i zapisuje go jako `dist/sw.js`.
 *
 * Zasady:
 * - Buforuje tylko powłokę aplikacji z tego samego originu: stronę `/`, pliki z `/assets/`
 *   (nazwy z hashem, niezmienne), manifest i ikony. Odpowiedzi API, Auth i Storage Supabase
 *   (inny origin) oraz żądania inne niż GET idą prosto do sieci i nigdy nie trafiają do cache,
 *   więc po wylogowaniu na urządzeniu nie zostają dane poprzedniego konta.
 * - Nawigacja: najpierw sieć, bez sieci powłoka z cache. Aplikacja bez sieci nie udaje pracy
 *   offline: pokazuje komunikat o braku połączenia (src/pwa/AppStatus.tsx), a wpisy notesu
 *   chroni kopia szkicu w `localStorage` (PAD-4).
 * - Nowa wersja instaluje się w tle i czeka. Aktywuje się dopiero na prośbę aplikacji
 *   (`SKIP_WAITING`), którą użytkownik wysyła przyciskiem „Odśwież” — nigdy w trakcie
 *   niezapisanego szkicu partii w tej karcie. Cache poprzedniej wersji zostaje (usuwamy tylko
 *   starsze), a pliki szukamy we wszystkich cache, więc inne karty na starym kodzie nadal
 *   wczytają swoje leniwe pliki, póki ich nie odświeżymy.
 */

const VERSION = self.__BG_VERSION__;
const PRECACHE = self.__BG_PRECACHE__;
const PREFIX = 'bg-club-shell-';
const CACHE = `${PREFIX}${VERSION}`;
/** Powłoka pod `/`: hosting (Cloudflare Pages) przekierowuje `/index.html` na `/`. */
const SHELL = '/';

self.addEventListener('install', (event) => {
  event.waitUntil(
    caches
      .open(CACHE)
      .then((cache) =>
        cache.addAll(PRECACHE.map((path) => new Request(path, { cache: 'reload' }))),
      ),
  );
});

self.addEventListener('activate', (event) => {
  event.waitUntil(
    caches
      .keys()
      .then((keys) => {
        // `caches.keys()` zwraca nazwy w kolejności utworzenia: zostaje bieżąca i poprzednia.
        const old = keys.filter((key) => key.startsWith(PREFIX) && key !== CACHE);
        return Promise.all(old.slice(0, -1).map((key) => caches.delete(key)));
      })
      .then(() => self.clients.claim()),
  );
});

self.addEventListener('message', (event) => {
  if (event.data && event.data.type === 'SKIP_WAITING') self.skipWaiting();
});

/** Czy żądanie należy do powłoki: GET z tego samego originu, nawigacja albo plik statyczny. */
function route(request) {
  if (request.method !== 'GET') return null;
  const url = new URL(request.url);
  if (url.origin !== self.location.origin) return null;
  if (request.mode === 'navigate') return 'navigate';
  if (url.pathname.startsWith('/assets/') || PRECACHE.includes(url.pathname)) return 'static';
  return null;
}

/**
 * Odpowiedź po przekierowaniu nie może obsłużyć nawigacji (tryb `manual`): kopiujemy treść
 * do nowej odpowiedzi bez znacznika `redirected`.
 */
function clean(response) {
  if (!response.redirected) return response;
  return response.blob().then(
    (body) =>
      new Response(body, {
        status: response.status,
        statusText: response.statusText,
        headers: response.headers,
      }),
  );
}

/** Plik z `/assets/` może trafić do cache tylko jako ten plik, a nie strona SPA z 200. */
function cacheable(request, response) {
  if (!response.ok || response.type !== 'basic' || response.redirected) return false;
  const html = (response.headers.get('content-type') || '').includes('text/html');
  return !html || new URL(request.url).pathname === SHELL;
}

self.addEventListener('fetch', (event) => {
  const kind = route(event.request);
  if (kind === 'navigate') {
    event.respondWith(
      fetch(event.request).catch(() =>
        caches
          .match(SHELL, { cacheName: CACHE })
          .then((cached) => (cached ? clean(cached) : Response.error())),
      ),
    );
  } else if (kind === 'static') {
    event.respondWith(
      // Wszystkie cache: karta na poprzedniej wersji wczytuje swoje pliki z jej cache.
      caches.match(event.request).then(
        (cached) =>
          cached ||
          fetch(event.request).then((response) => {
            // Leniwe pliki z `/assets/` (nazwy z hashem) dopisujemy do cache tej wersji.
            if (cacheable(event.request, response)) {
              const copy = response.clone();
              event.waitUntil(caches.open(CACHE).then((cache) => cache.put(event.request, copy)));
            }
            return response;
          }),
      ),
    );
  }
});
