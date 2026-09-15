/* ============================================================
   instalar-app.js — Botón "Instalar Portium" (PWA)
   MÓDULO AUTÓNOMO: crea su propio HTML y CSS con colores fijos
   (inmune al tema del anfitrión, como declaracion-sabado.js).
   La página anfitriona solo añade la etiqueta <script>.
   Requiere que la página tenga el <link rel="manifest"> en el head.

   Comportamiento:
   - Si la app YA se abre desde el icono (modo standalone): no hace nada.
   - Android/Chrome: espera el aviso "instalable" del navegador y
     enseña un botón flotante que lanza el diálogo nativo.
   - iPhone/iPad: enseña el mismo botón; al pulsarlo, mini-guía
     ("Compartir → Añadir a pantalla de inicio"), porque Apple no
     permite lanzar la instalación desde la web.
   - La X guarda el "no molestar" en localStorage: es comodidad de un
     navegador, no un pestillo.
   ============================================================ */
(function () {
  'use strict';

  var CLAVE_OCULTO = 'portium_instalar_oculto';

  // Ya instalada y abierta desde el icono → fuera
  var esStandalone =
    (window.matchMedia && window.matchMedia('(display-mode: standalone)').matches) ||
    window.navigator.standalone === true;
  if (esStandalone) return;

  var esIOS = /iPad|iPhone|iPod/.test(navigator.userAgent) ||
    (navigator.platform === 'MacIntel' && navigator.maxTouchPoints > 1);

  var promptDiferido = null;
  var boton = null;

  function inyectarCSS() {
    var css = [
      '#pia-boton{position:fixed;bottom:18px;right:16px;z-index:9500;',
      'display:flex;align-items:center;gap:8px;padding:12px 18px;',
      'background:#1e3a5f;color:#ffffff;border:none;border-radius:999px;',
      'font-family:-apple-system,BlinkMacSystemFont,"Segoe UI",Roboto,sans-serif;',
      'font-size:15px;font-weight:600;cursor:pointer;',
      'box-shadow:0 4px 14px rgba(0,0,0,0.25);}',
      '#pia-boton:active{transform:scale(0.97);}',
      '#pia-cerrar{background:none;border:none;color:#ffffff;opacity:0.7;',
      'font-size:16px;line-height:1;cursor:pointer;padding:2px 0 2px 4px;}',
      '#pia-velo{position:fixed;inset:0;background:rgba(0,0,0,0.55);',
      'z-index:9600;display:flex;align-items:center;justify-content:center;padding:24px;}',
      '#pia-guia{background:#ffffff;color:#1a1a1a;border-radius:16px;',
      'padding:24px 22px;max-width:340px;width:100%;',
      'font-family:-apple-system,BlinkMacSystemFont,"Segoe UI",Roboto,sans-serif;',
      'box-shadow:0 8px 30px rgba(0,0,0,0.35);}',
      '#pia-guia h3{margin:0 0 14px;font-size:18px;color:#1e3a5f;}',
      '#pia-guia ol{margin:0 0 16px;padding-left:20px;font-size:15px;line-height:1.7;}',
      '#pia-guia button{width:100%;padding:12px;font-size:15px;font-weight:600;',
      'background:#1e3a5f;color:#ffffff;border:none;border-radius:10px;cursor:pointer;}'
    ].join('');
    var s = document.createElement('style');
    s.textContent = css;
    document.head.appendChild(s);
  }

  function crearBoton() {
    if (boton) return;
    inyectarCSS();
    boton = document.createElement('button');
    boton.id = 'pia-boton';
    boton.type = 'button';
    boton.innerHTML = 'Instalar Portium <span id="pia-cerrar" title="No volver a enseñar">✕</span>';
    boton.addEventListener('click', function (ev) {
      if (ev.target && ev.target.id === 'pia-cerrar') {
        try { localStorage.setItem(CLAVE_OCULTO, '1'); } catch (e) { /* sin storage: solo esta visita */ }
        quitarBoton();
        return;
      }
      if (esIOS) { abrirGuiaIOS(); return; }
      lanzarInstalacion();
    });
    document.body.appendChild(boton);
  }

  function quitarBoton() {
    if (boton && boton.parentNode) boton.parentNode.removeChild(boton);
    boton = null;
  }

  function lanzarInstalacion() {
    if (!promptDiferido) return;
    promptDiferido.prompt();
    promptDiferido.userChoice.then(function (eleccion) {
      if (eleccion && eleccion.outcome === 'accepted') quitarBoton();
      promptDiferido = null;
    });
  }

  function abrirGuiaIOS() {
    var velo = document.createElement('div');
    velo.id = 'pia-velo';
    velo.innerHTML =
      '<div id="pia-guia">' +
      '<h3>Instalar Portium en tu iPhone</h3>' +
      '<ol>' +
      '<li>Pulsa el botón <strong>Compartir</strong> del navegador (el cuadrado con la flecha hacia arriba).</li>' +
      '<li>Busca y pulsa <strong>«Añadir a pantalla de inicio»</strong>.</li>' +
      '<li>Pulsa <strong>Añadir</strong>. Ya tienes el icono en el escritorio.</li>' +
      '</ol>' +
      '<button type="button" id="pia-guia-ok">Entendido</button>' +
      '</div>';
    velo.addEventListener('click', function (ev) {
      if (ev.target === velo || (ev.target && ev.target.id === 'pia-guia-ok')) {
        velo.parentNode.removeChild(velo);
      }
    });
    document.body.appendChild(velo);
  }

  function arrancar() {
    var oculto = false;
    try { oculto = localStorage.getItem(CLAVE_OCULTO) === '1'; } catch (e) { oculto = false; }
    if (oculto) return;

    if (esIOS) {
      // En iOS no existe el aviso "instalable": el botón sale siempre
      // (salvo standalone, ya descartado arriba).
      crearBoton();
      return;
    }

    // Android/Chrome y escritorio: solo si el navegador dice que se puede
    window.addEventListener('beforeinstallprompt', function (e) {
      e.preventDefault();
      promptDiferido = e;
      crearBoton();
    });

    // Si se instala (por el botón o por el menú), el botón sobra
    window.addEventListener('appinstalled', function () { quitarBoton(); });
  }

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', arrancar);
  } else {
    arrancar();
  }
})();
