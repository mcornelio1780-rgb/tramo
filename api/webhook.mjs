/* =============================================================================
   TRAMO — /api/webhook   (función serverless de Vercel, runtime edge)
   Recibe el aviso del proveedor de pago y activa el plan del usuario en Supabase.

   Es el único lugar del sistema que usa la clave service_role de Supabase.
   Esa clave NUNCA sale del servidor.

   Detecta el proveedor por la forma del aviso:

   1) POLAR  (Merchant of Record — el que estás usando)
      Envía JSON firmado con el estándar "Standard Webhooks":
      cabeceras webhook-id / webhook-timestamp / webhook-signature.
      Configurar en Polar → Settings → Webhooks:
        URL:     https://TU-DOMINIO/api/webhook
        Formato: Raw
        Eventos: order.paid, subscription.active, subscription.updated,
                 subscription.canceled, subscription.revoked, order.refunded
      Copia el "Signing Secret" a la variable POLAR_WEBHOOK_SECRET.

   2) GUMROAD  (formulario x-www-form-urlencoded) — se conserva por compatibilidad.
   3) Genérico JSON + HMAC (Lemon Squeezy, etc.) — se conserva por compatibilidad.
   ========================================================================== */

const PLAN_POR_PRODUCTO = {
  "tramo-pro-mensual": "pro",
  "tramo-pro-anual": "anual",
  "tramo-fundador": "fundador",
  "tramo-pase-ciudad": "pro"
};

/* Mapea el nombre/slug del producto a un plan. Nombra tus productos en Polar
   con estas palabras (Fundador / Anual / Pro) y el plan se asigna solo. */
function planDeProducto(v) {
  const s = String(v || "").toLowerCase();
  if (/fundador|founder|vitalicio|lifetime/.test(s)) return "fundador";
  if (/anual|annual|year|a[nñ]o/.test(s)) return "anual";
  if (/pro|mensual|month|premium|plus/.test(s)) return "pro";
  return PLAN_POR_PRODUCTO[v] || "pro";
}

/* ---- Escritura en Supabase ------------------------------------------------ */
async function supabase(tabla, filas, onConflict) {
  const url = `${process.env.SUPABASE_URL}/rest/v1/${tabla}${onConflict ? `?on_conflict=${onConflict}` : ""}`;
  const r = await fetch(url, {
    method: "POST",
    headers: {
      "apikey": process.env.SUPABASE_SERVICE_ROLE_KEY,
      "Authorization": `Bearer ${process.env.SUPABASE_SERVICE_ROLE_KEY}`,
      "Content-Type": "application/json",
      "Prefer": onConflict ? "resolution=merge-duplicates" : "return=minimal"
    },
    body: JSON.stringify(filas)
  });
  if (!r.ok) throw new Error(`Supabase ${tabla}: ${r.status} ${await r.text()}`);
}

/* ---- Verificación Polar (Standard Webhooks) ------------------------------- */
async function verificarPolar(req, cuerpo) {
  const secreto = process.env.POLAR_WEBHOOK_SECRET || process.env.PAYMENT_WEBHOOK_SECRET;
  if (!secreto) return false;
  const id = req.headers.get("webhook-id");
  const ts = req.headers.get("webhook-timestamp");
  const sigHeader = req.headers.get("webhook-signature");
  if (!id || !ts || !sigHeader) return false;
  const raw = secreto.startsWith("whsec_") ? secreto.slice(6) : secreto;
  let keyBytes;
  try { keyBytes = Uint8Array.from(atob(raw), c => c.charCodeAt(0)); }
  catch { keyBytes = new TextEncoder().encode(raw); }
  const key = await crypto.subtle.importKey("raw", keyBytes, { name: "HMAC", hash: "SHA-256" }, false, ["sign"]);
  const mac = await crypto.subtle.sign("HMAC", key, new TextEncoder().encode(`${id}.${ts}.${cuerpo}`));
  const esperado = btoa(String.fromCharCode(...new Uint8Array(mac)));
  const firmas = sigHeader.split(" ").map(s => (s.includes(",") ? s.split(",")[1] : s));
  return firmas.includes(esperado);
}

/* ---- Verificación genérica MoR: HMAC hex del cuerpo ----------------------- */
async function firmaHexValida(req, cuerpo) {
  const secreto = process.env.PAYMENT_WEBHOOK_SECRET;
  if (!secreto) return false;
  const firma = req.headers.get("x-signature") || req.headers.get("x-webhook-signature") || "";
  if (!firma) return false;
  const key = await crypto.subtle.importKey("raw", new TextEncoder().encode(secreto), { name: "HMAC", hash: "SHA-256" }, false, ["sign"]);
  const mac = await crypto.subtle.sign("HMAC", key, new TextEncoder().encode(cuerpo));
  const esperado = [...new Uint8Array(mac)].map(b => b.toString(16).padStart(2, "0")).join("");
  if (esperado.length !== firma.length) return false;
  let dif = 0;
  for (let i = 0; i < esperado.length; i++) dif |= esperado.charCodeAt(i) ^ firma.charCodeAt(i);
  return dif === 0;
}

/* ---- Verificación Gumroad contra su API ----------------------------------- */
async function ventaGumroadValida(saleId) {
  const token = process.env.GUMROAD_ACCESS_TOKEN;
  if (!token) return null;
  if (!saleId) return false;
  try {
    const r = await fetch(`https://api.gumroad.com/v2/sales/${encodeURIComponent(saleId)}`, {
      method: "POST",
      headers: { "Content-Type": "application/x-www-form-urlencoded" },
      body: new URLSearchParams({ access_token: token })
    });
    if (!r.ok) return false;
    const j = await r.json().catch(() => null);
    return !!(j && j.success && j.sale);
  } catch { return false; }
}

