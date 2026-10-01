// ============================================================================
//  HITO 1  ·  Descarga del CSV global de e-Coordina
//  ----------------------------------------------------------------------------
//  Qué hace:
//    1. Entra en https://v5.e-coordina.com/recop
//    2. Hace login con usuario/contraseña (vienen de los secrets de GitHub)
//    3. Navega a "Solicitudes de documentación"
//    4. Pulsa "Exportar" -> CSV y descarga el archivo
//    5. Guarda el CSV en output/  y capturas de cada paso en debug/
//
//  Todavía NO toca Supabase. Eso es el Hito 2.
//
//  Si algo falla, deja una captura "99-error.png" y el HTML de la pagina
//  ("page.html") para poder ajustar los selectores.
// ============================================================================

import { chromium } from 'playwright';
import fs from 'fs';
import path from 'path';

const USER = process.env.ECOORDINA_USER;
const PASS = process.env.ECOORDINA_PASS;

const LOGIN_URL = 'https://v5.e-coordina.com/recop';
const OUT_DIR = path.resolve('output');
const DBG_DIR = path.resolve('debug');

fs.mkdirSync(OUT_DIR, { recursive: true });
fs.mkdirSync(DBG_DIR, { recursive: true });

function log(...a) { console.log(new Date().toISOString(), ...a); }

async function shot(page, name) {
  try {
    await page.screenshot({ path: path.join(DBG_DIR, name + '.png'), fullPage: true });
    log('captura =>', name);
  } catch (e) { log('(no se pudo capturar', name + ')', e.message); }
}

async function dumpHtml(page, name) {
  try { fs.writeFileSync(path.join(DBG_DIR, name + '.html'), await page.content()); }
  catch (e) { log('(no se pudo volcar html)', e.message); }
}

// e-Coordina (sept 2026) muestra un banner de migración a v5 que se pone
// encima de la interfaz e intercepta los clics (#twindMigracionBanner).
// Lo quitamos del DOM antes de cada bloque de clics. Si no está, no pasa nada.
async function quitarBannerMigracion(page) {
  try {
    const quitado = await page.evaluate(() => {
      const b = document.getElementById('twindMigracionBanner');
      if (b) { b.remove(); return true; }
      return false;
    });
    if (quitado) log('Banner de migración detectado y quitado');
  } catch (e) { log('(no se pudo comprobar el banner)', e.message); }
}

if (!USER || !PASS) {
  console.error('ERROR: faltan los secrets ECOORDINA_USER / ECOORDINA_PASS');
  process.exit(1);
}

const browser = await chromium.launch({ headless: true });
const context = await browser.newContext({ acceptDownloads: true, locale: 'es-ES' });

// 1/10/2026 · El banner de Twind puede llegar TARDE: el 1/10 el robot lo buscó
// con la página aún en blanco, no estaba, y apareció un segundo después
// tapando «Solicitudes de documentación» (timeout 30 s, run #138). Buscarlo en
// momentos concretos no basta. Desde el arranque de CADA página se mete una
// regla de estilo que lo oculta siempre, aparezca cuando aparezca (su
// display:flex va en línea sin !important, así que esta regla gana).
// quitarBannerMigracion() se queda como segunda red.
await context.addInitScript(() => {
  const ID = 'portium-oculta-twind';
  const CSS = '#twindMigracionBanner{display:none!important;pointer-events:none!important;}';
  const poner = () => {
    if (document.getElementById(ID)) return;
    const raiz = document.head || document.documentElement;
    if (!raiz) return;
    const st = document.createElement('style');
    st.id = ID;
    st.textContent = CSS;
    raiz.appendChild(st);
  };
  poner();
  document.addEventListener('DOMContentLoaded', poner);
});

const page = await context.newPage();
page.setDefaultTimeout(30000);

