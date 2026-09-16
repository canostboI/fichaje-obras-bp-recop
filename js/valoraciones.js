/* ============================================================
   js/valoraciones.js — Valoraciones de operarios (1-5 estrellas)
   ------------------------------------------------------------
   101ª (16/9/2026). La lógica vive AQUÍ; cada panel tiene su
   pantalla fina con su propio aspecto:
     jefe/valoraciones.html · admin/valoraciones.html ·
     encargado/valoraciones.html
   (valoraciones.html de la raíz solo desvía según el rol).

   · «Valorar»: gente de la obra, AGRUPADA POR EMPRESA (Dani, 16/9);
     subcontratas por orden alfabético, «Sin empresa» y el personal
     propio al final. Dentro, primero quien ha fichado hace poco.
   · «Ranking por empresa»: solo jefe de obra y admin. La BD lo
     vuelve a comprobar (ranking_valoraciones).
   Reglas en la BD, no aquí: 1-2 estrellas exigen motivo; quién ve
   qué lo decide puedo_ver_valoraciones(). No bloquea la valla.

   AUTÓNOMO: crea su HTML y su CSS. Los colores salen de variables
   con respaldo (--val-*), que cada pantalla define según su tema.
   Nunca `var(--x)` sin respaldo (trampa 86ª).

   Depende de: js/foto-identidad.js (FI). Opcional: js/branding.js.

   Uso:
     Valoraciones.iniciar(sb, usuario, {
       hueco: document.getElementById('valoraciones'),
       claveObra: 'jefe_obra_activa_id',
       ranking: true,
       alCambiarObra: function (obra) { ... }   // opcional
     });
   ============================================================ */

