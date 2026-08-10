/* =============================================================================
   TRAMO — /api/flights (Vercel)
   Devuelve una banda de precio { low, high, source } para una ruta.

   Orden de intento:
     1. SerpApi (motor google_flights) → price_insights.typical_price_range
        Es lo más cercano a "la API de Google Flights", que no existe como
        producto público. Plan gratuito: 250 búsquedas al mes.
     2. Travelpayouts Data API → precio más barato en caché (gratis y además
        paga comisión de afiliado).
     3. null → el navegador usa su banda local calibrada.

   Claves: se configuran en Netlify → Site settings → Environment variables.
   Nunca van en el HTML.
   ========================================================================== */

const CACHE = new Map();               // caché en memoria por instancia
const TTL_MS = 1000 * 60 * 60 * 12;    // 12 horas

/* Fecha de salida según la ventana de compra que eligió el usuario */
function fechas(windowKey, tipo) {
  const dias = { corto: 14, medio: 38, largo: 75 }[windowKey] ?? 38;
  const out = new Date(Date.now() + dias * 864e5);
  const back = new Date(out.getTime() + 30 * 864e5);
  const f = (d) => d.toISOString().slice(0, 10);
  return tipo === "ow" ? { out: f(out) } : { out: f(out), back: f(back) };
}

async function serpapi(from, to, windowKey, tipo) {
  const key = process.env.SERPAPI_KEY;
  if (!key) return null;
  const { out, back } = fechas(windowKey, tipo);
  const u = new URL("https://serpapi.com/search");
  u.searchParams.set("engine", "google_flights");
  u.searchParams.set("departure_id", from);
  u.searchParams.set("arrival_id", to);
  u.searchParams.set("outbound_date", out);
  if (back) u.searchParams.set("return_date", back);
  u.searchParams.set("type", tipo === "ow" ? "2" : "1");
  u.searchParams.set("currency", "USD");
  u.searchParams.set("hl", "es");
  u.searchParams.set("api_key", key);

  const r = await fetch(u, { signal: AbortSignal.timeout(9000) });
  if (!r.ok) return null;
  const j = await r.json();

  const pi = j.price_insights;
  if (pi?.typical_price_range?.length === 2) {
    return { low: pi.typical_price_range[0], high: pi.typical_price_range[1], source: "serpapi" };
  }
  // Sin price_insights: derivamos la banda de las ofertas devueltas
  const precios = [...(j.best_flights || []), ...(j.other_flights || [])]
    .map((f) => f.price).filter((n) => typeof n === "number").sort((a, b) => a - b);
  if (precios.length) {
    return {
      low: precios[0],
      high: precios[Math.min(precios.length - 1, Math.floor(precios.length * 0.75))],
      source: "serpapi"
    };
  }
  return null;
}

async function travelpayouts(from, to) {
  const token = process.env.TRAVELPAYOUTS_TOKEN;
  if (!token) return null;
  const u = new URL("https://api.travelpayouts.com/v1/prices/cheap");
  u.searchParams.set("origin", from);
  u.searchParams.set("destination", to);
  u.searchParams.set("currency", "usd");
  u.searchParams.set("token", token);

  const r = await fetch(u, { signal: AbortSignal.timeout(8000) });
  if (!r.ok) return null;
  const j = await r.json();
  const precios = Object.values(j.data?.[to] || {})
    .map((v) => v.price).filter(Boolean).sort((a, b) => a - b);
  if (!precios.length) return null;
  // El caché de Travelpayouts es de ida: aproximamos la vuelta
  return { low: Math.round(precios[0] * 1.85), high: Math.round(precios[precios.length - 1] * 2.1), source: "travelpayouts" };
}

export default async (req) => {
  const p = new URL(req.url).searchParams;
  const json = (o, s = 200) => new Response(JSON.stringify(o), {
    status: s,
    headers: { "content-type": "application/json", "access-control-allow-origin": "*", "cache-control": "public, max-age=43200" }
  });

  if (p.get("ping")) return json({ ok: true, serpapi: !!process.env.SERPAPI_KEY, travelpayouts: !!process.env.TRAVELPAYOUTS_TOKEN });

  const from = (p.get("from") || "").toUpperCase().slice(0, 3);
  const to = (p.get("to") || "").toUpperCase().slice(0, 3);
  if (!/^[A-Z]{3}$/.test(from) || !/^[A-Z]{3}$/.test(to)) return json({ error: "Códigos IATA inválidos" }, 400);

  const tipo = p.get("type") === "ow" ? "ow" : "rt";
  const win = p.get("window") || "medio";
  const season = p.get("season") || "media";
  const ck = `${from}${to}${tipo}${win}`;

  const hit = CACHE.get(ck);
  if (hit && Date.now() - hit.t < TTL_MS) return json({ ...hit.v, cached: true, season });

  let band = null;
  try { band = await serpapi(from, to, win, tipo); } catch (e) { band = null; }
  if (!band) { try { band = await travelpayouts(from, to); } catch (e) { band = null; } }
  if (!band) return json({ error: "sin datos en vivo" }, 404);

  // El proveedor no conoce la temporada del usuario: la aplicamos aquí
  const k = { alta: 1.18, media: 1.0, baja: 0.9 }[season] ?? 1;
  band = { ...band, low: Math.round(band.low * k), high: Math.round(band.high * k) };

  CACHE.set(ck, { t: Date.now(), v: band });
  return json(band);
};

export const config = { runtime: "nodejs" };
