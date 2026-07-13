/* service-worker.js — Shell Mercado Limpio (Clientes + Pedidos) v8 */
// HTML: NETWORK-FIRST con timeout → el shell se actualiza solo al abrir
// con internet, y cae al caché si no hay señal (sigue abriendo offline).
// Nota: las apps de adentro tienen sus propios service workers en sus
// scopes (/app-vendedores/, /App-Pedidos-ML/); este solo cachea el shell.

const CACHE_NAME = "ml-shell-v10";
const HTML_TIMEOUT_MS = 2500;
const PRECACHE_URLS = ["./", "./index.html", "./manifest.json"];

self.addEventListener("install", (e) => {
  e.waitUntil(
    caches.open(CACHE_NAME)
      .then(c => Promise.allSettled(PRECACHE_URLS.map(u => c.add(u).catch(() => {}))))
      .then(() => self.skipWaiting())
  );
});

self.addEventListener("activate", (e) => {
  e.waitUntil((async () => {
    const keys = await caches.keys();
    await Promise.all(keys.map(k => (k !== CACHE_NAME ? caches.delete(k) : null)));
    await self.clients.claim();
  })());
});

self.addEventListener("fetch", (e) => {
  const req = e.request;
  const url = new URL(req.url);

  if (req.method !== "GET") return;
  if (url.origin !== self.location.origin) return;

  const esHTML = req.mode === "navigate" ||
                 (req.headers.get("accept") || "").includes("text/html");

  if (esHTML) {
    e.respondWith((async () => {
      const cache = await caches.open(CACHE_NAME);
      try {
        const fresh = await Promise.race([
          fetch(req),
          new Promise((_, rej) => setTimeout(() => rej(new Error("timeout")), HTML_TIMEOUT_MS))
        ]);
        cache.put("./index.html", fresh.clone());
        return fresh;
      } catch (err) {
        const cached = await cache.match("./index.html") || await cache.match("./");
        return cached || new Response("Sin conexión", {
          status: 503, headers: { "Content-Type": "text/plain; charset=utf-8" }
        });
      }
    })());
    return;
  }

  // Estáticos del shell: cache-first
  e.respondWith(
    caches.match(req).then(cached =>
      cached ||
      fetch(req).then(resp => {
        const clone = resp.clone();
        caches.open(CACHE_NAME).then(c => c.put(req, clone));
        return resp;
      }).catch(() => cached)
    )
  );
});