(function () {
  'use strict';

  var CSS =
    '.val-tabs{display:flex;gap:8px;margin-bottom:14px}'
  + '.val-tab{flex:1;padding:10px;border:1px solid var(--val-borde,#ddd);border-radius:8px;background:var(--val-tab,#e9ebee);color:var(--val-texto2,#555);font-size:14px;font-family:inherit;cursor:pointer}'
  + '.val-tab.on{background:var(--val-tab-on,#1a1a1a);color:var(--val-tab-on-texto,#fff);font-weight:600}'
  + '.val-barra{display:flex;gap:10px;flex-wrap:wrap;align-items:center;margin-bottom:10px}'
  + '.val-barra select,.val-barra input[type=search]{flex:1;min-width:180px;padding:9px 12px;border:1px solid var(--val-borde,#ccc);border-radius:8px;font-size:14px;font-family:inherit;background:var(--val-input,#fff);color:var(--val-texto,#222)}'
  + '.val-chk{display:inline-flex;align-items:center;gap:6px;font-size:13px;color:var(--val-texto2,#555);cursor:pointer;white-space:nowrap}'
  + '.val-chk input{margin:0;width:16px;height:16px}'
  + '.val-info{font-size:12.5px;color:var(--val-texto2,#666);margin:0 0 12px;line-height:1.4}'
  + '.val-grupo{display:flex;justify-content:space-between;font-size:11px;font-weight:700;letter-spacing:.5px;color:var(--val-texto2,#555);text-transform:uppercase;margin:18px 2px 6px}'
  + '.val-fila{display:flex;align-items:center;gap:12px;background:var(--val-card,#fff);border:1px solid var(--val-borde,#e6e8eb);border-radius:10px;padding:8px 12px;margin-bottom:6px;cursor:pointer}'
  + '.val-fila:hover{border-color:var(--val-hover,#999)}'
  + '.val-cara{width:48px;height:48px;border-radius:50%;flex:0 0 auto;background:var(--val-cara,#d9dce1);color:var(--val-texto2,#555);display:flex;align-items:center;justify-content:center;font-weight:700;overflow:hidden}'
  + '.val-cara img{width:100%;height:100%;object-fit:cover}'
  + '.val-datos{flex:1;min-width:0}'
  + '.val-nombre{font-weight:600;font-size:14.5px;color:var(--val-texto,#222)}'
  + '.val-sub{font-size:12.5px;color:var(--val-texto2,#777);white-space:nowrap;overflow:hidden;text-overflow:ellipsis}'
  + '.val-baja{font-size:12.5px;color:#e57373;margin-top:2px}'
  + '.val-punt{text-align:right;flex:0 0 auto}'
  + '.val-estr{color:#f5a623;font-size:15px;letter-spacing:1px;white-space:nowrap}'
  + '.val-estr .v{color:var(--val-estr-vacia,#c9ccd1)}'
  + '.val-cuenta{font-size:11.5px;color:var(--val-texto2,#888)}'
  + '.val-mia{font-size:11.5px;color:#4caf50}'
  + '.val-vacio{text-align:center;color:var(--val-texto2,#777);padding:2rem 1rem}'
  + '.val-err{background:#fdecea;color:#b71c1c;padding:10px;border-radius:8px}'
  + '.val-modal{position:fixed;inset:0;background:rgba(0,0,0,.6);display:flex;align-items:flex-start;justify-content:center;z-index:900;overflow-y:auto;padding:16px 10px}'
  + '.val-ficha{background:var(--val-modal,#fff);color:var(--val-texto,#222);border:1px solid var(--val-borde,#ddd);border-radius:12px;width:100%;max-width:440px;padding:16px}'
  + '.val-foto{width:100%;aspect-ratio:1/1;border-radius:10px;background:var(--val-foto,#e6e8eb);display:flex;align-items:center;justify-content:center;color:var(--val-texto2,#888);overflow:hidden;margin-bottom:10px}'
  + '.val-foto img{width:100%;height:100%;object-fit:cover}'
  + '.val-ficha h2{font-size:18px;margin:0}'
  + '.val-ficha h3{font-size:13px;margin:16px 0 6px;color:var(--val-texto2,#555);text-transform:uppercase;letter-spacing:.5px}'
  + '.val-votar{display:flex;gap:4px;justify-content:center;margin:4px 0}'
  + '.val-votar button{font-size:36px;background:none;border:0;cursor:pointer;color:var(--val-estr-vacia,#c9ccd1);padding:0 2px;line-height:1}'
  + '.val-votar button.on{color:#f5a623}'
  + '.val-ficha textarea{width:100%;min-height:70px;padding:8px;border:1px solid var(--val-borde,#ccc);border-radius:8px;font-family:inherit;font-size:14px;background:var(--val-input,#fff);color:var(--val-texto,#222)}'
  + '.val-aviso{font-size:12.5px;color:var(--val-texto2,#777);margin:4px 0}'
  + '.val-btns{display:flex;gap:8px;margin-top:10px}'
  + '.val-btns button{flex:1;padding:10px;border:0;border-radius:8px;font-size:14px;font-family:inherit;cursor:pointer}'
  + '.val-sec{background:var(--val-tab,#e6e8eb);color:var(--val-texto,#333)}'
  + '.val-pri{background:var(--val-tab-on,#1a1a1a);color:var(--val-tab-on-texto,#fff)}'
  + '.val-hist{border-top:1px solid var(--val-borde,#eee);padding:8px 0;font-size:13.5px}'
  + '.val-quien{color:var(--val-texto2,#777);font-size:12px}'
  + '.val-ok{color:#4caf50}.val-ko{color:#e57373}'
  + '.val-toast{position:fixed;left:50%;bottom:20px;transform:translateX(-50%);background:#2e7d32;color:#fff;padding:11px 16px;border-radius:10px;font-size:14px;box-shadow:0 4px 14px rgba(0,0,0,.3);z-index:950;max-width:92vw;text-align:center}';

  var sb, usuario, opts, H;
  var obras = [], obraId = null, listaValorar = [], listaRanking = [], rankingCargado = false;
  var cacheFoto = new Map(), observador = null;

  function esc(t) { var d = document.createElement('div'); d.textContent = String(t == null ? '' : t); return d.innerHTML; }
  function iniciales(n) { var p = String(n || '?').trim().split(/\s+/); return ((p[0] || '?')[0] + (p[1] ? p[1][0] : '')).toUpperCase(); }
  function estrellas(n) { var r = Math.round(Number(n) || 0); return '<span class="val-estr">' + '★'.repeat(r) + '<span class="v">' + '★'.repeat(5 - r) + '</span></span>'; }
  function fecha(f) { return f ? new Date(f).toLocaleDateString('es-ES', { timeZone: 'Europe/Madrid' }) : ''; }
  function notas(n) { return n + (n == 1 ? ' nota' : ' notas'); }
  function $(id) { return H.querySelector('#' + id); }
  function fallo(id, texto) { $(id).innerHTML = '<p class="val-err">' + esc(texto) + '</p>'; }

  function avisoBreve(texto) {
    var v = document.querySelector('.val-toast'); if (v) v.remove();
    var d = document.createElement('div'); d.className = 'val-toast'; d.textContent = texto;
    document.body.appendChild(d); setTimeout(function () { d.remove(); }, 3000);
  }

  // ── Fotos: una a una y solo al verse la fila (cada una deja rastro en la BD) ──
  function urlFoto(tid) {
    if (!cacheFoto.has(tid)) cacheFoto.set(tid, FI.ver(tid).then(function (r) { return r.hay_foto ? r.url : null; }).catch(function () { return null; }));
    return cacheFoto.get(tid);
  }
  function pintarCara(el) { urlFoto(el.dataset.tid).then(function (u) { if (u) el.innerHTML = '<img src="' + esc(u) + '" alt="">'; }); }
  function vigilarCaras(cont) {
    cont.querySelectorAll('.val-cara[data-foto="1"]').forEach(function (el) { observador ? observador.observe(el) : pintarCara(el); });
  }
  function htmlCara(t) {
    return '<div class="val-cara" data-tid="' + t.trabajador_id + '" data-foto="' + (t.tiene_foto ? 1 : 0) + '">' + esc(iniciales(t.nombre)) + '</div>';
  }

  // ── Arranque ──
  async function iniciar(cliente, u, o) {
    sb = cliente; usuario = u; opts = o || {}; H = opts.hueco;
    if (!H) { console.warn('[valoraciones] falta opts.hueco'); return; }
    if (!document.getElementById('val-css')) {
      var s = document.createElement('style'); s.id = 'val-css'; s.textContent = CSS; document.head.appendChild(s);
    }
    if (typeof window.IntersectionObserver === 'function') {
      observador = new IntersectionObserver(function (ents) {
        ents.forEach(function (e) { if (!e.isIntersecting) return; observador.unobserve(e.target); pintarCara(e.target); });
      }, { rootMargin: '200px' });
    }
    FI.init(sb);

    H.innerHTML =
        (opts.ranking ? '<div class="val-tabs"><button class="val-tab on" data-t="valorar">Valorar</button><button class="val-tab" data-t="ranking">Ranking por empresa</button></div>' : '')
      + '<section id="val-v-valorar">'
      +   '<div class="val-barra"><select id="val-sel-obra" style="display:none"></select><input id="val-buscar" type="search" placeholder="Buscar por nombre o empresa"></div>'
      +   '<div class="val-barra"><label class="val-chk"><input type="checkbox" id="val-propios"> Ver también personal propio</label></div>'
      +   '<p class="val-info">Pulsa en una persona para ver su foto y ponerle nota. Cada uno pone su propia nota; si vuelves a votar, se corrige. Con 1 o 2 estrellas hay que decir el motivo.</p>'
      +   '<div id="val-lista"><p class="val-vacio">Cargando…</p></div>'
      + '</section>'
      + (opts.ranking ? '<section id="val-v-ranking" style="display:none">'
      +   '<div class="val-barra"><select id="val-sel-empresa"></select><input id="val-buscar-r" type="search" placeholder="Buscar por nombre"></div>'
      +   '<p class="val-info">Todas las obras. Solo sale quien tiene al menos una nota. Mira siempre cuántas notas tiene: una sola nota es una sola opinión.</p>'
      +   '<div id="val-ranking"><p class="val-vacio">Cargando…</p></div>'
      + '</section>' : '');

    $('val-buscar').addEventListener('input', pintarValorar);
    $('val-propios').addEventListener('change', pintarValorar);
    $('val-lista').addEventListener('click', function (e) {
      var f = e.target.closest('.val-fila'); if (!f) return;
      var t = listaValorar.find(function (x) { return x.trabajador_id === f.dataset.tid; });
      if (t) abrirFicha(t, true);
    });
    if (opts.ranking) {
      H.querySelector('.val-tabs').addEventListener('click', function (e) {
        var b = e.target.closest('.val-tab'); if (!b) return;
        H.querySelectorAll('.val-tab').forEach(function (x) { x.classList.toggle('on', x === b); });
        var r = b.dataset.t === 'ranking';
        $('val-v-valorar').style.display = r ? 'none' : '';
        $('val-v-ranking').style.display = r ? '' : 'none';
        if (r && !rankingCargado) cargarRanking();
      });
      $('val-sel-empresa').addEventListener('change', pintarRanking);
      $('val-buscar-r').addEventListener('input', pintarRanking);
      $('val-ranking').addEventListener('click', function (e) {
        var f = e.target.closest('.val-fila'); if (!f) return;
        var t = listaRanking.find(function (x) { return x.trabajador_id === f.dataset.tid; });
        if (t) abrirFicha(t, false);
      });
    }

    var res;
    if (usuario.rol === 'admin') {
      res = await sb.from('obras').select('id, nombre, estado, empresa_marca').in('estado', ['activa', 'pausada']).order('nombre');
      if (res.error) return fallo('val-lista', 'No se han podido cargar las obras. Recarga la página.');
      obras = res.data || [];
    } else {
      res = await sb.from('usuarios_obra').select('obras(id, nombre, estado, empresa_marca)').eq('usuario_app_id', usuario.id);
      if (res.error) return fallo('val-lista', 'No se han podido cargar tus obras. Recarga la página.');
      var vistas = new Set();
      obras = (res.data || []).map(function (x) { return x.obras; })
        .filter(function (ob) { if (!ob || ob.estado === 'oculta' || vistas.has(ob.id)) return false; vistas.add(ob.id); return true; });
    }
    if (!obras.length) { $('val-lista').innerHTML = '<p class="val-vacio">No tienes ninguna obra asignada.</p>'; return; }

    var sel = $('val-sel-obra');
    sel.innerHTML = obras.map(function (ob) { return '<option value="' + ob.id + '">' + esc(ob.nombre) + '</option>'; }).join('');
    if (obras.length > 1) sel.style.display = '';
    var guardada = '';
    try { guardada = localStorage.getItem(opts.claveObra) || ''; } catch (_) {}
    if (obras.some(function (ob) { return ob.id === guardada; })) sel.value = guardada;
    sel.addEventListener('change', function () { cargarObra(sel.value); });
    await cargarObra(sel.value);
  }

  async function cargarObra(id) {
    obraId = id;
    try { if (opts.claveObra) localStorage.setItem(opts.claveObra, id); } catch (_) {}
    var ob = obras.find(function (x) { return x.id === id; });
    if (typeof opts.alCambiarObra === 'function') { try { opts.alCambiarObra(ob); } catch (_) {} }
    $('val-lista').innerHTML = '<p class="val-vacio">Cargando…</p>';
    var r = await sb.rpc('trabajadores_para_valorar', { p_obra_id: id });
    if (r.error || !r.data || !r.data.ok) return fallo('val-lista', (r.data && r.data.error) || 'No se ha podido cargar la lista. Recarga la página.');
    listaValorar = r.data.lista;
    pintarValorar();
  }

  // Orden de grupos: subcontratas A-Z, «Sin empresa», personal propio.
  function claveGrupo(t) { return (t.es_propia ? '2' : (t.empresa ? '0' : '1')) + (t.empresa || '').toLocaleLowerCase('es'); }

  function pintarValorar() {
    var q = $('val-buscar').value.trim().toLowerCase();
    var propios = $('val-propios').checked;
    var cont = $('val-lista');
    var filas = listaValorar.filter(function (t) {
      return (propios || !t.es_propia) && (!q || (t.nombre || '').toLowerCase().indexOf(q) >= 0 || (t.empresa || '').toLowerCase().indexOf(q) >= 0);
    }).sort(function (a, b) {
      var g = claveGrupo(a).localeCompare(claveGrupo(b), 'es');
      return g || String(b.ultimo_fichaje || '').localeCompare(String(a.ultimo_fichaje || ''));
    });
    if (!filas.length) { cont.innerHTML = '<p class="val-vacio">Nadie que coincida.</p>'; return; }
    var cuenta = {};
    filas.forEach(function (t) { var k = claveGrupo(t); cuenta[k] = (cuenta[k] || 0) + 1; });
    var html = '', grupo = null;
    filas.forEach(function (t) {
      var k = claveGrupo(t);
      if (k !== grupo) {
        grupo = k;
        html += '<div class="val-grupo"><span>' + esc(t.empresa || 'Sin empresa') + (t.es_propia ? ' · propia' : '') + '</span><span>' + cuenta[k] + '</span></div>';
      }
      html += '<div class="val-fila" data-tid="' + t.trabajador_id + '">' + htmlCara(t)
        + '<div class="val-datos"><div class="val-nombre">' + esc(t.nombre) + '</div>'
        + '<div class="val-sub">' + esc(t.categoria || '') + (t.ultimo_fichaje ? (t.categoria ? ' · ' : '') + 'fichó ' + fecha(t.ultimo_fichaje) : '') + '</div></div>'
        + '<div class="val-punt">' + (t.total ? estrellas(t.media) + '<div class="val-cuenta">' + t.media + ' · ' + notas(t.total) + '</div>' : '<div class="val-cuenta">Sin notas</div>')
        + (t.mi_nota ? '<div class="val-mia">Tu nota: ' + t.mi_nota + '★</div>' : '') + '</div></div>';
    });
    cont.innerHTML = html;
    vigilarCaras(cont);
  }

  async function cargarRanking() {
    var r = await sb.rpc('ranking_valoraciones');
    if (r.error || !r.data || !r.data.ok) return fallo('val-ranking', (r.data && r.data.error) || 'No se ha podido cargar el ranking. Recarga la página.');
    rankingCargado = true;
    listaRanking = r.data.lista;
    var previa = $('val-sel-empresa').value;
    var empresas = Array.from(new Set(listaRanking.map(function (t) { return t.empresa || 'Sin empresa'; }))).sort(function (a, b) { return a.localeCompare(b, 'es'); });
    $('val-sel-empresa').innerHTML = '<option value="">Todas las empresas</option>' + empresas.map(function (e) { return '<option>' + esc(e) + '</option>'; }).join('');
    if (empresas.indexOf(previa) >= 0) $('val-sel-empresa').value = previa;
    pintarRanking();
  }

  function pintarRanking() {
    var emp = $('val-sel-empresa').value, q = $('val-buscar-r').value.trim().toLowerCase(), cont = $('val-ranking');
    if (!listaRanking.length) { cont.innerHTML = '<p class="val-vacio">Todavía nadie ha puesto ninguna nota.</p>'; return; }
    var filas = listaRanking.filter(function (t) { return (!emp || (t.empresa || 'Sin empresa') === emp) && (!q || (t.nombre || '').toLowerCase().indexOf(q) >= 0); });
    if (!filas.length) { cont.innerHTML = '<p class="val-vacio">Nadie que coincida.</p>'; return; }
    var html = '', grupo = null;
    filas.forEach(function (t) {
      var g = t.empresa || 'Sin empresa';
      if (g !== grupo) { grupo = g; html += '<div class="val-grupo"><span>' + esc(g) + '</span></div>'; }
      var b = t.ultima_baja;
      html += '<div class="val-fila" data-tid="' + t.trabajador_id + '">' + htmlCara(t)
        + '<div class="val-datos"><div class="val-nombre">' + esc(t.nombre) + '</div>'
        + '<div class="val-sub">' + esc(t.categoria || '') + (t.bajas ? (t.categoria ? ' · ' : '') + t.bajas + (t.bajas == 1 ? ' nota baja' : ' notas bajas') : '') + '</div>'
        + (b ? '<div class="val-baja">Última baja: ' + b.puntuacion + '★ en ' + esc(b.obra) + ' (' + fecha(b.fecha) + ') — ' + esc(b.motivo) + '</div>' : '')
        + '</div><div class="val-punt">' + estrellas(t.media) + '<div class="val-cuenta">' + t.media + ' · ' + notas(t.total) + '</div></div></div>';
    });
    cont.innerHTML = html;
    vigilarCaras(cont);
  }

  // ── Ficha: foto grande + votar (solo desde «Valorar») + historial ──
  function abrirFicha(t, conVoto) {
    var m = document.createElement('div');
    m.className = 'val-modal';
    var ob = obras.find(function (x) { return x.id === obraId; });
    m.innerHTML = '<div class="val-ficha">'
      + '<div class="val-foto" data-r="foto">' + (t.tiene_foto ? 'Cargando foto…' : 'Sin foto') + '</div>'
      + '<h2>' + esc(t.nombre) + '</h2>'
      + '<div class="val-sub">' + esc(t.empresa || 'Sin empresa') + (t.categoria ? ' · ' + esc(t.categoria) : '') + '</div>'
      + (conVoto && usuario.rol !== 'admin' && !t.tiene_foto ? '<div class="val-btns"><button class="val-sec" data-r="hacer-foto">📷 Añadir foto</button></div>' : '')
      + (conVoto ? '<h3>Tu nota en ' + esc(ob ? ob.nombre : 'esta obra') + '</h3>'
        + '<div class="val-votar" data-r="votar">' + [1, 2, 3, 4, 5].map(function (n) { return '<button data-n="' + n + '">★</button>'; }).join('') + '</div>'
        + '<p class="val-aviso" data-r="aviso">Toca las estrellas.</p>'
        + '<textarea data-r="motivo" placeholder="Motivo (obligatorio con 1 o 2 estrellas): seguridad, puntualidad, calidad del trabajo…"></textarea>'
        + '<p class="val-aviso" data-r="msg"></p>' : '')
      + '<div class="val-btns"><button class="val-sec" data-r="cerrar">Cerrar</button>'
      + (conVoto ? '<button class="val-pri" data-r="guardar">Guardar nota</button>' : '') + '</div>'
      + '<h3>Todas sus notas</h3><div data-r="hist"><p class="val-aviso">Cargando…</p></div>'
      + '</div>';
    document.body.appendChild(m);
    var R = function (k) { return m.querySelector('[data-r="' + k + '"]'); };
    var cerrar = function () { m.remove(); };
    m.addEventListener('click', function (e) { if (e.target === m) cerrar(); });
    R('cerrar').addEventListener('click', cerrar);

    if (t.tiene_foto) urlFoto(t.trabajador_id).then(function (u) {
      R('foto').innerHTML = u ? '<img src="' + esc(u) + '" alt="">' : 'No se ha podido cargar la foto';
    });
    if (R('hacer-foto')) R('hacer-foto').addEventListener('click', function () {
      FI.abrirAnadir(t.trabajador_id, obraId, function () {
        cerrar(); cacheFoto.delete(t.trabajador_id); t.tiene_foto = true; abrirFicha(t, conVoto); pintarValorar();
      }, { tema: opts.temaOscuro ? 'oscuro' : '' });
    });

    var nota = t.mi_nota || 0;
    function pintarVoto() {
      if (!conVoto) return;
      R('votar').querySelectorAll('button').forEach(function (b) { b.classList.toggle('on', Number(b.dataset.n) <= nota); });
      R('aviso').textContent = nota ? (nota <= 2 ? nota + (nota === 1 ? ' estrella' : ' estrellas') + ': escribe el motivo.' : nota + ' estrellas.') : 'Toca las estrellas.';
    }
    if (conVoto) {
      R('votar').addEventListener('click', function (e) { var b = e.target.closest('button'); if (!b) return; nota = Number(b.dataset.n); pintarVoto(); });
      pintarVoto();
      R('guardar').addEventListener('click', async function () {
        var msg = R('msg'), motivo = R('motivo').value.trim();
        if (!nota) { msg.className = 'val-aviso val-ko'; msg.textContent = 'Primero elige las estrellas.'; return; }
        if (nota <= 2 && motivo.length < 10) { msg.className = 'val-aviso val-ko'; msg.textContent = 'Con 1 o 2 estrellas hay que explicar el motivo (mínimo 10 letras).'; return; }
        var bG = R('guardar'); bG.disabled = true; msg.className = 'val-aviso'; msg.textContent = 'Guardando…';
        var r = await sb.rpc('valorar_trabajador', { p_trabajador_id: t.trabajador_id, p_obra_id: obraId, p_puntuacion: nota, p_motivo: motivo || null });
        bG.disabled = false;
        // Error → la ficha sigue abierta. Bien → se cierra y avisa (16/9, Dani).
        if (r.error || !r.data || !r.data.ok) { msg.className = 'val-aviso val-ko'; msg.textContent = (r.data && r.data.error) || 'No se ha podido guardar. Inténtalo de nuevo.'; return; }
        cerrar();
        avisoBreve('⭐ ' + (r.data.nueva ? 'Nota guardada' : 'Nota corregida') + ' · ' + t.nombre);
        rankingCargado = false;
        await cargarObra(obraId);
      });
    }

    (async function () {
      var h = R('hist');
      var r = await sb.rpc('valoraciones_trabajador_detalle', { p_trabajador_id: t.trabajador_id });
      if (r.error || !r.data || !r.data.ok) { h.innerHTML = '<p class="val-aviso val-ko">' + esc((r.data && r.data.error) || 'No se ha podido cargar el historial.') + '</p>'; return; }
      var d = r.data;
      if (!d.lista.length) { h.innerHTML = '<p class="val-aviso">Todavía no tiene ninguna nota.</p>'; return; }
      h.innerHTML = '<p class="val-aviso">Media ' + d.media + ' con ' + notas(d.total) + '.</p>'
        + d.lista.map(function (v) {
          return '<div class="val-hist">' + estrellas(v.puntuacion) + ' <b>' + esc(v.obra) + '</b>'
            + (v.motivo ? '<div>' + esc(v.motivo) + '</div>' : '')
            + '<div class="val-quien">' + esc(v.quien) + (v.es_mia ? ' (tú)' : '') + ' · ' + fecha(v.fecha) + '</div></div>';
        }).join('');
      if (conVoto) {
        var mia = d.lista.find(function (v) { return v.es_mia && v.obra_id === obraId; });
        if (mia) { if (!nota) nota = mia.puntuacion; if (!R('motivo').value) R('motivo').value = mia.motivo || ''; pintarVoto(); }
      }
    })();
  }

  window.Valoraciones = { iniciar: iniciar };
})();
