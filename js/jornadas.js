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

   PRECEDENCIA (decidida por Dani, 78ª–79ª; revisada en la 82ª):
     1. Tipo propio de la persona, SALVO que:
        - El día esté marcado ☀ en la obra, Y
        - Haya una intensiva real detrás (la obra la tiene configurada, o
          el día trae su propio tipo), Y
        - La asignación tenga seguir_intensiva_obra = true (defecto).
        En ese caso, la persona cede a la intensiva de la obra ese día.
     2. Tipo propio con seguir_intensiva_obra = false — nunca cede.
     3. Sin tipo propio: el tipo del día marcado en el calendario de obra.
     4. Horario normal de la obra.

   ⚠️ EL SÁBADO NO ENTRA AQUÍ. Una versión anterior de este comentario
   decía que el sábado mandaba sobre todo; es falso y confundía.
   `obras.hora_salida_sabado` solo se usa para la hora del CIERRE
   AUTOMÁTICO. No cambia ni un minuto del proforma: el sábado se paga
   fijando las horas del día a mano. El motor solo guarda la marca
   es_sabado para que la pantalla lo pinte.

   ⚠️ `activo` ES VISIBILIDAD DE CATÁLOGO, NO UNA REGLA DE CÁLCULO.
   Un tipo desactivado se sigue aplicando a quien ya lo tiene asignado y a
   los días ya marcados con él; lo único que impide es asignarlo a alguien
   nuevo. Hasta la 82ª no era así, y desactivar un tipo reescribía las
   horas de su gente hacia atrás sin avisar.

   La casilla seguir_intensiva_obra permite que el mismo horario pactado
   se conserve en verano (false) o ceda a la jornada de obra (true, por
   defecto). Como la asignación lleva vigencia, puede cambiar de año en
   año sin tocar lo pasado.

   DEPENDE de js/sb-paginado.js. Supabase corta en 1.000 filas SIN AVISAR:
   si `asignaciones_jornada` pasara de ahí, faltarían personas y esas
   calcularían con el horario general sin que nada fallara. Silencioso y
   caro. Si el paginador no está cargado, esto se niega a leer en vez de
   leer a medias.

   Trabaja con fechas 'YYYY-MM-DD' ya normalizadas por quien llama.
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
    const vacio = { tipos: {}, asignaciones: {}, diasIntensiva: new Set(), diasTipo: {}, intensivaConfigurada: false, error: null };
    if (!sb || !obraId) return vacio;

    try {
      if (!window.SbPaginado) {
        throw new Error('falta js/sb-paginado.js: no se lee a medias');
      }

      // traerTodo() LANZA si algo falla; no devuelve datos incompletos.
      // El .order() es obligatorio: sin orden fijo la paginación duplica
      // unas filas y se deja otras.
      const [datosTipos, datosAsig, datosDias, datosObra] = await Promise.all([
        window.SbPaginado.traerTodo(() => sb.from('tipos_jornada')
          .select('id,nombre,entrada,salida,almuerzo_fin,almuerzo_min,comida_fin,comida_min,activo')
          .eq('obra_id', obraId).order('id', { ascending: true })),
        window.SbPaginado.traerTodo(() => sb.from('asignaciones_jornada')
          // 79ª: añadido seguir_intensiva_obra para respetar la casilla
          .select('trabajador_id,tipo_jornada_id,desde,hasta,seguir_intensiva_obra')
          .eq('obra_id', obraId).order('id', { ascending: true })),
        window.SbPaginado.traerTodo(() => sb.from('dias_intensiva_obra')
          .select('fecha,tipo_jornada_id')
          .eq('obra_id', obraId)
          .order('fecha', { ascending: true })),
        // 82ª · Hace falta saber si la obra tiene horario intensivo guardado,
        // para no "ceder" a una intensiva inexistente. Una sola fila.
        sb.from('obras')
          .select('hora_entrada_intensiva,hora_salida_intensiva')
          .eq('id', obraId).maybeSingle()
      ]);

      const tipos = {};
      (datosTipos || []).forEach(t => { tipos[t.id] = normalizarTipo(t); });

      // Una persona puede tener varias asignaciones a lo largo del
      // tiempo (la vigencia es lo que impide que asignar hoy reescriba
      // julio). Se guardan todas y se elige por fecha al preguntar.
      const asignaciones = {};
      (datosAsig || []).forEach(a => {
        if (!asignaciones[a.trabajador_id]) asignaciones[a.trabajador_id] = [];
        asignaciones[a.trabajador_id].push({
          tipo_id: a.tipo_jornada_id,
          desde: a.desde ? String(a.desde).slice(0, 10) : null,
          hasta: a.hasta ? String(a.hasta).slice(0, 10) : null,
          // 79ª: true = cede a la intensiva de la obra en días ☀ (defecto)
          seguir_intensiva_obra: a.seguir_intensiva_obra !== false
        });
      });

      // diasTipo: qué tipo aplica ese día (puede ser null si solo está
      // marcado el día sin tipo concreto asignado).
      // diasIntensiva: Set de fechas 'YYYY-MM-DD' que están marcadas como
      // intensiva en la obra, independientemente de si tienen tipo o no.
      // Necesario para que tipoDelDia() pueda evaluar la casilla.
      const diasTipo = {};
      const diasIntensiva = new Set();
      (datosDias || []).forEach(d => {
        if (!d.fecha) return;
        const f = String(d.fecha).slice(0, 10);
        diasIntensiva.add(f);
        if (d.tipo_jornada_id) diasTipo[f] = d.tipo_jornada_id;
      });

      const obraInt = (datosObra && datosObra.data) || {};
      const intensivaConfigurada = !!(obraInt.hora_entrada_intensiva && obraInt.hora_salida_intensiva);

      return { tipos, asignaciones, diasIntensiva, diasTipo, intensivaConfigurada, error: null };

    } catch (e) {
      // No se lanza. Se devuelve el contexto vacío y se deja constancia
      // para que la pantalla pueda avisar si quiere. Calcular como antes
      // es un resultado conocido; calcular a medias no lo es.
      console.error('[jornadas] no se pudieron cargar los tipos:', e);
      return { tipos: {}, asignaciones: {}, diasIntensiva: new Set(), diasTipo: {}, intensivaConfigurada: false, error: e };
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

    // ¿El día está marcado ☀ en la obra?
    // 82ª · Y además, ¿hay una intensiva de verdad detrás? El motor solo
    // aplica el horario de verano si la obra tiene entrada Y salida
    // intensivas guardadas (o si el día trae su propio tipo). Si aquí no se
    // comprobara lo mismo, una persona con horario pactado "cedería" a una
    // intensiva que no existe y acabaría con el horario NORMAL de la obra:
    // lo peor de las dos opciones.
    const hayIntensivaDetras = !!(
      (ctx.diasTipo && ctx.diasTipo[fechaISO]) || ctx.intensivaConfigurada
    );
    const esDiaIntensivo = !!(ctx.diasIntensiva && ctx.diasIntensiva.has(fechaISO))
                           && hayIntensivaDetras;

    // 1 · El tipo de la persona, con matiz de la 79ª.
    const lista = ctx.asignaciones && ctx.asignaciones[trabId];
    if (lista && lista.length && fechaISO) {
      for (let i = 0; i < lista.length; i++) {
        const a = lista[i];
        if (a.desde && fechaISO < a.desde) continue;
        if (a.hasta && fechaISO > a.hasta) continue;

        // 79ª · Si el día es ☀ y la casilla está marcada (defecto), la
        // persona cede a la intensiva de la obra: se ignora su tipo propio
        // para que el motor tome el camino de la intensiva (rama null).
        // Si la casilla está desmarcada, su horario pactado manda siempre.
        if (esDiaIntensivo && a.seguir_intensiva_obra !== false) continue;

        const t = ctx.tipos[a.tipo_id];
        // 82ª · `activo` es VISIBILIDAD DE CATÁLOGO, no una regla de cálculo.
        // Antes esto exigía `t.activo`, así que desactivar un tipo tiraba a
        // su gente al horario de la obra — hacia atrás, en todos los meses
        // abiertos, y descuadrando los cerrados. Media hora al día por
        // persona con un clic y sin ningún aviso.
        // Un tipo que ya está ASIGNADO se aplica aunque esté desactivado;
        // desactivarlo solo impide asignarlo a alguien nuevo.
        // Lo que sigue en pie (FICH-019) es que un tipo INEXISTENTE no
        // inventa horario: eso sí cae al de la obra, que es lo conocido.
        if (t) return t;
      }
    }

    // 2 · Sin tipo propio (o cedido): el que diga el calendario de la obra ese día.
    const idDia = ctx.diasTipo && fechaISO ? ctx.diasTipo[fechaISO] : null;
    if (idDia) {
      const t = ctx.tipos[idDia];
      // 82ª · Igual que arriba: un día ya marcado con este tipo lo conserva
      // aunque el tipo se desactive. Si no, desactivar el tipo Intensiva
      // reescribiría los 50 días marcados de cada verano.
      if (t) return t;
    }

    // 3 · Nada: horario de la obra.
    return null;
  }

  window.Jornadas = { cargar, tipoDelDia, normalizarTipo };
})();
