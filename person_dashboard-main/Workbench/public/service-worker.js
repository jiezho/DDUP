const CACHE_NAME = "ddup-static-shell-v1";
const SHELL_URLS = ["/", "/manifest.webmanifest", "/workbench-mark.svg", "/favicon-32.png"];

self.addEventListener("install", (event) => {
  event.waitUntil(caches.open(CACHE_NAME).then((cache) => cache.addAll(SHELL_URLS)));
  self.skipWaiting();
});

self.addEventListener("activate", (event) => {
  event.waitUntil(
    caches.keys().then((keys) => Promise.all(
      keys.filter((key) => key.startsWith("ddup-static-shell-") && key !== CACHE_NAME)
        .map((key) => caches.delete(key)),
    )),
  );
  self.clients.claim();
});

function isCacheableStaticRequest(request, url) {
  if (request.method !== "GET" || url.origin !== self.location.origin) return false;
  if (url.pathname.startsWith("/api/")) return false;
  return ["script", "style", "font", "image"].includes(request.destination)
    || url.pathname === "/manifest.webmanifest";
}

self.addEventListener("fetch", (event) => {
  const { request } = event;
  const url = new URL(request.url);
  if (request.method !== "GET" || url.origin !== self.location.origin || url.pathname.startsWith("/api/")) return;

  if (request.mode === "navigate") {
    event.respondWith(
      fetch(request).then((response) => {
        if (response.ok) caches.open(CACHE_NAME).then((cache) => cache.put("/", response.clone()));
        return response;
      }).catch(() => caches.match("/")),
    );
    return;
  }

  if (!isCacheableStaticRequest(request, url)) return;
  event.respondWith(
    caches.match(request).then((cached) => cached || fetch(request).then((response) => {
      if (response.ok) caches.open(CACHE_NAME).then((cache) => cache.put(request, response.clone()));
      return response;
    })),
  );
});
