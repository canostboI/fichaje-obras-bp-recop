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
    // 92ª: el Dashboard viejo (index.html) murió — absorbido por el cuadro
    // de mando. index.html queda solo como redirección.
    { tipo: 'enlace', href: 'cuadro-mando.html', ico: '🛰️', label: 'Cuadro de mando' },

    { tipo: 'seccion', label: 'Gestión' },
    { tipo: 'enlace', href: 'obras.html',                ico: '🏗',  label: 'Obras' },
    // 100ª: el Directorio vivía escondido en una pestaña de Obras. Entrada
    // propia; obras.html lee ?vista=directorio y arranca en esa pestaña.
    { tipo: 'enlace', href: 'obras.html?vista=directorio', ico: '👥', label: 'Directorio de usuarios' },
    { tipo: 'enlace', href: 'trabajadores.html',         ico: '👷',  label: 'Trabajadores' },
    { tipo: 'enlace', href: 'habilitaciones.html',       ico: '🏗️', label: 'Habilitaciones' },
    // 101ª: valorar operarios + ranking por empresa (lógica en js/valoraciones.js).
    { tipo: 'enlace', href: 'valoraciones.html',         ico: '⭐',  label: 'Valoraciones' },
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
    // 16/9: Portium (nombre de la app) arriba del todo; los logos de las
    // empresas debajo, algo más pequeños. Estilos en línea a propósito: el CSS
    // del menú vive copiado en cada página y así no hay que tocar ninguna.
    // Estilo «B» elegido por Dani (16/9): serif, «ium» en arena #d6b67c y
    // línea terracota #69300d debajo (los dos colores del icono).
    const brand = `
      <div class="sidebar-portium" style="display:flex;align-items:center;gap:10px;padding:16px 16px 12px;border-bottom:2px solid #69300d;">
        <img src="../assets/icons/portium-192.png" alt="" style="width:34px;height:34px;border-radius:8px;flex:0 0 auto;">
        <span style="font-family:Georgia, 'Times New Roman', serif;font-size:21px;line-height:1;color:var(--texto, #e8eaf0);">Port<span style="color:#d6b67c;font-style:italic;">ium</span></span>
      </div>
      <div class="sidebar-brand" style="padding:10px 16px;">
        <img src="../assets/logos/bosch_pascual_logo_white.svg" alt="Bosch Pascual" style="height:17px;">
        <img src="../assets/logos/recop_logo_white.svg" alt="Rècop" style="height:17px;">
      </div>`;

    const items = ITEMS.map(item => {
      if (item.tipo === 'seccion') {
        return `<div class="sidebar-section">${item.label}</div>`;
      }
      // Un href puede llevar ?query (100ª): activo solo si coinciden archivo Y query.
      const hrefArchivo = item.href.split('?')[0];
      const hrefQuery = item.href.includes('?') ? item.href.slice(item.href.indexOf('?')) : '';
      const activo = (hrefArchivo === paginaActual && hrefQuery === window.location.search) ? ' class="activo"' : '';
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
    // 16/9: con la cabecera de Portium el menú es más alto; en pantallas bajas
    // se desplaza en vez de esconder «Cerrar sesión» por debajo.
    contenedor.style.overflowY = 'auto';
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
