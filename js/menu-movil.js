/* ============================================================
   js/menu-movil.js — el menú lateral del jefe, como cajón en el móvil
   ------------------------------------------------------------
   23/9/2026. Dani: «estaría bien que el jefe de obra lo vea bien en el
   móvil; al final se acaba usando, aunque luego estés en el ordenador».

   QUÉ PASABA
   Las nueve pantallas de jefe/ tienen el menú lateral fijo de 200 px
   (.sidebar, position: fixed) y el contenido apartado con
   margin-left: 200px (.main). En un móvil de 412 px el menú se comía
   media pantalla, el contenido se apretaba en los 212 px restantes y,
   al deslizar de lado, el menú se quedaba cortado por la izquierda.
   Ninguna pantalla del jefe tenía reglas para ancho estrecho.

   QUÉ HACE
   Solo por debajo de 600 px de ancho (el mismo corte que css/movil.css):
     · el menú se esconde a la izquierda y el contenido recupera todo
       el ancho;
     · aparece un botón ☰ arriba a la izquierda;
     · al tocarlo, el menú entra por encima como un cajón, con el fondo
       oscurecido; se cierra tocando el fondo, eligiendo una opción,
       volviendo a tocar ☰ o con Escape.
   Por encima de 600 px el CSS ni se aplica y el botón no se ve: el
   escritorio queda exactamente igual que antes.

   POR QUÉ UN MÓDULO Y NO css/movil.css
   Lo de esconder el menú SÍ es solo CSS, pero el cajón necesita un
   botón y alguien que lo abra y lo cierre. Hacerlo aquí y cargarlo
   desde js/marca-portium.js (que ya está en las nueve pantallas)
   arregla las nueve de golpe sin tocar ningún HTML (norma de la 111ª).
   El CSS va dentro del módulo, con variables de color con respaldo.

   LO QUE RESPETA
     · El menú no se mueve ni se reescribe: es el mismo nodo que ordena
       js/menu-jefe.js. Solo se le pone o quita una clase.
     · Si en el importador entra un admin y js/menu-rol-ecoordina.js
       cambia el menú por el suyo, el cajón sirve igual: el menú se
       busca en el momento de tocar ☰, no al cargar.
     · Las ventanas emergentes (z-index 100) y el banner de conexión
       (200) siguen por encima del cajón (60).
     · jefe/resumen-mes.html ya tenía su arreglo: menú en barra
       horizontal por debajo de 760 px. Entre 600 y 760 se queda igual;
       por debajo de 600 manda el cajón, como en las otras ocho.

   CUÁNDO NO HACE NADA
     · Fuera de /jefe/ (lo pide marca-portium.js solo allí).
     · Si la página no tiene .sidebar o ya se ejecutó una vez.
     · Si algo falla: se retira y la pantalla queda como estaba. Un menú
       es accesorio y no puede tumbar la página (regla de marca-portium).

   PARA DESHACERLO: quitar la línea cargar('menu-movil.js') de
   js/marca-portium.js. Ningún HTML depende de esto.
   ============================================================ */

