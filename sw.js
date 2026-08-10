/* =============================================================================
   TRAMO — service worker
   Convierte la web en aplicación instalable que funciona sin conexión.
   Esto es lo que cubre el 90% de lo que la gente llama "app", y cuesta $0.

   Estrategia:
   - Páginas (navegación): RED primero, caché solo de respaldo sin conexión.
     Así nunca servimos una respuesta "redirigida" cacheada (que rompía el
     gestor con ERR_FAILED cuando Vercel usaba cleanUrls).
   - Recursos (JS, íconos, manifest): caché al instante + refresco por detrás.
   - APIs: siempre red primero; los precios y la config no deben quedar viejos.
   ========================================================================== */
const CACHE = "tramo-v5";
const APP = [
  "/", "/index.html", "/rutas.html", "/gestor.html", "/movil.html", "/tramo-core.js",
  "/manifest.webmanifest", "/icon.svg", "/icon-192.png", "/icon-512.png"
];

/* Guarda una copia SIN marca de redirección (una respuesta redirigida no puede
   servirse a una navegación: el navegador lanza ERR_FAILED). */
async function guardarLimpio(cache, req, res) {
  if (!res || !res.ok) return;
  const body = await res.clone().blob();
  await cache.put(req, new Response(body, { status: 200, statusText: "OK", headers: res.headers }));
}

self.addEventListener("install", (e) => {
  e.waitUntil((async () => {
    const c = await caches.open(CACHE);
    // Individual y tolerante a fallos: si un recurso no está, no rompe la instalación.
    await Promise.allSettled(APP.map(async (u) => {
      try { const r = await fetch(u, { cache: "no-cache", redirect: "follow" }); await guardarLimpio(c, u, r); } catch (_) {}
    }));
    await self.skipWaiting();
  })());
});

self.addEventListener("activate", (e) => {
  e.waitUntil((async () => {
    const ks = await caches.keys();
    await Promise.all(ks.filter((k) => k !== CACHE).map((k) => caches.delete(k)));
    await self.clients.claim();
  })());
});

self.addEventListener("fetch", (e) => {
  const req = e.request;
  if (req.method !== "GET") return;
  const url = new URL(req.url);

  // APIs: red primero, caché de respaldo si no hay señal.
  if (url.pathname.startsWith("/api/") || url.pathname.includes("/.netlify/functions/")) {
    e.respondWith(fetch(req).catch(() => caches.match(req)));
    return;
  }

  // Navegación (páginas): RED primero. Nunca sirve una respuesta redirigida cacheada.
  if (req.mode === "navigate") {
    e.respondWith((async () => {
      try {
        const r = await fetch(req);
        if (r && r.ok && url.origin === location.origin) {
          const c = await caches.open(CACHE); guardarLimpio(c, req, r.clone());
        }
        return r;
      } catch (_) {
        const hit = (await caches.match(req)) || (await caches.match("/index.html"));
        return hit || Response.error();
      }
    })());
    return;
  }

  // Recursos: caché al instante + refresco en segundo plano (ignora redirigidas).
  e.respondWith((async () => {
    const hit = await caches.match(req);
    const net = fetch(req).then(async (r) => {
      if (r && r.ok && !r.redirected && url.origin === location.origin) {
        const c = await caches.open(CACHE); c.put(req, r.clone());
      }
      return r;
    }).catch(() => hit);
    return hit || net;
  })());
});
