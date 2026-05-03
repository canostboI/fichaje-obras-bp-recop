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
 *          mes: '2026-04',           // 'YYYY-MM'
 *          fichajes: [...]           // ya filtrados (permisos, RLS, etc.)
 *        });
 *
 *      Cada fichaje debe traer al menos:
 *        { id, tipo, hora, cierre_automatico, trabajador_id,
 *          trabajador: { id, nombre, apellidos, dni, categoria,
 *                        precio_hora_personalizado,
 *                        empresa: { nombre } } }   // empresa puede ser null
 *
 *      `cierre_automatico` se usa para marcar en naranja claro las
 *      celdas de día cuya salida fue autocerrada por el cron nocturno.
 *
 *   3) El módulo NO descarga el archivo. Devuelve un objeto:
 *        { buffer, autocierres }
 *      donde `autocierres` es el número total de salidas autocerradas
 *      detectadas en el mes (para que la página avise al usuario antes
 *      de descargar).
 *
 * El módulo NO conoce Supabase ni permisos: solo dibuja el Excel a partir
 * de los datos que le pasan.
 */

(function () {
  'use strict';

  // FIX 2026-05-03:
  // Se mantiene el branding por colores, pero se desactiva la inserción de logos.
  // El intento de convertir SVG a PNG e insertarlo en el XLSX puede generar archivos
  // que Microsoft Excel no abre correctamente en algunos entornos.

  // ===== Estilo Excel: base neutra + branding sutil por marca de obra =====
  const FUENTE_EXCEL  = 'Arial';
  const COLOR_OSCURO  = '404040';   // título y cabeceras
  const COLOR_MEDIO   = '808080';   // etiquetas info
  const COLOR_FINDE   = 'D0D0D0';   // sombreado fines de semana
  const COLOR_BAND    = 'F7F7F7';   // banding filas pares
  const COLOR_TOTAL   = 'FFF2CC';   // cols totales por trabajador
  const COLOR_FOOTER  = 'FFE699';   // fila TOTALES
  const COLOR_ALERTA  = 'FFE0B2';   // naranja claro: días con autocierre
  const COLOR_BLANCO  = 'FFFFFF';
  const COLOR_BORDE   = 'BFBFBF';   // bordes grises (no negros)

  // Colores corporativos actuales de js/branding.js, preparados para Excel.
  // Se usa el logo blanco porque va sobre una cabecera oscura/profesional.
  const BRANDING_EXCEL = {
    bosch_pascual: {
      nombre: 'Bosch Pascual',
      color_principal: '1A1A1A',
      color_acento: 'C8102E',
      logo_blanco: '../assets/logos/bosch_pascual_logo_white.svg'
    },
    recop: {
      nombre: 'Rècop',
      color_principal: '6B3410',
      color_acento: 'C9A876',
      logo_blanco: '../assets/logos/recop_logo_white.svg'
    }
  };

  // Estos colores se actualizan al crear cada hoja según obra.empresa_marca.
  // El generador se ejecuta secuencialmente, no en paralelo.
  let COLOR_CABECERA_ACTUAL = COLOR_OSCURO;
  let COLOR_LABEL_ACTUAL = COLOR_MEDIO;
  let COLOR_LABEL_TEXTO_ACTUAL = COLOR_BLANCO;

  // ===== Función pública =====

  async function generar({ obra, mes, fichajes }) {
    if (!window.ExcelJS) {
      throw new Error('ExcelJS no está cargado. Añade el <script> de ExcelJS antes de este módulo.');
    }
    if (!mes || !/^\d{4}-\d{2}$/.test(mes)) {
      throw new Error('Mes inválido. Formato esperado: YYYY-MM.');
    }
    if (!Array.isArray(fichajes)) {
      throw new Error('fichajes debe ser un array.');
    }

    const grupos = agruparPorEmpresa(fichajes);
    const workbook = new window.ExcelJS.Workbook();
    const marca = obtenerBrandingExcel(obra?.empresa_marca);

    workbook.creator = 'Fichaje Obras';
    workbook.created = new Date();
    workbook.company = marca.nombre;

    const [year, month] = mes.split('-').map(Number);
    const diasMes = new Date(year, month, 0).getDate();

    const nombresEmpresa = Object.keys(grupos);

    // Contador global de salidas autocerradas en todo el mes,
    // sumando todas las empresas. Lo devolvemos junto al buffer.
    let totalAutocierres = 0;

    if (nombresEmpresa.length === 0) {
      // Sin datos: hoja vacía pero válida
      await crearHojaEmpresa(workbook, {
        obra,
        marca,
        nombreEmpresa: 'Sin empresa',
        mes,
        year,
        month,
        diasMes,
        trabajadores: []
      });
    } else {
      for (const nombreEmpresa of nombresEmpresa.sort((a, b) => a.localeCompare(b, 'es'))) {
        const trabajadores = construirResumenTrabajadores(grupos[nombreEmpresa], diasMes);
        // Sumar autocierres de cada trabajador al contador global
        trabajadores.forEach(t => { totalAutocierres += (t.autocierres_mes || 0); });
        await crearHojaEmpresa(workbook, {
          obra,
          marca,
          nombreEmpresa,
          mes,
          year,
          month,
          diasMes,
          trabajadores
        });
      }
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
      // dias_autocierre[d] = nº de salidas autocerradas ese día.
      // Lo usaremos en pintarHoja como "marcar amarillo si > 0" y para sumar el contador global.
      t.dias_autocierre = {};
      for (let d = 1; d <= diasMes; d++) {
        t.dias[d] = 0;
        t.dias_autocierre[d] = 0;
      }

      const porDia = {};

      t.fichajes.forEach(f => {
        // I1: Date(iso) interpreta el ISO como UTC y getDate() devuelve el día
        // en zona local del navegador (España) -> correcto para asignar al calendario.
        const d = new Date(f.hora);
        const dia = d.getDate();
        if (!porDia[dia]) porDia[dia] = [];
        porDia[dia].push({
          tipo: f.tipo,
          hora: d,
          cierre_automatico: !!f.cierre_automatico
        });
      });

      Object.keys(porDia).forEach(diaStr => {
        const dia = Number(diaStr);
        const eventos = porDia[dia].sort((a, b) => a.hora - b.hora);
        let entrada = null;
        let horas = 0;
        let autocierresDia = 0;

        eventos.forEach(ev => {
          if (ev.tipo === 'entrada') {
            if (!entrada) entrada = ev.hora;
          } else if (ev.tipo === 'salida') {
            if (entrada) {
              const diff = (ev.hora - entrada) / 3600000;
              if (diff > 0 && diff < 24) horas += diff;
              entrada = null;
            }
            // Contamos cualquier salida autocerrada del día,
            // emparejada o no: cada salida autocerrada cuenta 1.
            if (ev.cierre_automatico) autocierresDia++;
          }
        });

        t.dias[dia] = redondear2(horas);
        t.dias_autocierre[dia] = autocierresDia;
      });

      t.horas_mes = redondear2(Object.values(t.dias).reduce((a, b) => a + b, 0));
      t.total = t.precio_hora ? redondear2(t.horas_mes * Number(t.precio_hora)) : 0;
      // Total de autocierres del mes para este trabajador
      t.autocierres_mes = Object.values(t.dias_autocierre).reduce((a, b) => a + b, 0);
    });

    return trabajadores;
  }

  // ===== Construcción de la hoja =====

  async function crearHojaEmpresa(workbook, { obra, marca, nombreEmpresa, mes, year, month, diasMes, trabajadores }) {
    COLOR_CABECERA_ACTUAL = marca?.color_principal || COLOR_OSCURO;
    COLOR_LABEL_ACTUAL = marca?.color_acento || COLOR_MEDIO;
    COLOR_LABEL_TEXTO_ACTUAL = colorTextoLegible(COLOR_LABEL_ACTUAL);
    const sheetName = nombreHojaSeguro(nombreEmpresa);
    const ws = workbook.addWorksheet(sheetName, {
      pageSetup: {
        paperSize: 9,
        orientation: 'landscape',
        fitToPage: true,
        fitToWidth: 1,
        fitToHeight: 0,
        horizontalCentered: true,
        margins: { left: 0.3, right: 0.3, top: 0.4, bottom: 0.4, header: 0.2, footer: 0.2 }
      }
    });

    // Columnas fijas visibles antes de los días del mes.
    // Antes esta plantilla traía columnas de documentación (FORM., EPIS, USO MAQ., FIRMA, TC2, ALTA S.S.).
    // Para este Excel de horas/fichajes no aportaban valor, así que se dejan solo las columnas útiles.
    const fixedCols = 3; // NOMBRE, DNI, CATEGORÍA
    const totalCols = fixedCols + diasMes + 3;
    const colHoras = fixedCols + diasMes + 1;
    const colPrecio = fixedCols + diasMes + 2;
    const colTotal = fixedCols + diasMes + 3;

    ws.columns = construirColumnas(diasMes);

    // ===== Fila 1: TÍTULO =====
    ws.mergeCells(1, 1, 1, totalCols);
    const title = ws.getCell(1, 1);
    title.value = 'CONTROL DE HORAS DE PERSONAL EN OBRA';
    title.font = { name: FUENTE_EXCEL, bold: true, size: 16, color: { argb: COLOR_BLANCO } };
    title.alignment = { horizontal: 'center', vertical: 'middle' };
    title.fill = fillSolid(COLOR_CABECERA_ACTUAL);
    ws.getRow(1).height = 36;

    // Línea fina de acento corporativo bajo la cabecera.
    for (let c = 1; c <= totalCols; c++) {
      ws.getCell(2, c).fill = fillSolid(COLOR_LABEL_ACTUAL);
    }
    ws.getRow(2).height = 5;

    // Logo corporativo desactivado temporalmente: la inserción de imágenes desde SVG
    // puede corromper el XLSX en algunos navegadores/ExcelJS. Mantenemos colores de marca.

    // ===== Fila 3: INFO CABECERA =====
    pintarLabel(ws.getCell(3, 1), 'Nº OBRA');
    pintarValor(ws.getCell(3, 2), obra?.numero_obra || '');

    pintarLabel(ws.getCell(3, 3), 'DENOMINACIÓN');
    ws.mergeCells(3, 4, 3, 10);
    pintarValor(ws.getCell(3, 4), obra?.nombre || '');
    for (let c = 4; c <= 10; c++) {
      ws.getCell(3, c).border = borderThinGris();
      ws.getCell(3, c).fill = fillSolid(COLOR_BLANCO);
    }

    pintarLabel(ws.getCell(3, 11), 'EMPRESA');
    ws.mergeCells(3, 12, 3, 18);
    pintarValor(ws.getCell(3, 12), nombreEmpresa);
    for (let c = 12; c <= 18; c++) {
      ws.getCell(3, c).border = borderThinGris();
      ws.getCell(3, c).fill = fillSolid(COLOR_BLANCO);
    }

    pintarLabel(ws.getCell(3, 19), 'MES');
    const mesEnd = totalCols;
    ws.mergeCells(3, 20, 3, mesEnd);
    pintarValor(ws.getCell(3, 20), nombreMes(mes));
    for (let c = 20; c <= mesEnd; c++) {
      ws.getCell(3, c).border = borderThinGris();
      ws.getCell(3, c).fill = fillSolid(COLOR_BLANCO);
    }

    ws.getRow(3).height = 22;

    // ===== Filas 5-6: CABECERA TABLA =====
    const fixedHeaders = ['NOMBRE', 'DNI', 'CATEGORÍA'];
    const dasFinde = new Set();
    for (let d = 1; d <= diasMes; d++) {
      if (esFindeSemana(year, month, d)) dasFinde.add(d);
    }

    fixedHeaders.forEach((h, i) => {
      const cell = ws.getCell(5, i + 1);
      cell.value = h;
      pintarHeader(cell);
    });

    for (let d = 1; d <= diasMes; d++) {
      const cell = ws.getCell(5, fixedCols + d);
      cell.value = letraDiaSemana(year, month, d);
      pintarHeader(cell);
    }

    pintarHeader(ws.getCell(5, colHoras), 'HORAS MES');
    pintarHeader(ws.getCell(5, colPrecio), 'PRECIO HORA');
    pintarHeader(ws.getCell(5, colTotal), '€');

    ws.getRow(5).height = 32;

    // Fila 6: número de día
    for (let d = 1; d <= diasMes; d++) {
      const cell = ws.getCell(6, fixedCols + d);
      cell.value = d;
      pintarHeader(cell);
    }
    // Resto de fila 6: relleno cabecera (continuidad visual)
    for (let c = 1; c <= fixedCols; c++) {
      const cell = ws.getCell(6, c);
      cell.fill = fillSolid(COLOR_CABECERA_ACTUAL);
      cell.border = borderThinGris();
    }
    [colHoras, colPrecio, colTotal].forEach(c => {
      const cell = ws.getCell(6, c);
      cell.fill = fillSolid(COLOR_CABECERA_ACTUAL);
      cell.border = borderThinGris();
    });
    ws.getRow(6).height = 18;

    // ===== Filas datos =====
    let rowIndex = 7;
    const filaInicio = rowIndex;

    if (trabajadores.length === 0) {
      const cell = ws.getCell(rowIndex, 1);
      cell.value = 'Sin trabajadores con fichajes en este mes';
      cell.font = { name: FUENTE_EXCEL, italic: true, color: { argb: COLOR_MEDIO } };
      rowIndex++;
    } else {
      trabajadores.forEach((t, idx) => {
        const bandColor = idx % 2 === 0 ? COLOR_BLANCO : COLOR_BAND;
        const row = ws.getRow(rowIndex);
        row.height = 22;

        // NOMBRE / DNI / CATEGORÍA
        [
          { col: 1, val: t.nombre, align: 'left', indent: 1 },
          { col: 2, val: t.dni, align: 'center' },
          { col: 3, val: t.categoria || '', align: 'left' }
        ].forEach(({ col, val, align, indent }) => {
          const cell = row.getCell(col);
          cell.value = val;
          cell.font = { name: FUENTE_EXCEL, size: 10 };
          cell.fill = fillSolid(bandColor);
          cell.alignment = { horizontal: align, vertical: 'middle', wrapText: true, indent: indent || 0 };
          cell.border = borderThinGris();
        });

        // Días
        for (let d = 1; d <= diasMes; d++) {
          const col = fixedCols + d;
          const v = t.dias[d];
          const tieneAutocierre = t.dias_autocierre[d] > 0;
          const cell = row.getCell(col);
          cell.value = v ? v : null;
          cell.numFmt = '0.00;-0.00;';   // ocultar ceros
          cell.font = { name: FUENTE_EXCEL, size: 9 };

          // Prioridad de fondo:
          //   1) autocierre (naranja claro) — el aviso manda
          //   2) finde (gris)
          //   3) banding normal
          let fondo;
          if (tieneAutocierre) {
            fondo = COLOR_ALERTA;
          } else if (dasFinde.has(d)) {
            fondo = COLOR_FINDE;
          } else {
            fondo = bandColor;
          }
          cell.fill = fillSolid(fondo);
          cell.alignment = { horizontal: 'center', vertical: 'middle' };
          cell.border = borderThinGris();

          // Comentario en la celda con el aviso (solo si hay autocierre)
          if (tieneAutocierre) {
            cell.note = {
              texts: [
                { font: { bold: true, size: 10, name: FUENTE_EXCEL }, text: 'Salida automática\n' },
                { font: { size: 10, name: FUENTE_EXCEL }, text: 'Verificar la hora de salida con el encargado o el trabajador.' }
              ],
              margins: { insetmode: 'auto' }
            };
          }
        }

        // HORAS MES (fórmula)
        const colDiaIni = letraExcel(fixedCols + 1);
        const colDiaFin = letraExcel(fixedCols + diasMes);
        const cellHoras = row.getCell(colHoras);
        cellHoras.value = { formula: `SUM(${colDiaIni}${rowIndex}:${colDiaFin}${rowIndex})` };
        cellHoras.numFmt = '0.00;-0.00;-';
        cellHoras.font = { name: FUENTE_EXCEL, size: 10, bold: true };
        cellHoras.fill = fillSolid(COLOR_TOTAL);
        cellHoras.alignment = { horizontal: 'center', vertical: 'middle' };
        cellHoras.border = borderThinGris();

        // PRECIO HORA
        const cellPrecio = row.getCell(colPrecio);
        const precio = t.precio_hora !== null && t.precio_hora !== undefined ? Number(t.precio_hora) : 0;
        cellPrecio.value = precio ? precio : null;
        cellPrecio.numFmt = '#,##0.00 €;-#,##0.00 €;-';
        cellPrecio.font = { name: FUENTE_EXCEL, size: 10 };
        cellPrecio.fill = fillSolid(COLOR_TOTAL);
        cellPrecio.alignment = { horizontal: 'center', vertical: 'middle' };
        cellPrecio.border = borderThinGris();

        // TOTAL € (fórmula)
        const colH = letraExcel(colHoras);
        const colP = letraExcel(colPrecio);
        const cellTotal = row.getCell(colTotal);
        cellTotal.value = { formula: `${colH}${rowIndex}*${colP}${rowIndex}` };
        cellTotal.numFmt = '#,##0.00 €;-#,##0.00 €;-';
        cellTotal.font = { name: FUENTE_EXCEL, size: 10, bold: true };
        cellTotal.fill = fillSolid(COLOR_TOTAL);
        cellTotal.alignment = { horizontal: 'center', vertical: 'middle' };
        cellTotal.border = borderThinGris();

        rowIndex++;
      });
    }

    const filaFin = rowIndex - 1;

    // ===== FILA TOTALES =====
    if (trabajadores.length > 0) {
      const filaTot = ws.getRow(rowIndex);
      filaTot.height = 26;

      // Etiqueta TOTALES
      ws.mergeCells(rowIndex, 1, rowIndex, fixedCols);
      const cellLabel = ws.getCell(rowIndex, 1);
      cellLabel.value = 'TOTALES';
      cellLabel.font = { name: FUENTE_EXCEL, bold: true, size: 11, color: { argb: COLOR_BLANCO } };
      cellLabel.fill = fillSolid(COLOR_CABECERA_ACTUAL);
      cellLabel.alignment = { horizontal: 'right', vertical: 'middle', indent: 1 };
      cellLabel.border = borderThinGris();
      for (let c = 1; c <= fixedCols; c++) {
        ws.getCell(rowIndex, c).border = borderThinGris();
        ws.getCell(rowIndex, c).fill = fillSolid(COLOR_CABECERA_ACTUAL);
      }

      // Suma por día (fórmula)
      for (let d = 1; d <= diasMes; d++) {
        const col = fixedCols + d;
        const colLetter = letraExcel(col);
        const cell = ws.getCell(rowIndex, col);
        cell.value = { formula: `SUM(${colLetter}${filaInicio}:${colLetter}${filaFin})` };
        cell.numFmt = '0.00;-0.00;';
        cell.font = { name: FUENTE_EXCEL, bold: true, size: 8 };
        cell.fill = fillSolid(COLOR_FOOTER);
        cell.alignment = { horizontal: 'center', vertical: 'middle' };
        cell.border = borderThinGris();
      }

      // Total horas
      const colH = letraExcel(colHoras);
      const cellTotH = ws.getCell(rowIndex, colHoras);
      cellTotH.value = { formula: `SUM(${colH}${filaInicio}:${colH}${filaFin})` };
      cellTotH.numFmt = '0.00';
      cellTotH.font = { name: FUENTE_EXCEL, bold: true, size: 11 };
      cellTotH.fill = fillSolid(COLOR_FOOTER);
      cellTotH.alignment = { horizontal: 'center', vertical: 'middle' };
      cellTotH.border = borderThinGris();

      // Precio: vacío
      const cellTotP = ws.getCell(rowIndex, colPrecio);
      cellTotP.fill = fillSolid(COLOR_FOOTER);
      cellTotP.border = borderThinGris();

      // Total €
      const colT = letraExcel(colTotal);
      const cellTotT = ws.getCell(rowIndex, colTotal);
      cellTotT.value = { formula: `SUM(${colT}${filaInicio}:${colT}${filaFin})` };
      cellTotT.numFmt = '#,##0.00 €';
      cellTotT.font = { name: FUENTE_EXCEL, bold: true, size: 11 };
      cellTotT.fill = fillSolid(COLOR_FOOTER);
      cellTotT.alignment = { horizontal: 'center', vertical: 'middle' };
      cellTotT.border = borderThinGris();

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
    const firmaW = Math.max(8, Math.floor(totalCols / 2) - 1);
    const colDStart = totalCols - firmaW + 1;

    // Cabeceras
    ws.mergeCells(rowIndex, 1, rowIndex, firmaW);
    const cabFirma1 = ws.getCell(rowIndex, 1);
    cabFirma1.value = 'CONFORME ENCARGADO';
    cabFirma1.font = { name: FUENTE_EXCEL, bold: true, size: 10, color: { argb: COLOR_BLANCO } };
    cabFirma1.fill = fillSolid(COLOR_CABECERA_ACTUAL);
    cabFirma1.alignment = { horizontal: 'center', vertical: 'middle' };
    cabFirma1.border = borderThinGris();
    for (let c = 1; c <= firmaW; c++) {
      ws.getCell(rowIndex, c).fill = fillSolid(COLOR_CABECERA_ACTUAL);
      ws.getCell(rowIndex, c).border = borderThinGris();
    }

    ws.mergeCells(rowIndex, colDStart, rowIndex, totalCols);
    const cabFirma2 = ws.getCell(rowIndex, colDStart);
    cabFirma2.value = 'EMPRESA SUBCONTRATISTA';
    cabFirma2.font = { name: FUENTE_EXCEL, bold: true, size: 10, color: { argb: COLOR_BLANCO } };
    cabFirma2.fill = fillSolid(COLOR_CABECERA_ACTUAL);
    cabFirma2.alignment = { horizontal: 'center', vertical: 'middle' };
    cabFirma2.border = borderThinGris();
    for (let c = colDStart; c <= totalCols; c++) {
      ws.getCell(rowIndex, c).fill = fillSolid(COLOR_CABECERA_ACTUAL);
      ws.getCell(rowIndex, c).border = borderThinGris();
    }

    rowIndex += 1;

    // Caja firma (4 filas en blanco con bordes)
    [[1, firmaW], [colDStart, totalCols]].forEach(([cStart, cEnd]) => {
      ws.mergeCells(rowIndex, cStart, rowIndex + 3, cEnd);
      for (let r = rowIndex; r <= rowIndex + 3; r++) {
        for (let c = cStart; c <= cEnd; c++) {
          const cell = ws.getCell(r, c);
          cell.border = borderThinGris();
          cell.fill = fillSolid(COLOR_BLANCO);
        }
      }
    });
    for (let r = rowIndex; r <= rowIndex + 3; r++) {
      ws.getRow(r).height = 18;
    }
    rowIndex += 4;

    // Fdo.
    ws.mergeCells(rowIndex, 1, rowIndex, firmaW);
    const fdo1 = ws.getCell(rowIndex, 1);
    fdo1.value = 'Fdo.:';
    fdo1.font = { name: FUENTE_EXCEL, bold: true, size: 10 };
    fdo1.alignment = { horizontal: 'left', vertical: 'middle', indent: 1 };

    ws.mergeCells(rowIndex, colDStart, rowIndex, totalCols);
    const fdo2 = ws.getCell(rowIndex, colDStart);
    fdo2.value = 'Fdo.:';
    fdo2.font = { name: FUENTE_EXCEL, bold: true, size: 10 };
    fdo2.alignment = { horizontal: 'left', vertical: 'middle', indent: 1 };

    ws.getRow(rowIndex).height = 18;
    rowIndex += 2;

    // Nota final
    ws.mergeCells(rowIndex, 1, rowIndex, totalCols);
    const nota = ws.getCell(rowIndex, 1);
    nota.value = 'Resumen mensual de horas registradas mediante fichajes de entrada y salida.';
    nota.font = { name: FUENTE_EXCEL, size: 8, italic: true, color: { argb: COLOR_MEDIO } };
    nota.alignment = { horizontal: 'left', vertical: 'middle', wrapText: true, indent: 1 };

    // Congelar paneles: dejar visibles las columnas de identificación y las cabeceras.
    ws.views = [{ state: 'frozen', xSplit: fixedCols, ySplit: 6 }];
  }

  // ===== Helpers de estilo =====

  function pintarHeader(cell, valor) {
    if (valor !== undefined) cell.value = valor;
    cell.font = { name: FUENTE_EXCEL, bold: true, size: 9, color: { argb: COLOR_BLANCO } };
    cell.fill = fillSolid(COLOR_CABECERA_ACTUAL);
    cell.alignment = { horizontal: 'center', vertical: 'middle', wrapText: true };
    cell.border = borderThinGris();
  }

  function pintarLabel(cell, texto) {
    cell.value = texto;
    cell.font = { name: FUENTE_EXCEL, bold: true, size: 10, color: { argb: COLOR_LABEL_TEXTO_ACTUAL } };
    cell.fill = fillSolid(COLOR_LABEL_ACTUAL);
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
    const d = new Date(year, month - 1, day);
    const dow = d.getDay();   // 0 = domingo, 6 = sábado
    return dow === 0 || dow === 6;
  }

  function letraExcel(num) {
    let n = num;
    let s = '';
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
      { width: 14 }  // CATEGORÍA
    ];

    for (let d = 1; d <= diasMes; d++) cols.push({ width: 4 });

    cols.push({ width: 13 });  // HORAS MES
    cols.push({ width: 14 });  // PRECIO HORA
    cols.push({ width: 14 });  // €

    return cols;
  }

  function textoLegal() {
    return 'El presente resumen recoge las horas registradas mediante fichajes de entrada y salida en la obra indicada. Los días marcados en naranja corresponden a salidas cerradas automáticamente y deben revisarse antes de validar el resumen mensual.';
  }

  function obtenerBrandingExcel(empresaMarca) {
    return BRANDING_EXCEL[empresaMarca] || BRANDING_EXCEL.bosch_pascual;
  }

  function colorTextoLegible(hex) {
    const clean = String(hex || '').replace('#', '').substring(0, 6);
    if (clean.length !== 6) return COLOR_BLANCO;
    const r = parseInt(clean.substring(0, 2), 16);
    const g = parseInt(clean.substring(2, 4), 16);
    const b = parseInt(clean.substring(4, 6), 16);
    // Fórmula simple de luminancia percibida. Si el fondo es claro, texto negro.
    const luminancia = (0.299 * r + 0.587 * g + 0.114 * b);
    return luminancia > 150 ? '000000' : COLOR_BLANCO;
  }

  async function insertarLogoSiDisponible(workbook, ws, marca) {
    try {
      if (!marca?.logo_blanco || typeof fetch !== 'function' || typeof document === 'undefined') return;

      const base64 = await svgUrlToPngBase64(marca.logo_blanco, 220, 70);
      if (!base64) return;

      const imageId = workbook.addImage({
        base64,
        extension: 'png'
      });

      // Se coloca pequeño y discreto, arriba a la izquierda, sobre la cabecera oscura.
      ws.addImage(imageId, {
        tl: { col: 0.25, row: 0.12 },
        ext: { width: 145, height: 34 },
        editAs: 'oneCell'
      });
    } catch (err) {
      // El logo es decorativo: si falla por CORS, SVG o navegador, no debe romper la exportación.
      console.warn('[ExcelProforma] No se pudo insertar el logo corporativo:', err);
    }
  }

  async function svgUrlToPngBase64(url, width, height) {
    const res = await fetch(url);
    if (!res.ok) throw new Error('No se pudo cargar el logo: ' + url);

    const svgText = await res.text();
    const svgBlob = new Blob([svgText], { type: 'image/svg+xml;charset=utf-8' });
    const objectUrl = URL.createObjectURL(svgBlob);

    try {
      const img = await cargarImagen(objectUrl);
      const canvas = document.createElement('canvas');
      canvas.width = width;
      canvas.height = height;
      const ctx = canvas.getContext('2d');
      ctx.clearRect(0, 0, width, height);

      const scale = Math.min(width / img.width, height / img.height);
      const drawW = img.width * scale;
      const drawH = img.height * scale;
      const x = (width - drawW) / 2;
      const y = (height - drawH) / 2;
      ctx.drawImage(img, x, y, drawW, drawH);

      return canvas.toDataURL('image/png');
    } finally {
      URL.revokeObjectURL(objectUrl);
    }
  }

  function cargarImagen(src) {
    return new Promise((resolve, reject) => {
      const img = new Image();
      img.onload = () => resolve(img);
      img.onerror = () => reject(new Error('No se pudo convertir el logo SVG a imagen.'));
      img.src = src;
    });
  }

  // ===== Helpers genéricos =====

  function nombreCompleto(t) {
    return [t.nombre, t.apellidos].filter(Boolean).join(' ').trim() || '(sin nombre)';
  }

  function nombreHojaSeguro(nombre) {
    return String(nombre || 'Sin empresa')
      .replace(/[\\/?*\[\]:]/g, ' ')
      .substring(0, 31)
      .trim() || 'Sin empresa';
  }

  function letraDiaSemana(year, month, day) {
    const d = new Date(year, month - 1, day);
    const letras = ['D', 'L', 'M', 'X', 'J', 'V', 'S'];
    return letras[d.getDay()];
  }

  function nombreMes(mes) {
    const [year, month] = mes.split('-').map(Number);
    const d = new Date(year, month - 1, 1);
    return d.toLocaleDateString('es-ES', { month: 'long', year: 'numeric' }).toUpperCase();
  }

  function redondear2(n) {
    return Math.round((Number(n) || 0) * 100) / 100;
  }

  // ===== API pública =====

  window.ExcelProforma = {
    generar
  };
})();
