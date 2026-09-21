/* ============================================================
   js/papeles-subcontratas.js — EL CONTRATO Y EL LIBRO, A LA VISTA
   ------------------------------------------------------------
   21/9/2026. Cierra el único punto que quedó a medias de la 124ª.

   DE DÓNDE VIENE
   «Sin contrato entre empresas → rojo» y «No ha firmado el libro de
   subcontratación → rojo» se calculaban recorriendo las filas del Excel
   de e-Coordina, dentro de js/ecoordina-import.js. Quien no tenía fila,
   no pasaba por la regla: a la empresa con menos garantías era a la
   única a la que no se le exigía lo más importante. La 124ª sacó esa
   regla a la base de datos (`_subcontratas_sin_papeles`) y montó el cron
   que cierra la puerta a los 5 días laborables
   (`cerrar_empresas_sin_papeles`, 06:10).

   Pero la app ACTUABA SIN AVISAR: el jefe se enteraba el día que su
   gente ya no pasaba la valla. Eso es justo lo que prohíben dos normas
   de la casa: «un aviso que no se enseña donde alguien mira no es un
   aviso» y «un vigilante que no puede mirar, lo dice». Éste puede
   mirar; lo que no hacía era contarlo.

   🔴 LA REGLA NO VIVE AQUÍ. Este módulo solo pregunta. La receta es
   `_subcontratas_sin_papeles`, la MISMA que usa el cron, así que la
   pantalla y la consecuencia no pueden divergir. Si mañana cambia el
   plazo de 5 días, se toca la base de datos y este archivo ni se entera.
   La RPC de lectura es `papeles_subcontratas_obra`.

   POR EMPRESA, NO POR PERSONA (decisión de Dani, 124ª): el jefe llama a
   un gerente, no a 25 operarios. Por eso es un banner aparte del de
   js/ausentes-ecoordina.js, que va por persona. No se solapan: aquel
   habla de gente que desaparece de e-Coordina, éste de papeles de
   empresa. Se midió el 21/9 antes de escribirlo: una sola persona de
   toda la base entraría en los dos.

   SIN BOTÓN «VISTO», a propósito. En el banner de personas tiene
   sentido; aquí no. El plazo trae una consecuencia dura y colectiva, y
   dar por enterado sería quitarse de encima el único aviso que existe
   antes de que 25 personas se queden en la puerta.

   LO QUE VIENE HOY Y LO QUE YA NO PISA LA OBRA, SEPARADO. La lista de
   base mira TODO el historial de fichajes, sin límite de fecha: una
   subcontrata que pasó por la obra en abril y no volvió saldría igual
   que una que está hoy en la obra. Son dos problemas distintos —uno es
   urgente, el otro es limpieza— y mezclarlos es como se consigue que a
   la tercera mañana nadie mire el banner.

   SI NO SE PUEDE COMPROBAR, LO DICE. Un banner vacío puede significar
   «no hay nada» o «no se ha podido mirar», y no se pintan igual.

   CON LA OBRA PAUSADA NO SE CALLA: el cron recorre también las obras
   pausadas, así que el plazo corre con la obra parada.

   CANDADO: solo en /jefe/ y solo en Presencia (index.html).
   PARA DESHACERLO: quitar `cargar('papeles-subcontratas.js')` de
   js/marca-portium.js. Nada más depende de este archivo.
   ============================================================ */
