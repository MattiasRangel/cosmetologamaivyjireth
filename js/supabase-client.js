/**
 * supabase-client.js
 * -----------------------------------------------------------------------
 * Punto único de conexión a Supabase para TODO el sitio (páginas públicas
 * y panel privado). Crea un solo cliente y lo deja disponible como
 * `window.supabaseClient`, para que tanto los scripts clásicos (data.js,
 * main.js, booking.js) como los módulos ES (panel-*.js, vip-data.js,
 * mi-tarjeta.js, tarjeta-consulta.js) lo usen sin duplicar la conexión.
 *
 * ORDEN DE CARGA OBLIGATORIO en el HTML (antes que cualquier otro script
 * del sitio que hable con la base de datos):
 *
 *   <script src="https://cdn.jsdelivr.net/npm/@supabase/supabase-js@2"></script>
 *   <script src="supabase-client.js"></script>
 *   <script src="data.js"></script>
 *   <script type="module" src="booking.js"></script>
 *   ... el resto de tus scripts ...
 *
 * Reemplaza SUPABASE_URL y SUPABASE_ANON_KEY por los valores reales de tu
 * proyecto (Supabase → Project Settings → API). La "anon key" es pública
 * y segura de exponer en el frontend SIEMPRE que actives Row Level
 * Security con políticas correctas antes de publicar el sitio (ver la
 * sección 8 de schema.sql, hoy con RLS desactivado para desarrollo).
 * -----------------------------------------------------------------------
 */
const SUPABASE_URL = "https://lpdyhiyvkkkpqzkmwkap.supabase.co"; // TODO: reemplaza con la URL de tu proyecto
const SUPABASE_ANON_KEY = "sb_publishable_ZjXkF7Wl5vy_cBWpKvinMw_MhI5SBF2"; // TODO: reemplaza con tu anon/public key

if (!window.supabase || typeof window.supabase.createClient !== "function") {
  console.error(
    "[supabase-client] No se encontró el SDK de Supabase. Verifica que el <script> del CDN " +
      "(@supabase/supabase-js) esté cargado ANTES de supabase-client.js."
  );
}

window.supabaseClient = window.supabase.createClient(SUPABASE_URL, SUPABASE_ANON_KEY);
