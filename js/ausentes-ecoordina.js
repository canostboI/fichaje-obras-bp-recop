/* ============================================================
   js/ausentes-ecoordina.js — «esta gente ya no está en e-Coordina»,
   en el panel del jefe
   ------------------------------------------------------------
   20/9/2026. La otra mitad del trabajo de hoy: la sincronización
   nocturna ya DETECTA a quien desaparece del Excel de e-Coordina y le
   baja el verde a naranja. Esto es lo que lo enseña.

   POR QUÉ SEPARADO EN DOS
   Porque «41 desaparecidos» no es una alarma, es una lista de mudanza.
   En Escola Música Valls los 41 eran gente que terminó hace meses y
   seguía asignada a la obra; ninguno había fichado este mes. Si el
   banner los mezcla con los que SÍ están yendo, el número engorda, deja
   de significar nada y a la tercera mañana nadie lo mira.
     · Los que han fichado en los últimos 30 días se LISTAN con nombre,
       empresa y último fichaje. Eso es lo que hay que resolver hoy.
     · Los demás se CUENTAN en una línea. Eso es limpieza de la obra.

   UN BANNER VACÍO NO SIEMPRE SIGNIFICA LO MISMO
   Puede ser «no hay desaparecidos» o «no se ha podido mirar», y no se
   pueden pintar igual (norma de la casa: callar es indistinguible de
   dar el visto bueno). Por eso se avisa también cuando:
     · la sincronización lleva días sin pasar por esta obra;
     · la de anoche trajo mucha menos gente de la normal (el Excel llegó
       roto), en cuyo caso NO se degradó a nadie a propósito;
     · la consulta falla.
   Con la obra pausada no se avisa de nada: no se sincroniza porque está
   parada, y eso no es un fallo.

   CANDADO: solo en /jefe/ y solo en la pantalla de Presencia.

   PARA DESHACERLO: quitar la línea `cargar('ausentes-ecoordina.js')`
   de js/marca-portium.js. Nada más depende de este archivo.
   ============================================================ */
