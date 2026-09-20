/**
 * menu-rol-ecoordina.js — viste el importador de e-Coordina según quién entra
 *
 * 20/9/2026 · Petición de Dani: «es raro que el admin se tenga que meter en el
 * perfil de otro para hacer algo».
 *
 * EL PROBLEMA
 *   `jefe/documentos-ecoordina.html` es el ÚNICO importador de e-Coordina de
 *   la app, a propósito: el semáforo documental se calcula en un solo sitio
 *   (ver el cartel de admin/importar-ecoordina.html). Por dentro ya admite a
 *   los tres roles y al admin le enseña TODAS las obras activas.
 *   Lo que no hacía era vestirse: el menú lateral está escrito a mano en el
 *   HTML con el rótulo «Jefe de Obra» y los enlaces del jefe, y arriba a la
 *   derecha pone «← Panel Jefe». El admin entraba y parecía que se había
 *   colado en la casa de otro, sin puerta de vuelta a su panel.
 *
 * QUÉ HACE ESTE ARCHIVO
 *   Si —y solo si— quien entra es admin: cambia el menú lateral por el del
 *   panel de administración (el de `js/menu-admin.js`, el mismo de todas las
 *   pantallas admin) y el botón de arriba por «← Cuadro de mando».
 *   Si es jefe de obra, NO TOCA NADA: la pantalla queda exactamente igual.
 *
 * POR QUÉ ES UN ARCHIVO APARTE
 *   Norma de la casa (113ª y 116ª): si el cambio cabe en un archivo nuevo,
 *   mejor que reescribir uno grande. El importador tiene ~800 líneas y
 *   reescribirlo entero por esto es justo donde se cuela el error invisible.
 *   Aquí el único cambio en ese archivo es UNA línea <script>.
 *
 * CÓMO SE ENCIENDE
 *   Una línea al final del <head> de la pantalla:
 *     <script src="../js/menu-rol-ecoordina.js"></script>
 *
 * NOTAS DE DISEÑO
 *   · Cliente propio. La pantalla crea su cliente con `const sb`, que NO
 *     queda en window (un const de script clásico no cuelga del global), así
 *     que este módulo crea el suyo con la misma URL y la misma clave anon
 *     (pública por diseño, lo que protege es RLS). Solo LEE el rol.
 *   · Si algo falla —sin sesión, sin red, sin menu-admin.js— NO se toca el
 *     menú y la pantalla se queda como está. Un fallo aquí es cosmético y no
 *     puede dejar sin importador a nadie: es quien alimenta el semáforo
 *     entero. Mismo criterio que js/motivos.js en esta misma pantalla.
 *   · El CSS del menú admin vive copiado en cada pantalla de admin/. Aquí no
 *     está, así que se inyectan las cuatro reglas que faltan (.sidebar-section,
 *     a.activo, .sidebar-bottom, .btn-salir). El resto (.sidebar, .sidebar a)
 *     ya existe en la pantalla y es idéntico.
 */

