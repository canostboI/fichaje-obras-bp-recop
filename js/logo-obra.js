/* ============================================================
   js/logo-obra.js — en el menú, el logo de la obra activa
   ------------------------------------------------------------
   20/9/2026 (Dani): «en algunas se ven dos logos».

   EL PROBLEMA
   Las nueve pantallas del jefe van por dos caminos desde hace tiempo:
     · cinco (Presencia, Fichajes, Resumen, Trabajadores, e-Coordina)
       tienen <img id="sidebar-logo"> y lo rellena js/branding.js con el
       logo de la obra activa: una sola marca, la que toca;
     · cuatro (Habilitaciones, Valoraciones, Subcontratas, Informe de
       incidencias) tienen los DOS logos escritos a mano en el HTML y no
       usan branding para nada.
   El patrón de la casa es branding por obra (obras.empresa_marca) y el
   jefe trabaja en una obra cada vez: ver «Bosch Pascual + Rècop» estando
   dentro de Muralla de Valls no informa de nada.

   QUÉ HACE
   En esas pantallas con dos logos, esconde el que NO es de la obra
   activa. No pinta nada nuevo ni toca branding.js: los dos logos ya
   están en el HTML; aquí solo se decide cuál se ve.

   EXCEPCIÓN A PROPÓSITO: jefe/subcontratas.html. Es una lista GLOBAL de
   empresas, no de una obra; ahí los dos logos sí dicen algo y se quedan.

   CÓMO SABE LA OBRA
   1. El selector de obra de la propia pantalla, si lo hay (es el dato
      más fiable: es lo que el usuario está mirando). Se vuelve a mirar
      cada vez que lo cambia.
   2. Si no hay selector o aún no tiene valor, localStorage
      'jefe_obra_activa_id', que es donde el panel guarda la obra activa.
   Con el id, una consulta de lectura a obras.empresa_marca.

   SI ALGO FALLA — sin sesión, sin red, obra desconocida, marca rara —
   NO se esconde nada y se quedan los dos logos, que es exactamente lo
   que había hasta hoy. Nunca al revés: un fallo de consulta no puede
   dejar el menú sin ningún logo (patrón de la casa: un fallo no se
   pinta como un cero).

   LO CARGA js/marca-portium.js. Para deshacerlo: quitar esa línea.
   Ningún HTML depende de esto.
   ============================================================ */

(function () {
  'use strict';

  var SUPABASE_URL = 'https://istrnsicleopzbsrapsw.supabase.co';
  var SUPABASE_ANON_KEY = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6ImlzdHJuc2ljbGVvcHpic3JhcHN3Iiwicm9sZSI6ImFub24iLCJpYXQiOjE3NzU4MTIxMTYsImV4cCI6MjA5MTM4ODExNn0.5UXV2LWPXmbfLI7rKpZSG9YBzZsesjckHnhQabA0mTY';

  // Pantallas que NO se tocan: la lista de subcontratas es global.
  var EXCLUIDAS = ['subcontratas.html'];

  var RE_UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

  var cliente = null;
  var cache = {};   // obra_id -> marca, para no repetir la consulta

  // ¿Qué logo es cada imagen? Por el nombre del archivo, que es estable:
  // bosch_pascual_logo_white.svg / recop_logo_white.svg
  function marcaDeImagen(img) {
    var src = (img.getAttribute('src') || '').toLowerCase();
    if (src.indexOf('recop') !== -1) return 'recop';
    if (src.indexOf('bosch') !== -1) return 'bosch_pascual';
    return null;
  }

  function logosDelMenu() {
    var brand = document.querySelector('.sidebar .sidebar-brand');
    if (!brand) return [];
    return Array.prototype.slice.call(brand.querySelectorAll('img'))
      .filter(function (img) { return marcaDeImagen(img) !== null; });
  }

  function mostrarSolo(marca) {
    var logos = logosDelMenu();
    if (logos.length < 2) return;            // ya hay uno solo: nada que hacer
    var alguno = logos.some(function (img) { return marcaDeImagen(img) === marca; });
    if (!alguno) return;                     // marca desconocida: se quedan los dos
    logos.forEach(function (img) {
      img.style.display = (marcaDeImagen(img) === marca) ? '' : 'none';
    });
  }

  // Obra activa: primero el selector de la pantalla, luego lo guardado.
  function obraActiva() {
    var selects = document.querySelectorAll('select');
    for (var i = 0; i < selects.length; i++) {
      var v = selects[i].value;
      if (v && RE_UUID.test(v)) return v;
    }
    try {
      var g = localStorage.getItem('jefe_obra_activa_id');
      if (g && RE_UUID.test(g)) return g;
    } catch (_) {}
    return null;
  }

  function sb() {
    if (cliente) return cliente;
    if (!window.supabase || !window.supabase.createClient) return null;
    cliente = window.supabase.createClient(SUPABASE_URL, SUPABASE_ANON_KEY);
    return cliente;
  }

  function revisar() {
    var obraId = obraActiva();
    if (!obraId) return;                       // sin obra: los dos logos
    if (cache[obraId]) { mostrarSolo(cache[obraId]); return; }

    var c = sb();
    if (!c) return;
    c.from('obras').select('empresa_marca').eq('id', obraId).maybeSingle()
      .then(function (r) {
        if (r.error || !r.data || !r.data.empresa_marca) return;  // se quedan los dos
        cache[obraId] = r.data.empresa_marca;
        mostrarSolo(cache[obraId]);
      })
      .catch(function (e) {
        console.warn('[logo-obra] no se ha podido leer la marca de la obra:', e);
      });
  }

  function iniciar() {
    try {
      var ruta = window.location.pathname;
      if (ruta.indexOf('/jefe/') === -1) return;
      var pagina = ruta.split('/').pop() || '';
      if (EXCLUIDAS.indexOf(pagina) !== -1) return;
      if (logosDelMenu().length < 2) return;   // pantalla con logo dinámico: no es cosa nuestra

      // Cuando el usuario cambia de obra, el logo cambia con ella.
      document.addEventListener('change', function (ev) {
        if (ev.target && ev.target.tagName === 'SELECT') revisar();
      });

      revisar();
      // La obra la elige la propia pantalla al cargar sus datos, que puede
      // tardar: dos repasos cortos y se deja en paz.
      setTimeout(revisar, 800);
      setTimeout(revisar, 2500);
    } catch (e) {
      console.warn('[logo-obra]:', e);
    }
  }

  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', iniciar);
  else iniciar();

  window.LogoObra = { revisar: revisar, mostrarSolo: mostrarSolo, iniciar: iniciar };
})();
