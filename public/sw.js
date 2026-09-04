// Oxsig no longer uses the legacy offline service worker.
//
// Older production clients may still have a previous version registered. That
// version cached navigation responses, which can retain authenticated HTML and
// keep a browser on stale application code after a deployment. This tiny
// retirement worker updates those clients, removes only Oxsig-owned caches,
// and unregisters itself.

self.addEventListener('install', (event) => {
  event.waitUntil(self.skipWaiting());
});

self.addEventListener('activate', (event) => {
  event.waitUntil((async () => {
    const cacheNames = await caches.keys();
    await Promise.all(
      cacheNames
        .filter((name) => name.startsWith('oxsig-'))
        .map((name) => caches.delete(name))
    );

    await self.registration.unregister();

    // Take control long enough to retire the old worker consistently. We do
    // not register a fetch handler, so requests continue to the network.
    await self.clients.claim();
  })());
});
