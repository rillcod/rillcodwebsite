/* Rillcod Technologies service worker.
 * This is application source, not a generated build manifest. Never cache API
 * responses or private dashboard documents containing learner/finance data.
 */

const CACHE_NAME = "rillcod-public-shell-v1";
const OFFLINE_URL = "/offline.html";
const INSTALL_ASSETS = [OFFLINE_URL, "/manifest.json", "/images/logo.png"];
const LEGACY_CACHE_NAMES = new Set([
  "start-url",
  "google-fonts-webfonts",
  "google-fonts-stylesheets",
  "static-font-assets",
  "static-image-assets",
  "static-audio-assets",
  "static-video-assets",
  "static-js-assets",
  "static-style-assets",
  "static-data-assets",
  "next-image",
  "next-data",
  "apis",
  "others",
  "cross-origin",
]);

self.addEventListener("install", (event) => {
  event.waitUntil(
    caches.open(CACHE_NAME)
      .then((cache) => cache.addAll(INSTALL_ASSETS)),
  );
});

self.addEventListener("activate", (event) => {
  event.waitUntil(
    caches.keys()
      .then((names) => Promise.all(
        names
          .filter((name) => (
            (name.startsWith("rillcod-") && name !== CACHE_NAME)
            || name.startsWith("workbox-")
            || LEGACY_CACHE_NAMES.has(name)
          ))
          .map((name) => caches.delete(name)),
      ))
      .then(() => self.clients.claim()),
  );
});

function isPublicStaticAsset(url) {
  if (url.origin !== self.location.origin) return false;
  if (url.pathname.startsWith("/api/") || url.pathname.startsWith("/dashboard")) return false;
  return url.pathname.startsWith("/_next/static/")
    || url.pathname.startsWith("/images/")
    || url.pathname.startsWith("/icons/")
    || /\.(?:css|js|png|jpe?g|gif|svg|webp|avif|woff2?)$/i.test(url.pathname);
}

self.addEventListener("fetch", (event) => {
  const { request } = event;
  if (request.method !== "GET") return;

  const url = new URL(request.url);
  if (request.mode === "navigate") {
    event.respondWith(
      fetch(request).catch(async () => {
        const cache = await caches.open(CACHE_NAME);
        return (await cache.match(OFFLINE_URL)) || Response.error();
      }),
    );
    return;
  }

  if (!isPublicStaticAsset(url)) return;
  event.respondWith((async () => {
    const cache = await caches.open(CACHE_NAME);
    const cached = await cache.match(request);
    if (cached) return cached;
    const response = await fetch(request);
    if (response.ok && response.type === "basic") {
      await cache.put(request, response.clone());
    }
    return response;
  })());
});

function pushPayload(event) {
  if (!event.data) return {};
  try {
    return event.data.json();
  } catch {
    return { body: event.data.text() };
  }
}

self.addEventListener("push", (event) => {
  const payload = pushPayload(event);
  const notification = payload.notification || payload;
  const title = notification.title || "Rillcod Technologies";
  const url = notification.url || notification.data?.url || "/dashboard/notifications";
  event.waitUntil(self.registration.showNotification(title, {
    body: notification.body || "You have a new update.",
    icon: notification.icon || "/images/logo.png",
    badge: notification.badge || "/images/logo.png",
    tag: notification.tag || undefined,
    data: { ...(notification.data || {}), url },
  }));
});

self.addEventListener("notificationclick", (event) => {
  event.notification.close();
  const target = new URL(event.notification.data?.url || "/dashboard/notifications", self.location.origin);
  const safeTarget = target.origin === self.location.origin ? target.href : `${self.location.origin}/dashboard/notifications`;
  event.waitUntil((async () => {
    const windows = await self.clients.matchAll({ type: "window", includeUncontrolled: true });
    const existing = windows.find((client) => new URL(client.url).origin === self.location.origin);
    if (existing) {
      await existing.navigate(safeTarget);
      return existing.focus();
    }
    return self.clients.openWindow(safeTarget);
  })());
});

self.addEventListener("message", (event) => {
  if (event.data?.type === "SKIP_WAITING" || event.data?.type === "skipWaiting") {
    self.skipWaiting();
  }
});
