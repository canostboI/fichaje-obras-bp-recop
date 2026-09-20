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
  + 'header.con-portium .header-left{flex-wrap:wrap}'
  // 20/9: el bloque pasa a ser un enlace a la pantalla principal. Hay que
  // neutralizar el aspecto de «.sidebar a» (padding, margen, fondo al pasar
  // por encima), que si no lo pinta como una opción más del menú. Selector
  // de tres clases para ganar sin !important.
  + '.sidebar .portium-lateral{text-decoration:none;color:inherit}'
  + '.sidebar a.portium-lateral{padding:16px 16px 12px;margin:0;border-radius:0;background:none}'
  + '.sidebar a.portium-lateral:hover{background:none}'
  + '.sidebar a.portium-lateral:hover .portium-nombre{opacity:.85}';

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
    // 20/9/2026 (Dani): el logo lleva a la pantalla principal del panel, que
    // es lo que uno espera de un logo. «index.html» en relativo vale para los
    // dos paneles: jefe/index.html es Presencia y encargado/index.html es su
    // pantalla de inicio.
    var d = document.createElement('a');
    d.href = 'index.html';
    d.title = 'Ir a la pantalla principal';
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
   Estos módulos necesitan estar en las pantallas del jefe:
     · js/menu-jefe.js — deja el menú lateral con el mismo orden, los
       mismos iconos y las mismas secciones en las nueve. Estaban
       descuadradas entre sí (tres órdenes distintos, iconos cruzados
       en dos pantallas y una sin secciones).
     · js/logo-obra.js — en las pantallas que llevan los dos logos
       escritos a mano, deja a la vista solo el de la obra activa.
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
    // 20/9/2026 — el sello del día.
    // Las nueve pantallas del jefe cargan este archivo con un ?v= escrito a
    // mano que llevaba congelado desde el 16/9: para que llegase un cambio
    // había que editar los nueve HTML, y por eso no se actualizaba nunca.
    // Los módulos hijos se pedían SIN sello (el .*$ de abajo se comía el ?v=),
    // así que dependían del caché normal del navegador: diez minutos en los
    // que parece que el cambio no funciona y uno se pone a depurar de balde.
    // Con un sello de fecha, un módulo nuevo llega como muy tarde al día
    // siguiente sin tocar una sola pantalla. Se paga con una descarga al día
    // de tres archivos de pocos KB.
    function selloDelDia() {
      try {
        var d = new Date();
        return d.getFullYear().toString()
             + ('0' + (d.getMonth() + 1)).slice(-2)
             + ('0' + d.getDate()).slice(-2);
      } catch (_) { return '1'; }
    }

    function cargar(nombre) {
      if (document.querySelector('script[src*="' + nombre + '"]')) return;
      var src = '../js/' + nombre;
      if (yo) src = yo.replace(/marca-portium\.js.*$/, nombre);
      src += '?d=' + selloDelDia();
      var s = document.createElement('script');
      s.src = src;
      s.onerror = function () {
        console.warn('[marca-portium] no se ha podido cargar ' + nombre + '; el menú se queda como está');
      };
      document.head.appendChild(s);
    }

    // El mismo menú (orden, iconos y secciones) en las nueve pantallas.
    cargar('menu-jefe.js');
    // Y en el menú, el logo de la obra activa en vez de los dos.
    cargar('logo-obra.js');
    // Y, solo en el importador, el menú del admin si quien entra es admin.
    if (pagina === 'documentos-ecoordina.html') cargar('menu-rol-ecoordina.js');
    // 20/9/2026 — y, solo en Presencia, el botón de estado de la obra
    // (pausar, reanudar, pedir que se termine) al lado de «Ver QR».
    if (pagina === 'index.html' || pagina === '') cargar('estado-obra.js');
    // 20/9/2026 — y en Presencia, el aviso de quién ha desaparecido del
    // Excel de e-Coordina (lo detecta la sincronización de cada noche).
    if (pagina === 'index.html' || pagina === '') cargar('ausentes-ecoordina.js');
    // 20/9/2026 — y, solo en Presencia, el reloj del naranja sin comprobar:
    // quién se queda sin poder entrar y qué día, antes de que pase. El módulo
    // lleva su propio candado además de este, por si algún día se le llama
    // desde otro sitio.
    if (pagina === 'index.html' || pagina === '') cargar('aviso-sin-comprobar.js');
  } catch (e) {
    console.warn('[marca-portium] carga de los módulos de menú:', e);
  }
})();
