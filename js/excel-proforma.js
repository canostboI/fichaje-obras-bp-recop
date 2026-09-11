/**
 * excel-proforma.js — Generador de Excel proforma mensual
 *
 * Módulo compartido por admin/fichajes.html y jefe/fichajes.html.
 *
 * Uso:
 *   1) Cargar ExcelJS antes que este script:
 *        <script src="https://cdn.jsdelivr.net/npm/exceljs@4.4.0/dist/exceljs.min.js"></script>
 *        <script src="../js/excel-proforma.js"></script>
 *
 *   2) Llamar al generador:
 *        const { buffer, autocierres } = await window.ExcelProforma.generar({
 *          obra: { id, nombre, numero_obra, empresa_marca },
 *          mes: '2026-04',
 *          fichajes: [...],
 *          logoBase64: '...'   // opcional: PNG en base64
 *        });
 *
 *      Cada fichaje debe traer al menos:
 *        { id, tipo, hora, cierre_automatico, trabajador_id,
 *          trabajador: { id, nombre, apellidos, dni, categoria, categoria_otra,
 *                        precio_hora_personalizado,
 *                        empresa: { nombre } } }
 *
 *   3) Devuelve { buffer, autocierres }. No descarga el archivo.
 */

(function () {
  'use strict';

  // ===== Paletas por marca =====
  const PALETAS = {
    bosch_pascual: {
      oscuro:   '1A7A8A',
      medio:    '1D6B79',
      acento:   'D6EEF2',
      textoSub: '1A7A8A',
    },
    recop: {
      oscuro:   'A0392B',
      medio:    '8B3124',
      acento:   'F5D5D1',
      textoSub: 'A0392B',
    },
    _default: {
      oscuro:   '404040',
      medio:    '808080',
      acento:   'F0F0F0',
      textoSub: '404040',
    }
  };

  const FUENTE_EXCEL = 'Arial';
  const COLOR_FINDE  = 'D0D0D0';
  const COLOR_BAND   = 'F7F7F7';
  const COLOR_TOTAL  = 'FFF2CC';
  const COLOR_FOOTER = 'FFE699';
  const COLOR_ALERTA = 'FFE0B2';
  const COLOR_AJUSTE = 'D6E7FF'; // azul claro: día con horas fijadas a mano
  const COLOR_BLANCO = 'FFFFFF';
  const COLOR_BORDE  = 'BFBFBF';

  const CATEGORIA_COLORES = {
    'peon':         'E8E8E8',
    'peón':         'E8E8E8',
    'oficial':      'D6E4F7',
    'encargado':    'D5F5E3',
    'capataz':      'D5F5E3',
    'gruista':      'E8DAEF',
    'electricista': 'FCF3CF',
    'restaurador':  'FADBD8',
    'tecnico':      'FDEBD0',
    'técnico':      'FDEBD0',
    'otra':         'EAECEE',
  };

  // Cómo se escribe cada categoría en el papel. La base de datos las guarda
  // en minúscula y sin acentos; el Excel lo lee una persona.
  const CATEGORIA_ETIQUETAS = {
    'peon':         'Peón',
    'oficial':      'Oficial',
    'encargado':    'Encargado',
    'gruista':      'Gruista',
    'electricista': 'Electricista',
    'restaurador':  'Restaurador',
  };

  // Con la categoría "otra" manda el texto libre que escribió el jefe.
  // Si estuviera vacío (no debería: la BD lo impide), cae en "Otra".
  function etiquetaCategoria(t) {
    const clave = (t.categoria || '').toLowerCase().trim();
    if (clave === 'otra') return String(t.categoria_otra || '').trim() || 'Otra';
    return CATEGORIA_ETIQUETAS[clave] || (t.categoria || '');
  }

  // ===== Helper para obtener dimensiones reales del PNG =====
  // Decodifica la cabecera del PNG para leer width/height sin Image()
  function dimensionesPng(base64Data) {
    try {
      const binStr = atob(base64Data.slice(0, 50));
      const bytes = new Uint8Array(binStr.length);
      for (let i = 0; i < binStr.length; i++) bytes[i] = binStr.charCodeAt(i);
      // En un PNG, width está en bytes 16-19 y height en 20-23 (big-endian)
      const w = (bytes[16] << 24) | (bytes[17] << 16) | (bytes[18] << 8) | bytes[19];
      const h = (bytes[20] << 24) | (bytes[21] << 16) | (bytes[22] << 8) | bytes[23];
      if (w > 0 && h > 0 && w < 10000 && h < 10000) return { w, h };
    } catch (e) {}
    return null;
  }

  // ===== Función pública =====

  async function generar({ obra, mes, fichajes, logoBase64, ajustes, diasIntensiva, jornadas, trabajadoresSinFichaje }) {
    if (!window.ExcelJS) throw new Error('ExcelJS no está cargado.');
    if (!mes || !/^\d{4}-\d{2}$/.test(mes)) throw new Error('Mes inválido. Formato: YYYY-MM.');
    if (!Array.isArray(fichajes)) throw new Error('fichajes debe ser un array.');

    const marca = (obra?.empresa_marca || '').toLowerCase().trim();
    const paleta = PALETAS[marca] || PALETAS._default;

    const grupos = agruparPorEmpresa(fichajes);
    const workbook = new window.ExcelJS.Workbook();
    workbook.creator = 'Fichaje Obras';
    workbook.created = new Date();

    const [year, month] = mes.split('-').map(Number);
    const diasMes = new Date(year, month, 0).getDate();

    // 83ª · Trabajadores con horas fijadas a mano pero sin ningún fichaje
    // este mes: necesitan estar en el grupo de su empresa para que el
    // motor les aplique los ajustes y aparezcan en el proforma.
    // Se distribuyen ANTES de iterar los grupos.
    const extrasPorEmpresa = {};
    if (trabajadoresSinFichaje && trabajadoresSinFichaje.length) {
      const conFichaje = new Set();
      fichajes.forEach(f => {
        const id = f.trabajador_id || (f.trabajador && f.trabajador.id);
        if (id) conFichaje.add(String(id));
      });
      trabajadoresSinFichaje.forEach(tw => {
        if (conFichaje.has(String(tw.id))) return; // ya está por fichajes
        const empresa = tw.empresa?.nombre || 'Sin empresa';
        if (!grupos[empresa]) grupos[empresa] = [];
        if (!extrasPorEmpresa[empresa]) extrasPorEmpresa[empresa] = [];
        extrasPorEmpresa[empresa].push(tw);
      });
    }

    const nombresEmpresa = Object.keys(grupos);
    let totalAutocierres = 0;

    if (nombresEmpresa.length === 0) {
      crearHojaEmpresa(workbook, {
        obra, nombreEmpresa: 'Sin empresa', mes, year, month, diasMes,
        trabajadores: [], paleta, logoBase64
      });
    } else {
      nombresEmpresa
        .sort((a, b) => a.localeCompare(b, 'es'))
        .forEach(nombreEmpresa => {
          const trabajadores = construirResumenTrabajadores(
            grupos[nombreEmpresa], diasMes,
            { horaEntrada: obra && obra.hora_entrada_default, horaSalida: obra && obra.hora_salida_default, ajustes, minutosDescanso: obra && obra.minutos_descanso,
              horaEntradaIntensiva: obra && obra.hora_entrada_intensiva, horaSalidaIntensiva: obra && obra.hora_salida_intensiva, minutosDescansoIntensiva: obra && obra.minutos_descanso_intensiva,
              finAlmuerzo: obra && obra.fin_almuerzo, finComida: obra && obra.fin_comida,
              jornadas: jornadas || null,
              diasIntensiva,
              trabajadoresSinFichaje: extrasPorEmpresa[nombreEmpresa] || null,
              year, month }
          );
          trabajadores.forEach(t => { totalAutocierres += (t.autocierres_mes || 0); });
          crearHojaEmpresa(workbook, {
            obra, nombreEmpresa, mes, year, month, diasMes,
            trabajadores, paleta, logoBase64
          });
        });
    }

    const buffer = await workbook.xlsx.writeBuffer();
    return { buffer, autocierres: totalAutocierres };
  }

  // ===== Lógica de datos =====

  function agruparPorEmpresa(fichajes) {
    const grupos = {};
    fichajes.forEach(f => {
      const empresa = f.trabajador?.empresa?.nombre || 'Sin empresa';
      if (!grupos[empresa]) grupos[empresa] = [];
      grupos[empresa].push(f);
    });
    return grupos;
  }

  function construirResumenTrabajadores(fichajes, diasMes, opts) {
    const horaEntradaObra = opts && opts.horaEntrada ? opts.horaEntrada : null;
    const horaSalidaObra  = opts && opts.horaSalida  ? opts.horaSalida  : null;
    // Descanso de la obra en jornada completa. null/undefined → 90 (histórico).
    // Se usa != null para respetar el 0 (jornada intensiva sin comida).
    const minutosDescanso = (opts && opts.minutosDescanso != null) ? opts.minutosDescanso : 90;
    // Jornada intensiva (horario de verano). Si un día está en diasIntensiva,
    // se usa este horario en vez del normal. minutosDescansoIntensiva suele ser 0.
    const horaEntradaIntensiva = opts && opts.horaEntradaIntensiva ? opts.horaEntradaIntensiva : null;
    const horaSalidaIntensiva  = opts && opts.horaSalidaIntensiva  ? opts.horaSalidaIntensiva  : null;
    // FICH-019 - Un dia marcado como intensiva solo cambia el horario si la obra
    // TIENE horario intensivo guardado: hacen falta ENTRADA Y SALIDA. Sin las
    // dos, ese dia es un dia normal ENTERO (entrada, salida y descanso).
    const intensivaConfigurada = !!(horaEntradaIntensiva && horaSalidaIntensiva);
    const minutosDescansoIntensiva = (opts && opts.minutosDescansoIntensiva != null) ? opts.minutosDescansoIntensiva : null;
    const finAlmuerzo = (opts && opts.finAlmuerzo) ? String(opts.finAlmuerzo).slice(0,5) : '09:30';
    const finComida   = (opts && opts.finComida)   ? String(opts.finComida).slice(0,5)   : '14:30';
    const diasIntensiva = (opts && opts.diasIntensiva)
      ? (opts.diasIntensiva instanceof Set ? opts.diasIntensiva : new Set(opts.diasIntensiva))
      : new Set();
    // Ajustes de horas fijadas a mano (tabla ajustes_horas_dia):
    // { trabajador_id: { dia: { horas, motivo } } }. Opcional.
    const ajustes = (opts && opts.ajustes) || null;
    // 76ª · Contexto de tipos de jornada (js/jornadas.js). Si no llega,
    // `tipoDelDia` devuelve null siempre y el cálculo es el de antes.
    const ctxJornadas = (opts && opts.jornadas) || null;
    const resolverTipo = (ctxJornadas && window.Jornadas && window.Jornadas.tipoDelDia)
      ? (trabId, fechaISO) => window.Jornadas.tipoDelDia(ctxJornadas, trabId, fechaISO)
      : () => null;
    // 83ª · Año y mes para construir fechas de referencia cuando un
    // trabajador no tiene fichajes (solo horas fijadas a mano).
    const refYear  = (opts && opts.year)  || null;
    const refMonth = (opts && opts.month) || null; // 1-based
    const mapa = new Map();

    fichajes.forEach(f => {
      const t = f.trabajador;
      if (!t) return;
      if (!mapa.has(t.id)) {
        mapa.set(t.id, {
          id: t.id,
          nombre: nombreCompleto(t),
          dni: t.dni || '',
          categoria: t.categoria || '',
          categoria_otra: t.categoria_otra || '',
          precio_hora: t.precio_hora_personalizado ?? null,
          fichajes: []
        });
      }
      mapa.get(t.id).fichajes.push(f);
    });

    // 83ª · Trabajadores con horas fijadas a mano pero sin fichajes este
    // mes: se añaden al mapa con fichajes vacíos. Solo les aplican ajustes.
    const extras = (opts && opts.trabajadoresSinFichaje) || [];
    extras.forEach(tw => {
      if (mapa.has(tw.id)) return; // ya entró por fichajes
      mapa.set(tw.id, {
        id: tw.id,
        nombre: nombreCompleto(tw),
        dni: tw.dni || '',
        categoria: tw.categoria || '',
        categoria_otra: tw.categoria_otra || '',
        precio_hora: tw.precio_hora_personalizado ?? null,
        fichajes: []
      });
    });

    const trabajadores = [...mapa.values()].sort((a, b) =>
      a.nombre.localeCompare(b.nombre, 'es')
    );

    trabajadores.forEach(t => {
      t.dias = {};
      t.dias_autocierre = {};
      t.dias_ajuste = {};   // día -> { calculadas, fijadas, motivo }
      // ENTRADA 50 · el detalle de cada día, para la foto del mes cerrado.
      // Los ingredientes que explican el número YA se calculan aquí abajo;
      // hasta ahora se tiraban y solo se guardaba el neto. Esto no cambia
      // ningún cálculo: solo deja de tirarlos. Nadie más lo lee.
      t.dias_detalle = {};   // día -> { fecha, hora_entrada, ... }
      for (let d = 1; d <= diasMes; d++) {
        t.dias[d] = 0;
        t.dias_autocierre[d] = 0;
      }

      // Autocierres: se siguen contando por DÍA NATURAL, exactamente igual que
      // antes del emparejado. Es un contador de avisos, no una hora que se
      // pague, y una salida automática sin entrada delante también interesa
      // verla. Separado a propósito del cálculo de horas.
      t.fichajes.forEach(f => {
        if (f.tipo !== 'salida' || !f.cierre_automatico) return;
        const dia = new Date(f.hora).getDate();
        if (dia >= 1 && dia <= diasMes) t.dias_autocierre[dia] = (t.dias_autocierre[dia] || 0) + 1;
      });

      // FICH-016 + FICH-017 — CADA ENTRADA CON *SU* SALIDA, NO POR DÍA NATURAL.
      // Antes se agrupaba por día del calendario. Una jornada que termina
      // después de medianoche dejaba una entrada sin salida en un día y una
      // salida sin entrada en el siguiente: los DOS días valían CERO. Quien
      // fichó la salida a las 00:10 cobraba cero por un día entero de trabajo.
      //
      // Ahora los fichajes se recorren en orden y se agrupan en JORNADAS:
      //   · una jornada ABRE con una `entrada`;
      //   · se le van sumando los eventos siguientes;
      //   · se CIERRA en cuanto llega una `entrada` de OTRO día natural.
      // Dentro de la jornada se sigue tomando la PRIMERA entrada y la ÚLTIMA
      // salida (modelo de obra: la pausa de comer no se ficha), así que un día
      // corriente da EXACTAMENTE el mismo número que antes. La jornada se
      // imputa al día en que EMPEZÓ.
      //
      // Límite conocido y aceptado: los fichajes llegan acotados al mes, así
      // que una jornada que empieza el día 31 y termina el 1 del mes siguiente
      // se queda sin salida y vale cero — igual que hoy, ni mejor ni peor.
      const eventosOrdenados = t.fichajes
        .map(f => ({ tipo: f.tipo, hora: new Date(f.hora),
                     cierre_automatico: !!f.cierre_automatico,
                     es_manual: !!f.es_manual }))
        .filter(ev => !isNaN(ev.hora.getTime()))
        .sort((a, b) => a.hora - b.hora);

      const jornadas = [];
      let jornadaAbierta = null;
      eventosOrdenados.forEach(ev => {
        if (ev.tipo === 'entrada') {
          // Una entrada de otro día quiere decir que la jornada anterior ya
          // terminó (con salida o sin ella).
          if (jornadaAbierta && !mismoDiaNatural(jornadaAbierta.entrada, ev.hora)) jornadaAbierta = null;
          if (!jornadaAbierta) {
            jornadaAbierta = { entrada: ev.hora, salida: null,
                               autocierre: false, manual: !!ev.es_manual };
            jornadas.push(jornadaAbierta);
          }
          // Una segunda entrada del MISMO día no abre jornada nueva: sigue
          // valiendo la primera, que es el modelo que ya había.
        } else if (ev.tipo === 'salida') {
          // Una salida sin entrada delante no se puede valorar: no se sabe
          // cuándo empezó. Se ignora, igual que antes.
          if (jornadaAbierta) {
            jornadaAbierta.salida = ev.hora;
            jornadaAbierta.autocierre = !!ev.cierre_automatico;
            if (ev.es_manual) jornadaAbierta.manual = true;
          }
        }
      });

      jornadas.forEach(j => {
        const dia = j.entrada.getDate();
        if (dia < 1 || dia > diasMes) return;
        const primeraEntrada = j.entrada;
        const ultimaSalida = j.salida;

        let netoDia = 0;
        let brutoDia = null;      // ENTRADA 50 · ingredientes del día
        let descansoAplicado = null;
        let intensivaDia = false;
        let tipoDiaNombre = null;
        if (primeraEntrada && ultimaSalida && ultimaSalida > primeraEntrada) {
          // ¿Este día fue jornada intensiva en esta obra? Si sí, se usa el
          // horario de verano (otra entrada/salida y, normalmente, sin comida).
          const fechaKey = fechaISOLocal(primeraEntrada);
          // FICH-019 - Antes la entrada y la salida SI caian al horario normal
          // cuando la obra no tenia intensiva guardada, pero el descanso caia
          // a 0: un dia marcado sin horario detras salia sin descontar la comida,
          // hasta 1,5 h de mas por persona y dia. Ahora los tres van juntos.
          const esIntensiva = intensivaConfigurada && diasIntensiva.has(fechaKey);

          // 76ª · TIPO DE JORNADA DE ESTA PERSONA ESTE DÍA.
          // Manda sobre todo lo demás, incluido el calendario de la obra:
          // marcar un día intensiva no le cambia la jornada a quien tiene
          // un horario pactado propio. Si no hay tipo, null y sigue el
          // camino de siempre (obra + intensiva), sin cambiar nada.
          const tipoDia = resolverTipo(t.id, fechaKey);

          const entradaDia = tipoDia ? tipoDia.entrada
                           : (esIntensiva ? horaEntradaIntensiva : horaEntradaObra);
          const salidaDia  = tipoDia ? tipoDia.salida
                           : (esIntensiva ? horaSalidaIntensiva  : horaSalidaObra);
          // Con tipo, el interruptor de descanso lo enciende que el tipo
          // tenga alguna pausa; los minutos los pone el propio tipo.
          const descansoDia = tipoDia
            ? ((tipoDia.almuerzo_min || 0) + (tipoDia.comida_min || 0))
            : (esIntensiva
                ? (minutosDescansoIntensiva != null ? minutosDescansoIntensiva : 0)
                : minutosDescanso);
          const finAlmuerzoDia = tipoDia ? tipoDia.almuerzo_fin : finAlmuerzo;
          const finComidaDia   = tipoDia ? tipoDia.comida_fin   : finComida;
          const minAlmuerzoDia = tipoDia ? tipoDia.almuerzo_min : null;
          const minComidaDia   = tipoDia ? tipoDia.comida_min   : null;
          // Compensación (9/7/2026): los minutos trabajados ANTES de la hora
          // oficial de entrada compensan, hasta un máximo de 15 min, los que
          // falten para llegar a la hora oficial de salida. Ej.: entra 7:42 y
          // sale 17:19 con jornada 8:00-17:30 → los 18 min de antelación
          // (topados a 15) cubren los 11 que faltan → cobra jornada completa.
          // Se aplica sobre la hora REAL de salida, antes del redondeo, para
          // que el resultado siga cayendo en cuartos limpios.
          const sueloReal = limiteDelDia(primeraEntrada, entradaDia);
          const techoReal = limiteDelDia(primeraEntrada, salidaDia);

          // TOLERANCIA DE JORNADA (25/8/2026) — se aplica ANTES de todo lo
          // demas: si la entrada o la salida caen a menos de
          // TOLERANCIA_JORNADA_MS del horario oficial, cuenta el horario
          // oficial. Solo acerca al horario, nunca lo pasa.
          // Los fichajes REALES no se tocan: `primeraEntrada` y
          // `ultimaSalida` se siguen guardando tal cual en dias_detalle.
          let entradaEfectiva = primeraEntrada;
          let salidaEfectiva  = ultimaSalida;
          if (sueloReal && primeraEntrada > sueloReal &&
              (primeraEntrada - sueloReal) <= TOLERANCIA_JORNADA_MS) {
            entradaEfectiva = sueloReal;
          }
          if (techoReal && ultimaSalida < techoReal &&
              (techoReal - ultimaSalida) <= TOLERANCIA_JORNADA_MS) {
            salidaEfectiva = techoReal;
          }

          if (sueloReal && techoReal &&
              entradaEfectiva < sueloReal && salidaEfectiva < techoReal) {
            const colchon = Math.min(sueloReal - entradaEfectiva, COMPENSACION_MAX_MS);
            const deficit = techoReal - salidaEfectiva;
            salidaEfectiva = new Date(salidaEfectiva.getTime() + Math.min(colchon, deficit));
          }

          let inicio = redondearEntrada(entradaEfectiva);
          let fin    = redondearSalida(salidaEfectiva);

          // Suelo: no se paga antes de la hora oficial de entrada de la obra.
          const suelo = limiteDelDia(primeraEntrada, entradaDia);
          if (suelo && inicio < suelo) inicio = suelo;

          // Techo: no se pagan horas después de la hora oficial de salida.
          const techo = limiteDelDia(primeraEntrada, salidaDia);
          if (techo && fin > techo) fin = techo;

          const bruto = (fin - inicio) / 3600000;
          if (bruto > 0 && bruto < 24) {
            descansoAplicado = descansoMin(inicio, fin, finAlmuerzoDia, finComidaDia,
                                           descansoDia, minAlmuerzoDia, minComidaDia);
            netoDia = Math.max(0, bruto - descansoAplicado / 60);
            brutoDia = redondear2(bruto);
          }
          intensivaDia = esIntensiva;
          tipoDiaNombre = tipoDia ? tipoDia.nombre : null;
        }

        t.dias[dia] = redondear2(netoDia);

        // ENTRADA 50 · una línea por jornada, aunque valga cero: un día a
        // cero también se discute a fin de mes.
        t.dias_detalle[dia] = {
          fecha: fechaISOLocal(primeraEntrada),
          hora_entrada: primeraEntrada ? primeraEntrada.toISOString() : null,
          hora_salida: ultimaSalida ? ultimaSalida.toISOString() : null,
          horas_brutas: brutoDia,
          descanso_min: descansoAplicado,
          horas_netas: t.dias[dia],
          es_intensiva: intensivaDia,
          tipo_jornada: tipoDiaNombre,
          es_sabado: primeraEntrada.getDay() === 6,
          hubo_autocierre: !!j.autocierre,
          hubo_manual: !!j.manual,
          ajuste_horas: null
        };
      });

      // Horas fijadas a mano: sustituyen a las calculadas en ese día.
      // Los fichajes reales no cambian; solo el número que se muestra,
      // se suma y se exporta. Guardamos las calculadas para trazabilidad.
      if (ajustes && ajustes[t.id]) {
        Object.keys(ajustes[t.id]).forEach(diaStr => {
          const dia = Number(diaStr);
          if (dia < 1 || dia > diasMes) return;
          const aj = ajustes[t.id][diaStr];
          const fijadas = redondear2(Number(aj.horas));
          if (isNaN(fijadas)) return;
          t.dias_ajuste[dia] = {
            calculadas: t.dias[dia] || 0,
            fijadas: fijadas,
            motivo: aj.motivo || ''
          };
          t.dias[dia] = fijadas;

          // ENTRADA 50 · un día con horas fijadas a mano y SIN fichajes no
          // tiene jornada, así que no habría línea. Se crea aquí: esas horas
          // se pagan igual y tienen que estar en la foto.
          if (!t.dias_detalle[dia]) {
            // 83ª · Si el trabajador no tiene fichajes (solo horas fijadas),
            // no hay t.fichajes[0] de donde sacar año/mes. Se usa refYear/
            // refMonth que llegan desde opts. Fallback al primer fichaje si
            // existe (camino original).
            let fRef;
            if (t.fichajes.length > 0) {
              const ref0 = new Date(t.fichajes[0].hora);
              fRef = new Date(ref0.getFullYear(), ref0.getMonth(), dia);
            } else if (refYear && refMonth) {
              fRef = new Date(refYear, refMonth - 1, dia);
            } else {
              // Último recurso: no debería llegar aquí.
              fRef = new Date(new Date().getFullYear(), new Date().getMonth(), dia);
            }
            t.dias_detalle[dia] = {
              fecha: fechaISOLocal(fRef),
              hora_entrada: null, hora_salida: null,
              horas_brutas: null, descanso_min: null,
              horas_netas: 0,
              es_intensiva: intensivaConfigurada && diasIntensiva.has(fechaISOLocal(fRef)),
              es_sabado: fRef.getDay() === 6,
              hubo_autocierre: (t.dias_autocierre[dia] || 0) > 0,
              hubo_manual: true,
              ajuste_horas: null
            };
          }
          t.dias_detalle[dia].horas_netas = fijadas;
          t.dias_detalle[dia].ajuste_horas = fijadas;
        });
      }

      t.horas_mes = redondear2(Object.values(t.dias).reduce((a, b) => a + b, 0));
      // ⚠️ AQUÍ NO SE CALCULA NINGÚN IMPORTE, Y ES A PROPÓSITO.
      // Hubo un `t.total = horas_mes * precio_hora` que no leía nadie: se
      // calculaba y se tiraba. Retirado (33ª) por el mismo motivo por el que
      // se retiró `calcular_horas_mes` de la BD en la 23ª: un motor de
      // cálculo dormido es una trampa para quien lea esto dentro de un año.
      // El importe lo calcula el PROPIO EXCEL, con la fórmula `horas*precio`
      // que se escribe en la celda de total. Así quien factura teclea el
      // precio en su columna y todo recalcula solo. Si algún día hace falta
      // el importe en JS, se añade CON un consumidor, no antes.
      t.autocierres_mes = Object.values(t.dias_autocierre).reduce((a, b) => a + b, 0);
    });

    return trabajadores;
  }