(function () {
  'use strict';

  const SUPABASE_URL = 'https://istrnsicleopzbsrapsw.supabase.co';
  const SUPABASE_ANON_KEY = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6ImlzdHJuc2ljbGVvcHpic3JhcHN3Iiwicm9sZSI6ImFub24iLCJpYXQiOjE3NzU4MTIxMTYsImV4cCI6MjA5MTM4ODExNn0.5UXV2LWPXmbfLI7rKpZSG9YBzZsesjckHnhQabA0mTY';

  // Ruta relativa desde esta pantalla (/jefe/) hasta el panel de admin.
  const BASE_ADMIN = '../admin/';
  // Ítem del menú que debe salir marcado: el archivo actual se llama
  // documentos-ecoordina.html y el enlace del menú, importar-ecoordina.html.
  const ITEM_ACTIVO = 'importar-ecoordina.html';

  // ── CSS que le falta a esta pantalla para pintar el menú de admin ─────────
  function inyectarCss() {
    if (document.getElementById('css-menu-admin-prestado')) return;
    const st = document.createElement('style');
    st.id = 'css-menu-admin-prestado';
    st.textContent = `
      #sidebar-admin .sidebar-section { padding: 18px 14px 6px; font-size: 10px; font-weight: 700; letter-spacing: 1px; text-transform: uppercase; color: var(--texto2, #8b909e); }
      #sidebar-admin a.activo { background: var(--bg3, #22262f); color: var(--texto, #e8eaf0); font-weight: 600; }
      #sidebar-admin a .ico { font-size: 16px; width: 20px; text-align: center; }
      #sidebar-admin .sidebar-brand { border-bottom: 1px solid var(--borde, #2e3340); display: flex; align-items: center; justify-content: center; gap: 14px; }
      #sidebar-admin .sidebar-brand img { max-width: none; max-height: none; opacity: 0.9; }
      #sidebar-admin .sidebar-bottom { margin-top: auto; padding: 16px; border-top: 1px solid var(--borde, #2e3340); }
      #sidebar-admin .btn-salir { width: 100%; background: transparent; border: 1px solid var(--borde, #2e3340); color: var(--texto2, #8b909e); padding: 9px 14px; border-radius: 8px; cursor: pointer; font-size: 13px; font-family: inherit; text-align: left; display: flex; align-items: center; gap: 8px; }
      #sidebar-admin .btn-salir:hover { background: var(--bg3, #22262f); color: var(--texto, #e8eaf0); }
    `;
    document.head.appendChild(st);
  }

  // ── Cargar js/menu-admin.js bajo demanda ─────────────────────────────────
  function cargarMenuAdmin() {
    return new Promise((resolve, reject) => {
      if (window.MenuAdmin && typeof window.MenuAdmin.pintar === 'function') { resolve(); return; }
      const s = document.createElement('script');
      s.src = '../js/menu-admin.js';
      s.onload = () => resolve();
      s.onerror = () => reject(new Error('No se ha podido cargar js/menu-admin.js'));
      document.head.appendChild(s);
    });
  }

  // ── Sustituir el menú del jefe por el del admin ──────────────────────────
  async function vestirDeAdmin() {
    const viejo = document.querySelector('body > .sidebar');
    if (!viejo) return; // la pantalla ha cambiado de forma: no tocar nada

    inyectarCss();
    await cargarMenuAdmin();
    if (!window.MenuAdmin || typeof window.MenuAdmin.pintar !== 'function') return;

    const nuevo = document.createElement('div');
    nuevo.id = 'sidebar-admin';
    nuevo.setAttribute('data-base', BASE_ADMIN);
    nuevo.setAttribute('data-activo', ITEM_ACTIVO);
    viejo.replaceWith(nuevo);
    window.MenuAdmin.pintar();

    // Botón de arriba a la derecha: al admin le lleva a SU panel.
    const volver = document.querySelector('.topbar .volver');
    if (volver) {
      volver.setAttribute('href', BASE_ADMIN + 'cuadro-mando.html');
      volver.textContent = '← Cuadro de mando';
    }
  }

  // ── Arranque ─────────────────────────────────────────────────────────────
  async function init() {
    try {
      if (!window.supabase || !window.supabase.createClient) return;
      const sbRol = window.supabase.createClient(SUPABASE_URL, SUPABASE_ANON_KEY);
      // Para que «Cerrar sesión» del menú admin tenga un cliente con el que
      // cerrar sesión de verdad (menu-admin.js busca _sbAdmin o _sbPagina).
      window._sbPagina = sbRol;

      const { data: { session } } = await sbRol.auth.getSession();
      if (!session) return; // del resto ya se ocupa el Guardian de la pantalla

      // RLS: siempre filtrando por auth_user_id antes del single (norma de la casa).
      const { data: ua, error } = await sbRol
        .from('usuarios_app')
        .select('rol')
        .eq('auth_user_id', session.user.id)
        .maybeSingle();

      if (error || !ua) return;      // no se ha podido saber el rol → no se toca nada
      if (ua.rol !== 'admin') return; // jefe de obra → la pantalla queda igual

      await vestirDeAdmin();
    } catch (err) {
      // A propósito: solo consola. Esto es aspecto; el importador no se para.
      console.error('menu-rol-ecoordina.js:', err);
    }
  }

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', init);
  } else {
    init();
  }
})();
