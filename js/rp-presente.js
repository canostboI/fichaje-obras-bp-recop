/* js/rp-presente.js — 26/9/2026 (decisión de Dani)
 *
 * UNA sola regla para la alarma «Ningún Recurso Preventivo en obra ahora
 * mismo». La usan jefe/index.html, encargado/index.html y
 * admin/cuadro-mando.html. Si cambia el margen, se cambia AQUÍ y solo aquí.
 *
 * Salta cuando hay gente dentro, ningún RP designado dentro, y la obra lleva
 * sin RP más que su margen:
 *   - APERTURA (15 min): hoy aún no ha salido ningún RP. Se cuenta desde la
 *     entrada más antigua de los que están dentro. Por la mañana el RP no
 *     tiene por qué ser el primero en fichar.
 *   - SALIDA DEL RP (30 min): el último RP ya ha fichado su salida. Se cuenta
 *     desde esa salida. Por la tarde el RP suele salir unos minutos antes que
 *     los últimos (Muralla, 16-23/9: entre 2 y 10 minutos) y eso daba una
 *     alarma falsa cada día.
 * Manda lo que pasó DESPUÉS: si el RP salió a las 9:00, la obra se vació y a
 * las 15:00 entra gente nueva, se cuenta desde las 15:00 con 15 minutos.
 *
 * Cada pantalla sigue calculando QUIÉN está dentro a su manera; aquí solo
 * vive la regla. Entrada: dentroIds, primeraEntradaDentro (ISO o ms),
 * designados (Set de trabajador_id), fichajes de HOY de esa obra
 * ({ tipo, hora, trabajador_id }) y, opcional, ahora (ms).
 */
(function () {
  const MARGEN_APERTURA_MIN = 15;
  const MARGEN_SALIDA_RP_MIN = 30;

  function ms(x) {
    if (x == null || x === '') return null;
    const n = typeof x === 'number' ? x : new Date(x).getTime();
    return Number.isFinite(n) ? n : null;
  }

  // Hora (ms) de la última salida fichada hoy por un RP designado, o null.
  function ultimaSalidaRP(fichajes, designados) {
    let u = null;
    (fichajes || []).forEach(f => {
      if (!f || f.tipo !== 'salida' || !designados || !designados.has(f.trabajador_id)) return;
      const h = ms(f.hora);
      if (h !== null && (u === null || h > u)) u = h;
    });
    return u;
  }

  function evaluar(o) {
    o = o || {};
    const dentroIds = Array.isArray(o.dentroIds) ? o.dentroIds : [];
    const designados = o.designados instanceof Set ? o.designados : new Set();
    const ahora = ms(o.ahora) !== null ? ms(o.ahora) : Date.now();
    const r = {
      alarma: false, hayGente: dentroIds.length > 0, rpDentro: false,
      motivo: null, desde: null, margenMin: null, minutosSinRP: null, salidaRP: null
    };
    if (!r.hayGente) return r;                                   // obra vacía: nada
    r.rpDentro = dentroIds.some(id => designados.has(id));
    if (r.rpDentro) return r;                                    // hay RP dentro

    const primera = ms(o.primeraEntradaDentro);
    const salida = ultimaSalidaRP(o.fichajes, designados);
    r.salidaRP = salida;
    if (salida !== null && (primera === null || salida >= primera)) {
      r.motivo = 'salida_rp'; r.desde = salida; r.margenMin = MARGEN_SALIDA_RP_MIN;
    } else if (primera !== null) {
      r.motivo = 'apertura'; r.desde = primera; r.margenMin = MARGEN_APERTURA_MIN;
    } else {
      return r;                                                  // sin hora: no se inventa
    }
    r.minutosSinRP = Math.max(0, Math.floor((ahora - r.desde) / 60000));
    r.alarma = r.minutosSinRP >= r.margenMin;
    return r;
  }

  // Texto corto y común para las tres pantallas.
  function explicar(ev) {
    if (!ev || !ev.motivo) return '';
    const hh = t => new Date(t).toLocaleTimeString('es-ES', { hour: '2-digit', minute: '2-digit' });
    return ev.motivo === 'salida_rp'
      ? 'El último Recurso Preventivo fichó su salida a las ' + hh(ev.desde) + ' y sigue habiendo gente dentro.'
      : 'Hay gente dentro desde las ' + hh(ev.desde) + ' y ningún Recurso Preventivo designado ha fichado entrada.';
  }

  window.RpPresente = { MARGEN_APERTURA_MIN, MARGEN_SALIDA_RP_MIN, evaluar, ultimaSalidaRP, explicar };
})();
