/* ============================================================
   js/marca-portium.js — Marca Portium en los paneles de jefe y encargado
   ------------------------------------------------------------
   103ª (16/9/2026). Dani quiere Portium «en todos lados» con el
   mismo estilo que el menú admin (js/menu-admin.js) y la portada:
   icono + «Port» + «ium» en serif (Georgia) + línea terracota.
   Los logos de Bosch Pascual / Rècop se quedan: Portium es la
   herramienta; la empresa, la dueña de la obra.

   AUTÓNOMO: cada página solo carga este archivo. Crea su HTML y su
   CSS; no depende de nada. Detecta el panel:
     · Menú lateral (.sidebar, jefe de obra) → bloque Portium arriba
       del todo, encima del logo de la empresa, línea terracota debajo.
     · Cabecera (header .header-left, encargado) → Portium a la
       izquierda, rayita, y después el logo de la empresa y el título.
       La línea va de borde inferior de la cabecera.
   Si no encuentra ninguna de las dos, no hace nada (y lo dice en consola).

   Colores (estilo de Dani, 102ª):
     «ium» arena #d6b67c (fondos oscuros: menú y cabeceras de color).
     Línea terracota #69300d. EXCEPCIÓN (103ª, Claude): en obras de
     Rècop la cabecera del encargado ya ES terracota (#6b3410) y la
     línea no se vería → va en el ocre de Rècop (#c9a876). Para saber
     la marca envuelve aplicarBranding() de js/branding.js, que es la
     función que ya llama cada página al cargar la obra.

   Móvil: jefe/resumen-mes pone el menú en horizontal por debajo de
   760 px y esconde el logo; Portium se esconde a la vez.

   Uso: una etiqueta script con src="../js/marca-portium.js?v=20260916"
   justo antes del cierre del head.
   ============================================================ */

(function () {
  'use strict';

  var ARENA = '#d6b67c';
  var TERRACOTA = '#69300d';
  var OCRE_RECOP = '#c9a876';

  // Ruta del icono a partir de la ruta de este mismo archivo (sirve desde
  // cualquier carpeta). Respaldo: la carpeta de los paneles es un nivel abajo.
  var ICONO = '../assets/icons/portium-192.png';
  try {
    var yo = document.currentScript && document.currentScript.src;
    if (yo) ICONO = yo.replace(/js\/marca-portium\.js.*$/, 'assets/icons/portium-192.png');
  } catch (_) {}

  var CSS =
    '.portium-lateral{display:flex;align-items:center;gap:10px;padding:16px 16px 12px;border-bottom:2px solid ' + TERRACOTA + '}'
  + '.portium-lateral img{width:34px;height:34px;border-radius:8px;flex:0 0 auto}'
  + '.portium-lateral .portium-nombre{font-size:21px;color:var(--texto,#e8eaf0)}'
  + '.portium-cabecera{display:flex;align-items:center;gap:8px;flex:0 0 auto}'
  + '.portium-cabecera img{width:28px;height:28px;border-radius:7px;flex:0 0 auto}'
  + '.portium-cabecera .portium-nombre{font-size:19px;color:#fff}'
  + '.portium-raya{width:1px;height:26px;background:rgba(255,255,255,0.3);flex:0 0 auto}'
  + '.portium-nombre{font-family:Georgia,"Times New Roman",serif;line-height:1;font-weight:400;white-space:nowrap}'
  + '.portium-nombre .ium{color:' + ARENA + ';font-style:italic}'
  + 'header.con-portium{border-bottom:2px solid var(--portium-linea,' + TERRACOTA + ')}'
  + 'header.con-portium .header-left{flex-wrap:wrap}';

  function nombreHtml() {
    return '<span class="portium-nombre">Port<span class="ium">ium</span></span>';
  }

  function ponerCss() {
    if (document.getElementById('portium-css')) return;
    var s = document.createElement('style');
    s.id = 'portium-css';
    s.textContent = CSS;
    document.head.appendChild(s);
  }

  function enMenuLateral(sidebar) {
    if (sidebar.querySelector('.portium-lateral')) return;
    var d = document.createElement('div');
    d.className = 'portium-lateral';
    d.innerHTML = '<img src="' + ICONO + '" alt="">' + nombreHtml();
    sidebar.insertBefore(d, sidebar.firstChild);
    // Con el bloque, el menú es más alto: en pantallas bajas se desplaza en
    // vez de esconder «Cerrar sesión» (mismo arreglo que menu-admin, 102ª).
    sidebar.style.overflowY = 'auto';
    // Móvil: si la página esconde el logo de la empresa (menú en horizontal),
    // Portium se esconde también. Se mira el logo, no un ancho fijo.
    var brand = sidebar.querySelector('.sidebar-brand');
    if (brand && window.matchMedia) {
      var mq = window.matchMedia('(max-width: 760px)');
      var ajustar = function () {
        d.style.display = getComputedStyle(brand).display === 'none' ? 'none' : '';
      };
      ajustar();
      if (mq.addEventListener) mq.addEventListener('change', ajustar);
      else if (mq.addListener) mq.addListener(ajustar);
    }
  }

  function enCabecera(header, izquierda) {
    if (izquierda.querySelector('.portium-cabecera')) return;
    var d = document.createElement('div');
    d.className = 'portium-cabecera';
    d.innerHTML = '<img src="' + ICONO + '" alt="">' + nombreHtml();
    var raya = document.createElement('div');
    raya.className = 'portium-raya';
    izquierda.insertBefore(raya, izquierda.firstChild);
    izquierda.insertBefore(d, raya);
    header.classList.add('con-portium');
  }

  // La línea de la cabecera sigue a la marca de la obra.
  function colorLinea(marca) {
    document.documentElement.style.setProperty('--portium-linea', marca === 'recop' ? OCRE_RECOP : TERRACOTA);
  }
  function vigilarBranding() {
    if (typeof window.aplicarBranding !== 'function' || window.aplicarBranding._portium) return;
    var original = window.aplicarBranding;
    var envuelta = function (marca) {
      var r = original.apply(this, arguments);
      try { colorLinea(marca); } catch (_) {}
      return r;
    };
    envuelta._portium = true;
    window.aplicarBranding = envuelta;
  }

  function iniciar() {
    try {
      ponerCss();
      var sidebar = document.querySelector('.sidebar');
      var header = document.querySelector('header');
      var izquierda = header && header.querySelector('.header-left');
      if (sidebar) enMenuLateral(sidebar);
      else if (izquierda) {
        enCabecera(header, izquierda);
        vigilarBranding();
        // Por si la página aplicó los colores antes de que envolviéramos:
        // se deduce del color principal ya puesto (Rècop = #6b3410).
        var cp = document.documentElement.style.getPropertyValue('--color-principal').trim().toLowerCase();
        if (cp) colorLinea(cp === '#6b3410' ? 'recop' : 'bosch_pascual');
      }
      else console.warn('[marca-portium] esta página no tiene menú lateral ni cabecera conocida: no se pinta la marca');
    } catch (e) {
      // Lo accesorio no puede tumbar la página (68ª).
      console.warn('[marca-portium] no se ha podido pintar la marca:', e);
    }
  }

  // Envolver aplicarBranding cuanto antes: si branding.js ya cargó, ahora.
  vigilarBranding();
  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', iniciar);
  else iniciar();

  window.MarcaPortium = { iniciar: iniciar };
})();

