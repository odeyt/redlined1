/**
 * Redlined1 service worker.
 *
 * CACHE STRATEGY (documented per Phase 3)
 *
 *   API, auth, Supabase   network only, never cached, never stored
 *   Navigations (HTML)    network only, no cached fallback
 *   Static build output   cache-first within this build's cache
 *
 * The cache name carries the build id, which the page passes in when it
 * registers this worker (`/sw.js?v=<build>`). Two consequences, both wanted:
 * a new deploy registers a URL this browser has not seen, so the update check
 * is guaranteed rather than dependent on someone remembering to bump a
 * constant; and the activate handler deletes every cache that is not this
 * build's, so the previous build's assets cannot outlive it.
 *
 * Nothing authenticated is cached. Supabase responses, /api and /auth bypass
 * the cache entirely, so no tenant's data can be served to another session
 * from a shared store.
 *
 * HTML is never cached. A cached shell references the JS chunks of the build
 * it was captured from; served later it asks for files that no longer exist,
 * and it fails while looking like it worked. An error page is the safer
 * failure.
 */

const BUILD = new URL(self.location.href).searchParams.get('v') || 'dev';
const CACHE_NAME = `redlined1-${BUILD}`;

// Only genuinely static, content-stable files. No HTML.
const STATIC_ASSETS = [
  '/manifest.json',
  '/icons/icon-192x192.png',
  '/icons/icon-512x512.png',
];

self.addEventListener('install', (event) => {
  event.waitUntil(
    caches.open(CACHE_NAME).then((cache) =>
      // Individually, not addAll: addAll rejects wholesale if any single file
      // is missing, which would leave the worker uninstalled and the app with
      // no worker at all over one absent icon.
      Promise.all(STATIC_ASSETS.map((url) => cache.add(url).catch(() => null)))
    )
  );
  self.skipWaiting();
});

self.addEventListener('activate', (event) => {
  event.waitUntil(
    caches.keys()
      .then((keys) => Promise.all(
        keys.filter((k) => k.startsWith('redlined1-') && k !== CACHE_NAME)
            .map((k) => caches.delete(k))
      ))
      .then(() => self.clients.claim())
  );
});

// The page asks for this when it wants to hand over to a waiting worker.
self.addEventListener('message', (event) => {
  if (event.data?.type === 'SKIP_WAITING') self.skipWaiting();
});

self.addEventListener('fetch', (event) => {
  const { request } = event;

  // Only GET is cacheable at all; a POST reaching the cache API throws.
  if (request.method !== 'GET') return;

  let url;
  try { url = new URL(request.url); } catch { return; }

  // Never cache anything that talks to a server about data.
  if (
    url.pathname.startsWith('/api/') ||
    url.pathname.startsWith('/auth/') ||
    url.hostname.includes('supabase.co')
  ) {
    return; // fall through to the network untouched
  }

  // Cross-origin requests are left alone entirely.
  if (url.origin !== self.location.origin) return;

  // Documents always come from the network, with no cached fallback.
  if (request.mode === 'navigate') return;

  // Build output is content-hashed, so a hit is always the right file.
  event.respondWith(
    caches.open(CACHE_NAME).then((cache) =>
      cache.match(request).then((cached) => {
        if (cached) return cached;
        return fetch(request).then((res) => {
          // Store only what is safe to replay: this origin's own successful,
          // non-opaque static responses.
          if (res.ok && res.type === 'basic' && url.pathname.startsWith('/_next/static/')) {
            cache.put(request, res.clone()).catch(() => {});
          }
          return res;
        });
      })
    ).catch(() => fetch(request))
  );
});
