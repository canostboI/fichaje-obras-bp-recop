/**
 * listado-dia.js — Listado diario exportable (N-2)
 *
 * Saca en Excel quién estuvo en una obra un DÍA concreto: el día entero,
 * no solo los que siguen dentro ahora. Incluye los denegados y los
 * presentes sin registrar de ese día, que en papel son justo los que se
 * pierden.
 *
 * Módulo compartido por jefe/resumen-mes.html y encargado/resumen-mes.html.
 * NO calcula horas: las recibe ya calculadas por js/excel-proforma.js, que
 * sigue siendo el ÚNICO motor de cálculo de la app.
 *
 * Uso:
 *   1) Cargar ExcelJS antes que este script:
 *        <script src="https://cdn.jsdelivr.net/npm/exceljs@4.4.0/dist/exceljs.min.js"></script>
 *        <script src="../js/listado-dia.js"></script>
 *
 *   2) Construir las filas de personas a partir de lo que la página ya tiene
 *      en memoria (la caché del mes + el resumen que devolvió el motor):
 *        const personas = window.ListadoDia.construirPersonas({
 *          fichajes: fichajesMesCache,
 *          fecha: '2026-07-14',
 *          resumen: resumenTrabajadores   // { id: { nombre, dni, dias, dias_ajuste } }
 *        });
 *
 *   3) Generar el Excel:
 *        const { buffer } = await window.ListadoDia.generar({
 *          obra: { nombre, numero_obra, empresa_marca },
 *          fecha: '2026-07-14',
 *          personas,
 *          denegados: [...],      // opcional
 *          sinRegistrar: [...],   // opcional
 *          usuario: 'Nombre (rol)'
 *        });
 *
 *      Devuelve { buffer }. No descarga el archivo.
 */

