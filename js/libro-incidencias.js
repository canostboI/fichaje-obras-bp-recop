/* =====================================================================
   js/libro-incidencias.js — Fichaje Obras V2 (Portium)
   ---------------------------------------------------------------------
   LIBRO DE INCIDENCIAS (108ª, 18/9/2026). ÚNICA CASA de la pantalla que
   hojea la tabla `incidencias` entera: lo que la app cazó, cuándo, a
   quién, y qué se hizo. Sustituye a `admin/incidencias.html` (murió en la
   92ª) y da por fin enlace a los tipos que el cuadro de mando contaba sin
   enlace (forzado_caducado, otro, fuera_de_zona, movil_compartido…) y a
   los nuevos de la 108ª (acceso_rechazado, vigilante de obra, retirada).

   Dos páginas finas lo cargan: jefe/libro-incidencias.html (sus obras) y
   admin/libro-incidencias.html (todas). Aquí vive TODO: filtros, lectura,
   resumen, lista, «visto», exportar e imprimir. Las páginas solo ponen el
   hueco, el tema y el arranque.

   QUÉ ENSEÑA
   · Arriba, el RESUMEN del periodo por tipo («lo que la app ha cazado»):
     alertas primero (con cuántas siguen sin mirar), rastro después. Es la
     hoja de méritos: los mismos números que se enseñan a dirección.
   · Debajo, la LISTA agrupada por día, con persona o empresa, obra,
     detalle legible y el botón «✓ Visto» solo en las alertas nuevas.

   REGLAS DE LA CASA QUE CUMPLE
   · Familia y etiqueta SOLO de js/incidencias-familias.js.
   · Motivos SOLO de js/motivos.js (normaliza al leer, no reescribe filas).
   · Lectura completa con js/sb-paginado.js: el tope de 1.000 filas de
     Supabase no puede recortar un libro en silencio.
   · Un fallo de lectura se dice; no se pinta como «no hay nada».
   · Nada se marca como revisada en automático.
   · «Visto» = RPC marcar_incidencia_vista (la misma que jefe/index).

   FORMATOS DE `detalle` QUE SABE LEER (no se reescriben las filas viejas)
   · bloqueo_rojo / aviso_naranja / excepcion_autorizada / fuera_de_zona:
     JSON array de motivos → lista, cada uno por Motivos.normalizar.
   · presente_sin_registrar: JSON objeto {nombre, empresa, dni, intentos}.
   · autocierre, forzado_caducado, otro, fichaje_corregido: texto.
   · 108ª (acceso_rechazado, habilitacion_caducada, empresa_en_rojo,
     rp_incompleto, contrato_caduca, retirada): texto que EMPIEZA por la
     causa entre corchetes, p. ej. «[baja] …». Se pinta como chip.

   API: LibroIncidencias.iniciar(sb, usuario, { hueco, rol, claveObra })
     · rol: 'jefe' (obras de usuarios_obra) | 'admin' (todas, sin ocultas)
     · claveObra: clave de localStorage con la obra recordada (opcional)
   ===================================================================== */

