/* ============================================================
   js/aviso-sin-comprobar.js — El reloj del naranja, en la portada del jefe
   ------------------------------------------------------------
   20/9/2026. Origen: «¿qué pasa si tengo una empresa sin e-Coordina que
   va a venir a trabajar?», pensando en una obra donde Dani no esté.

   EL PROBLEMA QUE CIERRA. El naranja PASA la valla («acceso permitido
   con aviso»). Había dos naranjas que no los respaldaba nadie y que no
   caducaban nunca:
     · el alta manual de una subcontrata (nadie ha mirado un papel), y
     · quien desaparece del Excel de e-Coordina (ya nadie lo mira).
   Desde hoy la base de datos los pasa a ROJO a los 2 días LABORABLES
   (cron `reloj_naranja_diario`). Pero un rojo que llega de madrugada sin
   aviso previo es una emboscada: el jefe se lo encuentra con la gente en
   la puerta y su única salida es forzar colores, que es justo el hábito
   que todo esto quiere quitar. Este módulo le enseña el reloj ANTES de
   que suene.

   AUTÓNOMO, como los demás módulos de la casa: crea su HTML y su CSS y
   no depende de nada. Si no puede saber la obra, o la consulta falla, NO
   se inventa un «todo bien»: o no dice nada, o dice que no ha podido
   comprobarlo. Callar es indistinguible de dar el visto bueno.

   SOLO EN LA PORTADA (`jefe/index.html`). Se carga desde
   js/marca-portium.js, que las nueve pantallas del jefe ya piden, pero
   el candado de abajo lo apaga en las otras ocho: un aviso repetido en
   nueve pantallas deja de leerse.

   🔴 MISMA REGLA EN DOS SITIOS. El «2 días laborables» y la cuenta de
   días vive también dentro de `caducar_naranjas_sin_comprobar()` en
   Postgres (constante `c_margen`). Si se cambia el margen, hay que
   cambiarlo en LOS DOS o la pantalla prometerá un día que la base de
   datos no respeta. Aquí solo se ANUNCIA; quien decide el color es
   siempre la base de datos.

   PARA DESHACERLO: borrar la línea que lo carga en js/marca-portium.js.
   Nada más depende de él.
   ============================================================ */