(function () {
  'use strict';

  var ANCHO_MOVIL = 600;   // mismo corte que css/movil.css

  var CSS = ''
    + '.mm-boton{display:none}'
    + '.mm-fondo{display:none}'
    + '@media (max-width:' + ANCHO_MOVIL + 'px){'
    // El contenido recupera todo el ancho.
    +   '.main{margin-left:0 !important;min-width:0}'
    // El menú sale de la pantalla por la izquierda y entra al abrir.
    +   '.sidebar{width:min(280px,82vw) !important;transform:translateX(-105%);'
    +     'transition:transform .22s ease;z-index:60 !important;'
    +     'box-shadow:none;overflow-y:auto;-webkit-overflow-scrolling:touch}'
    +   'body.mm-abierto .sidebar{transform:translateX(0);'
    +     'box-shadow:4px 0 24px rgba(0,0,0,.45)}'
    // jefe/resumen-mes.html convierte el menú en barra horizontal por
    // debajo de 760 px. Aquí (por debajo de 600) se deshace, para que el
    // cajón sea igual en las nueve. «html body .sidebar» gana a su
    // «.sidebar» sin !important; entre 600 y 760 su barra sigue igual.
    +   'html body .sidebar{position:fixed;top:0;left:0;bottom:0;'
    +     'flex-direction:column;align-items:stretch;overflow-x:hidden;'
    +     'border-right:1px solid var(--borde, #2e3345);border-bottom:none}'
    +   'html body .sidebar .sidebar-brand,html body .sidebar .sidebar-section,'
    +     'html body .sidebar .sidebar-bottom{display:block}'
    // marca-portium.js esconde el bloque Portium (con estilo en línea)
    // cuando esa barra esconde el logo; en el cajón vuelve a verse.
    +   '.sidebar .portium-lateral{display:flex !important}'
    // Opciones del menú con altura de dedo.
    +   '.sidebar a{min-height:44px;box-sizing:border-box}'
    // Fondo oscuro detrás del cajón.
    +   '.mm-fondo{display:block;position:fixed;inset:0;background:rgba(0,0,0,.55);'
    +     'z-index:55;opacity:0;pointer-events:none;transition:opacity .22s ease}'
    +   'body.mm-abierto .mm-fondo{opacity:1;pointer-events:auto}'
    +   'body.mm-abierto{overflow:hidden}'
    // El botón ☰.
    +   '.mm-boton{display:flex;align-items:center;justify-content:center;'
    +     'position:fixed;top:12px;left:10px;width:44px;height:44px;z-index:50;'
    +     'border-radius:10px;border:1px solid var(--borde, #2e3345);'
    +     'background:var(--bg2, #1a1d27);color:var(--texto, #e8eaf0);'
    +     'font-size:22px;line-height:1;cursor:pointer;padding:0;'
    +     'box-shadow:0 2px 8px rgba(0,0,0,.35)}'
    +   'body.mm-abierto .mm-boton{z-index:61}'
    +   '.mm-boton:focus-visible{outline:2px solid var(--color-acento, #4fb3a9);outline-offset:2px}'
    // Que el título de la pantalla no quede debajo del botón.
    +   '.main .topbar{padding-left:66px !important;padding-right:14px !important}'
    + '}'
    + '@media (prefers-reduced-motion:reduce){'
    +   '.sidebar,.mm-fondo{transition:none !important}'
    + '}';

  function menu() {
    return document.querySelector('.sidebar');
  }

  function abierto() {
    return document.body.classList.contains('mm-abierto');
  }

  function abrir(boton) {
    if (!menu()) return;
    document.body.classList.add('mm-abierto');
    boton.setAttribute('aria-expanded', 'true');
    boton.setAttribute('aria-label', 'Cerrar menú');
    boton.textContent = '✕';
  }

  function cerrar(boton) {
    document.body.classList.remove('mm-abierto');
    boton.setAttribute('aria-expanded', 'false');
    boton.setAttribute('aria-label', 'Abrir menú');
    boton.textContent = '☰';
  }

  function iniciar() {
    try {
      if (!menu()) return;
      if (document.querySelector('.mm-boton')) return;   // ya iniciado

      var estilo = document.createElement('style');
      estilo.id = 'menu-movil-css';
      estilo.textContent = CSS;
      document.head.appendChild(estilo);

      var fondo = document.createElement('div');
      fondo.className = 'mm-fondo';
      document.body.appendChild(fondo);

      var boton = document.createElement('button');
      boton.type = 'button';
      boton.className = 'mm-boton';
      boton.setAttribute('aria-expanded', 'false');
      boton.setAttribute('aria-label', 'Abrir menú');
      boton.textContent = '☰';
      document.body.appendChild(boton);

      boton.addEventListener('click', function () {
        if (abierto()) cerrar(boton); else abrir(boton);
      });
      fondo.addEventListener('click', function () { cerrar(boton); });
      document.addEventListener('keydown', function (e) {
        if (e.key === 'Escape' && abierto()) cerrar(boton);
      });

      // Al elegir una opción (o «Cerrar sesión»), el cajón se cierra.
      // Se escucha en el documento porque el menú puede cambiar de nodo
      // (menu-rol-ecoordina.js en el importador).
      document.addEventListener('click', function (e) {
        if (!abierto()) return;
        var m = menu();
        if (!m || !m.contains(e.target)) return;
        if (e.target.closest && e.target.closest('a, button')) cerrar(boton);
      });

      // Si se gira el móvil o se agranda la ventana por encima del
      // corte, el cajón no se queda abierto con el fondo bloqueado.
      window.addEventListener('resize', function () {
        if (window.innerWidth > ANCHO_MOVIL && abierto()) cerrar(boton);
      });
    } catch (e) {
      console.warn('[menu-movil] no se ha podido preparar el menú del móvil:', e);
    }
  }

  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', iniciar);
  else iniciar();
})();
