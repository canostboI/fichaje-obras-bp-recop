/* ============================================================
   js/menu-jefe.js — un solo menú lateral para el panel del jefe
   ------------------------------------------------------------
   20/9/2026. Dani: «no siempre salen las mismas opciones dependiendo
   de en qué pantalla estés».

   QUÉ PASABA DE VERDAD
   Las nueve pantallas de jefe/ tienen el menú escrito A MANO en su
   propio HTML. Las opciones son las mismas nueve en todas, pero:
     · el ORDEN cambia — había tres variantes circulando, según en qué
       hueco se metió cada opción nueva el día que se añadió;
     · los ICONOS están cruzados en dos pantallas — habilitaciones.html
       e informe-rojos.html pintan Presencia con el icono de Resumen y
       Trabajadores con el de Presencia: corridos un puesto, copia-pega
       antiguo. Y e-Coordina lleva otro icono distinto en esas dos;
     · las SECCIONES tampoco cuadran: ocho tienen «Principal / Gestión»
       y documentos-ecoordina.html no tiene ninguna.
   El ojo no lee «las mismas opciones en otro orden», lee «otro menú».
   De ahí la sensación de estar donde no tocaba.

   CÓMO SE ARREGLA SIN TOCAR NINGUNA PANTALLA
   Este módulo NO pinta un menú nuevo: reordena y renombra el que ya
   hay, reutilizando los nodos existentes. Para cambiar el menú de las
   nueve pantallas se edita la lista MENU de aquí abajo y ya está —
   misma idea que js/menu-admin.js en el panel de administración, pero
   sin reescribir nueve archivos de hasta 200 KB (norma de la 111ª).

   LO QUE RESPETA
     · Enlaces que no estén en la lista (hoy solo «Panel admin» de
       resumen-mes.html) NO se tocan: se quedan al final, tal cual.
     · El bloque Portium, el logo de la empresa, «Cerrar sesión» y
       cualquier cosa que no sea enlace o cabecera se quedan donde están.
     · La pantalla actual se marca con class="active", que es la clase
       del CSS del jefe (el admin usa "activo": son distintas).

   CUÁNDO NO HACE NADA
     · Fuera de /jefe/.
     · Si el menú es el del admin (#sidebar-admin), que es el que pinta
       js/menu-rol-ecoordina.js cuando entra un administrador en el
       importador de e-Coordina. Ese manda y no se toca.
     · Si no encuentra menú o pasa cualquier cosa rara: se retira y la
       pantalla queda como estaba. Un menú es accesorio y no puede
       tumbar la página (misma regla que marca-portium.js).

   PROBADO con jsdom contra las nueve pantallas reales del repo: las
   nueve dan la misma secuencia, cada una con su opción marcada, y el
   resultado no cambia si el módulo se ejecuta dos veces. La prueba
   cazó tres fallos que no se veían leyendo el código: «../admin/index.html»
   se confundía con Presencia (los dos acaban en index.html), la
   cabecera «Gestión» se quedaba huérfana al final, y el bloque de marca
   Portium —que desde el 20/9 es un enlace a index.html— se colaba en el
   menú como si fuera la opción Presencia.

   LO CARGA js/marca-portium.js, que ya está en las nueve pantallas.
   Para deshacerlo: quitar esa línea. Ningún HTML depende de esto.
   ============================================================ */

