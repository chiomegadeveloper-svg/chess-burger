const CACHE = "chess-burger-shell-__BUILD_ID__";
const RPG_CACHE = "chess-burger-rpg-files-v1";
const TILE_CACHE = "chess-burger-rpg-map-v1";
const RPG_MANIFEST = "__RPG_ASSET_MANIFEST__";
const GAME_LIMIT = 80 * 1024 * 1024;
const TILE_LIMIT = 48;
const gameAssets = new Map((RPG_MANIFEST.assets || []).map((asset) => [asset.path, asset]));
const gameKeys = new Map([...gameAssets.values()].map((asset) => [gameKey(asset), asset]));
const pendingFiles = new Map(), downloads = new Map();
let storageQueue = Promise.resolve(), gameIndex = null;

function gameKey(asset) {
  const u = new URL(asset.path, self.location.origin);
  u.searchParams.set("rpg-revision", asset.revision);
  return u.href;
}
function store(task) {
  const next = storageQueue.catch(() => {}).then(task);
  storageQueue = next.catch(() => {});
  return next;
}
async function indexGame(cache) {
  if (gameIndex) return gameIndex;
  const index = new Map();
  for (const request of await cache.keys()) {
    const asset = gameKeys.get(request.url);
    if (asset) index.set(request.url, asset.bytes);
    else await cache.delete(request);
  }
  gameIndex = index;
  return index;
}
async function saveGame(key, asset, response) {
  return store(async () => {
    try {
      const cache = await caches.open(RPG_CACHE), index = await indexGame(cache);
      if (asset.bytes > GAME_LIMIT) return false;
      let bytes = [...index.values()].reduce((a, b) => a + b, 0) - (index.get(key) || 0);
      for (const [old, size] of index) {
        if (bytes + asset.bytes <= GAME_LIMIT) break;
        if (old === key) continue;
        await cache.delete(old);index.delete(old);bytes -= size;
      }
      await cache.put(key, response);index.set(key, asset.bytes);
      return true;
    } catch { gameIndex = null;return false; }
  });
}
function safeResponse(response) {
  return response.ok && !response.redirected && response.type !== "opaque" &&
    !response.headers.get("cache-control")?.includes("no-store");
}
async function gameFile(asset, event, waitForSave = false) {
  const key = gameKey(asset);
  try {
    const cached = await (await caches.open(RPG_CACHE)).match(key);
    if (cached) return cached;
  } catch {}
  let task = pendingFiles.get(key);
  if (!task) {
    task = {};
    task.ready = fetch(key, {credentials: "same-origin", cache: "no-cache"}).then((response) => {
      task.saved = safeResponse(response) ? saveGame(key, asset, response.clone()) : Promise.resolve(false);
      task.saved.finally(() => {if (pendingFiles.get(key) === task) pendingFiles.delete(key);});
      return response;
    }).catch((error) => {pendingFiles.delete(key);throw error;});
    pendingFiles.set(key, task);
  }
  event?.waitUntil(task.ready.then(() => task.saved).catch(() => {}));
  const response = await task.ready;
  if (waitForSave && !(await task.saved)) throw Error("Device storage is full or unavailable. You can still play online.");
  return response.clone();
}
function mapAsset(u) {
  return u.protocol === "https:" && u.hostname === "tiles.openfreemap.org" &&
    !u.search && (u.pathname === "/planet" || /\/\d+\/\d+\/\d+\.pbf$/.test(u.pathname));
}
async function mapFile(request, event) {
  const u = new URL(request.url), metadata = u.pathname === "/planet";
  let cached;
  try {cached = await (await caches.open(TILE_CACHE)).match(request);} catch {}
  if (cached && !metadata) return cached;
  try {
    const response = await fetch(request);
    if (!response.ok && cached) return cached;
    if (safeResponse(response)) {
      const copy = response.clone();
      event.waitUntil(store(async () => {
        try {
          if ((await copy.clone().blob()).size > 1024 * 1024) return;
          const cache = await caches.open(TILE_CACHE);
          await cache.put(request, copy);
          const keys = await cache.keys();
          for (const key of keys.slice(0, Math.max(0, keys.length - TILE_LIMIT))) await cache.delete(key);
        } catch {}
      }));
    }
    return response;
  } catch (error) {if (cached) return cached;throw error;}
}
async function gameStatus() {
  await storageQueue;
  const cache = await caches.open(RPG_CACHE), index = await indexGame(cache);
  return {version: RPG_MANIFEST.version, files: index.size, totalFiles: gameAssets.size,
    bytes: [...index.values()].reduce((a, b) => a + b, 0), totalBytes: RPG_MANIFEST.bytes || 0};
}
async function downloadGame(event) {
  const port = event.ports?.[0];if (!port) return;
  const id = event.data.id, job = {cancelled: false};downloads.set(id, job);
  const send = (data) => {try {port.postMessage(data);} catch {}};
  try {
    if (!gameAssets.size) throw Error("Game files are updating. Reopen RPG and try again.");
    if (RPG_MANIFEST.bytes > GAME_LIMIT) throw Error("The game pack is too large to save on this device.");
    send({type: "progress", ...await gameStatus()});
    const files = [...gameAssets.values()];let cursor = 0;
    await Promise.all(Array.from({length: 2}, async () => {
      while (!job.cancelled && cursor < files.length) {
        const asset = files[cursor++];await gameFile(asset, event, true);
        if (!job.cancelled) send({type: "progress", ...await gameStatus()});
      }
    }));
    send({type: job.cancelled ? "cancelled" : "complete", ...await gameStatus()});
  } catch (error) {job.cancelled = true;send({type: "error", error: error.message});}
  finally {downloads.delete(id);port.close();}
}
const ASSETS = [
  "/",
  "/cburger_logo.png",
  "/chess-burger-icon.svg",
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
      store(async () => {try {await indexGame(await caches.open(RPG_CACHE));} catch {}}),
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
  if (event.data?.type === "RPG_FILES_STATUS") {
    event.waitUntil(gameStatus().then((status) => event.ports?.[0]?.postMessage({type: "status", ...status}))
      .catch(() => event.ports?.[0]?.postMessage({type: "error", error: "Device storage is unavailable."})));
    return;
  }
  if (event.data?.type === "RPG_FILES_DOWNLOAD") {event.waitUntil(downloadGame(event));return;}
  if (event.data?.type === "RPG_FILES_CANCEL") {const job = downloads.get(event.data.id);if (job) job.cancelled = true;return;}
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
              !/\.(js|css|woff2?|png|webp|svg)$/.test(u.pathname)
            )
              return;
            const asset = gameAssets.get(u.pathname);
            if (asset) {await gameFile(asset, event, true);return;}
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
  if (event.request.method !== "GET" || event.request.headers.has("authorization")) return;
  if (mapAsset(u)) {event.respondWith(mapFile(event.request, event));return;}
  // A new app must bypass an older worker's HTML, while the matching worker can
  // still serve the small RPG entry page instantly from its revision cache.
  const currentRpgEntry = u.pathname === '/rpg/index.html' &&
    u.searchParams.size === 1 && u.searchParams.get('v') === RPG_MANIFEST.version;
  const asset = u.origin === self.location.origin && (!u.search || currentRpgEntry) && gameAssets.get(u.pathname);
  if (asset) {
    event.respondWith(gameFile(asset, event).catch(() => new Response("Reconnect to load this game file.", {status: 503})));
    return;
  }
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
