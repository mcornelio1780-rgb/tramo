/* =============================================================================
   TRAMO — /api/config   (función serverless de Vercel, formato Node req/res)
   Entrega al navegador la configuración PÚBLICA de Supabase + enlace de pago.

   La URL y la clave anon son públicas por diseño: la seguridad la dan las
   políticas RLS del esquema. La service_role NUNCA se expone aquí.
   ========================================================================== */
export default function handler(req, res) {
  res.setHeader("Cache-Control", "public, max-age=300");
  res.status(200).json({
    url: process.env.SUPABASE_URL || "",
    anonKey: process.env.SUPABASE_ANON_KEY || "",
    payUrl: process.env.GUMROAD_URL || ""
  });
}
