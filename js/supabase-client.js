// Conexión a Supabase para todo el sitio

const SUPABASE_URL = "https://lpdyhiyvkkkpqzkmwkap.supabase.co";
const SUPABASE_ANON_KEY = "sb_publishable_ZjXkF7Wl5vy_cBWpKvinMw_MhI5SBF2";

if (!window.supabase || typeof window.supabase.createClient !== "function") {
  console.error(
    "[supabase-client] No se encontró el SDK de Supabase. Verifica que el <script> del CDN " +
      "(@supabase/supabase-js) esté cargado ANTES de supabase-client.js."
  );
}

window.supabaseClient = window.supabase.createClient(SUPABASE_URL, SUPABASE_ANON_KEY);
