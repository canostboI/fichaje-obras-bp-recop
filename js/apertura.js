/* ============================================================
   js/apertura.js — Animación de apertura de Portium
   ------------------------------------------------------------
   24/9/2026. Idea de Dani a partir de la app Pleo: al abrir la app
   sale el fondo de Portium con el icono, unas rayas oscuras lo
   tapan, se dibuja el arco del portal, sube «Portium» con su línea
   y se desvanece dejando ver el panel. Maqueta aprobada por Dani.

   CUÁNDO SALE (decidido con Dani):
     · A pantalla completa, solo en los paneles del jefe de obra y
       del encargado (jefe/index.html y encargado/index.html) y en el
       admin (ver abajo). NUNCA a pantalla completa en la valla: el
       trabajador tiene que fichar rápido (allí va el modo espera).
     · Una sola vez por apertura de la app: se apunta en
       sessionStorage al TERMINAR. Si el móvil cierra la app y se
       vuelve a abrir, sale otra vez; al ir y volver entre pantallas
       del panel, no.
     · Si se corta a medias (p. ej. guardian.js manda a la portada
       porque no hay sesión), no se apunta: saldrá tras entrar.
     · No sale si el móvil pide «reducir movimiento» ni si el
       navegador no deja usar sessionStorage (mejor no salir que
       salir en cada recarga).
     · Un toque en cualquier sitio la salta.

   SEGURIDAD: nunca puede dejar la pantalla tapada. Hay un
   temporizador de retirada a los 5 s pase lo que pase, y cualquier
   error dentro del módulo quita la capa.

   24/9/2026, tarde (Dani): «es muy breve». El logo completo solo se
   veía un tercio de segundo. Ahora se queda quieto 1,25 s más: empieza
   a desvanecerse a los 2,8 s (antes 1,9) y se ha ido a los ~3,2 s. Las
   rayas, el arco y la palabra van igual de rápido que antes.

   COLORES: fijos de Portium, no de la obra (a esa hora aún no se
   sabe de quién es la obra). El fondo inicial es el background_color
   del manifest (#5a2b0c): en Android enlaza sin salto con la
   pantalla de arranque que pinta el propio móvil.

   AUTÓNOMO: crea su HTML y su CSS; no depende de nada.
   Uso: una etiqueta script con src="../js/apertura.js" en el head,
   lo más arriba posible (antes que el resto de scripts), para que
   tape el panel desde el primer instante.

   24/9/2026 (Dani, mismo día) — TAMBIÉN EN LA VALLA Y EN EL ADMIN.
     · Admin (admin/cuadro-mando.html): igual que los paneles.
     · Valla (fichaje/index.html), con data-modo="espera" en la
       etiqueta script: NO tapa la pantalla. Pone una versión pequeña
       (caja con rayas, arco y «Portium») DENTRO de la tarjeta de
       espera, en lugar de la ruedecita, mientras el sistema busca el
       GPS y valida el DNI. Decisión de Claude: a pantalla completa
       taparía las banderas que laten en esa misma espera (105ª,
       decisión de Dani) y el «±12 m» del GPS. Nunca retrasa el
       fichaje: en cuanto llega la respuesta, la tarjeta se oculta.
       Busca el elemento con el atributo data-portium-espera (la
       ruedecita): lo esconde y pone la caja delante. Si este archivo
       no carga o falla, la ruedecita sigue ahí (red de seguridad).
       La animación vuelve a empezar sola cada vez que la tarjeta
       reaparece (pasa de oculta a visible).
     · Sin document.currentScript no se sabe el modo: no hace nada.
   ============================================================ */

