/* =============================================================================
   TRAMO — /api/config
   Entrega al navegador la configuración PÚBLICA de Supabase.

   La URL y la clave anon son públicas por diseño: la seguridad la dan las
   políticas RLS del esquema, no esconder la clave. La service_role NUNCA
   se expone aquí (solo la usa el webhook, en el servidor).
   ========================================================================== */
export default async () => {
  const body = {
    url: process.env.SUPABASE_URL || "",
    anonKey: process.env.SUPABASE_ANON_KEY || "",
    // Enlace de pago (Gumroad) para el muro de pago del gestor. Público.
    payUrl: process.env.GUMROAD_URL || ""
  };
  return new Response(JSON.stringify(body), {
    status: 200,
    headers: {
      "content-type": "application/json",
      "cache-control": "public, max-age=300"
    }
  });
};

export const config = { runtime: "nodejs" };
