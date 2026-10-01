// ============================================================================
//  Apuntar en la app que la DESCARGA de e-Coordina ha fallado  (1/10/2026)
//  ----------------------------------------------------------------------------
//  Por qué existe: si el robot muere en el Hito 1 (descarga del CSV), nunca
//  llega a la base de datos y la app no se entera. Solo avisaba GitHub (correo
//  e issue) y la pantalla del botón decía, a los 10 min, «puede haber fallado».
//  Lo vio Dani el 1/10/2026 (run #138, cartel de Twind tapando un clic).
//
//  Qué hace: inserta UNA fila 'error' en ecoordina_sync. Con eso:
//    · jefe/documentos-ecoordina.html enseña «❌ ha fallado» al momento;
//    · el cuadro de mando del admin pone e-Coordina en rojo;
//    · NO cambia ningún color ni toca obras: los semáforos siguen siendo los
//      de la última sincronización buena;
//    · NO apaga el aviso [sync_parada] (su trigger solo salta con 'ok') y no
//      cuenta como día bueno para el vigilante de las 21:00.
//
//  Lo lanza ecoordina.yml solo si falló el paso de descarga. Si este script
//  falla también, no pasa nada grave: ya han avisado el correo y la issue.
//
//  Secrets: SUPABASE_EMAIL / SUPABASE_PASSWORD (los mismos del Hito 2).
// ============================================================================

import { createClient } from '@supabase/supabase-js';
import fs from 'fs';
import path from 'path';

const SUPABASE_URL = 'https://istrnsicleopzbsrapsw.supabase.co';
const SUPABASE_ANON_KEY = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6ImlzdHJuc2ljbGVvcHpic3JhcHN3Iiwicm9sZSI6ImFub24iLCJpYXQiOjE3NzU4MTIxMTYsImV4cCI6MjA5MTM4ODExNn0.5UXV2LWPXmbfLI7rKpZSG9YBzZsesjckHnhQabA0mTY';

const EMAIL = process.env.SUPABASE_EMAIL;
const PASSWORD = process.env.SUPABASE_PASSWORD;
const RUN_URL = process.env.RUN_URL || null;

function log(...a) { console.log(new Date().toISOString(), ...a); }

let motivo = 'El robot no pudo descargar el CSV de e-Coordina.';
try {
  const m = fs.readFileSync(path.resolve('debug', 'motivo.txt'), 'utf8').trim();
  if (m) motivo = m.slice(0, 300);
} catch (e) { /* sin motivo.txt: se queda el genérico */ }

async function main() {
  if (!EMAIL || !PASSWORD) {
    log('Faltan SUPABASE_EMAIL / SUPABASE_PASSWORD: no se puede apuntar el fallo.');
    process.exit(1);
  }
  const sb = createClient(SUPABASE_URL, SUPABASE_ANON_KEY, { auth: { persistSession: false } });
  const { error: authErr } = await sb.auth.signInWithPassword({ email: EMAIL, password: PASSWORD });
  if (authErr) { log('No se pudo entrar en Supabase:', authErr.message); process.exit(1); }

  const { error } = await sb.from('ecoordina_sync').insert({
    estado: 'error',
    obras_ok: 0,
    obras_error: 0,
    detalle: [{ fase: 'descarga', motivo, run: RUN_URL }]
  });
  if (error) { log('No se pudo apuntar el fallo en ecoordina_sync:', error.message); process.exit(1); }
  log('Fallo de descarga apuntado en ecoordina_sync:', motivo);
}

main().catch(err => { console.error('ERROR no controlado:', err); process.exit(1); });