(function () {
  'use strict';

  var SUPABASE_URL = 'https://istrnsicleopzbsrapsw.supabase.co';
  var SUPABASE_ANON_KEY = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6ImlzdHJuc2ljbGVvcHpic3JhcHN3Iiwicm9sZSI6ImFub24iLCJpYXQiOjE3NzU4MTIxMTYsImV4cCI6MjA5MTM4ODExNn0.5UXV2LWPXmbfLI7rKpZSG9YBzZsesjckHnhQabA0mTY';

  var RE_UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
  var DIAS = ['domingo', 'lunes', 'martes', 'miércoles', 'jueves', 'viernes', 'sábado'];
  var DIAS_SIN_PISAR = 30;   // a partir de aquí, «ya no viene»: es limpieza

  var cliente = null;
  var obraEnCurso = null;
  var verDormidas = false;

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
      .replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;')
      .replace(/"/g, '&quot;');
  }

  function fecha(iso) {
    if (!iso) return '—';
    var p = String(iso).slice(0, 10).split('-');
    return p.length === 3 ? p[2] + '/' + p[1] : String(iso);
  }

  // «hoy» / «mañana» / «el martes 29/9». Los días los cuenta la base de
  // datos; aquí solo se ponen en castellano.
  function cuando(iso, dias) {
    if (dias === null || dias === undefined) return null;
    if (dias <= 0) return 'hoy';
    if (dias === 1) return 'mañana';
    var p = String(iso).slice(0, 10).split('-');
    if (p.length !== 3) return null;
    var d = new Date(Number(p[0]), Number(p[1]) - 1, Number(p[2]), 12, 0, 0);
    if (isNaN(d.getTime())) return null;
    return 'el ' + DIAS[d.getDay()] + ' ' + d.getDate() + '/' + (d.getMonth() + 1);
  }

  function queFalta(e) {
    if (e.falta_contrato && e.falta_libro) return 'sin contrato entre empresas y sin el libro de subcontratación firmado';
    if (e.falta_contrato) return 'sin contrato entre empresas';
    if (e.falta_libro) return 'sin el libro de subcontratación firmado';
    return 'con papeles pendientes';
  }

  // A quién afecta. 🔴 Cuando el cron ya ha cerrado a la empresa, `afectadas`
  // (los que quedan por pasar a rojo) baja a 0: decir «afecta a 0 personas» de
  // una empresa con la puerta cerrada es justo lo contrario de la verdad.
  function aQuien(e) {
    var total = Number(e.personas) || 0;
    var pend = Number(e.afectadas) || 0;
    var rojos = Number(e.personas_rojo) || 0;
    if (e.cerrada) {
      if (rojos > 0) return rojos + (rojos === 1 ? ' persona suya está' : ' personas suyas están') + ' en rojo';
      if (pend > 0) return 'le quedan ' + pend + ' de ' + total + ' por cerrar';
      return 'tiene ' + total + (total === 1 ? ' persona' : ' personas') + ' en esta obra';
    }
    if (pend > 0) return 'afecta a ' + pend + ' de ' + total + (total === 1 ? ' persona' : ' personas');
    return 'tiene ' + total + (total === 1 ? ' persona' : ' personas') + ' en esta obra';
  }

  function estilos() {
    if (document.getElementById('psc-css')) return;
    var s = document.createElement('style');
    s.id = 'psc-css';
    s.textContent = [
      '#papeles-subcontratas{margin:0 0 14px}',
      '#papeles-subcontratas .psc{padding:12px 16px;border-radius:10px;font-size:13px;line-height:1.5;margin-bottom:10px}',
      '#papeles-subcontratas .psc-rojo{background:rgba(226,75,74,0.12);color:var(--rojo,#e24b4a);border:1px solid rgba(226,75,74,0.4)}',
      '#papeles-subcontratas .psc-naranja{background:rgba(255,152,0,0.12);color:var(--naranja,#e0a020);border:1px solid rgba(255,152,0,0.4)}',
      '#papeles-subcontratas .psc-gris{background:rgba(139,144,158,0.12);color:var(--texto2,#9aa4b2);border:1px solid rgba(139,144,158,0.35)}',
      '#papeles-subcontratas b{font-weight:700}',
      '#papeles-subcontratas .psc-fila{margin-top:9px;padding-top:9px;border-top:1px solid rgba(255,255,255,0.08)}',
      '#papeles-subcontratas .psc-det{opacity:.9;font-weight:400;display:block}',
      '#papeles-subcontratas .psc-plazo{font-weight:700}',
      '#papeles-subcontratas .psc-ya{color:var(--rojo,#e24b4a);font-weight:700}',
      '#papeles-subcontratas .psc-mas{background:none;border:0;color:inherit;font-family:inherit;',
      'font-size:12px;text-decoration:underline;cursor:pointer;padding:0;opacity:.85}',
      '#papeles-subcontratas .psc-pie{margin-top:9px;opacity:.85;font-size:12px;font-weight:400}'
    ].join('');
    document.head.appendChild(s);
  }

  // El hueco va SIEMPRE por encima del banner de personas: una empresa
  // arrastra a toda su gente, así que es el aviso de más arriba. Los dos
  // módulos se cuelgan de la misma barra y el orden dependería de cuál
  // termine antes de cargar, así que se recoloca en cada pintada (es
  // idempotente: si ya está bien, no toca nada).
  function hueco() {
    var h = document.getElementById('papeles-subcontratas');
    if (!h) {
      h = document.createElement('div');
      h.id = 'papeles-subcontratas';
      var tb = document.querySelector('.topbar');
      if (tb && tb.parentNode) tb.parentNode.insertBefore(h, tb.nextSibling);
      else {
        var main = document.querySelector('.main');
        if (!main) return null;
        main.insertBefore(h, main.firstChild);
      }
    }
    try {
      var otro = document.getElementById('ausentes-ecoordina');
      if (otro && otro.parentNode === h.parentNode &&
          (h.compareDocumentPosition(otro) & Node.DOCUMENT_POSITION_PRECEDING)) {
        otro.parentNode.insertBefore(h, otro);
      }
    } catch (_) {}
    return h;
  }

  function filaEmpresa(e) {
    var plazo = '';
    if (e.cerrada) {
      plazo = '<span class="psc-ya">puerta cerrada</span>';
    } else {
      var t = cuando(e.fecha_limite, e.dias_restantes);
      if (t) plazo = '<span class="psc-plazo">se les cierra la puerta ' + esc(t) + '</span>';
    }

    var pisa = '';
    if (e.dias_sin_pisar !== null && e.dias_sin_pisar !== undefined && e.dias_sin_pisar > DIAS_SIN_PISAR) {
      pisa = 'no ficha nadie suyo desde el ' + fecha(e.ultimo_fichaje)
           + ' (hace ' + e.dias_sin_pisar + ' días)';
    }

    return '<div class="psc-fila">'
      + '<b>' + esc(e.empresa) + '</b>'
      + '<span class="psc-det">' + esc(queFalta(e))
      + ' desde el ' + fecha(e.falta_desde)
      + ' · ' + esc(aQuien(e))
      + (plazo ? ' · ' : '') + plazo + '</span>'
      + (pisa ? '<span class="psc-det">' + esc(pisa) + '</span>' : '')
      + '</div>';
  }

  function pintar(d, h) {
    estilos();

    var lista = d.empresas || [];
    var activas = [], dormidas = [];
    for (var i = 0; i < lista.length; i++) {
      var e = lista[i];
      var quieta = (e.dias_sin_pisar !== null && e.dias_sin_pisar !== undefined
                    && e.dias_sin_pisar > DIAS_SIN_PISAR);
      // Una empresa con la puerta ya cerrada no se aparca nunca, aunque
      // lleve tiempo sin venir: es una consecuencia en marcha.
      if (quieta && !e.cerrada) dormidas.push(e);
      else activas.push(e);
    }

    var html = '';

    if (activas.length) {
      var hayCerradas = false;
      for (var k = 0; k < activas.length; k++) if (activas[k].cerrada) hayCerradas = true;
      html += '<div class="psc ' + (hayCerradas ? 'psc-rojo' : 'psc-naranja') + '">'
           + (hayCerradas ? '🚫 ' : '📄 ') + '<b>'
           + (activas.length === 1
               ? 'Una subcontrata de tu obra no tiene los papeles en regla'
               : activas.length + ' subcontratas de tu obra no tienen los papeles en regla')
           + '</b>';
      for (var a = 0; a < activas.length; a++) html += filaEmpresa(activas[a]);
      html += '<div class="psc-pie">Se exige a toda subcontrata con gente fichando, '
           +  'esté o no en e-Coordina. Para arreglarlo: cargar el contrato entre empresas '
           +  'o el libro de subcontratación firmado en la ficha de la empresa, en Trabajadores. '
           +  (hayCerradas
               ? 'A las que ya tienen la puerta cerrada, su gente no pasa la valla hasta que el papel esté.'
               : 'Mientras tanto su gente pasa con normalidad; cuando se acabe el plazo, no.')
           +  '</div></div>';
    }

    if (dormidas.length) {
      html += '<div class="psc psc-gris">🧹 Además hay <b>' + dormidas.length
           + '</b> subcontrata(s) sin contrato o sin libro que no pisan la obra desde hace '
           + 'más de un mes. No corre prisa: es una lista por limpiar. '
           + '<button type="button" class="psc-mas">'
           + (verDormidas ? 'ocultar' : 'ver cuáles son') + '</button>';
      if (verDormidas) for (var s = 0; s < dormidas.length; s++) html += filaEmpresa(dormidas[s]);
      html += '</div>';
    }

    h.innerHTML = html;
    enganchar(h);
  }

  function enganchar(h) {
    var mas = h.querySelectorAll('.psc-mas');
    for (var j = 0; j < mas.length; j++) {
      mas[j].onclick = function () {
        verDormidas = !verDormidas;
        revisar(true);
      };
    }
  }

  function revisar(forzar) {
    var h = hueco();
    if (!h) return;
    var obraId = obraActiva();
    if (!obraId) return;
    if (!forzar && obraEnCurso === obraId && h.getAttribute('data-listo') === '1') return;
    obraEnCurso = obraId;

    var c = sb();
    if (!c) return;

    c.rpc('papeles_subcontratas_obra', { p_obra_id: obraId }).then(function (r) {
      if (obraId !== obraEnCurso) return;      // cambió de obra mientras llegaba
      h.setAttribute('data-listo', '1');
      estilos();
      if (r.error) {
        // 🔴 Un fallo de lectura NUNCA se pinta como un cero.
        h.innerHTML = '<div class="psc psc-gris">❔ No se ha podido comprobar el contrato y el libro '
          + 'de las subcontratas de tu obra. Esto no significa que esté todo en regla: significa '
          + 'que no se sabe. Recarga la página.</div>';
        return;
      }
      var d = r.data || {};
      if (!d.ok) { h.innerHTML = ''; return; }
      pintar(d, h);
    }).catch(function (e) {
      console.warn('[papeles-subcontratas] no se ha podido comprobar:', e);
    });
  }

  function iniciar() {
    try {
      var ruta = window.location.pathname;
      if (ruta.indexOf('/jefe/') === -1) return;
      var pagina = ruta.split('/').pop() || '';
      if (pagina !== 'index.html' && pagina !== '') return;
      revisar(true);
      var sel = document.getElementById('selector-obra');
      if (sel) sel.addEventListener('change', function () {
        verDormidas = false;
        setTimeout(function () { revisar(true); }, 0);
      });
    } catch (e) {
      console.warn('[papeles-subcontratas] no se ha podido montar:', e);
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

  window.PapelesSubcontratas = { revisar: revisar };
})();