function parseForm(cuerpo) {
  const o = {};
  for (const [k, v] of new URLSearchParams(cuerpo)) o[k] = v;
  return o;
}

export default async (req) => {
  const ok = (o, s = 200) => new Response(JSON.stringify(o), { status: s, headers: { "content-type": "application/json" } });
  if (req.method !== "POST") return ok({ error: "Solo POST" }, 405);

  const cuerpo = await req.text();
  const ctype = (req.headers.get("content-type") || "").toLowerCase();

  let correo, variante, subId, pagoId, monto, moneda, activa, proveedor, metodo;

  if (req.headers.get("webhook-signature")) {
    /* ------------------------------ POLAR -------------------------------- */
    if (!(await verificarPolar(req, cuerpo))) return ok({ error: "Firma Polar inválida" }, 401);

    let ev;
    try { ev = JSON.parse(cuerpo); } catch { return ok({ error: "JSON inválido" }, 400); }

    const tipo = String(ev.type || "").toLowerCase();
    const d = ev.data || {};
    const estado = String(d.status || "").toLowerCase();
    const INACT = ["subscription.canceled", "subscription.revoked", "order.refunded"];
    const ACT = ["order.paid", "subscription.active", "subscription.created", "subscription.updated", "checkout.updated"];

    if (INACT.includes(tipo) || ["canceled", "revoked", "past_due", "unpaid"].includes(estado)) activa = false;
    else if (ACT.includes(tipo) || ["active", "paid", "succeeded"].includes(estado)) activa = true;
    else return ok({ ignorado: tipo }); // evento que no cambia el acceso

    correo    = d.customer?.email || d.customer_email || d.user?.email || d.email;
    variante  = d.product?.name || d.product?.id || d.product_id ||
                (d.items && d.items[0] && (d.items[0].product?.name || d.items[0].label));
    subId     = d.subscription_id || (tipo.startsWith("subscription") ? d.id : d.subscription_id) || d.id;
    pagoId    = d.id || subId;
    monto     = Number(d.amount ?? d.total_amount ?? d.net_amount ?? 0) / 100;
    moneda    = String(d.currency || "USD").toUpperCase();
    proveedor = "polar";
    metodo    = "polar";
  } else if (ctype.includes("form-urlencoded")) {
    /* ---------------------------- GUMROAD -------------------------------- */
    const d = parseForm(cuerpo);
    const idVenta = d.sale_id || d.subscription_id || d.order_number || "";
    let verificado = await ventaGumroadValida(idVenta);
    if (verificado === null) {
      const key = new URL(req.url).searchParams.get("key");
      verificado = !!process.env.PAYMENT_WEBHOOK_SECRET && key === process.env.PAYMENT_WEBHOOK_SECRET;
    }
    if (!verificado) return ok({ error: "Venta no verificada" }, 401);
    activa    = !(d.refunded === "true" || d.disputed === "true");
    correo    = d.email;
    variante  = d.product_permalink || d.product_name;
    subId     = d.subscription_id || d.sale_id;
    pagoId    = d.sale_id || d.subscription_id;
    monto     = Number(d.price || 0) / 100;
    moneda    = (d.currency || "USD").toUpperCase();
    proveedor = "gumroad";
    metodo    = "gumroad";
  } else {
    /* --------------------- GENÉRICO (JSON + HMAC hex) -------------------- */
    if (!(await firmaHexValida(req, cuerpo))) return ok({ error: "Firma inválida" }, 401);
    let ev;
    try { ev = JSON.parse(cuerpo); } catch { return ok({ error: "JSON inválido" }, 400); }
    const datos = ev.data?.attributes || ev.data || ev;
    activa    = ["active", "paid", "completed"].includes(String(datos.status || "active").toLowerCase());
    correo    = datos.user_email || datos.customer_email || datos.email;
    variante  = datos.variant_name || datos.product_id || datos.price_id;
    subId     = ev.data?.id || datos.id || datos.order_id;
    pagoId    = subId;
    monto     = Number(datos.total || datos.amount || 0) / (datos.total_usd ? 1 : 100);
    moneda    = (datos.currency || "USD").toUpperCase();
    proveedor = "mor";
    metodo    = "checkout";
  }

  if (!correo) return ok({ error: "Sin correo de cliente" }, 400);

  const plan = planDeProducto(variante);

  const q = await fetch(
    `${process.env.SUPABASE_URL}/rest/v1/perfiles?correo=eq.${encodeURIComponent(correo)}&select=id`,
    { headers: { apikey: process.env.SUPABASE_SERVICE_ROLE_KEY, Authorization: `Bearer ${process.env.SUPABASE_SERVICE_ROLE_KEY}` } }
  );
  const [perfil] = await q.json();

  try {
    if (perfil?.id) {
      await supabase("suscripciones", [{
        usuario_id: perfil.id,
        plan,
        estado: activa ? "activa" : "inactiva",
        proveedor,
        proveedor_id: String(subId || pagoId || ""),
        actualizado_en: new Date().toISOString()
      }], "usuario_id");

      if (activa) {
        await supabase("pagos", [{
          usuario_id: perfil.id,
          concepto: String(variante || plan),
          monto,
          moneda,
          metodo,
          proveedor_id: String(pagoId || subId || "")
        }], "proveedor_id");
      }
    }
    return ok({ recibido: true, plan, correo, activa, usuario: perfil?.id || null });
  } catch (e) {
    return ok({ error: String(e.message) }, 500);
  }
};

export const config = { runtime: "edge" };
