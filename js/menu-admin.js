/**
 * menu-admin.js — menú lateral del panel de administración
 *
 * Uso: cargar este script al final del <head> (o antes del </body>)
 * en cualquier pantalla admin, y colocar en el HTML:
 *
 *   <div id="sidebar-admin"></div>
 *
 * El script busca ese contenedor y lo rellena con el menú completo.
 * La página activa se marca automáticamente comparando el nombre del
 * archivo actual con el href de cada enlace.
 *
 * Enlace extra por pantalla:
 *   Algunas pantallas añaden ítems propios que no son comunes a todas.
 *   En ese caso, no uses este módulo para esos ítems: ponlos a mano
 *   debajo del contenedor o dentro de la sección .main de la pantalla.
 *
 * Para añadir un enlace nuevo al menú, édita solo la lista ITEMS de
 * este archivo y el módulo lo pinta solo en todas las pantallas sin
 * tocar ningún HTML.
 */

(function () {
  // ── Estructura del menú ───────────────────────────────────────────────────
  // Cada entrada es { tipo: 'seccion', label } o { tipo: 'enlace', href, ico, label }.
  // El orden aquí es el orden en pantalla.
  const ITEMS = [
    { tipo: 'seccion', label: 'Principal' },
    { tipo: 'enlace', href: 'cuadro-mando.html', ico: '🛰️', label: 'Cuadro de mando' },
    { tipo: 'enlace', href: 'index.html',         ico: '📊', label: 'Dashboard' },

    { tipo: 'seccion', label: 'Gestión' },
    { tipo: 'enlace', href: 'obras.html',                ico: '🏗',  label: 'Obras' },
    { tipo: 'enlace', href: 'trabajadores.html',         ico: '👷',  label: 'Trabajadores' },
    { tipo: 'enlace', href: 'habilitaciones.html',       ico: '🏗️', label: 'Habilitaciones' },
    { tipo: 'enlace', href: 'fichajes.html',             ico: '📋',  label: 'Fichajes' },
    { tipo: 'enlace', href: 'cierre-mes.html',           ico: '🔒',  label: 'Cierre de mes' },
    { tipo: 'enlace', href: 'foto-mes.html',             ico: '📷',  label: 'Foto del mes' },
    { tipo: 'enlace', href: 'reglas.html',               ico: '📋',  label: 'Reglas documentales' },
    { tipo: 'enlace', href: 'informe-rojos.html',        ico: '📕',  label: 'Informe de incidencias' },
    { tipo: 'enlace', href: 'informe-excepciones.html',  ico: '⚠️',  label: 'Excepciones asumidas' },
    { tipo: 'enlace', href: 'importar-ecoordina.html',   ico: '📥',  label: 'e-Coordina' },
  ];

  // ── Detectar la página actual ─────────────────────────────────────────────
  // Solo el nombre del archivo, sin ruta, para que funcione tanto en
  // GitHub Pages (/admin/index.html) como en local (file:///…).
  const paginaActual = window.location.pathname.split('/').pop() || 'index.html';

  // ── HTML del menú ─────────────────────────────────────────────────────────
  function renderMenu() {
    const brand = `
      <div class="sidebar-brand">
        <img src="../assets/logos/bosch_pascual_logo_white.svg" alt="Bosch Pascual">
        <img src="../assets/logos/recop_logo_white.svg" alt="Rècop">
      </div>`;

    const items = ITEMS.map(item => {
      if (item.tipo === 'seccion') {
        return `<div class="sidebar-section">${item.label}</div>`;
      }
      const activo = item.href === paginaActual ? ' class="activo"' : '';
      return `<a href="${item.href}"${activo}><span class="ico">${item.ico}</span> ${item.label}</a>`;
    }).join('\n');

    const bottom = `
      <div class="sidebar-bottom">
        <button class="btn-salir" id="btn-salir">↩ Cerrar sesión</button>
      </div>`;

    return brand + '\n' + items + '\n' + bottom;
  }

  // ── Inyectar en el contenedor ─────────────────────────────────────────────
  function init() {
    const contenedor = document.getElementById('sidebar-admin');
    if (!contenedor) return; // pantalla sin menú modular (cierre-mes, foto-mes)

    // Añadir clase sidebar si no la tiene ya el propio div
    contenedor.classList.add('sidebar');
    contenedor.innerHTML = renderMenu();

    // Cerrar sesión: busca el cliente Supabase ya inicializado en la página.
    // Las pantallas admin crean siempre `const sb = createClient(…)` antes de
    // cargar este módulo, así que `window.sb` no existe — buscamos la variable
    // en el scope global con un nombre conocido.
    const btnSalir = document.getElementById('btn-salir');
    if (btnSalir) {
      btnSalir.addEventListener('click', async () => {
        // Intentar signOut con el cliente de la página; si no existe, solo redirigir.
        if (window._sbAdmin && typeof window._sbAdmin.auth?.signOut === 'function') {
          await window._sbAdmin.auth.signOut();
        }
        window.location.href = '../';
      });
    }
  }

  // Ejecutar cuando el DOM esté listo
  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', init);
  } else {
    init();
  }
})();