(function () {
  'use strict';

  // ── El menú, en el orden bueno ─────────────────────────────────────
  // Orden elegido: el de jefe/index.html, la pantalla de entrada y la
  // más vista. Iconos: los que usaba la mayoría.
  var MENU = [
    { tipo: 'seccion', label: 'Principal' },
    { href: 'index.html',                ico: '👷',  label: 'Presencia' },
    { tipo: 'seccion', label: 'Gestión' },
    { href: 'fichajes.html',             ico: '🕐',  label: 'Fichajes' },
    { href: 'resumen-mes.html',          ico: '📊',  label: 'Resumen · Proforma' },
    { href: 'trabajadores.html',         ico: '👥',  label: 'Trabajadores' },
    { href: 'subcontratas.html',         ico: '🏢',  label: 'Subcontratas' },
    { href: 'habilitaciones.html',       ico: '🏗️', label: 'Habilitaciones' },
    { href: 'valoraciones.html',         ico: '⭐',  label: 'Valoraciones' },
    { href: 'informe-rojos.html',        ico: '🔴',  label: 'Informe incidencias' },
    { href: 'documentos-ecoordina.html', ico: '📥',  label: 'e-Coordina' }
  ];

  function soloArchivo(href) {
    return String(href || '').split('?')[0].split('#')[0].split('/').pop();
  }

  // ¿Es un enlace a una pantalla de ESTA carpeta? Hace falta porque
  // «../admin/index.html» también termina en index.html: sin esto se
  // confundía con Presencia y le cambiaba el texto.
  function esDeAqui(href) {
    var h = String(href || '');
    return h !== '' && h.indexOf('/') === -1 && h.indexOf(':') === -1;
  }

  function ordenar() {
    var sidebar = document.querySelector('.sidebar');
    if (!sidebar) return;
    if (sidebar.id === 'sidebar-admin') return;                       // manda el menú admin
    if (sidebar.getAttribute('data-menu-jefe') === 'hecho') return;   // ya ordenado

    // El bloque de marca (Portium) es un enlace a index.html desde el 20/9, y
    // sin esto se confundiría con «Presencia»: se le cambiaría el texto y la
    // Presencia de verdad acabaría al final. No es una opción del menú.
    var enlaces = Array.prototype.slice.call(sidebar.querySelectorAll('a'))
      .filter(function (a) { return !a.classList.contains('portium-lateral'); });
    if (!enlaces.length) return;

    // Emparejar cada entrada de la lista con el enlace que ya existe.
    // Si una entrada no está en esta pantalla NO se inventa: el menú
    // refleja lo que la pantalla ya ofrecía.
    var porArchivo = {};
    enlaces.forEach(function (a) {
      var href = a.getAttribute('href');
      if (!esDeAqui(href)) return;  // a otras carpetas: se respeta tal cual
      var clave = soloArchivo(href);
      if (clave && !porArchivo[clave]) porArchivo[clave] = a;  // el primero gana
    });

    // Se reconstruye la secuencia entera (cabeceras + enlaces) reutilizando
    // los nodos que ya hay. Las cabeceras son HERMANAS de los enlaces, no
    // contenedores: reordenar solo los enlaces dejaba «Gestión» descolgada.
    var seccionesViejas = Array.prototype.slice.call(sidebar.querySelectorAll('.sidebar-section'));
    var secUsadas = 0;
    var secuencia = [];

    MENU.forEach(function (item) {
      if (item.tipo === 'seccion') {
        var d = seccionesViejas[secUsadas++];
        if (!d) {                       // el importador no tenía secciones: se le crean
          d = document.createElement('div');
          d.className = 'sidebar-section';
        }
        d.textContent = item.label;
        secuencia.push(d);
        return;
      }
      var a = porArchivo[item.href];
      if (!a) return;
      // Icono y texto canónicos; el href se conserva tal como estaba.
      a.innerHTML = '<span class="ico">' + item.ico + '</span> ' + item.label;
      secuencia.push(a);
      delete porArchivo[item.href];
    });

    // Cabeceras sobrantes: fuera, ya no encabezan nada.
    seccionesViejas.slice(secUsadas).forEach(function (d) {
      if (d.parentNode) d.parentNode.removeChild(d);
    });

    // Enlaces fuera de la lista: al final, sin tocar.
    enlaces.forEach(function (a) {
      if (secuencia.indexOf(a) === -1) secuencia.push(a);
    });

    // Reinsertar donde empezaba el menú, para no mover el bloque Portium
    // ni el logo de la empresa.
    var primero = enlaces[0];
    var primeraSec = seccionesViejas[0];
    if (primeraSec && primeraSec.parentNode &&
        (primeraSec.compareDocumentPosition(primero) & Node.DOCUMENT_POSITION_FOLLOWING)) {
      primero = primeraSec;
    }
    var padre = primero.parentNode;
    var siguiente = primero.nextSibling;
    secuencia.forEach(function (n) {
      padre.insertBefore(n, siguiente);
    });

    // Marcar la pantalla actual.
    var actual = soloArchivo(window.location.pathname) || 'index.html';
    secuencia.forEach(function (n) {
      if (n.tagName !== 'A') return;
      var href = n.getAttribute('href');
      if (esDeAqui(href) && soloArchivo(href) === actual) n.classList.add('active');
      else n.classList.remove('active');
    });

    sidebar.setAttribute('data-menu-jefe', 'hecho');
  }

  function iniciar() {
    try {
      if (window.location.pathname.indexOf('/jefe/') === -1) return;
      ordenar();
    } catch (e) {
      console.warn('[menu-jefe] no se ha podido ordenar el menú:', e);
    }
  }

  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', iniciar);
  else iniciar();

  window.MenuJefe = { ordenar: iniciar };
})();
