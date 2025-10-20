const CACHE_NAME = "oxsig-v1.0.0";
const RUNTIME_CACHE = "oxsig-runtime-v1";
const IMAGE_CACHE = "oxsig-images-v1";

// Critical assets to cache immediately
const PRECACHE_URLS = [
  "/",
  "/offline",
  "/manifest.webmanifest",
  "/favicon.ico"
];

// Install event - cache critical assets
self.addEventListener("install", (event) => {
  console.log('[SW] Installing service worker...');
  event.waitUntil(
    caches.open(CACHE_NAME)
      .then((cache) => {
        console.log('[SW] Precaching critical assets');
        return cache.addAll(PRECACHE_URLS);
      })
      .then(() => self.skipWaiting())
  );
});

// Activate event - clean up old caches
self.addEventListener("activate", (event) => {
  console.log('[SW] Activating service worker...');
  const currentCaches = [CACHE_NAME, RUNTIME_CACHE, IMAGE_CACHE];
  event.waitUntil(
    caches.keys()
      .then((cacheNames) => {
        return Promise.all(
          cacheNames.map((cacheName) => {
            if (!currentCaches.includes(cacheName)) {
              console.log('[SW] Deleting old cache:', cacheName);
              return caches.delete(cacheName);
            }
          })
        );
      })
      .then(() => self.clients.claim())
  );
});

// Fetch event - implement caching strategies
self.addEventListener("fetch", (event) => {
  const { request } = event;
  const url = new URL(request.url);

  // Skip non-GET requests
  if (request.method !== "GET") return;

  // Skip chrome extension requests
  if (url.protocol === "chrome-extension:") return;

  // API requests - Network First, fallback to cache
  if (url.pathname.startsWith('/api/')) {
    event.respondWith(
      fetch(request)
        .then((response) => {
          const responseClone = response.clone();
          caches.open(RUNTIME_CACHE).then((cache) => {
            cache.put(request, responseClone);
          });
          return response;
        })
        .catch(() => {
          return caches.match(request);
        })
    );
    return;
  }

  // Images - Cache First, fallback to network
  if (request.destination === 'image') {
    event.respondWith(
      caches.match(request)
        .then((cached) => {
          if (cached) return cached;
          return fetch(request).then((response) => {
            const responseClone = response.clone();
            caches.open(IMAGE_CACHE).then((cache) => {
              cache.put(request, responseClone);
            });
            return response;
          });
        })
    );
    return;
  }

  // Navigation requests - Network First with fast fallback
  if (request.mode === "navigate") {
    event.respondWith(
      Promise.race([
        fetch(request)
          .then((response) => {
            const responseClone = response.clone();
            caches.open(RUNTIME_CACHE).then((cache) => {
              cache.put(request, responseClone);
            });
            return response;
          }),
        new Promise((resolve) => setTimeout(() => resolve(caches.match(request)), 3000))
      ])
      .catch(() => {
        return caches.match(request)
          .then((cached) => cached || caches.match('/offline'));
      })
    );
    return;
  }

  // Static assets - Cache First, update in background
  event.respondWith(
    caches.match(request)
      .then((cached) => {
        const fetchPromise = fetch(request)
          .then((response) => {
            const responseClone = response.clone();
            caches.open(CACHE_NAME).then((cache) => {
              cache.put(request, responseClone);
            });
            return response;
          })
          .catch(() => cached);
        
        return cached || fetchPromise;
      })
  );
});

// Background sync for offline actions
self.addEventListener('sync', (event) => {
  console.log('[SW] Background sync:', event.tag);
  if (event.tag === 'sync-data') {
    event.waitUntil(syncData());
  }
});

// Push notifications
self.addEventListener('push', (event) => {
  console.log('[SW] Push notification received');
  const data = event.data ? event.data.json() : {};
  const options = {
    body: data.body || 'New notification from OxSig',
    icon: '/icon-192.png',
    badge: '/favicon.ico',
    vibrate: [200, 100, 200],
    data: data,
    actions: [
      { action: 'open', title: 'Open App' },
      { action: 'close', title: 'Close' }
    ]
  };
  
  event.waitUntil(
    self.registration.showNotification(data.title || 'OxSig', options)
  );
});

// Notification click handling
self.addEventListener('notificationclick', (event) => {
  console.log('[SW] Notification clicked:', event.action);
  event.notification.close();
  
  if (event.action === 'open') {
    event.waitUntil(
      clients.openWindow('/')
    );
  }
});

// Helper function for background sync
async function syncData() {
  // Implement your background sync logic here
  console.log('[SW] Syncing data...');
  return Promise.resolve();
}