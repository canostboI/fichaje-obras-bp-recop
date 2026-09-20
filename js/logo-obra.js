/* ============================================================
   js/logo-obra.js — cabecera del menú del jefe: un solo logo, igual
   en las nueve pantallas
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

   Y no era solo cuántos logos: cada pantalla le da un TAMAÑO distinto
   (max-height 50 px, 42 px y height 22 px, tres variantes) y el rótulo
   del rol («Jefe de obra») está en cinco y falta en cuatro. Por eso en
   unas se veía grande y bien y en otras pequeño y descolocado.

   QUÉ HACE
   Deja la cabecera del menú igual en las nueve:
     1. un solo logo, el de la obra activa (esconde el otro donde hay dos;
        donde hay uno dinámico no toca nada, ya lo pone branding.js);
     2. el mismo tamaño en todas, por CSS propio que gana a los tres
        tamaños escritos en las pantallas;
     3. el rótulo «Jefe de obra» debajo, creándolo donde falta.
   No reescribe ninguna pantalla: los logos ya están en el HTML.

   EXCEPCIÓN A PROPÓSITO: jefe/subcontratas.html. Es una lista GLOBAL de
   empresas, no de una obra; ahí los dos logos sí dicen algo y se quedan.
   El aspecto (tamaño y rótulo) sí se unifica también allí: lo que no se
   toca es cuántos logos se ven, no cómo se ven.

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

  // Pantallas donde NO se esconde ningún logo: la lista de subcontratas
  // es global, no de una obra.
  var EXCLUIDAS = ['subcontratas.html'];

  var RE_UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

  var cliente = null;
  var cache = {};   // obra_id -> marca, para no repetir la consulta

  // ── Aspecto único de la cabecera ───────────────────────────────────
  // Gana a lo escrito en cada pantalla por especificidad (dos clases y
  // un elemento contra una clase y un elemento), sin !important.
  // El logo se enseña SOLO cuando ya tiene src: en cinco pantallas la
  // imagen nace vacía y la rellena branding.js; sin este cuidado se vería
  // el hueco de una imagen rota mientras tanto.
  var CSS_CABECERA =
      '.sidebar .sidebar-brand{padding:12px 16px 14px;display:flex;align-items:center;justify-content:center;gap:14px}'
    + '.sidebar .sidebar-brand img:not([src]){display:none}'
    + '.sidebar .sidebar-brand img[src]{display:block;width:auto;height:auto;max-width:150px;max-height:40px;object-fit:contain;opacity:.95}'
    // Cuando se quedan los DOS logos (subcontratas, que es global) no caben a
    // ese tamaño: el menú mide 200 px y se salían por los lados. Con dos, cada
    // uno se reparte la mitad y baja de alto. La clase la pone marcarDoble()
    // según lo que haya de verdad en pantalla, no según el nombre del archivo.
    + '.sidebar .sidebar-brand.brand-doble{gap:10px;padding:12px 10px 14px}'
    + '.sidebar .sidebar-brand.brand-doble img[src]{max-width:calc(50% - 5px);max-height:22px}'
    + '.sidebar .sidebar-logo{padding:0 20px 14px;font-size:13px;font-weight:800;letter-spacing:1.5px;text-transform:uppercase;color:var(--color-acento,#ff9800)}';

  function ponerCss() {
    if (!document.getElementById('logo-obra-css')) {
      var st = document.createElement('style');
      st.id = 'logo-obra-css';
      st.textContent = CSS_CABECERA;
      document.head.appendChild(st);
    }
    marcarDoble();
  }

  // ¿Se van a ver dos logos? Entonces hay que estrecharlos. Se mira lo que
  // queda VISIBLE, así que vale tanto para subcontratas (los dos a propósito)
  // como para el instante previo a esconder uno en las demás.
  function marcarDoble() {
    var brand = document.querySelector('.sidebar .sidebar-brand');
    if (!brand) return;
    var visibles = logosDelMenu().filter(function (img) {
      return img.style.display !== 'none';
    }).length;
    if (visibles > 1) brand.classList.add('brand-doble');
    else brand.classList.remove('brand-doble');
  }

  // El rótulo del rol falta en cuatro pantallas: se crea igual que en las
  // otras cinco, justo debajo del logo.
  function ponerRotulo() {
    var brand = document.querySelector('.sidebar .sidebar-brand');
    if (!brand || !brand.parentNode) return;
    if (brand.parentNode.querySelector('.sidebar-logo')) return;
    var d = document.createElement('div');
    d.className = 'sidebar-logo';
    d.textContent = 'Jefe de Obra';
    brand.parentNode.insertBefore(d, brand.nextSibling);
  }

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
    marcarDoble();   // ya solo queda uno: vuelve al tamaño grande
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
      // El aspecto se unifica en las NUEVE, subcontratas incluida.
      ponerCss();
      ponerRotulo();

      var pagina = ruta.split('/').pop() || '';
      if (EXCLUIDAS.indexOf(pagina) !== -1) return;
      if (logosDelMenu().length < 2) return;   // pantalla con logo dinámico: ya lo pone branding.js

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

  window.LogoObra = { revisar: revisar, mostrarSolo: mostrarSolo, iniciar: iniciar, ponerCss: ponerCss, ponerRotulo: ponerRotulo };
})();
