// =====================================================================
// Cliente Supabase - Fichaje Obras V2
// ---------------------------------------------------------------------
// Este archivo es la ÚNICA puerta de conexión a Supabase en toda la app.
// Cualquier otro archivo .js que necesite hablar con Supabase importa
// desde aquí (o usa la variable global window.supabaseClient).
//
// La anon key es pública por diseño: va al navegador. La seguridad real
// vive en las RLS policies y funciones RPC del backend.
// =====================================================================

const SUPABASE_URL  = 'https://istrnsicleopzbsrapsw.supabase.co';
const SUPABASE_ANON = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6ImlzdHJuc2ljbGVvcHpic3JhcHN3Iiwicm9sZSI6ImFub24iLCJpYXQiOjE3NzU4MTIxMTYsImV4cCI6MjA5MTM4ODExNn0.5UXV2LWPXmbfLI7rKpZSG9YBzZsesjckHnhQabA0mTY';

// El objeto supabase global lo provee el script de CDN que se carga
// en el <head> del HTML antes de este archivo.
if (!window.supabase) {
  throw new Error('Supabase CDN no cargado. Revisa el <head> del HTML.');
}

// Creamos UNA sola instancia y la colgamos de window para reutilizarla.
window.supabaseClient = window.supabase.createClient(SUPABASE_URL, SUPABASE_ANON, {
  auth: {
    // El fichaje del trabajador no usa login, pero esta config vale también
    // cuando luego se añadan paneles con login.
    persistSession: true,
    autoRefreshToken: true,
    detectSessionInUrl: true
  }
});
