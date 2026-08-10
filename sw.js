/* =============================================================================
   TRAMO — service worker
   Convierte la web en aplicación instalable que funciona sin conexión.
   Esto es lo que cubre el 90% de lo que la gente llama "app", y cuesta $0.

   Estrategia: la app se guarda al instalar; las llamadas a las APIs
   siempre van a la red y solo caen al caché si no hay señal.
   ========================================================================== */
const CACHE="tramo-v4";
const APP = [
  "/", "/index.html", "/rutas.html", "/gestor.html", "/movil.html", "/tramo-core.js",
  "/manifest.webmanifest", "/icon.svg", "/icon-192.png", "/icon-512.png"
];

self.addEventListener("install", (e) => {
  e.waitUntil(caches.open(CACHE).then((c) => c.addAll(APP)).then(() => self.skipWaiting()));
});

self.addEventListener("activate", (e) => {
  e.waitUntil(
    caches.keys()
      .then((ks) => Promise.all(ks.filter((k) => k !== CACHE).map((k) => caches.delete(k))))
      .then(() => self.clients.claim())
  );
});

self.addEventListener("fetch", (e) => {
  const url = new URL(e.request.url);
  if (e.request.method !== "GET") return;

  // Las APIs siempre intentan red primero: los precios no deben quedar viejos.
  if (url.pathname.startsWith("/api/") || url.pathname.includes("/.netlify/functions/")) {
    e.respondWith(fetch(e.request).catch(() => caches.match(e.request)));
    return;
  }

  // El resto: sirve del caché al instante y refresca por detrás.
  e.respondWith(
    caches.match(e.request).then((hit) => {
      const red = fetch(e.request).then((r) => {
        if (r.ok && url.origin === location.origin) {
          const copia = r.clone();
          caches.open(CACHE).then((c) => c.put(e.request, copia));
        }
        return r;
      }).catch(() => hit);
      return hit || red;
    })
  );
});