(function () {
  'use strict';

  var CLAVE = 'portium-apertura-vista';
  var FONDO_INICIO = '#5a2b0c';   // background_color del manifest
  var FONDO_FIN = '#111318';      // fondo del panel del jefe
  var ARENA = '#d6b67c';
  var LINEA = '#a4502a';
  var TEXTO = '#f2efe9';
  var DURACION_MS = 2800;         // cuándo empieza a desvanecerse (antes 1900)
  var RETIRADA_MS = 5000;         // red de seguridad (antes 4000)

  var yo = null;
  try { yo = document.currentScript; } catch (_) {}
  if (!yo) return;
  var MODO = (yo.getAttribute('data-modo') || 'apertura').toLowerCase();

  var movimientoReducido = false;
  try {
    movimientoReducido = !!(window.matchMedia && window.matchMedia('(prefers-reduced-motion: reduce)').matches);
  } catch (_) {}

  if (MODO === 'espera') {
    if (!movimientoReducido) modoEspera();
    return;
  }
  if (MODO !== 'apertura') return;

  // ¿Ya se vio en esta apertura? ¿Se puede apuntar?
  try {
    if (sessionStorage.getItem(CLAVE) === '1') return;
    sessionStorage.setItem(CLAVE + '-prueba', '1');
    sessionStorage.removeItem(CLAVE + '-prueba');
  } catch (_) {
    return;
  }
  if (movimientoReducido) return;

  // Ruta del icono a partir de la ruta de este mismo archivo.
  var ICONO = '../assets/icons/portium-192.png';
  try {
    if (yo.src) ICONO = yo.src.replace(/js\/apertura\.js.*$/, 'assets/icons/portium-192.png');
  } catch (_) {}

  var capa = null;
  var terminado = false;

  function quitar() {
    try { if (capa && capa.parentNode) capa.parentNode.removeChild(capa); } catch (_) {}
    capa = null;
  }

  function terminar(apuntar) {
    if (terminado) return;
    terminado = true;
    if (apuntar) {
      try { sessionStorage.setItem(CLAVE, '1'); } catch (_) {}
    }
    if (!capa) return;
    capa.classList.add('pa-fuera');
    setTimeout(quitar, 400);
  }

  try {
    var N = 12;
    var CSS =
      '#portium-apertura{position:fixed;inset:0;z-index:2147483000;background:' + FONDO_INICIO + ';overflow:hidden;opacity:1;transition:opacity .35s ease-out;-webkit-tap-highlight-color:transparent}'
    + '#portium-apertura.pa-fuera{opacity:0;pointer-events:none}'
    + '#portium-apertura .pa-capa{position:absolute;inset:0}'
    + '#portium-apertura .pa-centro{display:flex;flex-direction:column;align-items:center;justify-content:center}'
    + '#portium-apertura .pa-icono{width:96px;height:96px;border-radius:22px}'
    + '#portium-apertura .pa-raya{position:absolute;left:0;right:0;background:' + FONDO_FIN + ';transform:scaleY(0);animation:pa-crece .45s cubic-bezier(.75,0,.25,1) forwards}'
    + '@keyframes pa-crece{to{transform:scaleY(1)}}'
    + '#portium-apertura .pa-arco{stroke-dasharray:200;stroke-dashoffset:200;animation:pa-dibuja .5s ease-out .8s forwards}'
    + '@keyframes pa-dibuja{to{stroke-dashoffset:0}}'
    + '#portium-apertura .pa-marco{overflow:hidden;margin-top:8px;font-family:Georgia,"Times New Roman",serif;font-size:44px;line-height:1.2;font-weight:400;color:' + TEXTO + '}'
    + '#portium-apertura .pa-palabra{display:inline-block;transform:translateY(110%);animation:pa-sube .5s cubic-bezier(.2,.8,.2,1) .95s forwards}'
    + '@keyframes pa-sube{to{transform:translateY(0)}}'
    + '#portium-apertura .pa-ium{color:' + ARENA + ';font-style:italic}'
    + '#portium-apertura .pa-linea{width:0;height:3px;background:' + LINEA + ';margin:10px auto 0;animation:pa-ancho .35s ease-out 1.2s forwards}'
    + '@keyframes pa-ancho{to{width:140px}}';

    var estilo = document.createElement('style');
    estilo.id = 'portium-apertura-css';
    estilo.textContent = CSS;
    (document.head || document.documentElement).appendChild(estilo);

    var rayas = '';
    for (var i = 0; i < N; i++) {
      var retraso = (0.3 + (i % 3) * 0.1 + Math.abs(i - N / 2) * 0.012).toFixed(3);
      rayas += '<div class="pa-raya" style="top:' + (i * 100 / N) + '%;height:calc(' + (100 / N)
        + '% + 1px);transform-origin:' + (i % 2 ? 'top' : 'bottom') + ';animation-delay:' + retraso + 's"></div>';
    }

    capa = document.createElement('div');
    capa.id = 'portium-apertura';
    capa.setAttribute('aria-hidden', 'true');
    capa.innerHTML =
      '<div class="pa-capa pa-centro"><img class="pa-icono" alt="" src="' + ICONO + '"></div>'
    + '<div class="pa-capa">' + rayas + '</div>'
    + '<div class="pa-capa pa-centro">'
    +   '<svg width="84" height="74" viewBox="0 0 90 80" aria-hidden="true">'
    +     '<path class="pa-arco" d="M18 78 V40 A27 27 0 0 1 72 40 V78" fill="none" stroke="' + ARENA + '" stroke-width="5" stroke-linecap="round"/>'
    +   '</svg>'
    +   '<div class="pa-marco"><span class="pa-palabra">Port<span class="pa-ium">ium</span></span></div>'
    +   '<div class="pa-linea"></div>'
    + '</div>';

    // En el head aún no hay body: la capa cuelga directamente del html.
    document.documentElement.appendChild(capa);

    capa.addEventListener('click', function () { terminar(true); });
    setTimeout(function () { terminar(true); }, DURACION_MS);
    setTimeout(function () { terminado = true; quitar(); }, RETIRADA_MS);
  } catch (e) {
    try { console.warn('[apertura] no se pudo mostrar la animación:', e); } catch (_) {}
    quitar();
  }

  // ---------- Modo espera (valla): caja pequeña dentro de la tarjeta ----------
  function modoEspera() {
    var CSS_MINI =
      '.pa-mini{position:relative;width:100%;max-width:240px;height:118px;margin:0 auto 14px;border-radius:14px;overflow:hidden;background:' + FONDO_INICIO + '}'
    + '.pa-mini .pa-mc{position:absolute;inset:0}'
    + '.pa-mini .pa-mr{position:absolute;left:0;right:0;background:' + FONDO_FIN + ';transform:scaleY(0);animation:pa-m-crece .4s cubic-bezier(.75,0,.25,1) forwards}'
    + '@keyframes pa-m-crece{to{transform:scaleY(1)}}'
    + '.pa-mini .pa-ml{display:flex;flex-direction:column;align-items:center;justify-content:center}'
    + '.pa-mini .pa-ma{stroke-dasharray:200;stroke-dashoffset:200;animation:pa-m-dibuja .45s ease-out .45s forwards,pa-m-respira 1.6s ease-in-out 1.2s infinite}'
    + '@keyframes pa-m-dibuja{to{stroke-dashoffset:0}}'
    + '@keyframes pa-m-respira{0%,100%{opacity:1}50%{opacity:.35}}'
    + '.pa-mini .pa-mm{overflow:hidden;margin-top:4px;font-family:Georgia,"Times New Roman",serif;font-size:26px;line-height:1.2;font-weight:400;color:' + TEXTO + '}'
    + '.pa-mini .pa-mp{display:inline-block;transform:translateY(110%);animation:pa-m-sube .45s cubic-bezier(.2,.8,.2,1) .6s forwards}'
    + '@keyframes pa-m-sube{to{transform:translateY(0)}}'
    + '.pa-mini .pa-mi{color:' + ARENA + ';font-style:italic}';

    function montar() {
      try {
        var rueda = document.querySelector('[data-portium-espera]');
        if (!rueda || rueda.getAttribute('data-portium-montado') === '1') return;

        var estilo = document.createElement('style');
        estilo.id = 'portium-espera-css';
        estilo.textContent = CSS_MINI;
        (document.head || document.documentElement).appendChild(estilo);

        var M = 8, rayas = '';
        for (var i = 0; i < M; i++) {
          var retraso = ((i % 3) * 0.08 + Math.abs(i - M / 2) * 0.01).toFixed(3);
          rayas += '<div class="pa-mr" style="top:' + (i * 100 / M) + '%;height:calc(' + (100 / M)
            + '% + 1px);transform-origin:' + (i % 2 ? 'top' : 'bottom') + ';animation-delay:' + retraso + 's"></div>';
        }

        var caja = document.createElement('div');
        caja.className = 'pa-mini';
        caja.setAttribute('aria-hidden', 'true');
        caja.innerHTML =
          '<div class="pa-mc">' + rayas + '</div>'
        + '<div class="pa-mc pa-ml">'
        +   '<svg width="44" height="39" viewBox="0 0 90 80" aria-hidden="true">'
        +     '<path class="pa-ma" d="M18 78 V40 A27 27 0 0 1 72 40 V78" fill="none" stroke="' + ARENA + '" stroke-width="6" stroke-linecap="round"/>'
        +   '</svg>'
        +   '<div class="pa-mm"><span class="pa-mp">Port<span class="pa-mi">ium</span></span></div>'
        + '</div>';

        rueda.parentNode.insertBefore(caja, rueda);
        rueda.style.display = 'none';
        rueda.setAttribute('data-portium-montado', '1');
      } catch (e) {
        try { console.warn('[apertura] modo espera no montado:', e); } catch (_) {}
      }
    }

    if (document.readyState === 'loading') {
      document.addEventListener('DOMContentLoaded', montar);
    } else {
      montar();
    }
  }
})();