(function () {
  'use strict';

  var SUPABASE_URL = 'https://istrnsicleopzbsrapsw.supabase.co';
  var SUPABASE_ANON_KEY = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6ImlzdHJuc2ljbGVvcHpic3JhcHN3Iiwicm9sZSI6ImFub24iLCJpYXQiOjE3NzU4MTIxMTYsImV4cCI6MjA5MTM4ODExNn0.5UXV2LWPXmbfLI7rKpZSG9YBzZsesjckHnhQabA0mTY';

  // El mismo número que la constante `c_margen` de
  // caducar_naranjas_sin_comprobar(). Ver el aviso de arriba.
  var MARGEN_LABORABLES = 2;

  var ID = 'banner-sin-comprobar';
  var RE_UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
  var DIAS = ['domingo', 'lunes', 'martes', 'miércoles', 'jueves', 'viernes', 'sábado'];
  var cliente = null;
  var ultimaObra = null;

  var CSS =
    '#' + ID + '{border-radius:10px;padding:13px 18px;margin-bottom:20px;font-size:14px;line-height:1.5}'
  + '#' + ID + '.oculto{display:none}'
  + '#' + ID + '.amarillo{background:rgba(255,152,0,0.1);border:1px solid rgba(255,152,0,0.45);color:var(--naranja,#ff9800)}'
  + '#' + ID + '.rojo{background:rgba(244,67,54,0.08);border:1px solid rgba(244,67,54,0.4);color:var(--rojo,#f44336)}'
  + '#' + ID + '.gris{background:rgba(139,144,158,0.1);border:1px solid rgba(139,144,158,0.4);color:var(--texto2,#8b909e)}'
  + '#' + ID + ' ul{list-style:none;margin:6px 0 0 0;padding:0;font-size:13px}'
  + '#' + ID + ' li{margin-bottom:4px}'
  + '#' + ID + ' .quien{font-weight:700}'
  + '#' + ID + ' .cuando{opacity:0.85}'
  + '#' + ID + ' a{color:inherit;text-decoration:underline}';

  function esc(t) {
    return String(t == null ? '' : t)
      .replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;')
      .replace(/"/g, '&quot;').replace(/'/g, '&#39;');
  }

  function ponerCss() {
    if (document.getElementById('css-' + ID)) return;
    var s = document.createElement('style');
    s.id = 'css-' + ID;
    s.textContent = CSS;
    document.head.appendChild(s);
  }

  // El hueco se crea una sola vez, justo debajo del último banner de la
  // portada. Si esos banners cambiasen de nombre, cae al principio del
  // contenedor: preferimos verlo fuera de sitio a no verlo.
  function hueco() {
    var ya = document.getElementById(ID);
    if (ya) return ya;
    var div = document.createElement('div');
    div.id = ID;
    div.className = 'oculto';
    var ancla = document.getElementById('banner-cierres')
             || document.getElementById('banner-hab-caducidad')
             || document.getElementById('banner-ronda');
    if (ancla && ancla.parentNode) ancla.parentNode.insertBefore(div, ancla.nextSibling);
    else {
      var cont = document.querySelector('.contenido') || document.body;
      cont.insertBefore(div, cont.firstChild);
    }
    return div;
  }

  function obraActiva() {
    try {
      var u = new URLSearchParams(window.location.search).get('obra');
      if (u && RE_UUID.test(u)) return u;
    } catch (_) {}
    try {
      var g = localStorage.getItem('jefe_obra_activa_id');
      if (g && RE_UUID.test(g)) return g;
    } catch (_) {}
    return null;
  }

  function sb() {
    if (cliente) return cliente;
    if (!window.supabase || !window.supabase.createClient) return null;
    cliente = window.supabase.createClient(SUPABASE_URL, SUPABASE_ANON_KEY);
    return cliente;
  }

  // Fecha de hoy en Madrid, como texto AAAA-MM-DD. Nunca toISOString():
  // en verano devuelve el día de ayer a partir de las 22:00.
  function hoyMadrid() {
    var f = new Date().toLocaleDateString('en-CA', { timeZone: 'Europe/Madrid' });
    return f;
  }

  function aFecha(iso) {
    var p = String(iso || '').slice(0, 10).split('-');
    return new Date(Number(p[0]), Number(p[1]) - 1, Number(p[2]), 12, 0, 0);
  }

  function esLaborable(d) {
    var n = d.getDay();
    return n >= 1 && n <= 5;
  }

  // Días laborables transcurridos DESDE el día siguiente al del alta hasta
  // `hasta`, los dos incluidos. Réplica exacta de la cuenta que hace
  // caducar_naranjas_sin_comprobar() con generate_series + isodow <= 5.
  function laborablesTranscurridos(desdeISO, hasta) {
    var d = aFecha(desdeISO);
    d.setDate(d.getDate() + 1);
    var n = 0;
    var tope = 0;
    while (d <= hasta && tope < 400) {
      if (esLaborable(d)) n++;
      d.setDate(d.getDate() + 1);
      tope++;
    }
    return n;
  }

  // El primer día en que la base de datos lo pondrá en rojo: aquel en que
  // los laborables transcurridos pasan de MARGEN_LABORABLES.
  function diaDelRojo(desdeISO) {
    var d = aFecha(hoyMadrid());
    var tope = 0;
    while (tope < 400) {
      if (laborablesTranscurridos(desdeISO, d) > MARGEN_LABORABLES) return d;
      d.setDate(d.getDate() + 1);
      tope++;
    }
    return null;
  }

  function textoDia(d) {
    if (!d) return 'pronto';
    var hoy = aFecha(hoyMadrid());
    var dif = Math.round((d - hoy) / 86400000);
    if (dif <= 0) return 'hoy';
    if (dif === 1) return 'mañana';
    return 'el ' + DIAS[d.getDay()] + ' ' + d.getDate() + '/' + (d.getMonth() + 1);
  }

  function nombreDe(fila) {
    var t = fila.trabajador || {};
    var n = ((t.nombre || '') + ' ' + (t.apellidos || '')).trim();
    return n || 'Sin nombre';
  }

  function empresaDe(fila) {
    var t = fila.trabajador || {};
    var e = t.empresa || {};
    return e.nombre || '';
  }

  function pintar(filas) {
    var el = hueco();
    var rojos = [], avisos = [];

    (filas || []).forEach(function (f) {
      if (f.estado_forzado === true) return;   // el forzado manda y tiene su propio reloj
      if (f.estado === 'rojo') { rojos.push(f); return; }
      if (f.estado === 'naranja') avisos.push(f);
    });

    if (!rojos.length && !avisos.length) {
      el.className = 'oculto';
      el.innerHTML = '';
      return;
    }

    var html = '';

    if (rojos.length) {
      html += '<div><strong>🚫 ' + rojos.length + (rojos.length === 1
        ? ' persona ya no puede entrar' : ' personas ya no pueden entrar')
        + ': nadie comprobó su documentación a tiempo.</strong></div><ul>'
        + rojos.map(function (f) {
            return '<li><span class="quien">' + esc(nombreDe(f)) + '</span>'
                 + (empresaDe(f) ? ' · ' + esc(empresaDe(f)) : '')
                 + '</li>';
          }).join('') + '</ul>';
    }

    if (avisos.length) {
      // Se agrupan por el día en que les toca, que es lo que el jefe
      // necesita saber para decidir a quién llama primero.
      var lineas = avisos.map(function (f) {
        var d = diaDelRojo(f.sin_comprobar_desde);
        return { f: f, d: d, orden: d ? d.getTime() : 0 };
      }).sort(function (a, b) { return a.orden - b.orden; });

      html += (html ? '<div style="margin-top:10px"></div>' : '')
        + '<div><strong>⏳ ' + avisos.length + (avisos.length === 1
          ? ' persona se queda sin poder entrar' : ' personas se quedan sin poder entrar')
        + ' si nadie comprueba su documentación.</strong></div><ul>'
        + lineas.map(function (x) {
            return '<li><span class="quien">' + esc(nombreDe(x.f)) + '</span>'
                 + (empresaDe(x.f) ? ' · ' + esc(empresaDe(x.f)) : '')
                 + ' <span class="cuando">— deja de entrar ' + esc(textoDia(x.d)) + '</span></li>';
          }).join('') + '</ul>';
    }

    html += '<div style="margin-top:8px"><a href="trabajadores.html">Ver y resolver en Trabajadores →</a></div>';

    el.className = rojos.length ? 'rojo' : 'amarillo';
    el.innerHTML = html;
  }

  // Un vigilante que no puede mirar, lo dice. Nunca se pinta un fallo de
  // lectura como «no hay nadie pendiente».
  function pintarFallo() {
    var el = hueco();
    el.className = 'gris';
    el.innerHTML = '⚠ No se ha podido comprobar si hay documentación sin revisar. '
      + 'Esto NO significa que no la haya: vuelve a cargar la página o míralo en '
      + '<a href="trabajadores.html">Trabajadores</a>.';
  }

  function revisar() {
    var obraId = obraActiva();
    if (!obraId) return;                 // sin obra no se dice nada: no hay de qué informar
    var c = sb();
    if (!c) return;
    ultimaObra = obraId;

    c.from('validaciones_obra')
      .select('trabajador_id, estado, estado_forzado, sin_comprobar_desde, trabajador:trabajador_id(nombre, apellidos, empresa:empresa_id(nombre))')
      .eq('obra_id', obraId)
      .not('sin_comprobar_desde', 'is', null)
      .in('estado', ['naranja', 'rojo'])
      .then(function (r) {
        if (!r || r.error) { pintarFallo(); return; }
        if (obraId !== ultimaObra) return;   // cambió de obra mientras llegaba
        pintar(r.data || []);
      })
      .catch(function (e) {
        console.warn('[aviso-sin-comprobar]', e);
        pintarFallo();
      });
  }

  function iniciar() {
    try {
      var ruta = window.location.pathname;
      if (ruta.indexOf('/jefe/') === -1) return;
      var pagina = ruta.split('/').pop() || '';
      if (pagina !== '' && pagina !== 'index.html') return;   // solo la portada

      ponerCss();

      // La obra la elige la propia pantalla al cargar sus datos, que puede
      // tardar; y el jefe puede cambiarla con el selector.
      document.addEventListener('change', function (ev) {
        if (ev.target && ev.target.tagName === 'SELECT') revisar();
      });

      revisar();
      setTimeout(revisar, 1200);
      setTimeout(revisar, 3000);
    } catch (e) {
      console.warn('[aviso-sin-comprobar]:', e);
    }
  }

  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', iniciar);
  else iniciar();
})();
