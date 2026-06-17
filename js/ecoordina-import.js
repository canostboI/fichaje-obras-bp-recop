/* ============================================================================
   js/ecoordina-import.js
   ----------------------------------------------------------------------------
   Motor compartido del importador de e-Coordina.

   Concentra TODA la "inteligencia" del importador (leer archivo, separar
   empresa/trabajador, aplicar reglas documentales, contratos, Recurso
   Preventivo, calcular semáforo y escribir en BD), de forma que pueda usarse
   tanto desde el importador del jefe (una obra) como desde el importador
   masivo del admin (todas las obras de golpe).

   Patrón del proyecto: lógica compartida → módulo en /js/ que expone API en
   window. NO depende del DOM. Las funciones reciben sus dependencias por
   parámetro (sb, reglas, sets...) para poder reutilizarse en bucle por obra.

   Requiere que XLSX (SheetJS) esté cargado globalmente antes que este módulo.
   ========================================================================== */

window.EcoordinaImport = (function () {
  'use strict';

  // Documentos que solo aplican al Recurso Preventivo designado y que, por
  // tanto, NO deben heredarse a trabajadores de subcontratas.
  const DOCS_SOLO_RP = [
    'Nombramiento del Recurso Preventivo',
    'Formación 60 horas (Nivel básico) del Recurso preventivo'
  ];

  // Documentos de PRL que solo tienen sentido en una empresa con plantilla.
  // A un AUTÓNOMO SIN ASALARIADOS (marcado en la app con
  // empresas.es_autonomo_sin_asalariados = true) no se le exigen → se le
  // perdonan estos documentos de empresa. Anclas cortas: casan aunque el
  // nombre real lleve coletillas (p. ej. "Modalidad Preventiva adoptada
  // (especialidades Técnicas) + Recibo").
  const DOCS_SOLO_PLANTILLA = [
    'Modalidad Preventiva adoptada',
    'Evaluación de riesgos'
  ];

  // Documentos que solo exige un OFICIO concreto (categoría de la app). Si el
  // trabajador NO es de una de esas categorías, el documento no le aplica y se
  // salta (no penaliza). e-Coordina siempre manda "peon", por eso miramos la
  // categoría real de la app (la que ponen admin/jefe a mano). Esto es tan
  // fiable como esas categorías: un gruista mal clasificado dejaría de
  // controlarse su autorización de maquinaria.
  // Anclas cortas: casan aunque el nombre lleve coletillas.
  const DOCS_POR_OFICIO = [
    { doc: 'Autorización de uso de maquinaria', categorias: ['gruista'] },
    { doc: 'Formación en riesgo eléctrico',     categorias: ['electricista'] }
  ];

  // ── Normalización / helpers de texto ──────────────────────────────────────
  function normalizar(s) {
    return String(s || '')
      .normalize('NFD').replace(/[\u0300-\u036f]/g, '')
      .toUpperCase()
      .replace(/\s+/g, ' ')
      .trim();
  }

  function estadoSeguro(estado) {
    return ['verde', 'naranja', 'rojo'].includes(estado) ? estado : 'naranja';
  }

  function extraerDniDeTrabajador(texto) {
    if (!texto) return null;
    const partes = texto.split(' - ');
    if (partes.length < 2) return null;
    const dni = partes[partes.length - 1].trim();
    if (/^[A-Z0-9]{6,10}$/i.test(dni)) return dni.toUpperCase();
    return null;
  }
  function extraerNombreTrabajador(texto) {
    if (!texto) return '';
    return texto.split(' - ')[0].replace(/^[,\s]+/, '').trim();
  }
  function extraerNombreEmpresa(texto) {
    if (!texto) return '';
    return texto.split(' - ')[0].trim();
  }
  function extraerEmpresa(texto) {
    if (!texto) return { nombre: '', cif: '' };
    const partes = texto.split(' - ');
    if (partes.length >= 2) return { nombre: partes.slice(0, partes.length - 1).join(' - ').trim(), cif: partes[partes.length - 1].trim() };
    return { nombre: texto.trim(), cif: '' };
  }

  // Devuelve las palabras de un nombre, normalizadas y ordenadas, para poder
  // compararlas sin importar el orden ni las comas (apellidos, nombre / nombre apellidos).
  function tokensNombre(s) {
    return normalizar(String(s || '').replace(/,/g, ' '))
      .split(' ')
      .filter(Boolean)
      .sort();
  }
  // ¿El nombre de la empresa coincide con el del trabajador? (= mismo conjunto
  // de palabras). Es la firma típica de un AUTÓNOMO: la empresa lleva su nombre.
  function mismosNombres(a, b) {
    const ta = tokensNombre(a), tb = tokensNombre(b);
    if (ta.length === 0 || tb.length === 0 || ta.length !== tb.length) return false;
    return ta.every((t, i) => t === tb[i]);
  }

  // ── Fechas ─────────────────────────────────────────────────────────────────
  function parsearFechaEcoordina(texto) {
    if (!texto) return null;
    const t = String(texto).trim();
    const m = t.match(/^(\d{1,2})\/(\d{1,2})\/(\d{4})$/);
    if (!m) return null;
    const d = new Date(parseInt(m[3], 10), parseInt(m[2], 10) - 1, parseInt(m[1], 10));
    return isNaN(d.getTime()) ? null : d.getTime();
  }
  function fechaMasRecienteDeFila(fila) {
    const candidatos = [fila['F.emisión'], fila['F.emision'], fila['F.verificado'], fila['F.cumplimentado'], fila['F.solicitado']];
    let max = -Infinity;
    for (const c of candidatos) { const t = parsearFechaEcoordina(c); if (t !== null && t > max) max = t; }
    return max === -Infinity ? null : max;
  }

  // ── Reglas / semáforo ────────────────────────────────────────────────────
  function aplicarRegla(reglas, nombreDoc, estadoEcoordina, tipoAplica) {
    let regla = reglas.find(r => r.aplica_a === tipoAplica && r.nombre_documento === nombreDoc && r.estado_ecoordina === estadoEcoordina);
    if (!regla) regla = reglas.find(r => r.aplica_a === tipoAplica && r.nombre_documento === '*' && r.estado_ecoordina === estadoEcoordina);
    return regla || null;
  }
  function peorEstado(a, b) {
    const orden = { rojo: 3, naranja: 2, verde: 1 };
    return (orden[a] || 0) >= (orden[b] || 0) ? a : b;
  }

  function esDocSoloRP(nombreDoc) {
    const norm = normalizar(nombreDoc);
    for (const ref of DOCS_SOLO_RP) {
      const refNorm = normalizar(ref);
      if (norm === refNorm) return true;
      if (norm.includes(refNorm)) return true;
    }
    return false;
  }

  function esDocSoloPlantilla(nombreDoc) {
    const norm = normalizar(nombreDoc);
    for (const ref of DOCS_SOLO_PLANTILLA) {
      const refNorm = normalizar(ref);
      if (norm === refNorm) return true;
      if (norm.includes(refNorm)) return true;
    }
    return false;
  }

  // ¿Este documento es "de oficio" y la categoría del trabajador NO lo exige?
  // Devuelve true si hay que SALTAR el documento para este trabajador.
  // Sin categoría conocida → se trata como 'peon' (no le aplican docs de oficio).
  function docNoAplicaPorOficio(nombreDoc, categoria) {
    const norm = normalizar(nombreDoc);
    const cat = normalizar(categoria || 'peon');
    for (const m of DOCS_POR_OFICIO) {
      const refNorm = normalizar(m.doc);
      if (norm === refNorm || norm.includes(refNorm)) {
        // Es un documento de oficio: ¿la categoría está entre las que lo exigen?
        const loExige = m.categorias.some(c => normalizar(c) === cat);
        return !loExige; // no lo exige → saltar
      }
    }
    return false; // no es documento de oficio → no se salta
  }

  function esEmpresaPropia(empresasPropias, empresaRaw) {
    if (!empresaRaw) return false;
    const { nombre, cif } = extraerEmpresa(empresaRaw);
    const nNombre = normalizar(nombre);
    const nCif = normalizar(cif);
    if (nNombre && nCif && empresasPropias.has(`${nNombre}|${nCif}`)) return true;
    if (nNombre && empresasPropias.has(`NOMBRE:${nNombre}`)) return true;
    if (nCif && empresasPropias.has(`CIF:${nCif}`)) return true;
    return false;
  }

  // Misma forma que esEmpresaPropia, pero sobre el conjunto de empresas
  // marcadas como autónomo sin asalariados.
  function esAutonomoSinAsalariados(autonomosSolos, empresaRaw) {
    if (!empresaRaw) return false;
    const { nombre, cif } = extraerEmpresa(empresaRaw);
    const nNombre = normalizar(nombre);
    const nCif = normalizar(cif);
    if (nNombre && nCif && autonomosSolos.has(`${nNombre}|${nCif}`)) return true;
    if (nNombre && autonomosSolos.has(`NOMBRE:${nNombre}`)) return true;
    if (nCif && autonomosSolos.has(`CIF:${nCif}`)) return true;
    return false;
  }

  function tieneContratoVigente(contratosVigentes, empresaRaw) {
    if (!empresaRaw) return false;
    const { nombre, cif } = extraerEmpresa(empresaRaw);
    const nNombre = normalizar(nombre);
    const nCif = normalizar(cif);
    if (nNombre && nCif && contratosVigentes.has(`${nNombre}|${nCif}`)) return true;
    if (nNombre && contratosVigentes.has(`NOMBRE:${nNombre}`)) return true;
    if (nCif && contratosVigentes.has(`CIF:${nCif}`)) return true;
    return false;
  }

  function tieneLibroVigente(librosVigentes, empresaRaw) {
    if (!empresaRaw) return false;
    const { nombre, cif } = extraerEmpresa(empresaRaw);
    const nNombre = normalizar(nombre);
    const nCif = normalizar(cif);
    if (nNombre && nCif && librosVigentes.has(`${nNombre}|${nCif}`)) return true;
    if (nNombre && librosVigentes.has(`NOMBRE:${nNombre}`)) return true;
    if (nCif && librosVigentes.has(`CIF:${nCif}`)) return true;
    return false;
  }

  // ── Parseo de archivo (usa XLSX global) ───────────────────────────────────
  function convertirWorkbookAFilas(wb) {
    const ws = wb.Sheets[wb.SheetNames[0]];
    if (!ws) throw new Error('El archivo no contiene ninguna hoja o tabla legible.');

    const rawRows = XLSX.utils.sheet_to_json(ws, { header: 1, defval: '', raw: false });
    const headerIndex = rawRows.findIndex(row => {
      const cols = row.map(c => String(c).trim());
      return cols.includes('Documento') && cols.includes('Estado') &&
             cols.includes('Empresa') && cols.includes('Trabajador');
    });

    if (headerIndex === -1) throw new Error('No se han encontrado las cabeceras esperadas de e-Coordina.');

    const headers = rawRows[headerIndex].map(h => String(h).trim());
    return rawRows.slice(headerIndex + 1)
      .map(row => { const obj = {}; headers.forEach((h, i) => { if (h) obj[h] = row[i] ?? ''; }); return obj; })
      .filter(obj => Object.values(obj).some(v => String(v).trim() !== ''));
  }

  // Parsea el contenido ya leído (string para CSV, ArrayBuffer para Excel).
  function parsearContenido(contenido, esCsv) {
    let wb;
    if (esCsv) {
      wb = XLSX.read(contenido, { type: 'string', raw: false, FS: ';' });
    } else {
      wb = XLSX.read(contenido, { type: 'array' });
    }
    return convertirWorkbookAFilas(wb);
  }

  // Lee un objeto File del navegador y devuelve una promesa con las filas.
  function leerArchivo(file) {
    return new Promise((resolve, reject) => {
      const nombre = file.name.toLowerCase();
      const esCsv = nombre.endsWith('.csv');
      const esExcel = nombre.endsWith('.xlsx') || nombre.endsWith('.xls');
      if (!esCsv && !esExcel) { reject(new Error('Solo se aceptan archivos .csv, .xlsx o .xls')); return; }

      const reader = new FileReader();
      reader.onload = e => {
        try { resolve(parsearContenido(e.target.result, esCsv)); }
        catch (err) { reject(err); }
      };
      reader.onerror = () => reject(new Error('No se ha podido leer el archivo seleccionado.'));
      if (esCsv) reader.readAsText(file, 'ISO-8859-1');
      else reader.readAsArrayBuffer(file);
    });
  }

  // ── Centros ───────────────────────────────────────────────────────────────
  // Devuelve el conjunto de Centros distintos (normalizados) presentes en las filas.
  function centrosDistintos(filas) {
    return new Set(filas.map(f => normalizar(f['Centro'])).filter(Boolean));
  }
  // Filtra las filas que pertenecen a un Centro concreto (comparación normalizada).
  function filtrarPorCentro(filas, centroObra) {
    const centroNorm = normalizar(centroObra);
    return filas.filter(f => normalizar(f['Centro']) === centroNorm);
  }

  // ── Carga de contexto desde BD ────────────────────────────────────────────
  async function cargarReglas(sb) {
    const { data, error } = await sb.from('reglas_documentales').select('*');
    if (error) { console.error('Error cargando reglas:', error); return []; }
    return data || [];
  }

  async function cargarEmpresasPropias(sb) {
    const set = new Set();
    const { data, error } = await sb.from('empresas').select('nombre, cif, es_empresa_propia').eq('es_empresa_propia', true);
    if (error) { console.error('Error cargando empresas propias:', error); return set; }
    for (const e of (data || [])) {
      const nNombre = normalizar(e.nombre);
      const nCif = normalizar(e.cif);
      if (nNombre && nCif) set.add(`${nNombre}|${nCif}`);
      if (nNombre) set.add(`NOMBRE:${nNombre}`);
      if (nCif) set.add(`CIF:${nCif}`);
    }
    return set;
  }

  // Carga las empresas marcadas como autónomo sin asalariados. Mismo formato
  // de Set que cargarEmpresasPropias.
  async function cargarAutonomosSolos(sb) {
    const set = new Set();
    const { data, error } = await sb.from('empresas').select('nombre, cif, es_autonomo_sin_asalariados').eq('es_autonomo_sin_asalariados', true);
    if (error) { console.error('Error cargando autónomos sin asalariados:', error); return set; }
    for (const e of (data || [])) {
      const nNombre = normalizar(e.nombre);
      const nCif = normalizar(e.cif);
      if (nNombre && nCif) set.add(`${nNombre}|${nCif}`);
      if (nNombre) set.add(`NOMBRE:${nNombre}`);
      if (nCif) set.add(`CIF:${nCif}`);
    }
    return set;
  }

  async function cargarContratosVigentes(sb, obraId) {
    const set = new Set();
    if (!obraId) return set;
    const hoy = new Date().toISOString().slice(0, 10);
    const { data, error } = await sb.from('contratos_empresa')
      .select('empresa:empresa_id(nombre, cif)')
      .eq('obra_id', obraId)
      .lte('valido_desde', hoy)
      .or(`valido_hasta.is.null,valido_hasta.gte.${hoy}`);
    if (error) { console.error('Error cargando contratos:', error); return set; }
    for (const c of (data || [])) {
      const nNombre = normalizar(c.empresa?.nombre);
      const nCif = normalizar(c.empresa?.cif);
      if (nNombre && nCif) set.add(`${nNombre}|${nCif}`);
      if (nNombre) set.add(`NOMBRE:${nNombre}`);
      if (nCif) set.add(`CIF:${nCif}`);
    }
    return set;
  }

  async function cargarLibrosVigentes(sb, obraId) {
    const set = new Set();
    if (!obraId) return set;
    const hoy = new Date().toISOString().slice(0, 10);
    const { data, error } = await sb.from('libros_subcontratacion')
      .select('empresa:empresa_id(nombre, cif)')
      .eq('obra_id', obraId)
      .lte('valido_desde', hoy)
      .or(`valido_hasta.is.null,valido_hasta.gte.${hoy}`);
    if (error) { console.error('Error cargando libros de subcontratación:', error); return set; }
    for (const l of (data || [])) {
      const nNombre = normalizar(l.empresa?.nombre);
      const nCif = normalizar(l.empresa?.cif);
      if (nNombre && nCif) set.add(`${nNombre}|${nCif}`);
      if (nNombre) set.add(`NOMBRE:${nNombre}`);
      if (nCif) set.add(`CIF:${nCif}`);
    }
    return set;
  }

  async function cargarTrabajadoresApp(sb) {
    const map = {};
    const { data, error } = await sb.from('trabajadores').select('id, nombre, dni, categoria');
    if (error) { console.error('Error cargando trabajadores:', error); return map; }
    (data || []).forEach(t => { if (t.dni) map[String(t.dni).toUpperCase()] = { id: t.id, nombre: t.nombre, categoria: t.categoria }; });
    return map;
  }

  async function cargarDnisEnObra(sb, obraId) {
    const map = {};
    const { data, error } = await sb.from('validaciones_obra')
      .select('trabajador_id, estado, trabajadores(id, dni, nombre, apellidos, empresa:empresa_id(es_empresa_propia))')
      .eq('obra_id', obraId);
    if (error) { console.error('Error cargando validaciones_obra:', error); return map; }
    for (const row of (data || [])) {
      const t = row.trabajadores;
      if (!t || !t.dni) continue;
      const dni = String(t.dni).toUpperCase();
      map[dni] = {
        trabajador_id: t.id,
        nombre: [t.nombre, t.apellidos].filter(Boolean).join(' ') || t.dni,
        estado: row.estado,
        esPropia: t.empresa?.es_empresa_propia === true
      };
    }
    return map;
  }

  // ── Cálculo del resultado para UNA obra ───────────────────────────────────
  // filasObra: filas del archivo ya filtradas para esta obra.
  // ctx: { reglas, empresasPropias, autonomosSolos, contratosVigentes, librosVigentes, trabajadoresApp }
  // Devuelve: { resultadoFinal, descartadosMultiEmpresa, sinRegla }
  function calcularResultado(filasObra, ctx) {
    const reglas = ctx.reglas || [];
    const empresasPropias = ctx.empresasPropias || new Set();
    const autonomosSolos = ctx.autonomosSolos || new Set();
    const contratosVigentes = ctx.contratosVigentes || new Set();
    const librosVigentes = ctx.librosVigentes || new Set();
    const trabajadoresApp = ctx.trabajadoresApp || {};
    const sinRegla = new Set();

    // Separar filas empresa / trabajador
    const filasEmpresa = [];
    const filasTrabajador = [];
    for (const fila of filasObra) {
      const trabajadorRaw = fila['Trabajador'] || '';
      const dni = extraerDniDeTrabajador(trabajadorRaw);
      if (dni) {
        filasTrabajador.push({ ...fila, _dni: dni, _nombreTrabajador: extraerNombreTrabajador(trabajadorRaw), _empresaRaw: String(fila['Empresa'] || '').trim(), _fechaRef: fechaMasRecienteDeFila(fila) });
      } else {
        filasEmpresa.push(fila);
      }
    }

    // Fix cambio de empresa
    const descartadosMultiEmpresa = [];
    const ESTADOS_PROBLEMATICOS = new Set(['No válido', 'Sin presentar', 'Caducado', 'Pendiente']);
    const statsPorDniEmpresa = {};
    for (const fila of filasTrabajador) {
      const dni = fila._dni; const emp = fila._empresaRaw || '(sin empresa)';
      if (!statsPorDniEmpresa[dni]) statsPorDniEmpresa[dni] = {};
      if (!statsPorDniEmpresa[dni][emp]) statsPorDniEmpresa[dni][emp] = { validados: 0, problematicos: 0, fechaMax: null };
      const s = statsPorDniEmpresa[dni][emp];
      const estado = String(fila['Estado'] || '').trim();
      if (estado === 'Validado') s.validados++;
      else if (ESTADOS_PROBLEMATICOS.has(estado)) s.problematicos++;
      if (fila._fechaRef !== null && (s.fechaMax === null || fila._fechaRef > s.fechaMax)) s.fechaMax = fila._fechaRef;
    }
    const empresaGanadoraPorDni = {};
    for (const [dni, empresas] of Object.entries(statsPorDniEmpresa)) {
      const claves = Object.keys(empresas);
      if (claves.length <= 1) { empresaGanadoraPorDni[dni] = claves[0] || ''; continue; }
      claves.sort((a, b) => {
        const sa = empresas[a], sb2 = empresas[b];
        if (sa.validados !== sb2.validados) return sb2.validados - sa.validados;
        if (sa.problematicos !== sb2.problematicos) return sa.problematicos - sb2.problematicos;
        const fa = sa.fechaMax, fb = sb2.fechaMax;
        if (fa == null && fb == null) return 0;
        if (fa == null) return 1; if (fb == null) return -1;
        return fb - fa;
      });
      empresaGanadoraPorDni[dni] = claves[0];
      descartadosMultiEmpresa.push({ dni, ganadora: claves[0], descartadas: claves.slice(1) });
    }
    const filasTrabajadorFiltradas = filasTrabajador.filter(fila => {
      const ganadora = empresaGanadoraPorDni[fila._dni];
      return !ganadora || fila._empresaRaw === ganadora;
    });

    // Problemas por empresa (documentos de empresa sin regla → naranja por seguridad)
    const problemasPorEmpresa = {};
    // Empresas con una Formación de 60h validada a nivel de empresa. Sirve para
    // acreditar el 60h de los AUTÓNOMOS, cuyo curso cuelga de la empresa (= ellos).
    const empresasCon60hValidada = new Set();
    for (const fila of filasEmpresa) {
      const empresaRaw = String(fila['Empresa'] || '').trim();
      if (!empresaRaw) continue;
      const nombreDoc = fila['Documento'] || '', estado = fila['Estado'] || '';
      if (estado === 'Validado' && String(nombreDoc).startsWith('Formación 60 horas')) {
        empresasCon60hValidada.add(empresaRaw);
      }
      if (estado === 'Validado') continue;
      const regla = aplicarRegla(reglas, nombreDoc, estado, 'empresa');
      if (regla) {
        if (!problemasPorEmpresa[empresaRaw]) problemasPorEmpresa[empresaRaw] = [];
        problemasPorEmpresa[empresaRaw].push({ doc: nombreDoc, estado, resultado: regla.resultado });
      } else {
        sinRegla.add(`${nombreDoc}||${estado}`);
        if (!problemasPorEmpresa[empresaRaw]) problemasPorEmpresa[empresaRaw] = [];
        problemasPorEmpresa[empresaRaw].push({ doc: nombreDoc, estado, resultado: 'naranja' });
      }
    }

    // Agrupar por trabajador
    const porTrabajador = {};
    for (const fila of filasTrabajadorFiltradas) {
      const dni = fila._dni;
      if (!porTrabajador[dni]) {
        porTrabajador[dni] = { dni, nombre: fila._nombreTrabajador, empresa: extraerNombreEmpresa(fila['Empresa'] || ''), empresaRaw: fila._empresaRaw, docs: [] };
      }
      porTrabajador[dni].docs.push({ doc: fila['Documento'] || '', estado: fila['Estado'] || '' });
    }

    // Calcular semáforo
    const resultadoFinal = [];
    for (const [dni, info] of Object.entries(porTrabajador)) {
      let estadoFinal = 'verde';
      const motivos = [];

      // ¿Empresa propia? Si NO lo es, los documentos del RP no se le heredan.
      const empresaEsPropia = esEmpresaPropia(empresasPropias, info.empresaRaw);

      // ¿Autónomo sin asalariados? Si lo es, se le perdonan los documentos de
      // empresa de PRL que solo aplican a empresas con plantilla.
      const empresaEsAutonomoSolo = esAutonomoSinAsalariados(autonomosSolos, info.empresaRaw);

      // Subcontratas sin contrato vigente → rojo directo.
      if (!empresaEsPropia && !tieneContratoVigente(contratosVigentes, info.empresaRaw)) {
        estadoFinal = 'rojo';
        motivos.push('Sin contrato entre empresas → rojo');
      }

      // Subcontratas que no han firmado el libro de subcontratación → rojo.
      // Reactivado el 16/6/2026 tras cargar las firmas reales en la app
      // (firma registrada = fila vigente en libros_subcontratacion). Empresas
      // propias exentas. Ver ESTADO.md.
      if (!empresaEsPropia && !tieneLibroVigente(librosVigentes, info.empresaRaw)) {
        estadoFinal = 'rojo';
        motivos.push('No ha firmado el libro de subcontratación → rojo');
      }

      // Subsunción: Formación 60h validada cubre el requisito de Formación 20h.
      // Cuenta tanto si el 60h cuelga del propio trabajador como si, siendo
      // AUTÓNOMO (la empresa lleva su nombre), su 60h validado cuelga de la empresa.
      const esAutonomo = mismosNombres(info.nombre, extraerEmpresa(info.empresaRaw).nombre);
      const tiene60hValidada =
        info.docs.some(d => d.doc.startsWith('Formación 60 horas') && d.estado === 'Validado') ||
        (esAutonomo && empresasCon60hValidada.has(info.empresaRaw));

      // Categoría real del trabajador en la app (no la de e-Coordina, que
      // siempre es "peon"). Si no está en la app todavía → 'peon' por defecto.
      const categoriaApp = (trabajadoresApp[dni] && trabajadoresApp[dni].categoria) || 'peon';

      for (const { doc, estado } of info.docs) {
        if (estado === 'Validado') continue;
        if (tiene60hValidada && doc.startsWith('Formación 20 horas')) continue;
        // Documento de oficio que esta categoría no necesita → no le aplica.
        if (docNoAplicaPorOficio(doc, categoriaApp)) continue;
        const regla = aplicarRegla(reglas, doc, estado, 'trabajador');
        if (regla) {
          estadoFinal = peorEstado(estadoFinal, regla.resultado);
          motivos.push(`${doc} (${estado}) → ${regla.resultado}`);
        } else {
          sinRegla.add(`${doc}||${estado}`);
          estadoFinal = peorEstado(estadoFinal, 'naranja');
          motivos.push(`${doc} (${estado}) → naranja [sin regla definida, revisar Admin → Reglas]`);
        }
      }

      const empProblemas = problemasPorEmpresa[info.empresaRaw] || [];
      for (const p of empProblemas) {
        // No heredar documentos del Recurso Preventivo a subcontratas.
        if (!empresaEsPropia && esDocSoloRP(p.doc)) continue;
        // Autónomo sin asalariados: no exigir docs de PRL de empresa con plantilla.
        if (empresaEsAutonomoSolo && esDocSoloPlantilla(p.doc)) continue;
        estadoFinal = peorEstado(estadoFinal, p.resultado);
        motivos.push(`[Empresa] ${p.doc} (${p.estado}) → ${p.resultado}`);
      }

      const descInfo = descartadosMultiEmpresa.find(d => d.dni === dni);
      if (descInfo) {
        const nombresDesc = descInfo.descartadas.map(e => extraerNombreEmpresa(e)).join(', ');
        motivos.push(`[Cambio de empresa] Se han ignorado los documentos de: ${nombresDesc}`);
      }

      const enApp = !!trabajadoresApp[dni];
      resultadoFinal.push({
        dni,
        nombre: info.nombre,
        empresa: info.empresa,
        empresaRaw: info.empresaRaw,
        estadoCalculado: estadoFinal,
        motivos,
        enApp,
        trabajadorId: enApp ? trabajadoresApp[dni].id : null,
        nombreApp: enApp ? trabajadoresApp[dni].nombre : null
      });
    }

    const orden = { rojo: 0, naranja: 1, verde: 2 };
    resultadoFinal.sort((a, b) => orden[a.estadoCalculado] - orden[b.estadoCalculado]);

    return { resultadoFinal, descartadosMultiEmpresa, sinRegla };
  }

  // ── Aplicar (escritura en BD) ─────────────────────────────────────────────
  // resultadoFinal: salida de calcularResultado.
  // dnisABloquear: array de objetos { dni } a poner en rojo por ausencia (opcional).
  // Devuelve: { creadosLista, actualizadosLista, fallos, saltadosPorForzado, bloqueadosPorAusencia }
  async function aplicar(sb, obraId, resultadoFinal, dnisABloquear) {
    const creadosLista = [];
    const actualizadosLista = [];
    const fallos = [];
    const resultadosConId = [];

    // Paso 1: crear/actualizar trabajadores y recoger sus IDs.
    for (const r of resultadoFinal) {
      try {
        const { nombre: empNombre, cif: empCif } = extraerEmpresa(r.empresaRaw || '');
        const { data: rpcData, error: rpcErr } = await sb.rpc('crear_o_actualizar_trabajador_para_import', {
          p_nombre: r.nombre || '',
          p_apellidos: '',
          p_dni: r.dni,
          p_categoria: 'peon',
          p_empresa_nombre: empNombre || '',
          p_empresa_cif: empCif || ''
        });

        if (rpcErr || !rpcData || rpcData.ok === false) {
          fallos.push({ dni: r.dni, nombre: r.nombre, fase: 'crear/actualizar trabajador', mensaje: (rpcErr && rpcErr.message) || (rpcData && rpcData.error) || 'Error desconocido' });
          continue;
        }

        const idDevuelto = rpcData.id;
        if (!idDevuelto) {
          fallos.push({ dni: r.dni, nombre: r.nombre, fase: 'crear/actualizar trabajador', mensaje: 'La RPC no ha devuelto id' });
          continue;
        }

        if (!r.enApp) creadosLista.push({ nombre: r.nombre, dni: r.dni });
        else actualizadosLista.push({ nombre: r.nombre, dni: r.dni });

        resultadosConId.push({ ...r, trabajadorId: idDevuelto });

      } catch (err) {
        console.error('Excepción al crear/actualizar trabajador', r.dni, err);
        fallos.push({ dni: r.dni, nombre: r.nombre, fase: 'crear/actualizar trabajador', mensaje: err.message || String(err) });
      }
    }

    // Paso 2: array para la RPC.
    const p_resultados = resultadosConId.map(r => ({
      trabajador_id: r.trabajadorId,
      estado: r.estadoCalculado,
      motivos: r.motivos.length ? r.motivos : null
    }));

    // Paso 3: DNIs a bloquear (por defecto ninguno).
    const p_dnis_a_bloquear = Array.isArray(dnisABloquear) ? dnisABloquear : [];

    // Paso 4: RPC principal.
    let saltadosPorForzado = 0;
    let bloqueadosPorAusencia = 0;

    if (p_resultados.length || p_dnis_a_bloquear.length) {
      try {
        const { data: rpcResult, error: rpcErr } = await sb.rpc('aplicar_resultado_ecoordina', {
          p_obra_id: obraId,
          p_resultados: p_resultados,
          p_dnis_a_bloquear: p_dnis_a_bloquear
        });

        if (rpcErr) {
          fallos.push({ dni: '—', nombre: '—', fase: 'aplicar resultado (RPC)', mensaje: rpcErr.message || String(rpcErr) });
        } else if (rpcResult && rpcResult.ok === false) {
          fallos.push({ dni: '—', nombre: '—', fase: 'aplicar resultado (RPC)', mensaje: rpcResult.error || 'La RPC devolvió ok=false' });
        } else if (rpcResult) {
          saltadosPorForzado = rpcResult.saltados_por_forzado || 0;
          bloqueadosPorAusencia = rpcResult.bloqueados_por_ausencia || 0;
        }
      } catch (err) {
        console.error('Excepción en aplicar_resultado_ecoordina:', err);
        fallos.push({ dni: '—', nombre: '—', fase: 'aplicar resultado (RPC)', mensaje: err.message || String(err) });
      }
    }

    return { creadosLista, actualizadosLista, fallos, saltadosPorForzado, bloqueadosPorAusencia };
  }

  // ── API pública ───────────────────────────────────────────────────────────
  return {
    DOCS_SOLO_RP,
    DOCS_SOLO_PLANTILLA,
    DOCS_POR_OFICIO,
    normalizar,
    estadoSeguro,
    extraerDniDeTrabajador,
    extraerNombreTrabajador,
    extraerNombreEmpresa,
    extraerEmpresa,
    parsearFechaEcoordina,
    fechaMasRecienteDeFila,
    peorEstado,
    aplicarRegla,
    esDocSoloRP,
    esDocSoloPlantilla,
    docNoAplicaPorOficio,
    esEmpresaPropia,
    esAutonomoSinAsalariados,
    tieneContratoVigente,
    tieneLibroVigente,
    convertirWorkbookAFilas,
    parsearContenido,
    leerArchivo,
    centrosDistintos,
    filtrarPorCentro,
    cargarReglas,
    cargarEmpresasPropias,
    cargarAutonomosSolos,
    cargarContratosVigentes,
    cargarLibrosVigentes,
    cargarTrabajadoresApp,
    cargarDnisEnObra,
    calcularResultado,
    aplicar
  };
})();
