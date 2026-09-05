/* ============================================================
   js/jornadas.js  ·  TIPOS DE JORNADA Y ASIGNACIONES
   ------------------------------------------------------------
   ÚNICA casa de la lectura de `tipos_jornada`, `asignaciones_jornada`
   y del tipo que lleva cada día marcado en `dias_intensiva_obra`.

   POR QUÉ EXISTE (76ª, 5/9/2026)
   Hasta ahora una obra tenía UN horario para todos: las columnas
   hora_entrada_default / hora_salida_default / minutos_descanso de
   `obras`. Medido sobre el 1–4 de septiembre en Muralla, solo 8 de 57
   jornadas llegaban a 8,00 h: la restauradora que no come, el grupo que
   para 30+30 y los que salen a las 16:30 cobraban con un horario que no
   era el suyo. Este módulo trae el horario QUE LE TOCA A CADA UNO.

   NO CALCULA HORAS. El cálculo sigue viviendo entero en
   js/excel-proforma.js, que es el motor único. Esto solo LEE y RESUELVE
   qué horario aplica; el resultado se le pasa al motor en `opts`.

   ⚠️ SIN ASIGNACIÓN, TODO SIGUE IGUAL. Quien no tenga fila en
   `asignaciones_jornada` devuelve null y el motor usa las columnas de
   `obras`, exactamente como antes. Ésa es la garantía de que desplegar
   esto no mueve ni un minuto de lo ya facturado.

   PRECEDENCIA (decidida por Dani, 76ª):
     1. El TIPO ASIGNADO A LA PERSONA manda siempre.
     2. Si no tiene tipo propio y ese día está marcado en el calendario
        de la obra, manda el tipo del día.
     3. Si no, el horario normal de la obra.
   El calendario de la obra NO pisa a quien tiene un horario pactado
   propio: a Verónica no se le cambia su jornada porque la obra marque
   un día intensiva.

   DEPENDE de js/fechas.js NO — trabaja con fechas 'YYYY-MM-DD' ya
   normalizadas por quien llama.
   ============================================================ */
(function () {
  'use strict';

  // ---------------------------------------------------------------
  // Carga desde Supabase los tipos de una obra y las asignaciones de
  // sus trabajadores, más el tipo de cada día marcado del calendario.
  //
  // Devuelve SIEMPRE un objeto usable, aunque falle algo: en el peor
  // caso devuelve un contexto vacío y el motor calcula como antes.
  // Un fallo de red no puede convertirse en una factura distinta.
  // ---------------------------------------------------------------
  async function cargar(sb, obraId) {
    const vacio = { tipos: {}, asignaciones: {}, diasTipo: {}, error: null };
    if (!sb || !obraId) return vacio;

    try {
      const [rTipos, rAsig, rDias] = await Promise.all([
        sb.from('tipos_jornada')
          .select('id,nombre,entrada,salida,almuerzo_fin,almuerzo_min,comida_fin,comida_min,activo')
          .eq('obra_id', obraId),
        sb.from('asignaciones_jornada')
          .select('trabajador_id,tipo_jornada_id,desde,hasta')
          .eq('obra_id', obraId),
        sb.from('dias_intensiva_obra')
          .select('fecha,tipo_jornada_id')
          .eq('obra_id', obraId)
          .not('tipo_jornada_id', 'is', null)
      ]);

      if (rTipos.error) throw rTipos.error;
      if (rAsig.error)  throw rAsig.error;
      if (rDias.error)  throw rDias.error;

      const tipos = {};
      (rTipos.data || []).forEach(t => { tipos[t.id] = normalizarTipo(t); });

      // Una persona puede tener varias asignaciones a lo largo del
      // tiempo (la vigencia es lo que impide que asignar hoy reescriba
      // julio). Se guardan todas y se elige por fecha al preguntar.
      const asignaciones = {};
      (rAsig.data || []).forEach(a => {
        if (!asignaciones[a.trabajador_id]) asignaciones[a.trabajador_id] = [];
        asignaciones[a.trabajador_id].push({
          tipo_id: a.tipo_jornada_id,
          desde: a.desde ? String(a.desde).slice(0, 10) : null,
          hasta: a.hasta ? String(a.hasta).slice(0, 10) : null
        });
      });

      const diasTipo = {};
      (rDias.data || []).forEach(d => {
        if (d.fecha) diasTipo[String(d.fecha).slice(0, 10)] = d.tipo_jornada_id;
      });

      return { tipos, asignaciones, diasTipo, error: null };

    } catch (e) {
      // No se lanza. Se devuelve el contexto vacío y se deja constancia
      // para que la pantalla pueda avisar si quiere. Calcular como antes
      // es un resultado conocido; calcular a medias no lo es.
      console.error('[jornadas] no se pudieron cargar los tipos:', e);
      return { tipos: {}, asignaciones: {}, diasTipo: {}, error: e };
    }
  }

  // ---------------------------------------------------------------
  // Deja un tipo en la forma exacta que espera el motor: horas 'HH:MM'
  // y minutos numéricos. Una pausa con 0 minutos se deja SIN hora, para
  // que el motor no tenga ni la tentación de descontarla.
  // ---------------------------------------------------------------
  function normalizarTipo(t) {
    const hm = v => (v ? String(v).slice(0, 5) : null);
    const aMin = Number(t.almuerzo_min) || 0;
    const cMin = Number(t.comida_min)   || 0;
    return {
      id: t.id,
      nombre: t.nombre || '',
      activo: t.activo !== false,
      entrada: hm(t.entrada),
      salida:  hm(t.salida),
      almuerzo_fin: aMin > 0 ? hm(t.almuerzo_fin) : null,
      almuerzo_min: aMin,
      comida_fin:   cMin > 0 ? hm(t.comida_fin)   : null,
      comida_min:   cMin
    };
  }

  // ---------------------------------------------------------------
  // ¿Qué tipo rige para esta persona este día? Devuelve el tipo o null.
  //
  // null significa "no hay tipo, usa el horario de la obra como
  // siempre". El motor tiene que tratar null como el camino de antes,
  // no como un error.
  //
  // ctx      · lo que devuelve cargar()
  // trabId   · uuid del trabajador
  // fechaISO · 'YYYY-MM-DD' en hora local de Madrid
  // ---------------------------------------------------------------
  function tipoDelDia(ctx, trabId, fechaISO) {
    if (!ctx || !ctx.tipos) return null;

    // 1 · El tipo de la persona manda siempre.
    const lista = ctx.asignaciones && ctx.asignaciones[trabId];
    if (lista && lista.length && fechaISO) {
      for (let i = 0; i < lista.length; i++) {
        const a = lista[i];
        if (a.desde && fechaISO < a.desde) continue;
        if (a.hasta && fechaISO > a.hasta) continue;
        const t = ctx.tipos[a.tipo_id];
        // FICH-019 trasladada: un tipo que no existe o está inactivo no
        // inventa un horario. Cae al de la obra, que es lo conocido.
        if (t && t.activo) return t;
      }
    }

    // 2 · Sin tipo propio: el que diga el calendario de la obra ese día.
    const idDia = ctx.diasTipo && fechaISO ? ctx.diasTipo[fechaISO] : null;
    if (idDia) {
      const t = ctx.tipos[idDia];
      if (t && t.activo) return t;
    }

    // 3 · Nada: horario de la obra.
    return null;
  }

  window.Jornadas = { cargar, tipoDelDia, normalizarTipo };
})();
