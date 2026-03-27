const CACHE_NAME = "rillcod-cache-v2";
const OFFLINE_URL = "/offline.html";
const CORE_ASSETS = ["/", "/manifest.json", OFFLINE_URL];

// Never cache these origins — auth/API calls must always go to the network
const BYPASS_ORIGINS = [
  "supabase.co",
  "supabase.in",
];

function shouldBypass(url) {
  return BYPASS_ORIGINS.some((origin) => url.hostname.endsWith(origin));
}

self.addEventListener("install", (event) => {
  event.waitUntil(
    caches.open(CACHE_NAME).then((cache) => cache.addAll(CORE_ASSETS))
  );
  self.skipWaiting();
});

self.addEventListener("activate", (event) => {
  event.waitUntil(
    caches.keys().then((keys) =>
      Promise.all(keys.filter((key) => key !== CACHE_NAME).map((key) => caches.delete(key)))
    )
  );
  self.clients.claim();
});

self.addEventListener("fetch", (event) => {
  if (event.request.method !== "GET") return;

  const url = new URL(event.request.url);

  // Always bypass Supabase and any external API
  if (shouldBypass(url)) return;

  if (event.request.mode === "navigate") {
    event.respondWith(
      fetch(event.request)
        .then((response) => {
          const clone = response.clone();
          caches.open(CACHE_NAME).then((cache) => cache.put(event.request, clone));
          return response;
        })
        .catch(() => caches.match(event.request).then((res) => res || caches.match(OFFLINE_URL)))
    );
    return;
  }

  // For static assets: cache-first, then network
  event.respondWith(
    caches.match(event.request).then((cached) => {
      const fetchPromise = fetch(event.request)
        .then((response) => {
          // Only cache same-origin responses
          if (response.ok && url.origin === self.location.origin) {
            const clone = response.clone();
            caches.open(CACHE_NAME).then((cache) => cache.put(event.request, clone));
          }
          return response;
        })
        .catch(() => cached);
      return cached || fetchPromise;
    })
  );
});

self.addEventListener("push", (event) => {
  let data = {};
  if (event.data) {
    try { data = event.data.json(); } catch { data = { body: event.data.text() }; }
  }
  const title = data.title || "Rillcod Academy";
  const options = {
    body: data.body || "You have a new notification.",
    icon: "/favicon.ico",
    badge: "/favicon.ico",
    data: { url: data.url || "/" }
  };
  event.waitUntil(self.registration.showNotification(title, options));
});

self.addEventListener("notificationclick", (event) => {
  event.notification.close();
  const target = event.notification?.data?.url || "/";
  event.waitUntil(
    clients.matchAll({ type: "window", includeUncontrolled: true }).then((clientList) => {
      for (const client of clientList) {
        if (client.url.includes(target) && "focus" in client) {
          return client.focus();
        }
      }
      if (clients.openWindow) return clients.openWindow(target);
    })
  );
});
