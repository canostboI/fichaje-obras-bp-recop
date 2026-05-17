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
 *          logoBase64: '...'   // opcional: PNG en base64 (lo carga la página)
 *        });
 *
 *      Cada fichaje debe traer al menos:
 *        { id, tipo, hora, cierre_automatico, trabajador_id,
 *          trabajador: { id, nombre, apellidos, dni, categoria,
 *                        precio_hora_personalizado,
 *                        empresa: { nombre } } }
 *
 *   3) Devuelve { buffer, autocierres }. No descarga el archivo.
 *
 * El módulo NO conoce Supabase ni permisos.
 */

(function () {
  'use strict';

  // ===== Paletas por marca =====
  //
  // Bosch Pascual: teal corporativo (extraído del logo PNG)
  // Rècop:        terracota/ladrillo corporativo (extraído del footer web)
  const PALETAS = {
    bosch_pascual: {
      oscuro:   '1A7A8A',   // teal BP — cabeceras, título, firmas
      medio:    '1D6B79',   // teal oscuro — labels de info
      acento:   'D6EEF2',   // azul-teal muy claro — subtotales
      textoSub: '1A7A8A',
    },
    recop: {
      oscuro:   'A0392B',   // terracota Rècop — cabeceras, título, firmas
      medio:    '8B3124',   // terracota oscuro — labels de info
      acento:   'F5D5D1',   // terracota muy claro — subtotales
      textoSub: 'A0392B',
    },
    _default: {
      oscuro:   '404040',
      medio:    '808080',
      acento:   'F0F0F0',
      textoSub: '404040',
    }
  };

  // Colores fijos independientes de la marca
  const FUENTE_EXCEL = 'Arial';
  const COLOR_FINDE  = 'D0D0D0';
  const COLOR_BAND   = 'F7F7F7';
  const COLOR_TOTAL  = 'FFF2CC';
  const COLOR_FOOTER = 'FFE699';
  const COLOR_ALERTA = 'FFE0B2';
  const COLOR_BLANCO = 'FFFFFF';
  const COLOR_BORDE  = 'BFBFBF';

  // Colores de categoría
  const CATEGORIA_COLORES = {
    'peon':    'E8E8E8',
    'peón':    'E8E8E8',
    'oficial': 'D6E4F7',
    'capataz': 'D5F5E3',
    'tecnico': 'FDEBD0',
    'técnico': 'FDEBD0',
  };

  // ===== Función pública =====

  async function generar({ obra, mes, fichajes, logoBase64 }) {
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
          const trabajadores = construirResumenTrabajadores(grupos[nombreEmpresa], diasMes);
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

  function construirResumenTrabajadores(fichajes, diasMes) {
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
        let entrada = null, horas = 0, autocierresDia = 0;

        eventos.forEach(ev => {
          if (ev.tipo === 'entrada') {
            if (!entrada) entrada = ev.hora;
          } else if (ev.tipo === 'salida') {
            if (entrada) {
              const diff = (ev.hora - entrada) / 3600000;
              if (diff > 0 && diff < 24) horas += diff;
              entrada = null;
            }
            if (ev.cierre_automatico) autocierresDia++;
          }
        });

        t.dias[dia] = redondear2(horas);
        t.dias_autocierre[dia] = autocierresDia;
      });

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

    // Columnas: NOMBRE | DNI | CATEGORÍA | días... | HORAS MES | PRECIO HORA | €
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

    // Logo PNG en esquina derecha de la fila 1
    if (logoBase64) {
      try {
        const ext = logoBase64.startsWith('data:image/png') ? 'png' : 'jpeg';
        const base64Data = logoBase64.includes(',') ? logoBase64.split(',')[1] : logoBase64;
        const imageId = workbook.addImage({ base64: base64Data, extension: ext });
        ws.addImage(imageId, {
          tl: { col: totalCols - 2.5, row: 0.1 },
          br: { col: totalCols - 0.1, row: 0.9 },
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

    // Fila 6: número de día
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

        // NOMBRE
        const cN = row.getCell(1);
        cN.value = t.nombre;
        cN.font = { name: FUENTE_EXCEL, size: 10 };
        cN.fill = fillSolid(bandColor);
        cN.alignment = { horizontal: 'left', vertical: 'middle', wrapText: true, indent: 1 };
        cN.border = borderThinGris();

        // DNI
        const cD = row.getCell(2);
        cD.value = t.dni;
        cD.font = { name: FUENTE_EXCEL, size: 10 };
        cD.fill = fillSolid(bandColor);
        cD.alignment = { horizontal: 'center', vertical: 'middle' };
        cD.border = borderThinGris();

        // CATEGORÍA con color
        const cC = row.getCell(3);
        const catKey = (t.categoria || '').toLowerCase().trim();
        const catColor = CATEGORIA_COLORES[catKey] || bandColor;
        cC.value = t.categoria || '';
        cC.font = { name: FUENTE_EXCEL, size: 10, bold: !!CATEGORIA_COLORES[catKey] };
        cC.fill = fillSolid(catColor);
        cC.alignment = { horizontal: 'left', vertical: 'middle' };
        cC.border = borderThinGris();

        // Días
        for (let d = 1; d <= diasMes; d++) {
          const col = COL_DIAS_INI - 1 + d;
          const v = t.dias[d];
          const autocierre = t.dias_autocierre[d] > 0;
          const cell = row.getCell(col);
          cell.value = v ? v : null;
          cell.numFmt = '0.00;-0.00;';
          cell.font = { name: FUENTE_EXCEL, size: 9 };
          cell.fill = fillSolid(autocierre ? COLOR_ALERTA : dasFinde.has(d) ? COLOR_FINDE : bandColor);
          cell.alignment = { horizontal: 'center', vertical: 'middle' };
          cell.border = borderThinGris();
          if (autocierre) {
            cell.note = {
              texts: [
                { font: { bold: true, size: 10, name: FUENTE_EXCEL }, text: 'Salida automática\n' },
                { font: { size: 10, name: FUENTE_EXCEL }, text: 'Verificar la hora de salida con el encargado o el trabajador.' }
              ],
              margins: { insetmode: 'auto' }
            };
          }
        }

        // HORAS MES
        const dIni = letraExcel(COL_DIAS_INI);
        const dFin = letraExcel(COL_DIAS_INI - 1 + diasMes);
        const cH = row.getCell(colHoras);
        cH.value = { formula: `SUM(${dIni}${rowIndex}:${dFin}${rowIndex})` };
        cH.numFmt = '0.00;-0.00;-';
        cH.font = { name: FUENTE_EXCEL, size: 10, bold: true };
        cH.fill = fillSolid(COLOR_TOTAL);
        cH.alignment = { horizontal: 'center', vertical: 'middle' };
        cH.border = borderThinGris();

        // PRECIO HORA
        const cP = row.getCell(colPrecio);
        const precio = t.precio_hora != null ? Number(t.precio_hora) : 0;
        cP.value = precio || null;
        cP.numFmt = '#,##0.00 €;-#,##0.00 €;-';
        cP.font = { name: FUENTE_EXCEL, size: 10 };
        cP.fill = fillSolid(COLOR_TOTAL);
        cP.alignment = { horizontal: 'center', vertical: 'middle' };
        cP.border = borderThinGris();

        // TOTAL €
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

    // Congelar: 3 columnas fijas + 6 filas de cabecera
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
      { width: 30 }, // NOMBRE
      { width: 13 }, // DNI
      { width: 14 }, // CATEGORÍA
    ];
    for (let d = 1; d <= diasMes; d++) cols.push({ width: 4 });
    cols.push({ width: 13 }); // HORAS MES
    cols.push({ width: 14 }); // PRECIO HORA
    cols.push({ width: 14 }); // €
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

  window.ExcelProforma = { generar };
})();
