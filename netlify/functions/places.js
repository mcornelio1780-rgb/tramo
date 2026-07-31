/* =============================================================================
   TRAMO — /.netlify/functions/places
   Proxy a Google Maps Platform. La clave vive aquí, nunca en el navegador.

   Acciones:
     ?q=lima              → autocompletado de ciudades (Places API New)
     ?route=LIM|CUZ       → distancia y duración terrestre (Routes API),
                            útil para estimar buses, trenes y ferries.
   Google Maps Platform tiene crédito mensual gratuito; igual conviene cachear
   porque el autocompletado se dispara con cada tecla.
   ========================================================================== */

const CACHE = new Map();
const TTL_MS = 1000 * 60 * 60 * 24 * 7;

export default async (req) => {
  const p = new URL(req.url).searchParams;
  const json = (o, s = 200) => new Response(JSON.stringify(o), {
    status: s,
    headers: { "content-type": "application/json", "access-control-allow-origin": "*", "cache-control": "public, max-age=86400" }
  });

  const key = process.env.GOOGLE_MAPS_KEY;
  if (p.get("ping")) return json({ ok: true, maps: !!key });
  if (!key) return json({ error: "GOOGLE_MAPS_KEY no configurada" }, 501);

  const q = (p.get("q") || "").trim();
  if (q.length >= 2) {
    const ck = "q:" + q.toLowerCase();
    const hit = CACHE.get(ck);
    if (hit && Date.now() - hit.t < TTL_MS) return json(hit.v);
    try {
      const r = await fetch("https://places.googleapis.com/v1/places:autocomplete", {
        method: "POST",
        headers: { "content-type": "application/json", "X-Goog-Api-Key": key },
        body: JSON.stringify({ input: q, includedPrimaryTypes: ["locality", "administrative_area_level_3"], languageCode: "es" }),
        signal: AbortSignal.timeout(8000)
      });
      if (!r.ok) return json({ error: "places falló" }, 502);
      const j = await r.json();
      const out = {
        results: (j.suggestions || []).slice(0, 6).map((s) => ({
          text: s.placePrediction?.text?.text,
          placeId: s.placePrediction?.placeId
        })).filter((x) => x.text)
      };
      CACHE.set(ck, { t: Date.now(), v: out });
      return json(out);
    } catch (e) { return json({ error: "timeout" }, 504); }
  }

  const route = p.get("route");
  if (route && route.includes("|")) {
    const [o, d] = route.split("|");
    try {
      const r = await fetch("https://routes.googleapis.com/directions/v2:computeRoutes", {
        method: "POST",
        headers: {
          "content-type": "application/json",
          "X-Goog-Api-Key": key,
          "X-Goog-FieldMask": "routes.distanceMeters,routes.duration"
        },
        body: JSON.stringify({
          origin: { address: o }, destination: { address: d },
          travelMode: "DRIVE", languageCode: "es"
        }),
        signal: AbortSignal.timeout(8000)
      });
      if (!r.ok) return json({ error: "routes falló" }, 502);
      const j = await r.json();
      const ruta = j.routes?.[0];
      if (!ruta) return json({ error: "sin ruta terrestre" }, 404);
      const km = ruta.distanceMeters / 1000;
      const horas = parseInt(ruta.duration) / 3600;
      // Estimación de costo de bus interprovincial en la región
      return json({ km: Math.round(km), horas: Math.round(horas * 10) / 10, busUsdAprox: Math.round(km * 0.045 + 4) });
    } catch (e) { return json({ error: "timeout" }, 504); }
  }

  return json({ error: "Usa ?q=ciudad o ?route=origen|destino" }, 400);
};

export const config = { path: "/api/places" };
