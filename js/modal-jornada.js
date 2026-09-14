/* ============================================================
   js/modal-jornada.js  ·  MODAL DE ASIGNACIÓN DE TIPO DE JORNADA
   ------------------------------------------------------------
   ÚNICA casa del modal "cambiar el tipo de jornada de una persona".
   Nace en la 92ª sacando a módulo el modal que la 76ª construyó
   dentro de jefe/trabajadores.html, para que jefe/resumen-mes.html
   pueda ofrecer lo mismo sin copiar el modal (dos copias de la misma
   pantalla acaban divergiendo: la trampa de los gemelos).

   ESCRIBE SIEMPRE POR LA RPC asignar_tipo_jornada, nunca con un
   INSERT directo: la RPC es la que cierra la asignación anterior,
   comprueba permisos y se niega a tocar un mes ya cerrado.

   USO:
     ModalJornada.abrir(sb, {
       obraId:           uuid de la obra                (obligatorio)
       ids:              array de uuids de trabajador   (obligatorio)
       etiqueta:         texto bajo el título (nombre de la persona
                         o del grupo)                   (obligatorio)
       tipos:            array de tipos de la obra con
                         {id, nombre, entrada, salida,
                          almuerzo_min, comida_min, activo}.
                         El módulo SOLO ofrece los activos: un tipo
                         desactivado se sigue aplicando a quien ya lo
                         tiene, pero no se asigna a nadie nuevo (82ª).
       intensivaMarcada: bool · valor inicial de la casilla
                         "en días ☀ hace el horario de la obra".
                         Quien llama la calcula con el valor REAL de
                         la persona (ver nota abajo).
       desdeDefecto:     'YYYY-MM-DD' opcional. Si no llega, día 1
                         del mes actual.
       onGuardado:       async function() opcional. Se llama tras un
                         guardado correcto, ANTES de cerrar, para que
                         la página recargue sus datos y repinte.
     })
     ModalJornada.cerrar()

   ⚠️ LA CASILLA ABRE CON EL VALOR REAL, NO SIEMPRE MARCADA. Si
   abriera siempre marcada, editar a alguien que está en 🚫☀ por
   cualquier otro motivo le devolvería la intensiva en silencio.
   El módulo no puede saber ese valor (no lee BD): quien llama lo
   pasa en `intensivaMarcada`.

   El modal crea su propio HTML con estilos en línea (colores fijos,
   sin var(--x)): así no depende de las variables CSS del tema de la
   página que lo carga. Ambas páginas que lo usan son tema oscuro.
   ============================================================ */
