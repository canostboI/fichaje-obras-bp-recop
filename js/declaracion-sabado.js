// ============================================================
// js/declaracion-sabado.js — Declaración de los sábados
// ============================================================
// QUÉ ES: el sábado se paga por acuerdo (8 h a quien hizo la
// mañana), no por lo que marca el reloj. El encargado es el único
// que sabe si cada persona la hizo. Este módulo le saca un modal
// BLOQUEANTE con la lista de jornadas del sábado y tres respuestas
// por persona.
//
// 23/9/2026 (decisión de Dani): «si el encargado ha dicho que son
// ocho, ya debería marcar ocho». Desde hoy:
// - La declaración «hizo la mañana» FIJA las 8 h en la BD
//   (`declarar_sabado`, respaldo 129/135): el jefe ya no firma
//   nada en resumen-mes, solo lo ve. Su ajuste manual manda sobre
//   el del encargado.
// - Se declara TODA jornada de sábado, no solo las que la app
//   cerró sola (respaldo 134): el que fichó salida a las 13:05
//   también hizo la mañana y también cobra 8 h.
// Antes (15/9): solo autocierres, y la declaración solo informaba.
//
// REGLAS:
// - Se puede aplazar con "Ahora no" un máximo de 2 veces por
//   sábado pendiente. El contador vive en la BD
//   (declaraciones_sabado_aplazos), no en el navegador.
// - El modal es bloqueante A PROPÓSITO: la tarea ES contestar.
//   Excepción a "una tarea por pantalla", escrita y decidida.
// - Si la LECTURA falla, no se bloquea el panel: se avisa con una
//   franja roja y se ofrece recargar (regla 62ª: fallo de lectura
//   no rompe la pantalla).
// - CSS con colores fijos, sin var(--x): el encargado es tema
//   claro sin variables (lección 86ª).
//
// USO: DeclSabado.comprobar(sb, obraId)  — al cargar la obra.
// RPC: declaraciones_sabado_pendientes / declarar_sabado /
//      aplazar_declaracion_sabado
// ============================================================