window.LibroIncidencias = (function () {
  'use strict';

  var ICONO = {
    bloqueo_rojo: '🚫', presente_sin_registrar: '🪪', movil_compartido: '📱',
    autocierre: '🕛', otro: '📌', forzado_caducado: '⏳', acceso_rechazado: '⛔',
    habilitacion_caducada: '🏗️', empresa_en_rojo: '🏢', rp_incompleto: '🦺',
    contrato_caduca: '📄', aviso_naranja: '🟠', excepcion_autorizada: '🗝️',
    fichaje_corregido: '✏️', fuera_de_zona: '📍', retirada: '🗑️'
  };

  // Qué significa cada tipo para quien no conoce la tabla (una línea).
  var QUE_ES = {
    bloqueo_rojo: 'Intentó entrar con la documentación en rojo y no pasó.',
    presente_sin_registrar: 'Alguien sin ficha en el sistema se presentó en la puerta.',
    movil_compartido: 'Varios DNIs fichando desde el mismo móvil en poco tiempo.',
    autocierre: 'Olvidó fichar la salida: el sistema la cerró por él.',
    otro: 'Sin clasificar, o cierre de una identidad pendiente por el jefe.',
    forzado_caducado: 'Un forzado a verde se retiró solo al acabarse el margen.',
    acceso_rechazado: 'La valla rechazó a alguien por baja, obra inactiva o jornada abierta en otra obra.',
    habilitacion_caducada: 'Fichó ese día con una habilitación caducada o sin fecha.',
    empresa_en_rojo: 'Empresa con gente en obra estos días y en rojo por contrato o libro.',
    rp_incompleto: 'Hubo actividad sin Recurso Preventivo presente, o con la 60h mal.',
    contrato_caduca: 'Un contrato o libro caduca en 7 días y no hay otro detrás.',
    aviso_naranja: 'Entró con aviso: documentación pendiente ese día.',
    excepcion_autorizada: 'Entró en rojo porque el jefe de obra lo autorizó y firmó.',
    fichaje_corregido: 'Se corrigió o borró un fichaje; queda de qué hora a cuál.',
    fuera_de_zona: 'Fichó fuera del radio de la obra.',
    retirada: 'Se retiró algo (baja, habilitación, RP, contrato, libro) y quién lo hizo.'
  };

  var sb, usuario, cfg, hueco;
  var obras = [];            // [{id, nombre}]
  var filas = [];            // incidencias leídas (ya con joins)
  var estadoCarga = 'inicial'; // inicial | cargando | ok | error
  var errorCarga = '';

  // ------------------------------------------------------------ utilidades
  function esc(t) { var d = document.createElement('div'); d.textContent = String(t == null ? '' : t); return d.innerHTML; }
  function isoLocal(f) { return f.getFullYear() + '-' + String(f.getMonth() + 1).padStart(2, '0') + '-' + String(f.getDate()).padStart(2, '0'); }
  function hhmm(iso) { return new Date(iso).toLocaleTimeString('es-ES', { hour: '2-digit', minute: '2-digit' }); }
  function diaLargo(isoDia) { var d = new Date(isoDia + 'T12:00:00'); return d.toLocaleDateString('es-ES', { weekday: 'long', day: 'numeric', month: 'long', year: 'numeric' }); }
  function diaMadrid(iso) { return isoLocal(new Date(new Date(iso).toLocaleString('en-US', { timeZone: 'Europe/Madrid' }))); }
  function plural(n, a, b) { return n === 1 ? a : b; }
  function nombrePersona(t) { if (!t) return ''; return [t.nombre, t.apellidos].filter(Boolean).join(' ').trim(); }

  // Devuelve { chip, lineas } a partir de un `detalle` crudo.
  function leerDetalle(inc) {
    var d = inc.detalle;
    var out = { chip: '', lineas: [] };
    if (d == null || d === '') return out;
    var t = String(d).trim();
    if (t.charAt(0) === '[' || t.charAt(0) === '{') {
      try {
        var j = JSON.parse(t);
        if (Array.isArray(j)) {
          out.lineas = j.map(function (m) { return window.Motivos ? Motivos.normalizar(m) : String(m); }).filter(Boolean);
          return out;
        }
        if (j && typeof j === 'object') {
          if (j.nombre || j.empresa || j.dni) {
            out.lineas.push([j.nombre, j.empresa].filter(Boolean).join(' · ') + (j.dni ? ' · DNI ' + j.dni : ''));
            if (j.intentos && Number(j.intentos) > 1) out.lineas.push(j.intentos + ' intentos');
            return out;
          }
          out.lineas = Object.keys(j).map(function (k) { return k + ': ' + j[k]; });
          return out;
        }
      } catch (e) { /* no era JSON: texto */ }
    }
    var m = /^\[([a-z0-9_]+)\]\s*/i.exec(t);
    if (m) { out.chip = m[1].replace(/_/g, ' '); t = t.slice(m[0].length); }
    out.lineas = [t];
    return out;
  }

  // ------------------------------------------------------------ filtros
  function leerFiltros() {
    var q = function (id) { return hueco.querySelector('#li-' + id); };
    return {
      obra: q('obra').value,
      desde: q('desde').value,
      hasta: q('hasta').value,
      familia: q('familia').value,
      tipo: q('tipo').value,
      solo_pendientes: q('pendientes').checked,
      texto: q('texto').value.trim().toLowerCase()
    };
  }

  function aplicarRango(rango) {
    var hoy = new Date();
    var desde = hueco.querySelector('#li-desde'), hasta = hueco.querySelector('#li-hasta');
    if (rango === 'todo') { desde.value = ''; hasta.value = ''; }
    else if (rango === 'mes') { desde.value = isoLocal(new Date(hoy.getFullYear(), hoy.getMonth(), 1)); hasta.value = isoLocal(hoy); }
    else if (rango === 'mes-anterior') { desde.value = isoLocal(new Date(hoy.getFullYear(), hoy.getMonth() - 1, 1)); hasta.value = isoLocal(new Date(hoy.getFullYear(), hoy.getMonth(), 0)); }
    else if (rango === '7dias' || rango === '30dias') { var d = new Date(hoy); d.setDate(d.getDate() - (rango === '7dias' ? 7 : 30)); desde.value = isoLocal(d); hasta.value = isoLocal(hoy); }
    hueco.querySelectorAll('.li-rango').forEach(function (b) { b.classList.toggle('activo', b.dataset.rango === rango); });
  }

  // ------------------------------------------------------------ lectura
  async function cargarObras() {
    var sel = hueco.querySelector('#li-obra');
    var r;
    if (cfg.rol === 'admin') {
      r = await sb.from('obras').select('id, nombre, estado').neq('estado', 'oculta').order('nombre');
    } else {
      var uo = await sb.from('usuarios_obra').select('obra_id').eq('usuario_app_id', usuario.id);
      if (uo.error) { sel.innerHTML = '<option value="">Error al leer tus obras</option>'; return; }
      var ids = (uo.data || []).map(function (x) { return x.obra_id; });
      if (!ids.length) { sel.innerHTML = '<option value="">No tienes obras</option>'; return; }
      r = await sb.from('obras').select('id, nombre, estado').in('id', ids).neq('estado', 'oculta').order('nombre');
    }
    if (r.error) { sel.innerHTML = '<option value="">Error al cargar obras</option>'; return; }
    obras = r.data || [];
    var recordada = cfg.claveObra ? localStorage.getItem(cfg.claveObra) : null;
    sel.innerHTML = '<option value="">' + (cfg.rol === 'admin' ? 'Todas las obras' : 'Todas mis obras') + '</option>' +
      obras.map(function (o) {
        return '<option value="' + esc(o.id) + '"' + (recordada === o.id ? ' selected' : '') + '>' + esc(o.nombre) +
          (o.estado && o.estado !== 'activa' ? ' (' + esc(o.estado) + ')' : '') + '</option>';
      }).join('');
  }

  async function cargar() {
    var f = leerFiltros();
    estadoCarga = 'cargando'; pintarEstado();
    try {
      if (!window.SbPaginado || !SbPaginado.traerTodo) throw new Error('Falta js/sb-paginado.js');
      var desdeISO = f.desde ? new Date(f.desde + 'T00:00:00').toISOString() : null;
      var hastaISO = f.hasta ? new Date(new Date(f.hasta + 'T00:00:00').getTime() + 86400000).toISOString() : null;
      filas = await SbPaginado.traerTodo(function () {
        var q = sb.from('incidencias')
          .select('id, tipo, detalle, estado, comentario, created_at, obra_id, trabajador_id, empresa_id, created_by_user_id, ' +
                  'obra:obra_id(nombre), trabajador:trabajador_id(nombre, apellidos, empresa:empresa_id(nombre)), ' +
                  'empresa:empresa_id(nombre), autor:created_by_user_id(nombre)')
          .order('created_at', { ascending: false });
        if (f.obra) q = q.eq('obra_id', f.obra);
        if (desdeISO) q = q.gte('created_at', desdeISO);
        if (hastaISO) q = q.lt('created_at', hastaISO);
        if (f.tipo) q = q.eq('tipo', f.tipo);
        else if (f.familia) q = q.in('tipo', IncidenciasFamilias.tipos(f.familia));
        if (f.solo_pendientes) q = q.eq('estado', 'nueva');
        return q;
      }, { etiqueta: 'incidencias' });
      estadoCarga = 'ok';
    } catch (e) {
      console.error('libro-incidencias:', e);
      estadoCarga = 'error'; errorCarga = (e && e.message) || 'error desconocido'; filas = [];
    }
    pintar();
  }

  // ------------------------------------------------------------ pintado
  function filtrarTexto(lista, texto) {
    if (!texto) return lista;
    return lista.filter(function (i) {
      var bolsa = [nombrePersona(i.trabajador), i.trabajador && i.trabajador.empresa && i.trabajador.empresa.nombre,
                   i.empresa && i.empresa.nombre, i.obra && i.obra.nombre, i.detalle, i.comentario,
                   IncidenciasFamilias.etiqueta(i.tipo)].filter(Boolean).join(' ').toLowerCase();
      return bolsa.indexOf(texto) !== -1;
    });
  }

  function pintarEstado() {
    var z = hueco.querySelector('#li-zona');
    if (estadoCarga === 'cargando') z.innerHTML = '<div class="li-cargando">Leyendo el libro…</div>';
  }

  function pintar() {
    var z = hueco.querySelector('#li-zona');
    var f = leerFiltros();
    if (estadoCarga === 'error') {
      z.innerHTML = '<div class="li-error">⚠ No se ha podido leer el libro de incidencias (' + esc(errorCarga) +
        '). Esto NO significa que no haya nada: significa que no se ha podido mirar. Vuelve a intentarlo.</div>';
      hueco.querySelector('#li-exportar').disabled = true;
      return;
    }
    var lista = filtrarTexto(filas, f.texto);
    hueco.querySelector('#li-exportar').disabled = !lista.length;
    hueco.querySelector('#li-imprimir').disabled = !lista.length;

    // Resumen por tipo: alertas (con pendientes) y rastro.
    var cuenta = {};
    lista.forEach(function (i) {
      var t = (i.tipo || '').toLowerCase();
      if (!cuenta[t]) cuenta[t] = { n: 0, pend: 0 };
      cuenta[t].n++;
      if ((i.estado || 'nueva') === 'nueva') cuenta[t].pend++;
    });
    var tipos = Object.keys(cuenta).sort(function (a, b) {
      var fa = IncidenciasFamilias.esAlerta(a) ? 0 : 1, fb = IncidenciasFamilias.esAlerta(b) ? 0 : 1;
      return (fa - fb) || (cuenta[b].n - cuenta[a].n);
    });
    var periodo = (f.desde || f.hasta)
      ? ((f.desde ? 'desde el ' + f.desde.split('-').reverse().join('/') : '') + (f.hasta ? ' hasta el ' + f.hasta.split('-').reverse().join('/') : ''))
      : 'desde el inicio';
    var html = '<div class="li-resumen"><div class="li-resumen-cab"><h2>Lo que la app ha cazado</h2>' +
      '<span class="li-sub">' + lista.length + ' ' + plural(lista.length, 'registro', 'registros') + ' · ' + esc(periodo.trim()) + '</span></div>';
    if (!tipos.length) {
      html += '<div class="li-vacio">Nada en este periodo con estos filtros.</div>';
    } else {
      html += '<div class="li-tarjetas">' + tipos.map(function (t) {
        var c = cuenta[t], alerta = IncidenciasFamilias.esAlerta(t);
        return '<button type="button" class="li-tarjeta ' + (alerta ? 'alerta' : 'rastro') + '" data-tipo="' + esc(t) + '" title="' + esc(QUE_ES[t] || '') + '">' +
          '<span class="li-t-ico">' + (ICONO[t] || '⚠️') + '</span>' +
          '<span class="li-t-n">' + c.n + '</span>' +
          '<span class="li-t-nombre">' + esc(IncidenciasFamilias.etiqueta(t)) + '</span>' +
          (alerta ? '<span class="li-t-pend">' + (c.pend ? c.pend + ' sin mirar' : 'todas vistas') + '</span>' : '<span class="li-t-pend">rastro</span>') +
          '</button>';
      }).join('') + '</div>';
    }
    html += '</div>';

    // Lista agrupada por día
    if (lista.length) {
      var porDia = {};
      var ordenDias = [];
      lista.forEach(function (i) {
        var d = diaMadrid(i.created_at);
        if (!porDia[d]) { porDia[d] = []; ordenDias.push(d); }
        porDia[d].push(i);
      });
      html += '<div class="li-lista">' + ordenDias.map(function (d) {
        return '<div class="li-dia"><div class="li-dia-cab">' + esc(diaLargo(d)) + ' <span class="li-sub">' + porDia[d].length + '</span></div>' +
          porDia[d].map(filaHTML).join('') + '</div>';
      }).join('') + '</div>';
    }
    z.innerHTML = html;

    z.querySelectorAll('.li-tarjeta').forEach(function (b) {
      b.addEventListener('click', function () {
        var selTipo = hueco.querySelector('#li-tipo');
        selTipo.value = (selTipo.value === b.dataset.tipo) ? '' : b.dataset.tipo;
        cargar();
      });
    });
    z.querySelectorAll('.li-visto').forEach(function (b) {
      b.addEventListener('click', function () { marcarVisto(b.dataset.id, b); });
    });
  }

  function filaHTML(i) {
    var t = (i.tipo || '').toLowerCase();
    var alerta = IncidenciasFamilias.esAlerta(t);
    var pendiente = alerta && (i.estado || 'nueva') === 'nueva';
    var quien = nombrePersona(i.trabajador);
    var empresa = (i.trabajador && i.trabajador.empresa && i.trabajador.empresa.nombre) || (i.empresa && i.empresa.nombre) || '';
    var det = leerDetalle(i);
    var cabecera = quien ? '<b>' + esc(quien) + '</b>' + (empresa ? ' <span class="li-sub">· ' + esc(empresa) + '</span>' : '')
                 : empresa ? '<b>' + esc(empresa) + '</b> <span class="li-sub">· empresa</span>'
                 : '<span class="li-sub">Sin persona ni empresa (la obra entera)</span>';
    var obraTxt = (!hueco.querySelector('#li-obra').value && i.obra && i.obra.nombre) ? '<span class="li-chip obra">' + esc(i.obra.nombre) + '</span>' : '';
    var autor = (i.autor && i.autor.nombre) ? '<span class="li-sub"> · por ' + esc(i.autor.nombre) + '</span>' : '';
    return '<div class="li-fila ' + (alerta ? 'alerta' : 'rastro') + (pendiente ? ' pendiente' : '') + '">' +
      '<div class="li-ico" title="' + esc(QUE_ES[t] || '') + '">' + (ICONO[t] || '⚠️') + '</div>' +
      '<div class="li-cuerpo">' +
        '<div class="li-linea1">' + cabecera + obraTxt +
          '<span class="li-chip tipo ' + (alerta ? 'alerta' : 'rastro') + '">' + esc(IncidenciasFamilias.etiqueta(t)) + '</span>' +
          (det.chip ? '<span class="li-chip causa">' + esc(det.chip) + '</span>' : '') +
        '</div>' +
        (det.lineas.length ? '<div class="li-detalle">' + det.lineas.map(function (l) { return '<div>' + esc(l) + '</div>'; }).join('') + '</div>' : '') +
        (i.comentario ? '<div class="li-detalle li-coment">💬 ' + esc(i.comentario) + '</div>' : '') +
        '<div class="li-pie">' + esc(hhmm(i.created_at)) + autor +
          (alerta ? ' · ' + (pendiente ? '<span class="li-estado pend">sin mirar</span>' : '<span class="li-estado ok">' + esc(i.estado) + '</span>') : '') +
        '</div>' +
      '</div>' +
      (pendiente ? '<div class="li-acc"><button type="button" class="li-visto" data-id="' + esc(i.id) + '">✓ Visto</button></div>' : '') +
    '</div>';
  }

  async function marcarVisto(id, btn) {
    btn.disabled = true; btn.textContent = 'Marcando…';
    var r = await sb.rpc('marcar_incidencia_vista', { p_incidencia_id: id });
    if (r.error || !r.data || r.data.success === false) {
      btn.disabled = false; btn.textContent = '✓ Visto';
      alert('No se ha podido marcar: ' + ((r.error && r.error.message) || (r.data && r.data.error) || 'error'));
      return;
    }
    var fila = filas.find(function (i) { return i.id === id; });
    if (fila) fila.estado = 'revisada';
    pintar();
  }

  // ------------------------------------------------------------ exportar
  function exportarCSV() {
    var f = leerFiltros();
    var lista = filtrarTexto(filas, f.texto);
    var cab = ['fecha', 'hora', 'obra', 'tipo', 'familia', 'persona', 'empresa', 'causa', 'detalle', 'estado', 'registrado_por'];
    var lineas = [cab.join(';')];
    lista.forEach(function (i) {
      var det = leerDetalle(i);
      var c = [diaMadrid(i.created_at), hhmm(i.created_at), (i.obra && i.obra.nombre) || '', IncidenciasFamilias.etiqueta(i.tipo),
               IncidenciasFamilias.familia(i.tipo), nombrePersona(i.trabajador),
               (i.trabajador && i.trabajador.empresa && i.trabajador.empresa.nombre) || (i.empresa && i.empresa.nombre) || '',
               det.chip, det.lineas.join(' | '), i.estado || '', (i.autor && i.autor.nombre) || ''];
      lineas.push(c.map(function (v) { return '"' + String(v == null ? '' : v).replace(/"/g, '""') + '"'; }).join(';'));
    });
    var blob = new Blob(['\ufeff' + lineas.join('\r\n')], { type: 'text/csv;charset=utf-8' });
    var a = document.createElement('a');
    a.href = URL.createObjectURL(blob);
    a.download = 'libro-incidencias-' + isoLocal(new Date()) + '.csv';
    document.body.appendChild(a); a.click(); document.body.removeChild(a);
    setTimeout(function () { URL.revokeObjectURL(a.href); }, 2000);
  }

  // ------------------------------------------------------------ armazón
  function armazonHTML() {
    var opcTipos = IncidenciasFamilias.todosLosTipos().map(function (t) {
      return '<option value="' + esc(t) + '">' + esc(IncidenciasFamilias.etiqueta(t)) + '</option>';
    }).join('');
    return '' +
      '<div class="li-controles li-no-print">' +
        '<div class="li-campo"><label for="li-obra">Obra</label><select id="li-obra"><option value="">Cargando…</option></select></div>' +
        '<div class="li-campo"><label for="li-desde">Desde</label><input type="date" id="li-desde"></div>' +
        '<div class="li-campo"><label for="li-hasta">Hasta</label><input type="date" id="li-hasta"></div>' +
        '<div class="li-campo"><label for="li-familia">Familia</label><select id="li-familia"><option value="">Todas</option><option value="alerta">Alertas (piden acción)</option><option value="rastro">Rastro (solo registro)</option></select></div>' +
        '<div class="li-campo"><label for="li-tipo">Tipo</label><select id="li-tipo"><option value="">Todos</option>' + opcTipos + '</select></div>' +
        '<div class="li-campo"><label for="li-texto">Buscar</label><input type="search" id="li-texto" placeholder="persona, empresa, texto…"></div>' +
        '<label class="li-check"><input type="checkbox" id="li-pendientes"> Solo sin mirar</label>' +
        '<button type="button" class="li-btn primario" id="li-actualizar">Actualizar</button>' +
        '<button type="button" class="li-btn" id="li-exportar" disabled>⬇ CSV</button>' +
        '<button type="button" class="li-btn" id="li-imprimir" disabled>🖨 Imprimir</button>' +
      '</div>' +
      '<div class="li-rangos li-no-print">' +
        '<button type="button" class="li-rango" data-rango="7dias">Últimos 7 días</button>' +
        '<button type="button" class="li-rango" data-rango="mes">Este mes</button>' +
        '<button type="button" class="li-rango" data-rango="mes-anterior">Mes anterior</button>' +
        '<button type="button" class="li-rango" data-rango="30dias">Últimos 30 días</button>' +
        '<button type="button" class="li-rango" data-rango="todo">Desde el inicio</button>' +
      '</div>' +
      '<div id="li-zona"></div>' +
      '<div class="li-nota li-no-print"><b>Qué es este libro.</b> Todo lo que la app detecta y apunta, con fecha, persona o empresa y quién actuó. ' +
      'Las <b>alertas</b> piden que alguien las mire (el botón «Visto» deja constancia). El <b>rastro</b> es registro: no hace falta hacer nada. ' +
      'Pasa el ratón por un icono para saber qué significa cada tipo.</div>';
  }

  function css() {
    return '' +
      '.li-controles{display:flex;flex-wrap:wrap;gap:12px;align-items:flex-end;background:var(--li-card);border:1px solid var(--li-borde);border-radius:10px;padding:14px 16px;margin-bottom:12px}' +
      '.li-campo{display:flex;flex-direction:column;gap:5px}.li-campo label{font-size:11px;font-weight:700;text-transform:uppercase;letter-spacing:.5px;color:var(--li-texto2)}' +
      '.li-campo select,.li-campo input{background:var(--li-input);border:1px solid var(--li-borde);color:var(--li-texto);padding:8px 10px;border-radius:8px;font-size:14px;font-family:inherit;min-width:140px}' +
      '.li-check{display:flex;align-items:center;gap:6px;font-size:13px;color:var(--li-texto2);padding-bottom:8px}' +
      '.li-btn{background:var(--li-input);border:1px solid var(--li-borde);color:var(--li-texto);padding:9px 14px;border-radius:8px;cursor:pointer;font-size:13px;font-family:inherit;font-weight:600}' +
      '.li-btn.primario{background:#2196f3;border-color:#2196f3;color:#fff}.li-btn:disabled{opacity:.45;cursor:default}' +
      '.li-rangos{display:flex;gap:8px;flex-wrap:wrap;margin-bottom:16px}' +
      '.li-rango{background:transparent;border:1px solid var(--li-borde);color:var(--li-texto2);padding:6px 13px;border-radius:20px;font-size:13px;cursor:pointer;font-family:inherit}' +
      '.li-rango.activo{background:#2196f3;border-color:#2196f3;color:#fff;font-weight:600}' +
      '.li-resumen{background:var(--li-card);border:1px solid var(--li-borde);border-radius:10px;padding:16px 18px;margin-bottom:18px}' +
      '.li-resumen-cab{display:flex;justify-content:space-between;align-items:baseline;gap:12px;flex-wrap:wrap;margin-bottom:12px}.li-resumen-cab h2{font-size:14px;font-weight:800;text-transform:uppercase;letter-spacing:.5px}' +
      '.li-sub{font-size:12px;color:var(--li-texto2);font-weight:400}' +
      '.li-tarjetas{display:grid;grid-template-columns:repeat(auto-fill,minmax(150px,1fr));gap:10px}' +
      '.li-tarjeta{display:flex;flex-direction:column;align-items:flex-start;gap:2px;background:var(--li-input);border:1px solid var(--li-borde);border-radius:10px;padding:10px 12px;cursor:pointer;text-align:left;color:var(--li-texto);font-family:inherit}' +
      '.li-tarjeta.alerta{border-left:4px solid #ff9800}.li-tarjeta.rastro{border-left:4px solid var(--li-borde)}.li-tarjeta:hover{border-color:#2196f3}' +
      '.li-t-ico{font-size:18px}.li-t-n{font-size:22px;font-weight:800;line-height:1.1}.li-t-nombre{font-size:12px;font-weight:600}.li-t-pend{font-size:11px;color:var(--li-texto2)}' +
      '.li-vacio,.li-cargando{padding:22px;text-align:center;color:var(--li-texto2);font-size:14px}' +
      '.li-error{padding:14px 16px;border:1px solid #f44336;border-radius:10px;background:rgba(244,67,54,.1);font-size:14px;line-height:1.5}' +
      '.li-dia{margin-bottom:16px}.li-dia-cab{font-size:12px;font-weight:700;text-transform:uppercase;letter-spacing:.5px;color:var(--li-texto2);padding:6px 4px;border-bottom:1px solid var(--li-borde);margin-bottom:6px}' +
      '.li-fila{display:flex;gap:12px;align-items:flex-start;background:var(--li-card);border:1px solid var(--li-borde);border-radius:10px;padding:11px 14px;margin-bottom:6px}' +
      '.li-fila.alerta{border-left:4px solid #ff9800}.li-fila.alerta.pendiente{border-left-color:#f44336}.li-fila.rastro{border-left:4px solid var(--li-borde);opacity:.9}' +
      '.li-ico{font-size:20px;line-height:1.3;cursor:help}.li-cuerpo{flex:1;min-width:0}' +
      '.li-linea1{font-size:14px;line-height:1.5;display:flex;flex-wrap:wrap;gap:6px;align-items:center}' +
      '.li-chip{display:inline-block;font-size:11px;font-weight:700;padding:2px 8px;border-radius:12px;border:1px solid var(--li-borde);color:var(--li-texto2)}' +
      '.li-chip.tipo.alerta{color:#ff9800;border-color:rgba(255,152,0,.5)}.li-chip.tipo.rastro{color:var(--li-texto2)}.li-chip.causa{color:#2196f3;border-color:rgba(33,150,243,.5)}.li-chip.obra{color:var(--li-texto)}' +
      '.li-detalle{font-size:13px;color:var(--li-texto2);margin-top:4px;line-height:1.5}.li-detalle div{padding-left:10px;border-left:2px solid var(--li-borde);margin:2px 0}.li-coment{color:var(--li-texto)}' +
      '.li-pie{font-size:12px;color:var(--li-texto2);margin-top:5px}.li-estado.pend{color:#f44336;font-weight:700}.li-estado.ok{color:#4caf50;font-weight:700}' +
      '.li-acc{align-self:center}.li-visto{background:transparent;border:1px solid #4caf50;color:#4caf50;padding:6px 10px;border-radius:8px;cursor:pointer;font-size:12px;font-family:inherit;font-weight:700;white-space:nowrap}.li-visto:hover{background:rgba(76,175,80,.12)}' +
      '.li-nota{font-size:12px;color:var(--li-texto2);line-height:1.6;padding:14px 16px;background:var(--li-card);border:1px solid var(--li-borde);border-radius:10px;margin-top:8px}.li-nota b{color:var(--li-texto)}' +
      '@media print{.li-no-print{display:none!important}.li-fila,.li-resumen,.li-tarjeta{border-color:#999;background:#fff;color:#000}.li-sub,.li-detalle,.li-pie{color:#333}.li-visto{display:none}}';
  }

  async function iniciar(_sb, _usuario, _cfg) {
    sb = _sb; usuario = _usuario; cfg = _cfg || {}; hueco = cfg.hueco;
    if (!hueco) throw new Error('LibroIncidencias.iniciar: falta hueco');
    if (!window.IncidenciasFamilias || !window.SbPaginado) {
      hueco.innerHTML = '<div class="li-error">Faltan módulos: esta pantalla necesita js/incidencias-familias.js, js/motivos.js y js/sb-paginado.js cargados antes. Recarga la página.</div>';
      return;
    }
    var st = document.createElement('style'); st.textContent = css(); document.head.appendChild(st);
    hueco.innerHTML = armazonHTML();

    hueco.querySelector('#li-actualizar').addEventListener('click', cargar);
    hueco.querySelector('#li-exportar').addEventListener('click', exportarCSV);
    hueco.querySelector('#li-imprimir').addEventListener('click', function () { window.print(); });
    hueco.querySelector('#li-texto').addEventListener('input', function () { if (estadoCarga === 'ok') pintar(); });
    ['li-obra', 'li-familia', 'li-tipo', 'li-pendientes'].forEach(function (id) {
      hueco.querySelector('#' + id).addEventListener('change', function () {
        if (id === 'li-familia') hueco.querySelector('#li-tipo').value = '';
        if (id === 'li-obra' && cfg.claveObra) { var v = hueco.querySelector('#li-obra').value; if (v) localStorage.setItem(cfg.claveObra, v); }
        cargar();
      });
    });
    hueco.querySelectorAll('.li-rango').forEach(function (b) {
      b.addEventListener('click', function () { aplicarRango(b.dataset.rango); cargar(); });
    });

    await cargarObras();
    aplicarRango('mes');
    await cargar();
  }

  return { iniciar: iniciar, leerDetalle: leerDetalle };
})();
