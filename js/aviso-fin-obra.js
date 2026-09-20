/* ============================================================
   js/aviso-fin-obra.js — «un jefe pide terminar una obra», en el
   cuadro de mando del admin
   ------------------------------------------------------------
   20/9/2026. Va con el botón de estado de obra del panel del jefe
   (js/estado-obra.js): el jefe puede pausar y reanudar su obra él
   mismo, pero TERMINARLA la sigue cerrando el admin, porque arrastra
   cierres de mes y facturación. El jefe lo PIDE; el admin lo hace.

   POR QUÉ ESTE ARCHIVO EXISTE
   Porque sin él la petición sería una nota que no lee nadie. Es
   exactamente el fallo que destapamos hoy: Escola Música Valls llevaba
   cinco semanas parada, mandando SMS cada mañana, y la app no tenía
   ojos para verlo. Un aviso que no se enseña en la pantalla donde
   alguien mira no es un aviso.

   QUÉ ENSEÑA
   Un bloque arriba del cuadro de mando, encima del banner de fallos,
   con lo que el admin necesita para DECIDIR (no solo para enterarse):
   quién lo pide y cuándo, el motivo, el último fichaje de la obra, si
   queda alguien con la jornada abierta y — lo que de verdad frena
   terminar una obra — cuántos meses con fichajes siguen sin cerrar.

   SE APAGA SOLO: la función solo devuelve obras activas o pausadas. En
   cuanto el admin la marca como terminada, la petición está atendida y
   el aviso desaparece sin que nadie tenga que limpiarlo.

   SI NO SE PUEDE COMPROBAR, LO DICE (norma de la casa: un vigilante
   que no puede mirar no se calla, porque callar es indistinguible de
   dar el visto bueno).

   CANDADO: solo en el cuadro de mando del admin.

   PARA DESHACERLO: quitar la línea `cargar('aviso-fin-obra.js')` de
   js/menu-admin.js. Nada más depende de este archivo.
   ============================================================ */
(function () {
  'use strict';

  var SUPABASE_URL = 'https://istrnsicleopzbsrapsw.supabase.co';
  var SUPABASE_ANON_KEY = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6ImlzdHJuc2ljbGVvcHpic3JhcHN3Iiwicm9sZSI6ImFub24iLCJpYXQiOjE3NzU4MTIxMTYsImV4cCI6MjA5MTM4ODExNn0.5UXV2LWPXmbfLI7rKpZSG9YBzZsesjckHnhQabA0mTY';

  var cliente = null;

  function sb() {
    if (cliente) return cliente;
    if (!window.supabase || !window.supabase.createClient) return null;
    cliente = window.supabase.createClient(SUPABASE_URL, SUPABASE_ANON_KEY);
    return cliente;
  }

  function esc(t) {
    return String(t == null ? '' : t)
      .replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
  }

  function fecha(iso) {
    if (!iso) return '—';
    var d = String(iso).slice(0, 10).split('-');
    return d.length === 3 ? d[2] + '/' + d[1] + '/' + d[0] : String(iso);
  }

  // La pantalla ya tiene `.aviso` y sus colores. Se añade lo propio con
  // respaldo, por si algún día este módulo va a otra pantalla.
  function estilos() {
    if (document.getElementById('afo-css')) return;
    var s = document.createElement('style');
    s.id = 'afo-css';
    s.textContent = [
      '#aviso-fin-obra .aviso{padding:12px 16px;border-radius:10px;font-size:13px;',
      'line-height:1.5;margin-bottom:16px;font-weight:600}',
      '#aviso-fin-obra .afo-naranja{background:rgba(255,152,0,0.12);color:var(--naranja,#ff9800);',
      'border:1px solid rgba(255,152,0,0.4)}',
      '#aviso-fin-obra .afo-gris{background:rgba(139,144,158,0.12);color:var(--gris,#8b909e);',
      'border:1px solid rgba(139,144,158,0.35)}',
      '#aviso-fin-obra .afo-obra{margin-top:8px;font-weight:700}',
      '#aviso-fin-obra .afo-datos{font-weight:400;opacity:.9;margin-top:2px}',
      '#aviso-fin-obra .afo-freno{color:var(--rojo,#e24b4a);font-weight:700}',
      '#aviso-fin-obra a{color:inherit}'
    ].join('');
    document.head.appendChild(s);
  }

  function hueco() {
    var h = document.getElementById('aviso-fin-obra');
    if (h) return h;
    h = document.createElement('div');
    h.id = 'aviso-fin-obra';
    var antes = document.getElementById('banner-fallos');
    if (antes && antes.parentNode) antes.parentNode.insertBefore(h, antes);
    else {
      var main = document.querySelector('.main');
      if (!main) return null;
      main.insertBefore(h, main.firstChild);
    }
    return h;
  }

  function pintar() {
    var h = hueco();
    if (!h) return;
    var c = sb();
    if (!c) return;

    c.rpc('solicitudes_fin_obra').then(function (r) {
      if (r.error) {
        // No se ha podido comprobar: se dice. Nunca se deja en blanco,
        // que se leería como «no hay ninguna petición».
        estilos();
        h.innerHTML = '<div class="aviso afo-gris">❔ No se ha podido comprobar si algún jefe ha pedido '
          + 'terminar una obra. Esto NO significa que no haya ninguna: significa que no se sabe. '
          + 'Recarga la página.</div>';
        return;
      }
      var d = r.data || {};
      var lista = (d && d.solicitudes) || [];
      if (!d.ok || !lista.length) { h.innerHTML = ''; return; }

      estilos();
      var html = '<div class="aviso afo-naranja">🏁 <b>'
        + (lista.length === 1
            ? 'Un jefe de obra pide dar una obra por terminada'
            : lista.length + ' obras con petición de terminarlas')
        + '</b>';

      for (var i = 0; i < lista.length; i++) {
        var s = lista[i];
        var partes = [];
        partes.push('la pidió ' + esc(s.pedida_por) + ' el ' + fecha(s.pedida_en));
        partes.push('último fichaje: ' + fecha(s.ultimo_fichaje));
        if (s.estado === 'pausada') partes.push('la obra ya está pausada');
        if (s.jornadas_abiertas)    partes.push('⚠ ' + s.jornadas_abiertas + ' con la jornada abierta');

        html += '<div class="afo-obra">· ' + esc(s.obra) + '</div>'
             +  '<div class="afo-datos">' + esc(partes.join(' · '));
        if (s.motivo) html += '<br>«' + esc(s.motivo) + '»';
        if (s.meses_sin_cerrar) {
          html += '<br><span class="afo-freno">Antes de terminarla: ' + s.meses_sin_cerrar
               +  ' mes(es) con fichajes sin cerrar.</span>';
        } else {
          html += '<br>Todos los meses con fichajes están cerrados.';
        }
        html += '</div>';
      }

      html += '<div class="afo-datos" style="margin-top:10px">'
           +  'Terminar una obra se hace en <a href="obras.html">Obras</a>. '
           +  'Este aviso desaparece solo cuando la marques como terminada.</div></div>';
      h.innerHTML = html;
    }).catch(function (e) {
      console.warn('[aviso-fin-obra] no se ha podido comprobar:', e);
    });
  }

  function iniciar() {
    try {
      var ruta = window.location.pathname;
      if (ruta.indexOf('/admin/') === -1) return;
      if ((ruta.split('/').pop() || '') !== 'cuadro-mando.html') return;
      pintar();
    } catch (e) {
      console.warn('[aviso-fin-obra] no se ha podido montar:', e);
    }
  }

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', iniciar);
  } else {
    iniciar();
  }
})();
