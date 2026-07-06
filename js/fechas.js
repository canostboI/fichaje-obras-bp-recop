/* ============================================================
   js/fechas.js — Helpers de fecha anclados a Europe/Madrid
   ------------------------------------------------------------
   Motivo (auditoría M-05): usar new Date().toISOString() para
   calcular "el día de hoy" da el día en UTC, no en España. Entre
   las 00:00 y la 01:00 (invierno) o las 02:00 (verano), el día
   UTC es el ANTERIOR al día real en España. Este módulo da el
   día correcto siempre, con o sin horario de verano.

   Uso (en cualquier página, cargar antes del script principal):
     <script src="../js/fechas.js"></script>

   API pública (window.Fechas):
     Fechas.hoyMadrid()            → 'YYYY-MM-DD' de HOY en España
     Fechas.fechaMadrid(date)      → 'YYYY-MM-DD' de un Date en España
     Fechas.rangoDiaMadrid(fecha)  → { desde, hasta } en ISO UTC,
                                     para filtrar timestamptz por día
   ============================================================ */
(function () {
  'use strict';

  const TZ = 'Europe/Madrid';

  // Formateador fijo: 'en-CA' da el formato YYYY-MM-DD directamente.
  const fmtFecha = new Intl.DateTimeFormat('en-CA', {
    timeZone: TZ,
    year: 'numeric',
    month: '2-digit',
    day: '2-digit'
  });

  /**
   * Fecha (YYYY-MM-DD) de un objeto Date, vista desde España.
   * @param {Date} d
   * @returns {string} 'YYYY-MM-DD'
   */
  function fechaMadrid(d) {
    return fmtFecha.format(d);
  }

  /**
   * Fecha de HOY (YYYY-MM-DD) en España, con DST correcto.
   * Sustituye a: new Date().toISOString().slice(0, 10)
   * @returns {string} 'YYYY-MM-DD'
   */
  function hoyMadrid() {
    return fechaMadrid(new Date());
  }

  /**
   * Offset (en minutos) de Europe/Madrid respecto a UTC para un
   * instante dado. +60 en invierno, +120 en verano.
   * @param {Date} d
   * @returns {number}
   */
  function offsetMadridMin(d) {
    const fmt = new Intl.DateTimeFormat('en-US', {
      timeZone: TZ,
      year: 'numeric', month: '2-digit', day: '2-digit',
      hour: '2-digit', minute: '2-digit', second: '2-digit',
      hour12: false
    });
    const p = {};
    for (const parte of fmt.formatToParts(d)) p[parte.type] = parte.value;
    // Instante "como si" la hora local de Madrid fuese UTC:
    const comoUTC = Date.UTC(
      Number(p.year), Number(p.month) - 1, Number(p.day),
      Number(p.hour) % 24, Number(p.minute), Number(p.second)
    );
    return Math.round((comoUTC - d.getTime()) / 60000);
  }

  /**
   * Rango UTC [desde, hasta) que cubre un día natural en España.
   * Sirve para filtrar columnas timestamptz por día:
   *   .gte('hora', r.desde).lt('hora', r.hasta)
   *
   * @param {string} fecha  'YYYY-MM-DD' (día en España). Si se omite, hoy.
   * @returns {{desde: string, hasta: string}} ISO UTC
   */
  function rangoDiaMadrid(fecha) {
    const f = fecha || hoyMadrid();
    const [y, m, d] = f.split('-').map(Number);

    // Aproximación inicial: medianoche de ese día como si fuera UTC,
    // corregida después con el offset real de Madrid en ese instante.
    let inicio = new Date(Date.UTC(y, m - 1, d, 0, 0, 0));
    inicio = new Date(inicio.getTime() - offsetMadridMin(inicio) * 60000);
    // Segunda pasada por si la primera cayó al otro lado de un cambio DST:
    const ajuste = new Date(Date.UTC(y, m - 1, d, 0, 0, 0));
    inicio = new Date(ajuste.getTime() - offsetMadridMin(inicio) * 60000);

    let fin = new Date(Date.UTC(y, m - 1, d + 1, 0, 0, 0));
    fin = new Date(fin.getTime() - offsetMadridMin(fin) * 60000);
    const ajusteFin = new Date(Date.UTC(y, m - 1, d + 1, 0, 0, 0));
    fin = new Date(ajusteFin.getTime() - offsetMadridMin(fin) * 60000);

    return { desde: inicio.toISOString(), hasta: fin.toISOString() };
  }

  window.Fechas = { hoyMadrid, fechaMadrid, rangoDiaMadrid };
})();
