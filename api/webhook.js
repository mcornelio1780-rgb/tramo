/* =============================================================================
   TRAMO — /api/webhook  (o /.netlify/functions/webhook)
   Recibe el aviso del proveedor de pago y activa el plan Pro del usuario.

   Es el único lugar del sistema que usa la clave service_role de Supabase,
   porque necesita escribir en tablas que el usuario solo puede leer.
   Esa clave NUNCA sale del servidor.

   Soporta dos tipos de proveedor a la vez:

   1) GUMROAD  (para cobrar HOY)
      Gumroad envía el aviso como formulario (x-www-form-urlencoded) y NO lo
      firma. Por eso la autenticidad se verifica de una de estas dos formas:
        a) Llamando a la API de Gumroad con GUMROAD_ACCESS_TOKEN (recomendado).
        b) Con un secreto compartido en la URL:  /api/webhook?key=EL_SECRETO
           (usa la variable PAYMENT_WEBHOOK_SECRET).
      Configurar en Gumroad → Settings → Advanced → Ping:
        URL:  https://TU-DOMINIO/api/webhook   (o con ?key=... si usas 1b)

   2) MERCHANT OF RECORD  (Polar / Lemon Squeezy, para migrar después)
      Envían JSON firmado con HMAC-SHA256. Se conserva ese camino intacto.
      Configurar en el panel del proveedor:
        URL:    https://TU-DOMINIO/api/webhook
        Evento: order_created / subscription_created / subscription_updated
   ========================================================================== */

const PLAN_POR_PRODUCTO = {
  // Gumroad: usa el "permalink" del producto (el slug corto de su URL).
  // MoR: usa el variant_name / product_id. En ambos casos, estos identificadores.
  "tramo-pro-mensual": "pro",
  "tramo-pro-anual": "anual",
  "tramo-fundador": "fundador",
  "tramo-aterrizaje": "pro"
};

/* ---- Escritura en Supabase (idéntico para ambos proveedores) ------------- */
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

/* ---- Verificación MoR: firma HMAC del cuerpo JSON ------------------------ */
async function firmaValida(req, cuerpo) {
  const secreto = process.env.PAYMENT_WEBHOOK_SECRET;
  if (!secreto) return false;
  const firma = req.headers.get("x-signature") || req.headers.get("x-webhook-signature") || "";
  if (!firma) return false;
  const key = await crypto.subtle.importKey(
    "raw", new TextEncoder().encode(secreto),
    { name: "HMAC", hash: "SHA-256" }, false, ["sign"]
  );
  const mac = await crypto.subtle.sign("HMAC", key, new TextEncoder().encode(cuerpo));
  const esperado = [...new Uint8Array(mac)].map(b => b.toString(16).padStart(2, "0")).join("");
  // Comparación de tiempo constante
  if (esperado.length !== firma.length) return false;
  let dif = 0;
  for (let i = 0; i < esperado.length; i++) dif |= esperado.charCodeAt(i) ^ firma.charCodeAt(i);
  return dif === 0;
}

/* ---- Verificación Gumroad: confirmar la venta contra la API de Gumroad ---
   Devuelve true/false si hay token; null si no hay token (para usar el
   respaldo del secreto en la URL). */
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
  } catch {
    return false;
  }
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
  const tipo = (req.headers.get("content-type") || "").toLowerCase();

  // Campos normalizados que rellena cada rama
  let correo, variante, subId, pagoId, monto, moneda, estado, proveedor, metodo;

  if (tipo.includes("form-urlencoded")) {
    /* ---------------------------- GUMROAD -------------------------------- */
    const d = parseForm(cuerpo);
    const idVenta = d.sale_id || d.subscription_id || d.order_number || "";

    // Autenticidad: API de Gumroad (si hay token) o secreto en la URL.
    let verificado = await ventaGumroadValida(idVenta);
    if (verificado === null) {
      const key = new URL(req.url).searchParams.get("key");
      verificado = !!process.env.PAYMENT_WEBHOOK_SECRET && key === process.env.PAYMENT_WEBHOOK_SECRET;
    }
    if (!verificado) return ok({ error: "Venta no verificada" }, 401);

    const reembolsado = d.refunded === "true" || d.disputed === "true";
    correo    = d.email;
    variante  = d.product_permalink || d.product_name;
    subId     = d.subscription_id || d.sale_id;   // clave de la suscripción
    pagoId    = d.sale_id || d.subscription_id;    // clave única de cada cobro
    monto     = Number(d.price || 0) / 100;        // Gumroad manda centavos
    moneda    = (d.currency || "USD").toUpperCase();
    estado    = reembolsado ? "reembolsado" : "active";
    proveedor = "gumroad";
    metodo    = "gumroad";
  } else {
    /* ------------------- MERCHANT OF RECORD (JSON + HMAC) ---------------- */
    if (!(await firmaValida(req, cuerpo))) return ok({ error: "Firma inválida" }, 401);

    let ev;
    try { ev = JSON.parse(cuerpo); } catch { return ok({ error: "JSON inválido" }, 400); }

    const datos = ev.data?.attributes || ev.data || ev;
    correo    = datos.user_email || datos.customer_email || datos.email;
    variante  = datos.variant_name || datos.product_id || datos.price_id;
    subId     = ev.data?.id || datos.id || datos.order_id;
    pagoId    = subId;
    monto     = Number(datos.total || datos.amount || 0) / (datos.total_usd ? 1 : 100);
    moneda    = (datos.currency || "USD").toUpperCase();
    estado    = (datos.status || "active").toLowerCase();
    proveedor = ev.meta?.store_id ? "lemonsqueezy" : "mor";
    metodo    = datos.card_brand ? `•••• ${datos.card_last_four || ""}` : "checkout";
  }

  if (!correo) return ok({ error: "Sin correo de cliente" }, 400);

  const plan   = PLAN_POR_PRODUCTO[variante] || "pro";
  const activa = ["active", "paid", "completed"].includes(estado);

  /* Buscamos el usuario por correo. Si aún no existe cuenta, guardamos el
     pago igual: al registrarse con ese correo, el plan queda activado. */
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
        proveedor_id: String(subId),
        actualizado_en: new Date().toISOString()
      }], "usuario_id");

      // Solo registramos un pago cuando entra dinero (no en reembolsos).
      // on_conflict evita duplicados si el proveedor reintenta el aviso.
      if (activa) {
        await supabase("pagos", [{
          usuario_id: perfil.id,
          concepto: variante || plan,
          monto,
          moneda,
          metodo,
          proveedor_id: String(pagoId)
        }], "proveedor_id");
      }
    }
    return ok({ recibido: true, plan, correo, usuario: perfil?.id || null });
  } catch (e) {
    /* Devolvemos 500 a propósito: el proveedor reintentará el envío. */
    return ok({ error: String(e.message) }, 500);
  }
};

export const config = { runtime: "nodejs" };