try {
  // ── 1. Abrir login ────────────────────────────────────────────────────────
  log('Abriendo', LOGIN_URL);
  await page.goto(LOGIN_URL, { waitUntil: 'networkidle' });
  await page.waitForTimeout(1500);
  await shot(page, '01-login');

  // ── 2. Rellenar credenciales ───────────────────────────────────────────────
  const passInput = page.locator('input[type="password"]').first();
  await passInput.waitFor({ state: 'visible', timeout: 20000 });

  // Usuario = primer input de texto visible que no sea el de password
  const userInput = page
    .locator('input[type="text"]:visible, input:not([type]):visible')
    .first();
  await userInput.fill(USER);
  await passInput.fill(PASS);
  await shot(page, '02-credenciales');

  // Botón "Iniciar"
  log('Pulsando Iniciar');
  const iniciar = page.getByRole('button', { name: /iniciar/i }).first();
  if (await iniciar.count()) {
    await iniciar.click();
  } else {
    await page.getByText(/^Iniciar$/i).first().click();
  }

  await page.waitForLoadState('networkidle').catch(() => {});
  await page.waitForTimeout(3000);
  await shot(page, '03-tras-login');

  // Si seguimos viendo un campo password, el login ha fallado
  if (await page.locator('input[type="password"]').first().isVisible().catch(() => false)) {
    throw new Error('Parece que el login no entró (sigue visible el formulario). Revisa usuario/contraseña.');
  }

  // ── 3. Ir a "Solicitudes de documentación" ─────────────────────────────────
  await quitarBannerMigracion(page);
  log('Navegando a Solicitudes de documentación');
  // Primero intentamos abrir el menú "Documentación" del top-bar
  const menuDoc = page.getByText('Documentación', { exact: true }).first();
  if (await menuDoc.count()) {
    await menuDoc.click().catch(() => {});
    await page.waitForTimeout(1000);
  }
  await page.getByText('Solicitudes de documentación', { exact: true }).first().click();
  await page.waitForLoadState('networkidle').catch(() => {});
  await quitarBannerMigracion(page);
  await page.waitForTimeout(3000);
  await shot(page, '04-solicitudes');

  // ── 4. Exportar -> CSV ──────────────────────────────────────────────────────
  await quitarBannerMigracion(page);
  log('Localizando botón Exportar');
  const exportBtn = page
    .locator('button:has-text("Exportar"), .x-btn:has-text("Exportar"), :text("Exportar")')
    .first();
  await exportBtn.scrollIntoViewIfNeeded();
  await page.waitForTimeout(500);
  await shot(page, '05-antes-export');

  const box = await exportBtn.boundingBox();
  if (!box) throw new Error('No encuentro el botón Exportar en pantalla.');

  // Es un botón "split" de ExtJS: la flechita está a la derecha del botón.
  // Clicamos cerca del borde derecho para desplegar el menú de formatos.
  log('Abriendo menú de formato (flecha del split)');
  await page.mouse.click(box.x + box.width - 7, box.y + box.height / 2);
  await page.waitForTimeout(1000);

  let csvItem = page.getByText('CSV', { exact: true }).first();
  let csvVisible = (await csvItem.count()) && (await csvItem.isVisible().catch(() => false));

  // Fallback: si no salió el menú, probamos clic en el centro del botón
  if (!csvVisible) {
    log('El menú no salió por la flecha, probando clic central');
    await page.mouse.click(box.x + box.width / 2, box.y + box.height / 2);
    await page.waitForTimeout(1000);
    csvItem = page.getByText('CSV', { exact: true }).first();
    csvVisible = (await csvItem.count()) && (await csvItem.isVisible().catch(() => false));
  }

  await shot(page, '06-menu-formato');
  if (!csvVisible) throw new Error('No conseguí abrir el menú con la opción CSV.');

  // ── 5. Descargar ────────────────────────────────────────────────────────────
  log('Clicando CSV y esperando la descarga');
  const [download] = await Promise.all([
    page.waitForEvent('download', { timeout: 90000 }),
    csvItem.click(),
  ]);

  const dest = path.join(OUT_DIR, 'ecoordina.csv');
  await download.saveAs(dest);

  const stats = fs.statSync(dest);
  const head = fs.readFileSync(dest, { encoding: 'latin1' }).split('\n').slice(0, 3).join('\n');
  log('CSV guardado:', dest, `(${stats.size} bytes)`);
  log('Primeras líneas del CSV:\n' + head);
  await shot(page, '07-ok');
  log('HITO 1 COMPLETADO ✅');

} catch (err) {
  log('ERROR:', err.message);
  // 1/10/2026 · Motivo corto para que el paso «Apuntar el fallo en la app»
  // del workflow lo guarde en ecoordina_sync y lo vea el jefe en la pantalla.
  try { fs.writeFileSync(path.join(DBG_DIR, 'motivo.txt'), String(err.message || err).split('\n')[0].slice(0, 300)); } catch (e) {}
  await shot(page, '99-error');
  await dumpHtml(page, 'page');
  process.exitCode = 1;
} finally {
  await browser.close();
}
