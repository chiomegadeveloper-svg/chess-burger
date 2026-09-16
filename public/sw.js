const CACHE = "chess-burger-shell-v44";
const ASSETS = [
  "/",
  "/cburger_logo.png",
  "/manifest.webmanifest",
  ...Array.from(
    { length: 50 },
    (_, i) => "/badges/badge-" + String(i).padStart(2, "0") + ".png",
  ),
  ...Array.from(
    { length: 10 },
    (_, i) => "/levels/level-" + String(i).padStart(2, "0") + ".png",
  ),
  ...Array.from({ length: 12 }, (_, i) => "/emotes/" + i + ".webp"),
];
self.addEventListener("install", (event) => {
  event.waitUntil(
    caches.open(CACHE).then(async (cache) => {
      await Promise.all(
        ASSETS.map(async (path) => {
          try {
            const r = await fetch(path, { cache: "reload" });
            if (r.ok && !r.redirected) await cache.put(path, r);
          } catch {}
        }),
      );
    }),
  );
  self.skipWaiting();
});
self.addEventListener("activate", (event) =>
  event.waitUntil(
    Promise.all([
      self.clients.claim(),
      caches
        .keys()
        .then((keys) =>
          Promise.all(
            keys
              .filter((k) => k.startsWith("chess-burger-shell-") && k !== CACHE)
              .map((k) => caches.delete(k)),
          ),
        ),
    ]),
  ),
);
function cacheable(u) {
  return (
    u.origin === self.location.origin &&
    !u.search &&
    !u.pathname.startsWith("/api/") &&
    !/auth|callback|signin|signout/.test(u.pathname)
  );
}
self.addEventListener("message", (event) => {
  if (event.data?.type !== "CACHE_ASSETS" || !Array.isArray(event.data.paths))
    return;
  event.waitUntil(
    caches.open(CACHE).then(async (cache) => {
      await Promise.all(
        event.data.paths.slice(0, 150).map(async (path) => {
          try {
            const u = new URL(path, self.location.origin);
            if (
              !cacheable(u) ||
              !/\.(js|css|woff2?|png|webp)$/.test(u.pathname)
            )
              return;
            const r = await fetch(u);
            if (r.ok && !r.redirected) await cache.put(u, r);
          } catch {}
        }),
      );
    }),
  );
});
self.addEventListener("fetch", (event) => {
  const u = new URL(event.request.url);
  if (event.request.method !== "GET" || !cacheable(u)) return;
  event.respondWith(
    fetch(event.request)
      .then((response) => {
        if (
          response.ok &&
          !response.redirected &&
          !response.headers.get("cache-control")?.includes("no-store")
        ) {
          const copy = response.clone();
          event.waitUntil(
            caches.open(CACHE).then((c) => c.put(event.request, copy)),
          );
        }
        return response;
      })
      .catch(
        async () =>
          (await caches.match(event.request)) ||
          (event.request.mode === "navigate"
            ? await caches.match("/")
            : null) ||
          new Response(
            "Open Chess Burger online once before using it offline.",
            { status: 503 },
          ),
      ),
  );
});
