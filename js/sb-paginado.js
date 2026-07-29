/*
 * js/sb-paginado.js — Lectura COMPLETA de consultas grandes de Supabase.
 *
 * EL PROBLEMA QUE RESUELVE (encontrado el 29/7/2026):
 *   Supabase (PostgREST) devuelve como máximo 1.000 filas por consulta,
 *   AUNQUE el código no pida ningún límite. No avisa: simplemente vienen
 *   menos filas. Como las consultas del mes van ordenadas por hora de más
 *   antigua a más nueva, lo que se pierde es el FINAL DEL MES.
 *
 *   Caso real: MURALLA DE VALLS, julio 2026 → 1.168 fichajes. Se leían
 *   1.000. Los días 27, 28 y 29 salían VACÍOS en pantalla y el Excel
 *   proforma se generaba sin ellos, sin avisar de nada.
 *
 *   Poner .limit(5000) NO sirve: el tope lo impone el servidor, no el
 *   cliente. La única vía es pedir los datos por tandas.
 *
 * CÓMO SE USA:
 *   const filas = await SbPaginado.traerTodo(() =>
 *     sb.from('fichajes')
 *       .select('id, tipo, hora')
 *       .eq('obra_id', obraId)
 *       .gte('hora', desde).lt('hora', hasta)
 *       .order('hora', { ascending: true })
 *   );
 *
 *   Se pasa una FUNCIÓN que fabrica la consulta, no la consulta ya hecha:
 *   el constructor de Supabase se consume al esperarlo (await) y no se
 *   puede reutilizar para la tanda siguiente.
 *
 * REGLA IMPORTANTE — ORDEN OBLIGATORIO:
 *   La consulta DEBE llevar .order(). Sin un orden fijo, PostgreSQL puede
 *   devolver las filas en distinto orden en cada tanda, y entonces la
 *   paginación duplica unas filas y se deja otras. El módulo avisa por
 *   consola si detecta que falta.
 *
 * SI ALGO FALLA, LANZA (throw). NO devuelve datos a medias.
 *   Un mes incompleto en silencio es exactamente el fallo que este módulo
 *   viene a cerrar. Quien lo llama debe dejar que el error suba y bloquear
 *   la exportación.
 *
 * Este módulo NO consulta nada por su cuenta y NO pinta HTML: recibe una
 * consulta ya construida por la página y devuelve filas.
 */
(function () {
  'use strict';

  // Tamaño de tanda. 1.000 es el tope del servidor: pedir más no trae más.
  const TAM_TANDA = 1000;

  // Tope de seguridad: 50 tandas = 50.000 filas. Si se llega aquí, algo
  // va mal (consulta sin filtros, orden inestable...) y es mejor cortar
  // avisando que quedarse dando vueltas para siempre.
  const MAX_TANDAS = 50;

  /**
   * Lee TODAS las filas de una consulta, en tandas.
   *
   * @param {Function} construirQuery  Función sin argumentos que devuelve
   *                                   una consulta de Supabase NUEVA.
   * @param {Object}   [opts]
   * @param {string}   [opts.etiqueta] Nombre para los mensajes de error.
   * @returns {Promise<Array>} Todas las filas.
   * @throws  {Error} Si cualquier tanda falla o se supera MAX_TANDAS.
   */
  async function traerTodo(construirQuery, opts) {
    const etiqueta = (opts && opts.etiqueta) || 'consulta';

    if (typeof construirQuery !== 'function') {
      throw new Error(
        'SbPaginado.traerTodo espera una FUNCIÓN que construya la consulta, ' +
        'no la consulta ya construida.'
      );
    }

    // Aviso de orden: sin .order() la paginación no es fiable.
    try {
      const muestra = construirQuery();
      const url = muestra && muestra.url ? String(muestra.url) : '';
      if (url && url.indexOf('order=') === -1) {
        console.warn(
          '[SbPaginado] La ' + etiqueta + ' no lleva .order(). ' +
          'Sin un orden fijo la paginación puede duplicar o perder filas.'
        );
      }
    } catch (_) {
      // Si no se puede inspeccionar la URL, seguimos: es solo un aviso.
    }

    const filas = [];
    let tandas = 0;

    for (let desde = 0; ; desde += TAM_TANDA) {
      if (++tandas > MAX_TANDAS) {
        throw new Error(
          'SbPaginado: la ' + etiqueta + ' ha superado ' + MAX_TANDAS +
          ' tandas (' + (MAX_TANDAS * TAM_TANDA) + ' filas). ' +
          'Se corta para no bloquear la página. Revisa los filtros.'
        );
      }

      const hasta = desde + TAM_TANDA - 1;
      const { data, error } = await construirQuery().range(desde, hasta);

      if (error) {
        throw new Error(
          'SbPaginado: fallo leyendo la ' + etiqueta +
          ' (filas ' + desde + '-' + hasta + '): ' +
          (error.message || 'error desconocido')
        );
      }

      const tanda = data || [];
      for (let i = 0; i < tanda.length; i++) filas.push(tanda[i]);

      // Tanda incompleta = no hay más datos. Fin.
      if (tanda.length < TAM_TANDA) break;
    }

    return filas;
  }

  window.SbPaginado = { traerTodo, TAM_TANDA, MAX_TANDAS };
})();