/* ============================================================
   AÑADIDO 20/9/2026 — encender los módulos de menú del jefe
   ------------------------------------------------------------
   POR QUÉ AQUÍ Y NO EN LAS PANTALLAS
   Dos módulos de menú necesitan estar en las pantallas del jefe:
     · js/menu-jefe.js — deja el menú lateral con el mismo orden, los
       mismos iconos y las mismas secciones en las nueve. Estaban
       descuadradas entre sí (tres órdenes distintos, iconos cruzados
       en dos pantallas y una sin secciones).
     · js/menu-rol-ecoordina.js — solo en el importador de e-Coordina,
       que es el único de la app y lo usan jefe Y admin: si quien entra
       es admin le pone su propio menú en vez del del jefe.
   Añadirlos a mano son nueve etiquetas <script> en archivos de hasta
   200 KB, y reescribir un archivo grande por una línea es donde se
   cuela el error invisible (norma de la 111ª). Este archivo lo cargan
   YA las nueve pantallas, mide 153 líneas y se sube sin riesgo.

   CANDADOS: fuera de /jefe/ no hace nada (las cuatro pantallas del
   encargado también cargan este archivo y salen por la primera línea);
   el módulo del admin solo se pide en esa pantalla concreta. Si algo
   no carga, el menú se queda como estaba: se nota, pero no se rompe.

   PARA DESHACERLO: borrar este bloque. Nada más depende de él.
   ============================================================ */
(function () {
  'use strict';
  try {
    var ruta = window.location.pathname;
    var pagina = (ruta.split('/').pop() || '');
    var enJefe = ruta.indexOf('/jefe/') !== -1;
    if (!enJefe) return;

    // Ruta a partir de la de este mismo archivo, igual que el icono de
    // arriba: así sirve desde cualquier carpeta.
    var yo = document.currentScript && document.currentScript.src;
    function cargar(nombre) {
      if (document.querySelector('script[src*="' + nombre + '"]')) return;
      var src = '../js/' + nombre;
      if (yo) src = yo.replace(/marca-portium\.js.*$/, nombre);
      var s = document.createElement('script');
      s.src = src;
      s.onerror = function () {
        console.warn('[marca-portium] no se ha podido cargar ' + nombre + '; el menú se queda como está');
      };
      document.head.appendChild(s);
    }

    // El mismo menú (orden, iconos y secciones) en las nueve pantallas.
    cargar('menu-jefe.js');
    // Y, solo en el importador, el menú del admin si quien entra es admin.
    if (pagina === 'documentos-ecoordina.html') cargar('menu-rol-ecoordina.js');
  } catch (e) {
    console.warn('[marca-portium] carga de los módulos de menú:', e);
  }
})();
