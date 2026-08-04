// Bump this whenever the caching rules change. The activate handler deletes
// every cache whose name differs, so a bump is what evicts stale entries — with
// a fixed name, that cleanup could never fire.
const CACHE_NAME = 'redlined1-v2';

// HTML is deliberately absent. Caching '/' or '/login' stores a shell that
// references the JS bundles of the build it was cached from; served later as an
// offline fallback, it asks for bundles that no longer exist. Only genuinely
// static, content-stable files belong here.
const STATIC_ASSETS = [
  '/manifest.json',
  '/icons/icon-192x192.png',
  '/icons/icon-512x512.png',
];

self.addEventListener('install', (event) => {
  event.waitUntil(
    caches.open(CACHE_NAME).then((cache) => cache.addAll(STATIC_ASSETS))
  );
  self.skipWaiting();
});

self.addEventListener('activate', (event) => {
  event.waitUntil(
    caches.keys().then((keys) =>
      Promise.all(keys.filter((k) => k !== CACHE_NAME).map((k) => caches.delete(k)))
    )
  );
  self.clients.claim();
});

self.addEventListener('fetch', (event) => {
  const { request } = event;
  const url = new URL(request.url);

  // Never cache anything that talks to a server about data.
  if (
    url.pathname.startsWith('/api/') ||
    url.pathname.startsWith('/auth/') ||
    url.hostname.includes('supabase.co')
  ) {
    event.respondWith(fetch(request));
    return;
  }

  // Documents always come from the network. There is no cached fallback: a
  // stale shell is worse than an error page, because it looks like it works.
  if (request.mode === 'navigate') {
    event.respondWith(fetch(request));
    return;
  }

  // Next.js build output is content-hashed, so a hit is always the right file.
  // Scoped to this cache rather than searching every cache in the origin.
  event.respondWith(
    caches.open(CACHE_NAME)
      .then((cache) => cache.match(request))
      .then((cached) => cached || fetch(request))
  );
});
