/* =============================================================================
   TRAMO — /api/webhook  (o /.netlify/functions/webhook)
   Recibe el aviso del proveedor de pago y activa el plan Pro del usuario.

   Es el único lugar del sistema que usa la clave service_role de Supabase,
   porque necesita escribir en tablas que el usuario solo puede leer.
   Esa clave NUNCA sale del servidor.

   Configurar en el panel del proveedor:
     URL:    https://TU-DOMINIO/api/webhook
     Evento: order_created / subscription_created / subscription_updated
   ========================================================================== */

const PLAN_POR_VARIANTE = {
  // Reemplaza estas claves por los IDs reales de tus productos
  "tramo-pro-mensual": "pro",
  "tramo-pro-anual": "anual",
  "tramo-fundador": "fundador",
  "tramo-aterrizaje": "pro"
};

/* Verifica la firma del webhook. Sin esto, cualquiera puede regalarse Pro. */
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

export default async (req) => {
  const ok = (o, s = 200) => new Response(JSON.stringify(o), { status: s, headers: { "content-type": "application/json" } });
  if (req.method !== "POST") return ok({ error: "Solo POST" }, 405);

  const cuerpo = await req.text();
  if (!(await firmaValida(req, cuerpo))) return ok({ error: "Firma inválida" }, 401);

  let ev;
  try { ev = JSON.parse(cuerpo); } catch { return ok({ error: "JSON inválido" }, 400); }

  /* Cada proveedor nombra los campos distinto. Ajusta estas tres líneas
     al formato real del tuyo mirando un evento de prueba en su panel. */
  const datos      = ev.data?.attributes || ev.data || ev;
  const correo     = datos.user_email || datos.customer_email || datos.email;
  const variante   = datos.variant_name || datos.product_id || datos.price_id;
  const proveedorId= ev.data?.id || datos.id || datos.order_id;
  const monto      = Number(datos.total || datos.amount || 0) / (datos.total_usd ? 1 : 100);
  const estado     = (datos.status || "active").toLowerCase();

  if (!correo) return ok({ error: "Sin correo de cliente" }, 400);

  const plan = PLAN_POR_VARIANTE[variante] || "pro";

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
        estado: ["active", "paid", "completed"].includes(estado) ? "activa" : "inactiva",
        proveedor: ev.meta?.store_id ? "lemonsqueezy" : "mor",
        proveedor_id: String(proveedorId),
        actualizado_en: new Date().toISOString()
      }], "usuario_id");

      await supabase("pagos", [{
        usuario_id: perfil.id,
        concepto: variante || plan,
        monto,
        metodo: datos.card_brand ? `•••• ${datos.card_last_four || ""}` : "checkout",
        proveedor_id: String(proveedorId)
      }]);
    }
    return ok({ recibido: true, plan, correo, usuario: perfil?.id || null });
  } catch (e) {
    /* Devolvemos 500 a propósito: el proveedor reintentará el envío. */
    return ok({ error: String(e.message) }, 500);
  }
};

export const config = { runtime: "nodejs" };
