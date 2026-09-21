/* ============================================================
   js/ausentes-ecoordina.js — EL AVISO DEL JEFE, unificado
   ------------------------------------------------------------
   21/9/2026. Sustituye a dos banners que el 20/9 salieron a la vez desde
   dos conversaciones distintas y que el lunes 21 enseñaron LOS MISMOS
   SIETE NOMBRES en dos sitios de la misma pantalla:
     · el de «quién ha desaparecido de e-Coordina» (este archivo, v1)
     · el de «a quién se le acaba el plazo» (js/aviso-sin-comprobar.js)

   Eran dos preguntas distintas —una mira al pasado, la otra al futuro—
   pero el jefe no trabaja por causas, trabaja por personas: su pregunta
   cada mañana es «¿de quién me tengo que ocupar hoy?». Así que ahora es
   UNA línea por persona con toda su historia.

   🔴 SE UNIFICA LA PANTALLA, NO LA LÓGICA. Las dos reglas siguen siendo
   dos en la base de datos, cada una con su motivo escrito y su registro.
   Si mañana cambia el plazo de dos días, se toca una sola cosa
   (`naranja_fecha_limite`) y este archivo ni se entera.

   LA FECHA DE CIERRE LA CALCULA LA BASE DE DATOS, no este módulo. La
   versión anterior del otro banner la calculaba en JavaScript y su propio
   comentario avisaba: «MISMA REGLA EN DOS SITIOS». Ahora la RPC
   `avisos_documentales_obra` la devuelve ya hecha, con la misma receta
   que usa el cron para cerrar la puerta. No pueden divergir.

   EL VISTO (pedido por Dani)
   El jefe puede dar por vista a una persona y deja de gritarle. Pero:
     · es POR PERSONA, no del banner entero: si mañana desaparece otro,
       el aviso vuelve a salir con el nuevo;
     · queda firmado (quién y cuándo);
     · no desaparece, se repliega a una línea gris;
     · 🔴 **deja de silenciar cuando queda un día o menos para el cierre**.
       Dar por enterado no puede hacer que te quedes sin un oficial el
       jueves por la mañana sin previo aviso;
     · si la persona vuelve a e-Coordina y más tarde vuelve a desaparecer,
       el visto viejo no vale: es otra causa y se avisa de cero.

   LO QUE NO SE MEZCLA: los que van a la obra (fichaje en 30 días) se
   LISTAN; los que no fichan desde hace más de un mes se CUENTAN. En
   Escola eran 41 y ninguno había pisado la obra: mezclarlos hace que a la
   tercera mañana nadie mire el banner.

   SE AVISA POR ESTAR SIN REVISAR, NO SOLO POR ESTAR MARCADO. Además de
   los que las dos detecciones marcan, entra quien esté FICHANDO con un
   dictamen de e-Coordina de más de 15 días (o sin ninguno), lo haya
   marcado algo o no. Si un día la detección falla, el banner no se queda
   callado. Nació del caso CHAABAN: fichaba a diario en Muralla con el
   dictamen del 08/06 porque su empresa lo tenía de alta en el centro de
   OTRA obra.

   Y SE ENSEÑA LA FECHA DEL DATO, no la de la detección: «último dato de
   e-Coordina: 08/06 (hace 105 días)». Decir «desaparecido desde el 21/09»
   cuando ese día fue solo cuando nos dimos cuenta es engañar con la verdad.

   SI NO SE PUEDE COMPROBAR, LO DICE. Un banner vacío puede significar «no
   hay nadie» o «no se ha podido mirar», y no se pintan igual.

   CANDADO: solo en /jefe/ y solo en Presencia.
   PARA DESHACERLO: quitar `cargar('ausentes-ecoordina.js')` de
   js/marca-portium.js y volver a encender `aviso-sin-comprobar.js`, que
   sigue en el repo.
   ============================================================ */