const DeclSabado = (() => {

  const RESPUESTAS = [
    { valor: 'hizo_manana',    texto: '✅ Hizo la mañana',        color: '#1a7f37' },
    { valor: 'no_hizo_manana', texto: '❌ No la hizo / se fue antes', color: '#b42318' },
    { valor: 'no_lo_se',       texto: '🤷 No lo sé',              color: '#6b6b6b' }
  ];

  let _sb = null;
  let _obraId = null;
  let _pendientes = 0;

  function _css() {
    if (document.getElementById('dsab-css')) return;
    const s = document.createElement('style');
    s.id = 'dsab-css';
    s.textContent = `
      #dsab-overlay { position:fixed; inset:0; background:rgba(0,0,0,0.65);
        z-index:9500; display:flex; align-items:center; justify-content:center;
        padding:16px; overflow-y:auto; }
      #dsab-modal { background:#ffffff; color:#222222; border-radius:12px;
        max-width:560px; width:100%; max-height:90vh; overflow-y:auto;
        box-shadow:0 8px 32px rgba(0,0,0,0.35); padding:20px; }
      #dsab-modal h2 { margin:0 0 6px 0; font-size:1.15rem; color:#222222; }
      #dsab-modal .dsab-expl { font-size:0.9rem; color:#555555; margin:0 0 14px 0; }
      .dsab-fecha { font-weight:bold; font-size:0.95rem; margin:14px 0 6px 0;
        color:#222222; border-bottom:2px solid #dddddd; padding-bottom:4px; }
      .dsab-fila { border:1px solid #dddddd; border-radius:8px; padding:10px;
        margin-bottom:8px; background:#fafafa; }
      .dsab-nombre { font-weight:bold; font-size:0.95rem; }
      .dsab-entrada { font-size:0.82rem; color:#555555; margin:2px 0 8px 0; }
      .dsab-botones { display:flex; flex-wrap:wrap; gap:6px; }
      .dsab-botones button { flex:1 1 30%; min-width:120px; padding:9px 6px;
        border:none; border-radius:6px; color:#ffffff; font-size:0.85rem;
        cursor:pointer; }
      .dsab-botones button:disabled { opacity:0.45; cursor:default; }
      .dsab-hecho { font-size:0.88rem; font-weight:bold; padding:6px 0; }
      .dsab-error { color:#b42318; font-size:0.82rem; margin-top:6px; }
      .dsab-pie { margin-top:16px; display:flex; flex-direction:column; gap:8px; }
      .dsab-pie button { padding:11px; border:none; border-radius:8px;
        font-size:0.9rem; cursor:pointer; }
      #dsab-btn-aplazar { background:#eeeeee; color:#444444; }
      #dsab-btn-cerrar { background:#1a7f37; color:#ffffff; font-weight:bold; display:none; }
      .dsab-aviso-limite { font-size:0.78rem; color:#8a6d00; text-align:center; }
      #dsab-franja-error { background:#b42318; color:#ffffff; padding:10px 14px;
        border-radius:8px; margin:10px 0; font-size:0.88rem; }
      #dsab-franja-error button { margin-left:10px; padding:4px 10px;
        border:none; border-radius:5px; cursor:pointer; }
    `;
    document.head.appendChild(s);
  }

  function _fmtFecha(iso) {
    const [a, m, d] = iso.split('-');
    return `Sábado ${d}/${m}/${a}`;
  }

  // ── Comprobar pendientes al cargar la obra ──────────────────
  async function comprobar(sb, obraId) {
    _sb = sb;
    _obraId = obraId;
    _quitarModal();
    _quitarFranjaError();

    let filas;
    try {
      const { data, error } = await sb.rpc('declaraciones_sabado_pendientes', { p_obra_id: obraId });
      if (error) throw error;
      filas = data || [];
    } catch (e) {
      // Fallo de LECTURA: no se bloquea el panel, se avisa (62ª).
      _franjaError();
      return;
    }

    if (filas.length === 0) return;
    _abrirModal(filas);
  }

  function _franjaError() {
    const panel = document.getElementById('panel-obra') || document.body;
    const div = document.createElement('div');
    div.id = 'dsab-franja-error';
    div.innerHTML = 'No se ha podido comprobar si hay sábados pendientes de declarar. ' +
      '<button onclick="location.reload()">Recargar</button>';
    panel.insertBefore(div, panel.firstChild);
  }

  function _quitarFranjaError() {
    const f = document.getElementById('dsab-franja-error');
    if (f) f.remove();
  }

  function _quitarModal() {
    const o = document.getElementById('dsab-overlay');
    if (o) o.remove();
  }

  // ── El modal ────────────────────────────────────────────────
  function _abrirModal(filas) {
    _css();
    _pendientes = filas.length;

    // Aplazos ya usados: el máximo entre los sábados pendientes
    const maxAplazos = filas.reduce((m, f) => Math.max(m, f.aplazos_usados || 0), 0);
    const quedan = 2 - maxAplazos;

    const overlay = document.createElement('div');
    overlay.id = 'dsab-overlay';

    const modal = document.createElement('div');
    modal.id = 'dsab-modal';

    let html = `<h2>☀️ Sábados por declarar</h2>
      <p class="dsab-expl">Tú eres quien estaba en obra: di si cada persona
      <b>hizo la mañana</b> del sábado. A quien la hizo se le cuentan 8 h, por acuerdo,
      sea cual sea la hora de salida. Si dices que no la hizo, el jefe de obra decide.</p>`;

    // Agrupar por fecha
    let fechaActual = null;
    filas.forEach((f, i) => {
      if (f.fecha !== fechaActual) {
        fechaActual = f.fecha;
        html += `<div class="dsab-fecha">${_fmtFecha(f.fecha)}</div>`;
      }
      html += `<div class="dsab-fila" id="dsab-fila-${i}">
        <div class="dsab-nombre">${_esc(f.trabajador_nombre)}</div>
        <div class="dsab-entrada">${_reloj(f)}</div>
        <div class="dsab-botones">` +
        RESPUESTAS.map(r =>
          `<button style="background:${r.color}"
            onclick="DeclSabado._responder(${i},'${f.trabajador_id}','${f.fecha}','${r.valor}')">${r.texto}</button>`
        ).join('') +
        `</div><div class="dsab-error" id="dsab-err-${i}" style="display:none"></div></div>`;
    });

    html += `<div class="dsab-pie">`;
    if (quedan > 0) {
      html += `<button id="dsab-btn-aplazar" onclick="DeclSabado._aplazar()">
        Ahora no</button>
        <div class="dsab-aviso-limite">⚠️ Puedes aplazarlo ${quedan === 2 ? '2 veces más' : '1 vez más'}.
        Después habrá que contestar para seguir.</div>`;
    } else {
      html += `<div class="dsab-aviso-limite">⚠️ Ya no se puede aplazar más:
        hay que contestar para seguir.</div>`;
    }
    html += `<button id="dsab-btn-cerrar" onclick="DeclSabado._cerrar()">✅ Hecho — cerrar</button></div>`;

    modal.innerHTML = html;
    overlay.appendChild(modal);
    document.body.appendChild(overlay);
  }

  // ── Responder por una persona ───────────────────────────────
  async function _responder(idx, trabajadorId, fecha, respuesta) {
    const fila = document.getElementById(`dsab-fila-${idx}`);
    const err = document.getElementById(`dsab-err-${idx}`);
    if (!fila) return;
    const botones = fila.querySelectorAll('button');
    botones.forEach(b => b.disabled = true);
    err.style.display = 'none';

    try {
      const { error } = await _sb.rpc('declarar_sabado', {
        p_obra_id: _obraId,
        p_trabajador_id: trabajadorId,
        p_fecha: fecha,
        p_respuesta: respuesta
      });
      if (error) throw error;
    } catch (e) {
      botones.forEach(b => b.disabled = false);
      err.textContent = 'No se ha podido guardar. Inténtalo otra vez.';
      err.style.display = 'block';
      return;
    }

    const elegida = RESPUESTAS.find(r => r.valor === respuesta);
    fila.querySelector('.dsab-botones').outerHTML =
      `<div class="dsab-hecho" style="color:${elegida.color}">Guardado: ${elegida.texto}</div>`;
    _pendientes--;

    if (_pendientes <= 0) {
      const btnAplazar = document.getElementById('dsab-btn-aplazar');
      if (btnAplazar) btnAplazar.style.display = 'none';
      document.getElementById('dsab-btn-cerrar').style.display = 'block';
    }
  }

  // ── Aplazar ("Ahora no") ────────────────────────────────────
  async function _aplazar() {
    const btn = document.getElementById('dsab-btn-aplazar');
    if (btn) btn.disabled = true;
    try {
      const { error } = await _sb.rpc('aplazar_declaracion_sabado', { p_obra_id: _obraId });
      if (error) throw error;
      _quitarModal();
    } catch (e) {
      // Si el límite saltó en otro dispositivo, el botón mentía: recargar estado
      if (btn) btn.disabled = false;
      comprobar(_sb, _obraId);
    }
  }

  function _cerrar() {
    _quitarModal();
  }

  // Lo que marcó el reloj. Solo informa: la respuesta es del encargado.
  function _reloj(f) {
    const ent = _esc(f.hora_entrada);
    if (f.salida_automatica) return `Entrada: ${ent} · sin salida (la app cerró la jornada sola)`;
    if (!f.hora_salida || f.hora_salida === '—') return `Entrada: ${ent} · sin salida`;
    return `Entrada: ${ent} · Salida: ${_esc(f.hora_salida)}`;
  }

  function _esc(t) {
    const d = document.createElement('div');
    d.textContent = t == null ? '' : String(t);
    return d.innerHTML;
  }

  return { comprobar, _responder, _aplazar, _cerrar };
})();