(function () {
  'use strict';

  let ctx = null;   // { sb, obraId, ids, onGuardado } mientras está abierto

  function esc(s) {
    return String(s ?? '').replace(/[&<>"']/g, c =>
      ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
  }

  function abrir(sb, opts) {
    opts = opts || {};
    const obraId = opts.obraId;
    const ids = Array.isArray(opts.ids) ? opts.ids : [];
    if (!sb || !obraId || ids.length === 0) return;

    // Solo tipos activos: los desactivados no se asignan a nadie nuevo.
    const tipos = (opts.tipos || []).filter(t => t && t.activo !== false);
    if (tipos.length === 0) {
      alert('Esta obra todavía no tiene ningún tipo de jornada definido.');
      return;
    }

    ctx = { sb: sb, obraId: obraId, ids: ids, onGuardado: opts.onGuardado || null };

    let cap = document.getElementById('modal-jornada');
    if (!cap) {
      cap = document.createElement('div');
      cap.id = 'modal-jornada';
      cap.style.cssText = 'position:fixed;inset:0;background:rgba(0,0,0,.65);display:flex;align-items:center;justify-content:center;z-index:9999;padding:16px';
      cap.addEventListener('click', ev => { if (ev.target === cap) cerrar(); });
      document.body.appendChild(cap);
    }

    // Fecha por defecto: día 1 del mes actual, salvo que quien llama
    // pase otra. Componer con getFullYear/getMonth: toISOString() de
    // madrugada da el día anterior.
    let desdeDefecto = opts.desdeDefecto;
    if (!/^\d{4}-\d{2}-\d{2}$/.test(String(desdeDefecto || ''))) {
      const hoy = new Date();
      desdeDefecto = hoy.getFullYear() + '-' + String(hoy.getMonth() + 1).padStart(2, '0') + '-01';
    }

    const intensivaMarcada = opts.intensivaMarcada !== false;
    const desc = t => {
      const p = (Number(t.almuerzo_min) || 0) + (Number(t.comida_min) || 0);
      return `${t.nombre} · ${String(t.entrada).slice(0, 5)}–${String(t.salida).slice(0, 5)}` +
             (p ? ` · ${p} min de pausa` : ' · sin pausas');
    };

    cap.innerHTML = `
    <div style="background:#1e1e1e;border:1px solid #444;border-radius:10px;max-width:520px;width:100%;padding:20px;color:#eee">
      <h3 style="margin:0 0 4px">Tipo de jornada</h3>
      <div style="opacity:.75;font-size:.9rem;margin-bottom:14px">${esc(opts.etiqueta || '')}</div>

      <label style="display:block;font-size:.85rem;opacity:.8;margin-bottom:4px">Tipo</label>
      <select id="mj-tipo" style="width:100%;padding:8px;margin-bottom:12px;background:#2a2a2a;color:#eee;border:1px solid #555;border-radius:6px">
        ${tipos.map(t => `<option value="${esc(t.id)}">${esc(desc(t))}</option>`).join('')}
        <option value="">— Sin tipo propio (horario general de la obra) —</option>
      </select>

      <label style="display:block;font-size:.85rem;opacity:.8;margin-bottom:4px">Desde el día</label>
      <input type="date" id="mj-desde" value="${esc(desdeDefecto)}" style="width:100%;padding:8px;margin-bottom:4px;background:#2a2a2a;color:#eee;border:1px solid #555;border-radius:6px">
      <div style="font-size:.8rem;opacity:.6;margin-bottom:12px">Los días anteriores a esta fecha no cambian. Un mes ya cerrado no se puede tocar.</div>

      <label style="display:flex;gap:8px;align-items:flex-start;margin-bottom:12px;cursor:pointer">
        <input type="checkbox" id="mj-intensiva"${intensivaMarcada ? ' checked' : ''} style="margin-top:3px;flex:0 0 auto">
        <span>
          <span style="font-size:.9rem">En los días marcados ☀ hace el horario de la obra</span>
          <span style="display:block;font-size:.8rem;opacity:.6;margin-top:2px">Déjala marcada si en verano esta gente hace la jornada intensiva como el resto de la obra. Desmárcala solo si mantiene su horario pactado también esos días.</span>
        </span>
      </label>

      <label style="display:block;font-size:.85rem;opacity:.8;margin-bottom:4px">Motivo (opcional)</label>
      <input type="text" id="mj-motivo" placeholder="p. ej. cambio de turno acordado con el encargado" style="width:100%;padding:8px;margin-bottom:16px;background:#2a2a2a;color:#eee;border:1px solid #555;border-radius:6px">

      <div id="mj-msg" style="font-size:.9rem;margin-bottom:10px"></div>
      <div style="display:flex;gap:8px;justify-content:flex-end">
        <button id="mj-cancelar" style="padding:8px 14px;background:#2a2a2a;color:#eee;border:1px solid #555;border-radius:6px;cursor:pointer">Cancelar</button>
        <button id="mj-guardar" style="padding:8px 14px;background:#3a6ea5;color:#fff;border:1px solid #3a6ea5;border-radius:6px;cursor:pointer">Guardar</button>
      </div>
    </div>`;
    cap.style.display = 'flex';

    // Sin onclick en el HTML: el módulo no exige funciones globales a la
    // página que lo carga.
    document.getElementById('mj-cancelar').addEventListener('click', cerrar);
    document.getElementById('mj-guardar').addEventListener('click', guardar);
  }

  function cerrar() {
    const cap = document.getElementById('modal-jornada');
    if (cap) cap.style.display = 'none';
    ctx = null;
  }

  async function guardar() {
    if (!ctx) return;
    const btn = document.getElementById('mj-guardar');
    const msg = document.getElementById('mj-msg');
    const tipo = document.getElementById('mj-tipo').value || null;
    const desde = document.getElementById('mj-desde').value;
    const motivo = document.getElementById('mj-motivo').value;
    const seguirIntensiva = document.getElementById('mj-intensiva').checked;

    if (!desde) { msg.innerHTML = '<span style="color:#f88">Falta la fecha.</span>'; return; }
    btn.disabled = true; msg.textContent = 'Guardando…';

    const { data, error } = await ctx.sb.rpc('asignar_tipo_jornada', {
      p_trabajador_ids: ctx.ids,
      p_obra_id: ctx.obraId,
      p_tipo_jornada_id: tipo,
      p_desde: desde,
      p_motivo: motivo,
      p_seguir_intensiva_obra: seguirIntensiva
    });

    if (error || !data || data.ok !== true) {
      btn.disabled = false;
      msg.innerHTML = '<span style="color:#f88">' + esc((data && data.error) || (error && error.message) || 'No se ha podido guardar') + '</span>';
      return;
    }

    msg.innerHTML = '<span style="color:#8f8">Guardado: ' + esc(String(data.afectados)) + ' persona(s) → ' + esc(String(data.tipo)) + '</span>';
    // Primero recargar y repintar la página; el modal se cierra después.
    // Si la recarga falla, el error se ve en consola pero el guardado ya
    // está hecho: no se re-habilita el botón para no guardar dos veces.
    try { if (ctx.onGuardado) await ctx.onGuardado(); }
    catch (e) { console.error('[modal-jornada] onGuardado:', e); }
    setTimeout(cerrar, 900);
  }

  window.ModalJornada = { abrir: abrir, cerrar: cerrar };
})();