(function () {
  'use strict';

  var SUPABASE_URL = 'https://istrnsicleopzbsrapsw.supabase.co';
  var SUPABASE_ANON_KEY = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6ImlzdHJuc2ljbGVvcHpic3JhcHN3Iiwicm9sZSI6ImFub24iLCJpYXQiOjE3NzU4MTIxMTYsImV4cCI6MjA5MTM4ODExNn0.5UXV2LWPXmbfLI7rKpZSG9YBzZsesjckHnhQabA0mTY';

  var RE_UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
  var DIAS = ['domingo', 'lunes', 'martes', 'miércoles', 'jueves', 'viernes', 'sábado'];
  var cliente = null;
  var obraEnCurso = null;
  var verAntiguos = false;
  var verVistos = false;

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

  // «hoy» / «mañana» / «el jueves 24/9». Los días los cuenta la BD; aquí
  // solo se ponen en castellano.
  function cuando(iso, dias) {
    if (dias === null || dias === undefined) return null;
    if (dias <= 0) return 'hoy';
    if (dias === 1) return 'mañana';
    var p = String(iso).slice(0, 10).split('-');
    if (p.length !== 3) return null;
    var d = new Date(Number(p[0]), Number(p[1]) - 1, Number(p[2]), 12, 0, 0);
    return 'el ' + DIAS[d.getDay()] + ' ' + d.getDate() + '/' + (d.getMonth() + 1);
  }

  function estilos() {
    if (document.getElementById('aec-css')) return;
    var s = document.createElement('style');
    s.id = 'aec-css';
    s.textContent = [
      '#ausentes-ecoordina{margin:0 0 14px}',
      '#ausentes-ecoordina .aec{padding:12px 16px;border-radius:10px;font-size:13px;line-height:1.5;margin-bottom:10px}',
      '#ausentes-ecoordina .aec-rojo{background:rgba(226,75,74,0.12);color:var(--rojo,#e24b4a);border:1px solid rgba(226,75,74,0.4)}',
      '#ausentes-ecoordina .aec-naranja{background:rgba(255,152,0,0.12);color:var(--naranja,#e0a020);border:1px solid rgba(255,152,0,0.4)}',
      '#ausentes-ecoordina .aec-gris{background:rgba(139,144,158,0.12);color:var(--texto2,#9aa4b2);border:1px solid rgba(139,144,158,0.35)}',
      '#ausentes-ecoordina b{font-weight:700}',
      '#ausentes-ecoordina .aec-fila{display:flex;gap:10px;align-items:flex-start;margin-top:9px;padding-top:9px;border-top:1px solid rgba(255,255,255,0.08)}',
      '#ausentes-ecoordina .aec-txt{flex:1;min-width:0}',
      '#ausentes-ecoordina .aec-donde{opacity:.85;font-weight:400}',
      '#ausentes-ecoordina .aec-porque{opacity:.9;font-weight:400;display:block}',
      '#ausentes-ecoordina .aec-plazo{font-weight:700}',
      '#ausentes-ecoordina .aec-ya{color:var(--rojo,#e24b4a);font-weight:700}',
      '#ausentes-ecoordina .aec-visto{flex:0 0 auto;background:none;border:1px solid currentColor;',
      'color:inherit;font-family:inherit;font-size:12px;padding:4px 10px;border-radius:7px;cursor:pointer;opacity:.75}',
      '#ausentes-ecoordina .aec-visto:hover{opacity:1}',
      '#ausentes-ecoordina .aec-visto[disabled]{opacity:.4;cursor:wait}',
      '#ausentes-ecoordina .aec-mas{background:none;border:0;color:inherit;font-family:inherit;',
      'font-size:12px;text-decoration:underline;cursor:pointer;padding:0;opacity:.85}',
      '#ausentes-ecoordina .aec-pie{margin-top:9px;opacity:.85;font-size:12px;font-weight:400}'
    ].join('');
    document.head.appendChild(s);
  }

  function hueco() {
    var h = document.getElementById('ausentes-ecoordina');
    if (h) return h;
    h = document.createElement('div');
    h.id = 'ausentes-ecoordina';
    var tb = document.querySelector('.topbar');
    if (tb && tb.parentNode) tb.parentNode.insertBefore(h, tb.nextSibling);
    else {
      var main = document.querySelector('.main');
      if (!main) return null;
      main.insertBefore(h, main.firstChild);
    }
    return h;
  }

  // La antigüedad del DATO, no la de la detección. El caso que lo motivó:
  // un hombre fichando a diario con el dictamen de e-Coordina del 08/06. El
  // banner decía «ya no aparece desde el 21/09», que es cuando lo detectamos,
  // y la verdad era «su último dato es de hace 105 días».
  function antiguedad(p) {
    if (p.dias_dictamen === null || p.dias_dictamen === undefined) {
      return 'e-Coordina no ha dicho nunca nada de esta persona en esta obra';
    }
    if (p.dias_dictamen <= 1) return null;          // al día: no hace falta decirlo
    return 'último dato de e-Coordina: ' + fecha(p.dictamen) + ' (hace ' + p.dias_dictamen + ' días)';
  }

  function porque(p) {
    if (p.solo_sin_revisar) return 'está fichando y nadie ha revisado su documentación';
    if (p.ausente) return 'ya no aparece en e-Coordina';
    if (p.sin_comprobar) return 'nadie ha comprobado su documentación';
    return 'pendiente de comprobar';
  }

  function filaPersona(p, conVisto) {
    var plazo = '';
    if (p.ya_en_rojo) {
      plazo = '<span class="aec-ya">ya no puede entrar</span>';
    } else {
      var t = cuando(p.fecha_limite, p.dias_para_limite);
      if (t) plazo = '<span class="aec-plazo">deja de entrar ' + esc(t) + '</span>';
    }

    var visto = conVisto
      ? '<button type="button" class="aec-visto" data-tr="' + esc(p.trabajador_id) + '" data-v="1">✔ visto</button>'
      : '<button type="button" class="aec-visto" data-tr="' + esc(p.trabajador_id) + '" data-v="0">volver a avisar</button>';

    return '<div class="aec-fila"><div class="aec-txt">'
      + '<b>' + esc(p.nombre) + '</b> <span class="aec-donde">(' + esc(p.empresa) + ')'
      + (p.ultimo_fichaje ? ' — último fichaje ' + fecha(p.ultimo_fichaje) : ' — sin fichajes')
      + '</span>'
      + '<span class="aec-porque">' + esc(porque(p)) + (plazo ? ' · ' : '') + plazo + '</span>'
      + (antiguedad(p) ? '<span class="aec-porque">' + esc(antiguedad(p)) + '</span>' : '')
      + '</div>' + visto + '</div>';
  }

  function pintar(d, h) {
    estilos();

    // 🔴 Con la obra PAUSADA no se calla del todo. El cron que cierra la
    // puerta recorre también las obras pausadas, así que el reloj corre con la
    // obra parada: callar aquí significaría encontrarse gente en rojo al
    // reanudar sin haber visto nunca el aviso. Lo que sí se calla son los
    // avisos de sincronización, que la RPC ya no manda en ese caso.
    var personas = d.personas || [];
    var urgentes = [], antiguos = [], vistos = [];
    for (var i = 0; i < personas.length; i++) {
      var p = personas[i];
      // «Va a la obra» lo decide la BD con la fecha de Madrid: aquí no se
      // vuelve a calcular, que es como se acaba teniendo dos cuentas.
      if (p.silenciado) vistos.push(p);
      else if (p.va_a_la_obra) urgentes.push(p);
      else antiguos.push(p);
    }

    var html = '';

    // Los avisos sobre la sincronización solo tienen sentido si la obra está
    // en marcha. Con la obra pausada la RPC no manda esos datos, y no mandarlos
    // NO significa «nunca se ha comprobado»: significa que no toca mirarlo.
    if (d.obra_pausada) {
      // nada que decir de la sincronización
    } else if (d.sospecha_sync) {
      html += '<div class="aec aec-gris">⚠️ <b>La última sincronización con e-Coordina no es de fiar.</b><br>'
           + esc(d.sospecha_sync) + '<div class="aec-pie">Por eso no se ha cambiado el color de nadie.</div></div>';
    } else if (d.dias_sin_sincronizar === null || d.dias_sin_sincronizar === undefined) {
      html += '<div class="aec aec-gris">❔ e-Coordina no ha comprobado nunca la documentación de esta obra.</div>';
    } else if (d.dias_sin_sincronizar >= 3) {
      html += '<div class="aec aec-gris">❔ <b>La documentación no se comprueba desde hace '
           + d.dias_sin_sincronizar + ' días.</b> El semáforo enseña lo de entonces, no lo de hoy.</div>';
    }

    if (urgentes.length) {
      var hayRojos = false;
      for (var k = 0; k < urgentes.length; k++) if (urgentes[k].ya_en_rojo) hayRojos = true;
      html += '<div class="aec ' + (hayRojos ? 'aec-rojo' : 'aec-naranja') + '">'
           + (hayRojos ? '🚫 ' : '🚪 ') + '<b>'
           + (urgentes.length === 1
               ? 'Una persona de tu obra necesita que hagas algo'
               : urgentes.length + ' personas de tu obra necesitan que hagas algo')
           + '</b>';
      for (var u = 0; u < urgentes.length; u++) html += filaPersona(urgentes[u], true);
      html += '<div class="aec-pie">Para arreglarlo, que su empresa los dé de alta en e-Coordina '
           +  'en el centro de ESTA obra: estar de alta en otra no vale. '
           +  (d.obra_pausada
               ? 'La obra está pausada, pero el plazo sigue corriendo: al reanudarla te los encontrarías cerrados.'
               : 'Mientras tanto pasan la valla con aviso; cuando se acabe el plazo, no.')
           +  '</div></div>';
    }

    if (antiguos.length) {
      html += '<div class="aec aec-gris">🧹 Además hay <b>' + antiguos.length
           + '</b> persona(s) asignada(s) a esta obra que no fichan desde hace más de un mes y que '
           + 'e-Coordina ya no reconoce. No es un peligro: es una lista por limpiar. '
           + '<button type="button" class="aec-mas" data-mas="antiguos">'
           + (verAntiguos ? 'ocultar' : 'ver quiénes son') + '</button>';
      if (verAntiguos) for (var a = 0; a < antiguos.length; a++) html += filaPersona(antiguos[a], true);
      html += '</div>';
    }

    if (vistos.length) {
      html += '<div class="aec aec-gris">✔ <b>' + vistos.length + '</b> que ya diste por vista(s). '
           + '<button type="button" class="aec-mas" data-mas="vistos">'
           + (verVistos ? 'ocultar' : 'ver') + '</button>'
           + '<div class="aec-pie">Volverán a avisarte el día antes de que se les cierre la puerta.</div>';
      if (verVistos) for (var s = 0; s < vistos.length; s++) html += filaPersona(vistos[s], false);
      html += '</div>';
    }

    h.innerHTML = html;
    enganchar(h);
  }

  function enganchar(h) {
    var botones = h.querySelectorAll('.aec-visto');
    for (var i = 0; i < botones.length; i++) {
      botones[i].onclick = function () {
        var b = this;
        var c = sb();
        if (!c) return;
        b.disabled = true;
        c.rpc('marcar_aviso_visto', {
          p_trabajador_id: b.getAttribute('data-tr'),
          p_obra_id: obraEnCurso,
          p_visto: b.getAttribute('data-v') === '1'
        }).then(function (r) {
          if (r.error) { b.disabled = false; alert('No se ha podido guardar: ' + r.error.message); return; }
          revisar(true);
        }).catch(function () { b.disabled = false; });
      };
    }
    var mas = h.querySelectorAll('.aec-mas');
    for (var j = 0; j < mas.length; j++) {
      mas[j].onclick = function () {
        if (this.getAttribute('data-mas') === 'antiguos') verAntiguos = !verAntiguos;
        else verVistos = !verVistos;
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

    c.rpc('avisos_documentales_obra', { p_obra_id: obraId }).then(function (r) {
      if (obraId !== obraEnCurso) return;       // cambió de obra mientras llegaba
      h.setAttribute('data-listo', '1');
      estilos();
      if (r.error) {
        h.innerHTML = '<div class="aec aec-gris">❔ No se ha podido comprobar la documentación de tu obra. '
          + 'Esto no significa que esté todo bien: significa que no se sabe. Recarga la página.</div>';
        return;
      }
      var d = r.data || {};
      if (!d.ok) { h.innerHTML = ''; return; }
      pintar(d, h);
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
      revisar(true);
      var sel = document.getElementById('selector-obra');
      if (sel) sel.addEventListener('change', function () {
        verAntiguos = false; verVistos = false;
        setTimeout(function () { revisar(true); }, 0);
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
