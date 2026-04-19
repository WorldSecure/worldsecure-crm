// WorldSecure PWA Service Worker v2
const CACHE_NAME = 'worldsecure-v2';

// Install - cache the app shell
self.addEventListener('install', (event) => {
  event.waitUntil(
    caches.open(CACHE_NAME).then((cache) => {
      // שמור את הדף הראשי בלבד — שאר הנכסים יישמרו דינמית
      return cache.addAll(['/', '/manifest.json']).catch(() => {});
    })
  );
  self.skipWaiting();
});

// Activate - נקה caches ישנים
self.addEventListener('activate', (event) => {
  event.waitUntil(
    caches.keys().then((keys) =>
      Promise.all(
        keys.filter((key) => key !== CACHE_NAME).map((key) => caches.delete(key))
      )
    )
  );
  self.clients.claim();
});

// Fetch - Network first, Cache fallback
self.addEventListener('fetch', (event) => {
  const { request } = event;
  const url = new URL(request.url);

  // API calls — תמיד מהרשת, לא cache
  if (url.pathname.startsWith('/api/')) {
    event.respondWith(
      fetch(request).catch(() =>
        new Response(JSON.stringify({ error: 'offline' }), {
          headers: { 'Content-Type': 'application/json' },
          status: 503
        })
      )
    );
    return;
  }

  // Static assets & pages — Network first, cache fallback
  event.respondWith(
    fetch(request)
      .then((response) => {
        // שמור תגובות טובות ב-cache
        if (response && response.status === 200) {
          const cloned = response.clone();
          caches.open(CACHE_NAME).then((cache) => cache.put(request, cloned));
        }
        return response;
      })
      .catch(() => {
        // אין רשת — החזר מ-cache
        return caches.match(request).then((cached) => {
          if (cached) return cached;
          // fallback לדף הראשי עבור navigation requests
          if (request.mode === 'navigate') {
            return caches.match('/');
          }
          return new Response('Offline', { status: 503 });
        });
      })
  );
});