(function () {
  'use strict';

  var SUPABASE_URL = 'https://istrnsicleopzbsrapsw.supabase.co';
  var SUPABASE_ANON_KEY = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6ImlzdHJuc2ljbGVvcHpic3JhcHN3Iiwicm9sZSI6ImFub24iLCJpYXQiOjE3NzU4MTIxMTYsImV4cCI6MjA5MTM4ODExNn0.5UXV2LWPXmbfLI7rKpZSG9YBzZsesjckHnhQabA0mTY';

  var RE_UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
  var cliente = null;
  var pedida = null;

  function sb() {
    if (cliente) return cliente;
    if (!window.supabase || !window.supabase.createClient) return null;
    cliente = window.supabase.createClient(SUPABASE_URL, SUPABASE_ANON_KEY);
    return cliente;
  }

  function obraActiva() {
    var sel = document.getElementById('selector-obra');
    if (sel && sel.value && RE_UUID.test(sel.value)) return sel.value;
    try {
      var g = localStorage.getItem('jefe_obra_activa_id');
      if (g && RE_UUID.test(g)) return g;
    } catch (_) {}
    return null;
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

  function estilos() {
    if (document.getElementById('aec-css')) return;
    var s = document.createElement('style');
    s.id = 'aec-css';
    s.textContent = [
      '#ausentes-ecoordina{margin:0 0 14px}',
      '#ausentes-ecoordina .aec{padding:12px 16px;border-radius:10px;font-size:13px;line-height:1.5}',
      '#ausentes-ecoordina .aec-naranja{background:rgba(255,152,0,0.12);color:var(--naranja,#e0a020);',
      'border:1px solid rgba(255,152,0,0.4)}',
      '#ausentes-ecoordina .aec-gris{background:rgba(139,144,158,0.12);color:var(--texto2,#9aa4b2);',
      'border:1px solid rgba(139,144,158,0.35)}',
      '#ausentes-ecoordina b{font-weight:700}',
      '#ausentes-ecoordina .aec-persona{margin-top:7px;padding-left:2px}',
      '#ausentes-ecoordina .aec-donde{opacity:.85}',
      '#ausentes-ecoordina .aec-pie{margin-top:10px;opacity:.85;font-size:12px}'
    ].join('');
    document.head.appendChild(s);
  }

  function hueco() {
    var h = document.getElementById('ausentes-ecoordina');
    if (h) return h;
    h = document.createElement('div');
    h.id = 'ausentes-ecoordina';
    // Debajo de la barra de título, arriba del contenido de la pantalla.
    var tb = document.querySelector('.topbar');
    if (tb && tb.parentNode) tb.parentNode.insertBefore(h, tb.nextSibling);
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
    var obraId = obraActiva();
    if (!obraId) return;
    var c = sb();
    if (!c) return;
    if (pedida === obraId) return;
    pedida = obraId;

    c.rpc('ausentes_ecoordina', { p_obra_id: obraId }).then(function (r) {
      estilos();
      if (r.error) {
        h.innerHTML = '<div class="aec aec-gris">❔ No se ha podido comprobar si alguien ha '
          + 'desaparecido de e-Coordina. Esto no significa que no haya nadie: significa que no se sabe.</div>';
        return;
      }
      var d = r.data || {};
      if (!d.ok) { h.innerHTML = ''; return; }

      // Obra pausada: no se sincroniza porque está parada. No es un fallo.
      if (d.obra_pausada) { h.innerHTML = ''; return; }

      var trozos = [];

      if (d.sospecha_sync) {
        trozos.push('<div class="aec aec-gris">⚠️ <b>La última sincronización con e-Coordina no es de fiar.</b><br>'
          + esc(d.sospecha_sync) + '</div>');
      } else if (d.dias_sin_sincronizar === null || d.dias_sin_sincronizar === undefined) {
        trozos.push('<div class="aec aec-gris">❔ e-Coordina no ha comprobado nunca la documentación de esta obra.</div>');
      } else if (d.dias_sin_sincronizar >= 3) {
        trozos.push('<div class="aec aec-gris">❔ <b>La documentación no se comprueba desde hace '
          + d.dias_sin_sincronizar + ' días.</b> El semáforo enseña lo de entonces, no lo de hoy.</div>');
      }

      var lista = d.con_actividad || [];
      if (lista.length) {
        var html = '<div class="aec aec-naranja">🚪 <b>'
          + (lista.length === 1
              ? 'Una persona que ha estado fichando ya no aparece en e-Coordina'
              : lista.length + ' personas que han estado fichando ya no aparecen en e-Coordina')
          + '</b><br>Puede que su empresa las haya quitado de la obra. Su documentación ya no la comprueba nadie.';
        for (var i = 0; i < lista.length; i++) {
          var p = lista[i];
          html += '<div class="aec-persona">· <b>' + esc(p.nombre) + '</b> '
               +  '<span class="aec-donde">(' + esc(p.empresa) + ') — último fichaje ' + fecha(p.ultimo_fichaje)
               +  ' · sin aparecer desde el ' + fecha(p.desde) + '</span></div>';
        }
        html += '<div class="aec-pie">Su semáforo está en naranja: pasan la valla con aviso, no se les cierra la puerta.</div></div>';
        trozos.push(html);
      }

      if (d.n_antiguos) {
        trozos.push('<div class="aec aec-gris">🧹 Además hay <b>' + d.n_antiguos
          + '</b> persona(s) asignada(s) a esta obra que no fichan desde hace más de un mes y que '
          + 'e-Coordina ya no reconoce. No es un peligro: es una lista por limpiar.</div>');
      }

      h.innerHTML = trozos.join('');
    }).catch(function (e) {
      console.warn('[ausentes-ecoordina] no se ha podido comprobar:', e);
    });
  }

  function iniciar() {
    try {
      var ruta = window.location.pathname;
      if (ruta.indexOf('/jefe/') === -1) return;
      var pagina = ruta.split('/').pop() || '';
      if (pagina !== 'index.html' && pagina !== '') return;
      pintar();
      var sel = document.getElementById('selector-obra');
      if (sel) sel.addEventListener('change', function () {
        pedida = null;
        setTimeout(pintar, 0);
      });
    } catch (e) {
      console.warn('[ausentes-ecoordina] no se ha podido montar:', e);
    }
  }

  function esperar(intentos) {
    if (obraActiva() || intentos <= 0) { iniciar(); return; }
    setTimeout(function () { esperar(intentos - 1); }, 300);
  }

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', function () { esperar(20); });
  } else {
    esperar(20);
  }
})();