(function () {
  'use strict';

  // ===== Paletas por marca (mismas que el proforma) =====
  const PALETAS = {
    bosch_pascual: { oscuro: '1A7A8A', acento: 'D6EEF2' },
    recop:         { oscuro: 'A0392B', acento: 'F2DED6' },
    _default:      { oscuro: '37474F', acento: 'E0E4E6' }
  };

  const AZUL_FIJADA = 'D6E7FF';   // mismo azul que el proforma usa para horas fijadas
  const NARANJA     = 'FFE0B2';   // autocierre
  const GRIS_BLOQUE = 'ECEFF1';

  // ===================================================================
  // 1) Construcción de las filas de personas
  // ===================================================================

  /**
   * Devuelve una fila por persona que pisó la obra ese día.
   *
   * @param {Array}  fichajes  fichajes del MES (la caché de la página)
   * @param {String} fecha     'YYYY-MM-DD'
   * @param {Object} resumen   mapa { trabajador_id: { nombre, dni, dias, dias_ajuste } }
   * @returns {Array} filas ordenadas por empresa y luego por nombre
   */
  function construirPersonas({ fichajes, fecha, resumen }) {
    const lista = fichajes || [];
    const mapaResumen = resumen || {};
    const dia = Number(String(fecha).slice(8, 10));

    // Nos quedamos solo con los fichajes de ese día (fecha LOCAL, no UTC).
    const delDia = lista.filter(f => fechaISOLocal(new Date(f.hora)) === fecha);

    const porTrab = new Map();
    delDia.forEach(f => {
      const t = f.trabajador || {};
      const id = f.trabajador_id;
      if (!id) return;
      if (!porTrab.has(id)) {
        porTrab.set(id, {
          id,
          nombre: nombreCompleto(t) || (mapaResumen[id] && mapaResumen[id].nombre) || '(sin nombre)',
          dni: t.dni || (mapaResumen[id] && mapaResumen[id].dni) || '',
          empresa: (t.empresa && t.empresa.nombre) ? t.empresa.nombre : '',
          primeraEntrada: null,
          ultimaSalida: null,
          salidaAutocierre: false,
          tocadoAMano: false
        });
      }
      const reg = porTrab.get(id);
      const h = new Date(f.hora);
      if (f.tipo === 'entrada') {
        if (!reg.primeraEntrada || h < reg.primeraEntrada) reg.primeraEntrada = h;
      } else if (f.tipo === 'salida') {
        if (!reg.ultimaSalida || h > reg.ultimaSalida) {
          reg.ultimaSalida = h;
          reg.salidaAutocierre = !!f.cierre_automatico;
        }
      }
      if (f.es_manual || f.corregido_por) reg.tocadoAMano = true;
    });

    const filas = [...porTrab.values()].map(r => {
      const res = mapaResumen[r.id] || {};
      const calculadas = (res.dias && res.dias[dia] != null) ? Number(res.dias[dia]) : 0;
      const ajusteDia = (res.dias_ajuste && res.dias_ajuste[dia]) ? res.dias_ajuste[dia] : null;

      // Si el día tiene horas FIJADAS, mandan ellas: es lo que paga el
      // proforma. Enseñar las calculadas aquí divergiría en silencio del
      // documento económico.
      const horas = ajusteDia ? Number(ajusteDia.fijadas) : calculadas;

      const estados = [];
      if (r.primeraEntrada && !r.ultimaSalida) estados.push('Sigue dentro / sin salida');
      if (r.salidaAutocierre) estados.push('Salida por autocierre');
      if (r.tocadoAMano) estados.push('Tocado a mano');
      if (ajusteDia) {
        estados.push('Horas fijadas' + (ajusteDia.motivo ? ' (' + ajusteDia.motivo + ')' : ''));
      }

      return {
        nombre: r.nombre,
        dni: r.dni,
        empresa: r.empresa || '—',
        entrada: r.primeraEntrada ? hhmm(r.primeraEntrada) : '',
        salida: r.ultimaSalida ? hhmm(r.ultimaSalida) : '',
        horas: redondear2(horas),
        horasFijadas: !!ajusteDia,
        autocierre: r.salidaAutocierre,
        sinSalida: !!(r.primeraEntrada && !r.ultimaSalida),
        estado: estados.join(' · ')
      };
    });

    return filas.sort((a, b) => {
      const ea = (a.empresa || '').toLowerCase();
      const eb = (b.empresa || '').toLowerCase();
      if (ea !== eb) return ea.localeCompare(eb, 'es');
      return (a.nombre || '').localeCompare(b.nombre || '', 'es');
    });
  }

  // ===================================================================
  // 2) Generación del Excel
  // ===================================================================

  async function generar({ obra, fecha, personas, denegados, sinRegistrar, usuario }) {
    if (!window.ExcelJS) throw new Error('No se ha cargado ExcelJS.');

    const marca = (obra && obra.empresa_marca) || '_default';
    const paleta = PALETAS[marca] || PALETAS._default;

    const filas = personas || [];
    const den = denegados || [];
    const sin = sinRegistrar || [];

    const workbook = new window.ExcelJS.Workbook();
    workbook.creator = 'Fichaje Obras';
    workbook.created = new Date();

    const hoja = workbook.addWorksheet('Listado del día', {
      pageSetup: { orientation: 'landscape', fitToPage: true, fitToWidth: 1, fitToHeight: 0 }
    });

    hoja.columns = [
      { width: 5 },   // #
      { width: 30 },  // Nombre
      { width: 13 },  // DNI
      { width: 28 },  // Empresa
      { width: 10 },  // Entrada
      { width: 10 },  // Salida
      { width: 9 },   // Horas
      { width: 42 }   // Estado
    ];

    let fila = 1;

    // ── Cabecera ──
    hoja.mergeCells(fila, 1, fila, 8);
    const cTitulo = hoja.getCell(fila, 1);
    cTitulo.value = 'LISTADO DIARIO DE OBRA';
    cTitulo.font = { bold: true, size: 15, color: { argb: 'FFFFFF' } };
    cTitulo.fill = fillSolid(paleta.oscuro);
    cTitulo.alignment = { vertical: 'middle', horizontal: 'left', indent: 1 };
    hoja.getRow(fila).height = 26;
    fila++;

    hoja.mergeCells(fila, 1, fila, 8);
    const cSub = hoja.getCell(fila, 1);
    const nombreObra = (obra && obra.nombre) ? obra.nombre : '(obra)';
    const numObra = (obra && obra.numero_obra) ? ' · nº ' + obra.numero_obra : '';
    cSub.value = nombreObra + numObra + '   |   Fecha: ' + fechaLarga(fecha);
    cSub.font = { bold: true, size: 11 };
    cSub.fill = fillSolid(paleta.acento);
    cSub.alignment = { vertical: 'middle', horizontal: 'left', indent: 1 };
    hoja.getRow(fila).height = 20;
    fila++;
    fila++;

    // ── Bloque 1: personas ──
    fila = tituloBloque(hoja, fila, 'PERSONAS EN OBRA (' + filas.length + ')', paleta);

    const cabeceras = ['#', 'Nombre', 'DNI', 'Empresa', 'Entrada', 'Salida', 'Horas', 'Estado'];
    cabeceras.forEach((txt, i) => {
      const c = hoja.getCell(fila, i + 1);
      c.value = txt;
      c.font = { bold: true, size: 10, color: { argb: 'FFFFFF' } };
      c.fill = fillSolid(paleta.oscuro);
      c.alignment = { vertical: 'middle', horizontal: i === 0 ? 'center' : 'left' };
      c.border = borderThinGris();
    });
    hoja.getRow(fila).height = 18;
    fila++;

    if (filas.length === 0) {
      hoja.mergeCells(fila, 1, fila, 8);
      const c = hoja.getCell(fila, 1);
      c.value = 'Sin fichajes registrados este día.';
      c.font = { italic: true, color: { argb: '777777' } };
      c.alignment = { horizontal: 'center' };
      c.border = borderThinGris();
      fila++;
    } else {
      filas.forEach((p, i) => {
        const valores = [i + 1, p.nombre, p.dni, p.empresa, p.entrada, p.salida, p.horas, p.estado];
        valores.forEach((v, j) => {
          const c = hoja.getCell(fila, j + 1);
          c.value = v;
          c.font = { size: 10 };
          c.border = borderThinGris();
          c.alignment = {
            vertical: 'middle',
            horizontal: (j === 0 || j === 4 || j === 5 || j === 6) ? 'center' : 'left'
          };
        });
        // Marcas visuales coherentes con el resto de la app.
        if (p.horasFijadas) hoja.getCell(fila, 7).fill = fillSolid(AZUL_FIJADA);
        if (p.autocierre || p.sinSalida) hoja.getCell(fila, 6).fill = fillSolid(NARANJA);
        fila++;
      });

      // Total de horas del día
      const total = filas.reduce((s, p) => s + (Number(p.horas) || 0), 0);
      const cEtq = hoja.getCell(fila, 6);
      cEtq.value = 'TOTAL';
      cEtq.font = { bold: true, size: 10 };
      cEtq.alignment = { horizontal: 'right' };
      cEtq.border = borderThinGris();
      const cTot = hoja.getCell(fila, 7);
      cTot.value = redondear2(total);
      cTot.font = { bold: true, size: 10 };
      cTot.alignment = { horizontal: 'center' };
      cTot.fill = fillSolid(paleta.acento);
      cTot.border = borderThinGris();
      fila++;
    }

    fila++;

    // ── Bloque 2: denegados ──
    fila = tituloBloque(hoja, fila, 'ACCESOS DENEGADOS (' + den.length + ')', paleta);
    fila = tablaSimple(hoja, fila, ['Nombre', 'Empresa', 'Hora del intento'],
      den.map(d => [d.nombre || '—', d.empresa || '—', d.hora || '—']),
      'Ningún acceso denegado este día.', paleta);

    hoja.mergeCells(fila, 1, fila, 8);
    const cNotaDen = hoja.getCell(fila, 1);
    cNotaDen.value = 'El motivo del bloqueo no se incluye en este listado por contener datos de categoría especial (salud).';
    cNotaDen.font = { italic: true, size: 9, color: { argb: '777777' } };
    fila++;
    fila++;

    // ── Bloque 3: presentes sin registrar ──
    fila = tituloBloque(hoja, fila, 'PRESENTES SIN REGISTRAR (' + sin.length + ')', paleta);
    fila = tablaSimple(hoja, fila, ['Nombre declarado', 'Empresa declarada', 'DNI tecleado', 'Intentos'],
      sin.map(s => [s.nombre || '—', s.empresa || '—', s.dni || '—', s.intentos != null ? s.intentos : 1]),
      'Ninguna persona sin registrar este día.', paleta);

    hoja.mergeCells(fila, 1, fila, 8);
    const cNotaSin = hoja.getCell(fila, 1);
    cNotaSin.value = 'Datos DECLARADOS por la propia persona en la valla, sin verificar. Su presencia NO implica autorización para trabajar.';
    cNotaSin.font = { italic: true, size: 9, color: { argb: '777777' } };
    fila++;
    fila++;

    // ── Pie ──
    hoja.mergeCells(fila, 1, fila, 8);
    const cPie1 = hoja.getCell(fila, 1);
    cPie1.value = 'Descargado por ' + (usuario || '—') + ' el ' + fechaHoraLarga(new Date()) + '.';
    cPie1.font = { size: 9, color: { argb: '555555' } };
    fila++;

    hoja.mergeCells(fila, 1, fila, 8);
    const cPie2 = hoja.getCell(fila, 1);
    cPie2.value = 'Documento INFORMATIVO. El documento económico del mes es el Excel proforma, que se genera desde "Resumen mes · Proforma".';
    cPie2.font = { size: 9, bold: true, color: { argb: '555555' } };
    fila++;

    const buffer = await workbook.xlsx.writeBuffer();
    return { buffer };
  }

  // ===================================================================
  // Ayudas internas
  // ===================================================================

  function tituloBloque(hoja, fila, texto, paleta) {
    hoja.mergeCells(fila, 1, fila, 8);
    const c = hoja.getCell(fila, 1);
    c.value = texto;
    c.font = { bold: true, size: 11 };
    c.fill = fillSolid(GRIS_BLOQUE);
    c.alignment = { vertical: 'middle', horizontal: 'left', indent: 1 };
    hoja.getRow(fila).height = 20;
    return fila + 1;
  }

  function tablaSimple(hoja, fila, cabeceras, datos, textoVacio, paleta) {
    cabeceras.forEach((txt, i) => {
      const c = hoja.getCell(fila, i + 1);
      c.value = txt;
      c.font = { bold: true, size: 10, color: { argb: 'FFFFFF' } };
      c.fill = fillSolid(paleta.oscuro);
      c.alignment = { vertical: 'middle', horizontal: 'left' };
      c.border = borderThinGris();
    });
    fila++;

    if (datos.length === 0) {
      hoja.mergeCells(fila, 1, fila, cabeceras.length);
      const c = hoja.getCell(fila, 1);
      c.value = textoVacio;
      c.font = { italic: true, color: { argb: '777777' } };
      c.alignment = { horizontal: 'center' };
      c.border = borderThinGris();
      return fila + 1;
    }

    datos.forEach(row => {
      row.forEach((v, j) => {
        const c = hoja.getCell(fila, j + 1);
        c.value = v;
        c.font = { size: 10 };
        c.border = borderThinGris();
        c.alignment = { vertical: 'middle', horizontal: 'left' };
      });
      fila++;
    });
    return fila;
  }

  function fillSolid(argb) {
    return { type: 'pattern', pattern: 'solid', fgColor: { argb } };
  }

  function borderThinGris() {
    return {
      top:    { style: 'thin', color: { argb: 'BBBBBB' } },
      left:   { style: 'thin', color: { argb: 'BBBBBB' } },
      bottom: { style: 'thin', color: { argb: 'BBBBBB' } },
      right:  { style: 'thin', color: { argb: 'BBBBBB' } }
    };
  }

  function nombreCompleto(t) {
    return [t.nombre, t.apellidos].filter(Boolean).join(' ').trim();
  }

  function hhmm(d) {
    return String(d.getHours()).padStart(2, '0') + ':' + String(d.getMinutes()).padStart(2, '0');
  }

  // Fecha local 'YYYY-MM-DD' (nunca toISOString: eso da UTC y corre el día).
  function fechaISOLocal(d) {
    return d.getFullYear() + '-' +
           String(d.getMonth() + 1).padStart(2, '0') + '-' +
           String(d.getDate()).padStart(2, '0');
  }

  function fechaLarga(fechaISO) {
    const [y, m, d] = String(fechaISO).split('-').map(Number);
    const dt = new Date(y, m - 1, d);
    return dt.toLocaleDateString('es-ES', {
      weekday: 'long', day: '2-digit', month: 'long', year: 'numeric'
    });
  }

  function fechaHoraLarga(d) {
    return d.toLocaleDateString('es-ES', { day: '2-digit', month: '2-digit', year: 'numeric' }) +
           ' a las ' + hhmm(d);
  }

  function redondear2(n) {
    return Math.round((Number(n) || 0) * 100) / 100;
  }

  window.ListadoDia = { construirPersonas, generar };
})();
