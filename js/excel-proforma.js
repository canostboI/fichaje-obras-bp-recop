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
 *          trabajador: { id, nombre, apellidos, dni, categoria,
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
    'peon':    'E8E8E8',
    'peón':    'E8E8E8',
    'oficial': 'D6E4F7',
    'capataz': 'D5F5E3',
    'tecnico': 'FDEBD0',
    'técnico': 'FDEBD0',
  };

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

  async function generar({ obra, mes, fichajes, logoBase64, ajustes }) {
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
            { horaEntrada: obra && obra.hora_entrada_default, horaSalida: obra && obra.hora_salida_default, ajustes, minutosDescanso: obra && obra.minutos_descanso }
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
    // Ajustes de horas fijadas a mano (tabla ajustes_horas_dia):
    // { trabajador_id: { dia: { horas, motivo } } }. Opcional.
    const ajustes = (opts && opts.ajustes) || null;
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
          precio_hora: t.precio_hora_personalizado ?? null,
          fichajes: []
        });
      }
      mapa.get(t.id).fichajes.push(f);
    });

    const trabajadores = [...mapa.values()].sort((a, b) =>
      a.nombre.localeCompare(b.nombre, 'es')
    );

    trabajadores.forEach(t => {
      t.dias = {};
      t.dias_autocierre = {};
      t.dias_ajuste = {};   // día -> { calculadas, fijadas, motivo }
      for (let d = 1; d <= diasMes; d++) {
        t.dias[d] = 0;
        t.dias_autocierre[d] = 0;
      }

      const porDia = {};
      t.fichajes.forEach(f => {
        const d = new Date(f.hora);
        const dia = d.getDate();
        if (!porDia[dia]) porDia[dia] = [];
        porDia[dia].push({ tipo: f.tipo, hora: d, cierre_automatico: !!f.cierre_automatico });
      });

      Object.keys(porDia).forEach(diaStr => {
        const dia = Number(diaStr);
        const eventos = porDia[dia].sort((a, b) => a.hora - b.hora);

        // Modelo de obra: una entrada al llegar y una salida al irse (la pausa
        // de comer NO se ficha). Tomamos la primera entrada y la última salida
        // del día; el descanso se descuenta como bloque sobre el bruto.
        let primeraEntrada = null, ultimaSalida = null, autocierresDia = 0;
        eventos.forEach(ev => {
          if (ev.tipo === 'entrada') {
            if (!primeraEntrada) primeraEntrada = ev.hora;
          } else if (ev.tipo === 'salida') {
            ultimaSalida = ev.hora;
            if (ev.cierre_automatico) autocierresDia++;
          }
        });

        let netoDia = 0;
        if (primeraEntrada && ultimaSalida && ultimaSalida > primeraEntrada) {
          // Compensación (9/7/2026): los minutos trabajados ANTES de la hora
          // oficial de entrada compensan, hasta un máximo de 15 min, los que
          // falten para llegar a la hora oficial de salida. Ej.: entra 7:42 y
          // sale 17:19 con jornada 8:00-17:30 → los 18 min de antelación
          // (topados a 15) cubren los 11 que faltan → cobra jornada completa.
          // Se aplica sobre la hora REAL de salida, antes del redondeo, para
          // que el resultado siga cayendo en cuartos limpios.
          const sueloReal = limiteDelDia(primeraEntrada, horaEntradaObra);
          const techoReal = limiteDelDia(primeraEntrada, horaSalidaObra);
          let salidaEfectiva = ultimaSalida;
          if (sueloReal && techoReal &&
              primeraEntrada < sueloReal && ultimaSalida < techoReal) {
            const colchon = Math.min(sueloReal - primeraEntrada, COMPENSACION_MAX_MS);
            const deficit = techoReal - ultimaSalida;
            salidaEfectiva = new Date(ultimaSalida.getTime() + Math.min(colchon, deficit));
          }

          let inicio = redondearEntrada(primeraEntrada);
          let fin    = redondearSalida(salidaEfectiva);

          // Suelo: no se paga antes de la hora oficial de entrada de la obra.
          const suelo = limiteDelDia(primeraEntrada, horaEntradaObra);
          if (suelo && inicio < suelo) inicio = suelo;

          // Techo: no se pagan horas después de la hora oficial de salida.
          const techo = limiteDelDia(primeraEntrada, horaSalidaObra);
          if (techo && fin > techo) fin = techo;

          const bruto = (fin - inicio) / 3600000;
          if (bruto > 0 && bruto < 24) {
            netoDia = Math.max(0, bruto - descansoMin(bruto, minutosDescanso) / 60);
          }
        }

        t.dias[dia] = redondear2(netoDia);
        t.dias_autocierre[dia] = autocierresDia;
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
        });
      }

      t.horas_mes = redondear2(Object.values(t.dias).reduce((a, b) => a + b, 0));
      t.total = t.precio_hora ? redondear2(t.horas_mes * Number(t.precio_hora)) : 0;
      t.autocierres_mes = Object.values(t.dias_autocierre).reduce((a, b) => a + b, 0);
    });

    return trabajadores;
  }

  // ===== Construcción de la hoja =====

  function crearHojaEmpresa(workbook, { obra, nombreEmpresa, mes, year, month, diasMes, trabajadores, paleta, logoBase64 }) {
    const ws = workbook.addWorksheet(nombreHojaSeguro(nombreEmpresa), {
      pageSetup: {
        paperSize: 9, orientation: 'landscape', fitToPage: true,
        fitToWidth: 1, fitToHeight: 0, horizontalCentered: true,
        margins: { left: 0.3, right: 0.3, top: 0.4, bottom: 0.4, header: 0.2, footer: 0.2 }
      }
    });

    const COL_DIAS_INI = 4;
    const colHoras  = 3 + diasMes + 1;
    const colPrecio = 3 + diasMes + 2;
    const colTotal  = 3 + diasMes + 3;
    const totalCols = colTotal;

    ws.columns = construirColumnas(diasMes);

    // ===== Fila 1: TÍTULO =====
    ws.mergeCells(1, 1, 1, totalCols);
    const title = ws.getCell(1, 1);
    title.value = 'CONTROL DE PERSONAL DE OBRA';
    title.font = { name: FUENTE_EXCEL, bold: true, size: 16, color: { argb: COLOR_BLANCO } };
    title.alignment = { horizontal: 'center', vertical: 'middle' };
    title.fill = fillSolid(paleta.oscuro);
    ws.getRow(1).height = 40;

    // Logo PNG: tamaño fijo respetando aspect ratio
    if (logoBase64) {
      try {
        const ext = logoBase64.startsWith('data:image/png') ? 'png' : 'jpeg';
        const base64Data = logoBase64.includes(',') ? logoBase64.split(',')[1] : logoBase64;
        const imageId = workbook.addImage({ base64: base64Data, extension: ext });

        // Calcular tamaño en píxeles manteniendo aspect ratio.
        // Altura objetivo: ~46px (encaja en una fila de 40 con un poco de margen).
        const ALTURA_PX = 46;
        const dims = dimensionesPng(base64Data);
        let widthPx = 130; // valor por defecto si no se pudo leer la cabecera
        if (dims && dims.h > 0) {
          widthPx = Math.round((dims.w / dims.h) * ALTURA_PX);
        }

        // Anclar la esquina inferior-derecha del logo al final del título
        // y dejar que ExcelJS calcule la esquina superior según el tamaño.
        ws.addImage(imageId, {
          tl: { col: totalCols - 0.05, row: 0.95, nativeColOff: -widthPx * 9525, nativeRowOff: -ALTURA_PX * 9525 },
          ext: { width: widthPx, height: ALTURA_PX },
          editAs: 'oneCell'
        });
      } catch (e) {
        console.warn('ExcelProforma: logo no insertado:', e.message);
      }
    }

    // ===== Fila 3: INFO CABECERA =====
    pintarLabel(ws.getCell(3, 1), 'Nº OBRA', paleta.medio);
    pintarValor(ws.getCell(3, 2), obra?.numero_obra || '');
    pintarLabel(ws.getCell(3, 3), 'DENOMINACIÓN', paleta.medio);

    const colDenomFin = Math.max(4, Math.min(colHoras - 4, 14));
    if (colDenomFin > 3) ws.mergeCells(3, 4, 3, colDenomFin);
    pintarValor(ws.getCell(3, 4), obra?.nombre || '');
    for (let c = 4; c <= colDenomFin; c++) {
      ws.getCell(3, c).border = borderThinGris();
      ws.getCell(3, c).fill = fillSolid(COLOR_BLANCO);
    }

    const colEmpresaLabel = colDenomFin + 1;
    const colEmpresaVal   = colDenomFin + 2;
    const colEmpresaFin   = Math.min(totalCols - 2, colEmpresaVal + 3);
    pintarLabel(ws.getCell(3, colEmpresaLabel), 'EMPRESA', paleta.medio);
    if (colEmpresaFin > colEmpresaVal) ws.mergeCells(3, colEmpresaVal, 3, colEmpresaFin);
    pintarValor(ws.getCell(3, colEmpresaVal), nombreEmpresa);
    for (let c = colEmpresaVal; c <= colEmpresaFin; c++) {
      ws.getCell(3, c).border = borderThinGris();
      ws.getCell(3, c).fill = fillSolid(COLOR_BLANCO);
    }

    pintarLabel(ws.getCell(3, totalCols - 1), 'MES', paleta.medio);
    pintarValor(ws.getCell(3, totalCols), nombreMes(mes));
    ws.getRow(3).height = 22;

    // ===== Filas 5-6: CABECERA TABLA =====
    const dasFinde = new Set();
    for (let d = 1; d <= diasMes; d++) {
      if (esFindeSemana(year, month, d)) dasFinde.add(d);
    }

    pintarHeader(ws.getCell(5, 1), 'NOMBRE',    paleta.oscuro);
    pintarHeader(ws.getCell(5, 2), 'DNI',       paleta.oscuro);
    pintarHeader(ws.getCell(5, 3), 'CATEGORÍA', paleta.oscuro);

    for (let d = 1; d <= diasMes; d++) {
      const cell = ws.getCell(5, COL_DIAS_INI - 1 + d);
      cell.value = letraDiaSemana(year, month, d);
      pintarHeader(cell, undefined, paleta.oscuro);
    }
    pintarHeader(ws.getCell(5, colHoras),  'HORAS MES',   paleta.oscuro);
    pintarHeader(ws.getCell(5, colPrecio), 'PRECIO HORA', paleta.oscuro);
    pintarHeader(ws.getCell(5, colTotal),  '€',           paleta.oscuro);
    ws.getRow(5).height = 32;

    for (let d = 1; d <= diasMes; d++) {
      const cell = ws.getCell(6, COL_DIAS_INI - 1 + d);
      cell.value = d;
      pintarHeader(cell, undefined, paleta.oscuro);
    }
    [1, 2, 3, colHoras, colPrecio, colTotal].forEach(c => {
      ws.getCell(6, c).fill = fillSolid(paleta.oscuro);
      ws.getCell(6, c).border = borderThinGris();
    });
    ws.getRow(6).height = 18;

    // ===== Filas de datos =====
    let rowIndex = 7;
    const filaInicio = rowIndex;

    if (trabajadores.length === 0) {
      ws.getCell(rowIndex, 1).value = 'Sin trabajadores con fichajes en este mes';
      ws.getCell(rowIndex, 1).font = { name: FUENTE_EXCEL, italic: true, color: { argb: '808080' } };
      rowIndex++;
    } else {
      trabajadores.forEach((t, idx) => {
        const bandColor = idx % 2 === 0 ? COLOR_BLANCO : COLOR_BAND;
        const row = ws.getRow(rowIndex);
        row.height = 22;

        const cN = row.getCell(1);
        cN.value = t.nombre;
        cN.font = { name: FUENTE_EXCEL, size: 10 };
        cN.fill = fillSolid(bandColor);
        cN.alignment = { horizontal: 'left', vertical: 'middle', wrapText: true, indent: 1 };
        cN.border = borderThinGris();

        const cD = row.getCell(2);
        cD.value = t.dni;
        cD.font = { name: FUENTE_EXCEL, size: 10 };
        cD.fill = fillSolid(bandColor);
        cD.alignment = { horizontal: 'center', vertical: 'middle' };
        cD.border = borderThinGris();

        const cC = row.getCell(3);
        const catKey = (t.categoria || '').toLowerCase().trim();
        const catColor = CATEGORIA_COLORES[catKey] || bandColor;
        cC.value = t.categoria || '';
        cC.font = { name: FUENTE_EXCEL, size: 10, bold: !!CATEGORIA_COLORES[catKey] };
        cC.fill = fillSolid(catColor);
        cC.alignment = { horizontal: 'left', vertical: 'middle' };
        cC.border = borderThinGris();

        for (let d = 1; d <= diasMes; d++) {
          const col = COL_DIAS_INI - 1 + d;
          const v = t.dias[d];
          const autocierre = t.dias_autocierre[d] > 0;
          const ajuste = t.dias_ajuste && t.dias_ajuste[d];
          const cell = row.getCell(col);
          cell.value = v ? v : null;
          cell.numFmt = '0.00;-0.00;';
          cell.font = { name: FUENTE_EXCEL, size: 9 };
          cell.fill = fillSolid(ajuste ? COLOR_AJUSTE : autocierre ? COLOR_ALERTA : dasFinde.has(d) ? COLOR_FINDE : bandColor);
          cell.alignment = { horizontal: 'center', vertical: 'middle' };
          cell.border = borderThinGris();
          if (ajuste) {
            cell.note = {
              texts: [
                { font: { bold: true, size: 10, name: FUENTE_EXCEL }, text: 'Horas fijadas a mano\n' },
                { font: { size: 10, name: FUENTE_EXCEL },
                  text: `Calculadas según fichajes: ${ajuste.calculadas} h → fijadas: ${ajuste.fijadas} h.`
                    + (ajuste.motivo ? `\nMotivo: ${ajuste.motivo}` : '')
                    + (autocierre ? '\n(El día tenía además una salida automática.)' : '') }
              ],
              margins: { insetmode: 'auto' }
            };
          } else if (autocierre) {
            cell.note = {
              texts: [
                { font: { bold: true, size: 10, name: FUENTE_EXCEL }, text: 'Salida automática\n' },
                { font: { size: 10, name: FUENTE_EXCEL }, text: 'Verificar la hora de salida con el encargado o el trabajador.' }
              ],
              margins: { insetmode: 'auto' }
            };
          }
        }

        const dIni = letraExcel(COL_DIAS_INI);
        const dFin = letraExcel(COL_DIAS_INI - 1 + diasMes);
        const cH = row.getCell(colHoras);
        cH.value = { formula: `SUM(${dIni}${rowIndex}:${dFin}${rowIndex})` };
        cH.numFmt = '0.00;-0.00;-';
        cH.font = { name: FUENTE_EXCEL, size: 10, bold: true };
        cH.fill = fillSolid(COLOR_TOTAL);
        cH.alignment = { horizontal: 'center', vertical: 'middle' };
        cH.border = borderThinGris();

        const cP = row.getCell(colPrecio);
        const precio = t.precio_hora != null ? Number(t.precio_hora) : 0;
        cP.value = precio || null;
        cP.numFmt = '#,##0.00 €;-#,##0.00 €;-';
        cP.font = { name: FUENTE_EXCEL, size: 10 };
        cP.fill = fillSolid(COLOR_TOTAL);
        cP.alignment = { horizontal: 'center', vertical: 'middle' };
        cP.border = borderThinGris();

        const cT = row.getCell(colTotal);
        cT.value = { formula: `${letraExcel(colHoras)}${rowIndex}*${letraExcel(colPrecio)}${rowIndex}` };
        cT.numFmt = '#,##0.00 €;-#,##0.00 €;-';
        cT.font = { name: FUENTE_EXCEL, size: 10, bold: true };
        cT.fill = fillSolid(COLOR_TOTAL);
        cT.alignment = { horizontal: 'center', vertical: 'middle' };
        cT.border = borderThinGris();

        rowIndex++;
      });
    }

    const filaFin = rowIndex - 1;

    // ===== FILA SUBTOTAL empresa =====
    if (trabajadores.length > 0) {
      ws.getRow(rowIndex).height = 22;

      ws.mergeCells(rowIndex, 1, rowIndex, 3);
      const cSL = ws.getCell(rowIndex, 1);
      cSL.value = `SUBTOTAL — ${nombreEmpresa}`;
      cSL.font = { name: FUENTE_EXCEL, bold: true, size: 10, color: { argb: paleta.textoSub } };
      cSL.fill = fillSolid(paleta.acento);
      cSL.alignment = { horizontal: 'right', vertical: 'middle', indent: 1 };
      cSL.border = borderThinGris();
      for (let c = 1; c <= 3; c++) {
        ws.getCell(rowIndex, c).border = borderThinGris();
        ws.getCell(rowIndex, c).fill = fillSolid(paleta.acento);
      }

      for (let d = 1; d <= diasMes; d++) {
        const col = COL_DIAS_INI - 1 + d;
        const cell = ws.getCell(rowIndex, col);
        cell.value = { formula: `SUM(${letraExcel(col)}${filaInicio}:${letraExcel(col)}${filaFin})` };
        cell.numFmt = '0.00;-0.00;';
        cell.font = { name: FUENTE_EXCEL, size: 8, color: { argb: paleta.textoSub } };
        cell.fill = fillSolid(paleta.acento);
        cell.alignment = { horizontal: 'center', vertical: 'middle' };
        cell.border = borderThinGris();
      }

      const cSH = ws.getCell(rowIndex, colHoras);
      cSH.value = { formula: `SUM(${letraExcel(colHoras)}${filaInicio}:${letraExcel(colHoras)}${filaFin})` };
      cSH.numFmt = '0.00';
      cSH.font = { name: FUENTE_EXCEL, bold: true, size: 10, color: { argb: paleta.textoSub } };
      cSH.fill = fillSolid(paleta.acento);
      cSH.alignment = { horizontal: 'center', vertical: 'middle' };
      cSH.border = borderThinGris();

      ws.getCell(rowIndex, colPrecio).fill = fillSolid(paleta.acento);
      ws.getCell(rowIndex, colPrecio).border = borderThinGris();

      const cST = ws.getCell(rowIndex, colTotal);
      cST.value = { formula: `SUM(${letraExcel(colTotal)}${filaInicio}:${letraExcel(colTotal)}${filaFin})` };
      cST.numFmt = '#,##0.00 €';
      cST.font = { name: FUENTE_EXCEL, bold: true, size: 10, color: { argb: paleta.textoSub } };
      cST.fill = fillSolid(paleta.acento);
      cST.alignment = { horizontal: 'center', vertical: 'middle' };
      cST.border = borderThinGris();

      rowIndex++;
    }

    // ===== FILA TOTALES =====
    if (trabajadores.length > 0) {
      ws.getRow(rowIndex).height = 26;

      ws.mergeCells(rowIndex, 1, rowIndex, 3);
      const cTL = ws.getCell(rowIndex, 1);
      cTL.value = 'TOTALES';
      cTL.font = { name: FUENTE_EXCEL, bold: true, size: 11, color: { argb: COLOR_BLANCO } };
      cTL.fill = fillSolid(paleta.oscuro);
      cTL.alignment = { horizontal: 'right', vertical: 'middle', indent: 1 };
      cTL.border = borderThinGris();
      for (let c = 1; c <= 3; c++) {
        ws.getCell(rowIndex, c).fill = fillSolid(paleta.oscuro);
        ws.getCell(rowIndex, c).border = borderThinGris();
      }

      for (let d = 1; d <= diasMes; d++) {
        const col = COL_DIAS_INI - 1 + d;
        const cell = ws.getCell(rowIndex, col);
        cell.value = { formula: `SUM(${letraExcel(col)}${filaInicio}:${letraExcel(col)}${filaFin})` };
        cell.numFmt = '0.00;-0.00;';
        cell.font = { name: FUENTE_EXCEL, bold: true, size: 8 };
        cell.fill = fillSolid(COLOR_FOOTER);
        cell.alignment = { horizontal: 'center', vertical: 'middle' };
        cell.border = borderThinGris();
      }

      const cTH = ws.getCell(rowIndex, colHoras);
      cTH.value = { formula: `SUM(${letraExcel(colHoras)}${filaInicio}:${letraExcel(colHoras)}${filaFin})` };
      cTH.numFmt = '0.00';
      cTH.font = { name: FUENTE_EXCEL, bold: true, size: 11 };
      cTH.fill = fillSolid(COLOR_FOOTER);
      cTH.alignment = { horizontal: 'center', vertical: 'middle' };
      cTH.border = borderThinGris();

      ws.getCell(rowIndex, colPrecio).fill = fillSolid(COLOR_FOOTER);
      ws.getCell(rowIndex, colPrecio).border = borderThinGris();

      const cTT = ws.getCell(rowIndex, colTotal);
      cTT.value = { formula: `SUM(${letraExcel(colTotal)}${filaInicio}:${letraExcel(colTotal)}${filaFin})` };
      cTT.numFmt = '#,##0.00 €';
      cTT.font = { name: FUENTE_EXCEL, bold: true, size: 11 };
      cTT.fill = fillSolid(COLOR_FOOTER);
      cTT.alignment = { horizontal: 'center', vertical: 'middle' };
      cTT.border = borderThinGris();

      rowIndex++;
    }

    rowIndex += 1;

    // ===== TEXTO LEGAL =====
    ws.mergeCells(rowIndex, 1, rowIndex + 2, totalCols);
    const legal = ws.getCell(rowIndex, 1);
    legal.value = textoLegal();
    legal.font = { name: FUENTE_EXCEL, size: 9, italic: true };
    legal.alignment = { horizontal: 'left', vertical: 'middle', wrapText: true, indent: 1 };
    ws.getRow(rowIndex).height = 20;
    rowIndex += 4;

    // ===== ZONA DE FIRMAS =====
    const firmaW = Math.max(6, Math.floor(totalCols / 2) - 1);
    const colDStart = totalCols - firmaW + 1;

    ws.mergeCells(rowIndex, 1, rowIndex, firmaW);
    const cf1 = ws.getCell(rowIndex, 1);
    cf1.value = 'CONFORME ENCARGADO';
    cf1.font = { name: FUENTE_EXCEL, bold: true, size: 10, color: { argb: COLOR_BLANCO } };
    cf1.fill = fillSolid(paleta.oscuro);
    cf1.alignment = { horizontal: 'center', vertical: 'middle' };
    cf1.border = borderThinGris();
    for (let c = 1; c <= firmaW; c++) {
      ws.getCell(rowIndex, c).fill = fillSolid(paleta.oscuro);
      ws.getCell(rowIndex, c).border = borderThinGris();
    }

    ws.mergeCells(rowIndex, colDStart, rowIndex, totalCols);
    const cf2 = ws.getCell(rowIndex, colDStart);
    cf2.value = 'EMPRESA SUBCONTRATISTA';
    cf2.font = { name: FUENTE_EXCEL, bold: true, size: 10, color: { argb: COLOR_BLANCO } };
    cf2.fill = fillSolid(paleta.oscuro);
    cf2.alignment = { horizontal: 'center', vertical: 'middle' };
    cf2.border = borderThinGris();
    for (let c = colDStart; c <= totalCols; c++) {
      ws.getCell(rowIndex, c).fill = fillSolid(paleta.oscuro);
      ws.getCell(rowIndex, c).border = borderThinGris();
    }
    rowIndex++;

    [[1, firmaW], [colDStart, totalCols]].forEach(([cS, cE]) => {
      ws.mergeCells(rowIndex, cS, rowIndex + 3, cE);
      for (let r = rowIndex; r <= rowIndex + 3; r++)
        for (let c = cS; c <= cE; c++) {
          ws.getCell(r, c).border = borderThinGris();
          ws.getCell(r, c).fill = fillSolid(COLOR_BLANCO);
        }
    });
    for (let r = rowIndex; r <= rowIndex + 3; r++) ws.getRow(r).height = 18;
    rowIndex += 4;

    ws.mergeCells(rowIndex, 1, rowIndex, firmaW);
    const fd1 = ws.getCell(rowIndex, 1);
    fd1.value = 'Fdo.:';
    fd1.font = { name: FUENTE_EXCEL, bold: true, size: 10 };
    fd1.alignment = { horizontal: 'left', vertical: 'middle', indent: 1 };

    ws.mergeCells(rowIndex, colDStart, rowIndex, totalCols);
    const fd2 = ws.getCell(rowIndex, colDStart);
    fd2.value = 'Fdo.:';
    fd2.font = { name: FUENTE_EXCEL, bold: true, size: 10 };
    fd2.alignment = { horizontal: 'left', vertical: 'middle', indent: 1 };
    ws.getRow(rowIndex).height = 18;
    rowIndex += 2;

    ws.mergeCells(rowIndex, 1, rowIndex, totalCols);
    const nota = ws.getCell(rowIndex, 1);
    nota.value = '(*) La firma del trabajador acredita su presencia en obra durante la jornada indicada.';
    nota.font = { name: FUENTE_EXCEL, size: 8, italic: true, color: { argb: '808080' } };
    nota.alignment = { horizontal: 'left', vertical: 'middle', wrapText: true, indent: 1 };

    ws.views = [{ state: 'frozen', xSplit: 3, ySplit: 6 }];
  }

  // ===== Helpers de estilo =====

  function pintarHeader(cell, valor, colorFondo) {
    if (valor !== undefined) cell.value = valor;
    cell.font = { name: FUENTE_EXCEL, bold: true, size: 9, color: { argb: COLOR_BLANCO } };
    cell.fill = fillSolid(colorFondo || '404040');
    cell.alignment = { horizontal: 'center', vertical: 'middle', wrapText: true };
    cell.border = borderThinGris();
  }

  function pintarLabel(cell, texto, colorFondo) {
    cell.value = texto;
    cell.font = { name: FUENTE_EXCEL, bold: true, size: 10, color: { argb: COLOR_BLANCO } };
    cell.fill = fillSolid(colorFondo || '808080');
    cell.alignment = { horizontal: 'center', vertical: 'middle' };
    cell.border = borderThinGris();
  }

  function pintarValor(cell, texto) {
    cell.value = texto;
    cell.font = { name: FUENTE_EXCEL, size: 10 };
    cell.fill = fillSolid(COLOR_BLANCO);
    cell.alignment = { horizontal: 'center', vertical: 'middle' };
    cell.border = borderThinGris();
  }

  function fillSolid(argb) {
    return { type: 'pattern', pattern: 'solid', fgColor: { argb } };
  }

  function borderThinGris() {
    return {
      top:    { style: 'thin', color: { argb: COLOR_BORDE } },
      left:   { style: 'thin', color: { argb: COLOR_BORDE } },
      bottom: { style: 'thin', color: { argb: COLOR_BORDE } },
      right:  { style: 'thin', color: { argb: COLOR_BORDE } }
    };
  }

  function esFindeSemana(year, month, day) {
    const dow = new Date(year, month - 1, day).getDay();
    return dow === 0 || dow === 6;
  }

  function letraExcel(num) {
    let n = num, s = '';
    while (n > 0) {
      const r = (n - 1) % 26;
      s = String.fromCharCode(65 + r) + s;
      n = Math.floor((n - 1) / 26);
    }
    return s;
  }

  function construirColumnas(diasMes) {
    const cols = [
      { width: 30 },
      { width: 13 },
      { width: 14 },
    ];
    for (let d = 1; d <= diasMes; d++) cols.push({ width: 4 });
    cols.push({ width: 13 });
    cols.push({ width: 14 });
    cols.push({ width: 14 });
    return cols;
  }

  function textoLegal() {
    return 'El trabajador firmante declara haber recibido la información/formación preventiva necesaria, disponer de los EPIs requeridos y encontrarse autorizado para el acceso a obra conforme a la documentación aportada por su empresa.';
  }

  function nombreCompleto(t) {
    return [t.nombre, t.apellidos].filter(Boolean).join(' ').trim() || '(sin nombre)';
  }

  function nombreHojaSeguro(nombre) {
    return String(nombre || 'Sin empresa')
      .replace(/[\\/?*\[\]:]/g, ' ')
      .substring(0, 31).trim() || 'Sin empresa';
  }

  function letraDiaSemana(year, month, day) {
    return ['D','L','M','X','J','V','S'][new Date(year, month - 1, day).getDay()];
  }

  function nombreMes(mes) {
    const [year, month] = mes.split('-').map(Number);
    return new Date(year, month - 1, 1)
      .toLocaleDateString('es-ES', { month: 'long', year: 'numeric' })
      .toUpperCase();
  }

  function redondear2(n) {
    return Math.round((Number(n) || 0) * 100) / 100;
  }

  // ===== Cálculo de horas: redondeo al cuarto de hora + descanso =====
  // Reglas de negocio (Decisión A, abril 2026 · cerrada 16/6/2026):
  // - El redondeo va SIEMPRE en contra de la demora, con margen de cortesía
  //   de 3 minutos:
  //     · Entrada: si ficha en los 3 primeros minutos de un cuarto, cuenta
  //       desde ese cuarto; si se pasa, sube al cuarto siguiente.
  //     · Salida: si ficha en los 3 últimos minutos antes de un cuarto, le
  //       cuenta ese cuarto; si no, baja al cuarto anterior.
  // - No se paga antes de la hora oficial de entrada de la obra (fichar antes
  //   está permitido, pero no suma): suelo = hora_entrada_default.
  // - No se pagan horas después de la hora oficial de salida (las extra las
  //   confirma el jefe aparte): techo = hora_salida_default.
  // - Descanso proporcional sobre horas brutas: ≤4h → 0 · 4–7h → 30 · ≥7h → 90.
  // - Compensación (añadida 9/7/2026): entrar antes de la hora oficial no
  //   suma, pero compensa hasta 15 min de salida anticipada. Solo aplica si
  //   la obra tiene hora oficial de entrada Y de salida definidas.
  const CUARTO_MS   = 15 * 60 * 1000;
  const CORTESIA_MS = 3 * 60 * 1000;
  const COMPENSACION_MAX_MS = 15 * 60 * 1000;

  function redondearEntrada(fecha) {
    const ms = fecha.getTime();
    const base = Math.floor(ms / CUARTO_MS) * CUARTO_MS; // cuarto anterior
    const resto = ms - base;
    if (resto <= CORTESIA_MS) return new Date(base);     // cortesía: cuenta desde el cuarto
    return new Date(base + CUARTO_MS);                   // sube al siguiente
  }

  function redondearSalida(fecha) {
    const ms = fecha.getTime();
    const base = Math.floor(ms / CUARTO_MS) * CUARTO_MS;
    const resto = ms - base;
    if (CUARTO_MS - resto <= CORTESIA_MS) return new Date(base + CUARTO_MS); // cortesía
    return new Date(base);                                                   // baja al anterior
  }

  // Construye el límite (suelo/techo) del día a partir de una hora "HH:MM"
  // o "HH:MM:SS". Devuelve null si no hay hora oficial definida.
  function limiteDelDia(fechaRef, horaStr) {
    if (!horaStr) return null;
    const partes = String(horaStr).split(':');
    const h = Number(partes[0]);
    const m = Number(partes[1] || 0);
    if (isNaN(h)) return null;
    return new Date(fechaRef.getFullYear(), fechaRef.getMonth(), fechaRef.getDate(), h, m, 0, 0);
  }

  function descansoMin(brutoH, descansoLargo) {
    // descansoLargo = minutos de descanso en jornada completa (≥7h).
    // Por defecto 90 (comportamiento histórico). La media jornada resta 30
    // pero nunca más que el descanso de la obra (si es 0, no resta nada).
    const largo = (descansoLargo == null) ? 90 : descansoLargo;
    if (brutoH <= 4) return 0;
    if (brutoH < 7) return Math.min(30, largo);
    return largo;
  }

  // API pública.
  // - generar: crea el Excel proforma (uso original).
  // - agruparPorEmpresa y construirResumenTrabajadores: expuestas para P-07
  //   (resumen mensual en pantalla), para que pantalla y Excel usen
  //   exactamente el mismo cálculo de horas.
  window.ExcelProforma = { generar, agruparPorEmpresa, construirResumenTrabajadores };
})();
