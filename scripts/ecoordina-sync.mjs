// ============================================================================
//  HITO 2  ·  Parsear el CSV y volcar estados a Supabase
//  ----------------------------------------------------------------------------
//  Lee output/ecoordina.csv (que dejó el Hito 1) y, autenticado como admin,
//  recorre TODAS las obras activas aplicando exactamente la misma lógica que
//  tu importador web (jefe/documentos-ecoordina.html):
//    - filtra filas por el "Centro" de e-Coordina de cada obra
//    - ranking multi-empresa por DNI
//    - subsunción Formación 60h -> 20h
//    - reglas de reglas_documentales (con comodín '*')
//    - no hereda docs de Recurso Preventivo a subcontratas
//    - subcontrata sin contrato vigente -> rojo
//    - escribe vía las RPCs crear_o_actualizar_trabajador_para_import
//      y aplicar_resultado_ecoordina
//
//  POLÍTICA DECIDIDA: nunca bloquea a los ausentes (p_dnis_a_bloquear = []).
//  Solo actualiza estados.
//
//  Secrets necesarios:  SUPABASE_EMAIL  /  SUPABASE_PASSWORD  (usuario admin)
// ============================================================================

import { createClient } from '@supabase/supabase-js';
import * as XLSX from 'xlsx';
import fs from 'fs';
import path from 'path';

// ── Config (la URL y la anon key son públicas, igual que en la web) ───────────
const SUPABASE_URL = 'https://istrnsicleopzbsrapsw.supabase.co';
const SUPABASE_ANON_KEY = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6ImlzdHJuc2ljbGVvcHpic3JhcHN3Iiwicm9sZSI6ImFub24iLCJpYXQiOjE3NzU4MTIxMTYsImV4cCI6MjA5MTM4ODExNn0.5UXV2LWPXmbfLI7rKpZSG9YBzZsesjckHnhQabA0mTY';

const CSV_PATH = path.resolve('output', 'ecoordina.csv');

const EMAIL = process.env.SUPABASE_EMAIL;
const PASSWORD = process.env.SUPABASE_PASSWORD;

const DOCS_SOLO_RP = [
  'Nombramiento del Recurso Preventivo',
  'Formación 60 horas (Nivel básico) del Recurso preventivo'
];

function log(...a) { console.log(new Date().toISOString(), ...a); }

// ── Helpers portados literalmente del importador web ──────────────────────────
function normalizar(s) {
  return String(s || '')
    .normalize('NFD').replace(/[\u0300-\u036f]/g, '')
    .toUpperCase()
    .replace(/\s+/g, ' ')
    .trim();
}
function extraerEmpresa(texto) {
  if (!texto) return { nombre: '', cif: '' };
  const partes = texto.split(' - ');
  if (partes.length >= 2) return { nombre: partes.slice(0, partes.length - 1).join(' - ').trim(), cif: partes[partes.length - 1].trim() };
  return { nombre: texto.trim(), cif: '' };
}
// Palabras de un nombre, normalizadas y ordenadas, para comparar sin importar
// el orden ni las comas (apellidos, nombre / nombre apellidos).
function tokensNombre(s) {
  return normalizar(String(s || '').replace(/,/g, ' '))
    .split(' ')
    .filter(Boolean)
    .sort();
}
// ¿El nombre de la empresa coincide con el del trabajador? Firma típica de AUTÓNOMO.
function mismosNombres(a, b) {
  const ta = tokensNombre(a), tb = tokensNombre(b);
  if (ta.length === 0 || tb.length === 0 || ta.length !== tb.length) return false;
  return ta.every((t, i) => t === tb[i]);
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
function peorEstado(a, b) {
  const orden = { rojo: 3, naranja: 2, verde: 1 };
  return (orden[a] || 0) >= (orden[b] || 0) ? a : b;
}

// ── Estado global cargado de Supabase ─────────────────────────────────────────
let reglas = [];
let empresasPropias = new Set();
let contratosVigentes = new Set();
let librosVigentes = new Set();

function aplicarRegla(nombreDoc, estadoEcoordina, tipoAplica) {
  let regla = reglas.find(r => r.aplica_a === tipoAplica && r.nombre_documento === nombreDoc && r.estado_ecoordina === estadoEcoordina);
  if (!regla) regla = reglas.find(r => r.aplica_a === tipoAplica && r.nombre_documento === '*' && r.estado_ecoordina === estadoEcoordina);
  return regla || null;
}
function esEmpresaPropia(empresaRaw) {
  if (!empresaRaw) return false;
  const { nombre, cif } = extraerEmpresa(empresaRaw);
  const nNombre = normalizar(nombre);
  const nCif = normalizar(cif);
  if (nNombre && nCif && empresasPropias.has(`${nNombre}|${nCif}`)) return true;
  if (nNombre && empresasPropias.has(`NOMBRE:${nNombre}`)) return true;
  if (nCif && empresasPropias.has(`CIF:${nCif}`)) return true;
  return false;
}
function tieneContratoVigente(empresaRaw) {
  if (!empresaRaw) return false;
  const { nombre, cif } = extraerEmpresa(empresaRaw);
  const nNombre = normalizar(nombre);
  const nCif = normalizar(cif);
  if (nNombre && nCif && contratosVigentes.has(`${nNombre}|${nCif}`)) return true;
  if (nNombre && contratosVigentes.has(`NOMBRE:${nNombre}`)) return true;
  if (nCif && contratosVigentes.has(`CIF:${nCif}`)) return true;
  return false;
}
function tieneLibroVigente(empresaRaw) {
  if (!empresaRaw) return false;
  const { nombre, cif } = extraerEmpresa(empresaRaw);
  const nNombre = normalizar(nombre);
  const nCif = normalizar(cif);
  if (nNombre && nCif && librosVigentes.has(`${nNombre}|${nCif}`)) return true;
  if (nNombre && librosVigentes.has(`NOMBRE:${nNombre}`)) return true;
  if (nCif && librosVigentes.has(`CIF:${nCif}`)) return true;
  return false;
}

// ── Parseo del CSV (mismo enfoque que la web: SheetJS, FS=';', ISO-8859-1) ─────
function leerCsvComoFilas(csvPath) {
  const raw = fs.readFileSync(csvPath, 'latin1'); // ISO-8859-1
  const wb = XLSX.read(raw, { type: 'string', raw: false, FS: ';' });
  const ws = wb.Sheets[wb.SheetNames[0]];
  if (!ws) throw new Error('El CSV no contiene ninguna hoja legible.');
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

// ── Cálculo de semáforos para una obra (port de procesarExcel, sin UI) ─────────
function calcularResultadoObra(filasObra, trabajadoresApp) {
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

  // Fix cambio de empresa (ranking multi-empresa por DNI)
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

  // Problemas por empresa
  const problemasPorEmpresa = {};
  // Empresas con Formación de 60h validada a nivel de empresa (para autónomos).
  const empresasCon60hValidada = new Set();
  for (const fila of filasEmpresa) {
    const empresaRaw = String(fila['Empresa'] || '').trim();
    if (!empresaRaw) continue;
    const nombreDoc = fila['Documento'] || '', estado = fila['Estado'] || '';
    if (estado === 'Validado' && String(nombreDoc).startsWith('Formación 60 horas')) {
      empresasCon60hValidada.add(empresaRaw);
    }
    if (estado === 'Validado') continue;
    const regla = aplicarRegla(nombreDoc, estado, 'empresa');
    if (regla) {
      if (!problemasPorEmpresa[empresaRaw]) problemasPorEmpresa[empresaRaw] = [];
      problemasPorEmpresa[empresaRaw].push({ doc: nombreDoc, estado, resultado: regla.resultado });
    } else {
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

    const empresaEsPropia = esEmpresaPropia(info.empresaRaw);

    if (!empresaEsPropia && !tieneContratoVigente(info.empresaRaw)) {
      estadoFinal = 'rojo';
      motivos.push('Sin contrato entre empresas → rojo');
    }

    // TEMPORAL (16/6/2026): sin libro → AVISO (naranja), no bloqueo. El control de
    // libro se rebajó de rojo a naranja mientras se cargan los libros en la app
    // (P-14 se activó sin datos y bloqueó la obra entera). Para reactivar el bloqueo,
    // volver a poner estadoFinal = 'rojo' y el texto '→ rojo'. Ver ESTADO.md.
    if (!empresaEsPropia && !tieneLibroVigente(info.empresaRaw)) {
      estadoFinal = peorEstado(estadoFinal, 'naranja');
      motivos.push('Sin libro de subcontratación → naranja (pendiente de cargar el libro)');
    }

    // Subsunción: Formación 60h validada cubre el requisito de Formación 20h.
    // Cuenta también si, siendo AUTÓNOMO, su 60h validado cuelga de la empresa.
    const esAutonomo = mismosNombres(info.nombre, extraerEmpresa(info.empresaRaw).nombre);
    const tiene60hValidada =
      info.docs.some(d => d.doc.startsWith('Formación 60 horas') && d.estado === 'Validado') ||
      (esAutonomo && empresasCon60hValidada.has(info.empresaRaw));

    for (const { doc, estado } of info.docs) {
      if (estado === 'Validado') continue;
      if (tiene60hValidada && doc.startsWith('Formación 20 horas')) continue;
      const regla = aplicarRegla(doc, estado, 'trabajador');
      if (regla) {
        estadoFinal = peorEstado(estadoFinal, regla.resultado);
        motivos.push(`${doc} (${estado}) → ${regla.resultado}`);
      } else {
        estadoFinal = peorEstado(estadoFinal, 'naranja');
        motivos.push(`${doc} (${estado}) → naranja [sin regla definida, revisar Admin → Reglas]`);
      }
    }

    const empProblemas = problemasPorEmpresa[info.empresaRaw] || [];
    for (const p of empProblemas) {
      if (!empresaEsPropia && esDocSoloRP(p.doc)) continue;
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
      enApp
    });
  }

  return resultadoFinal;
}

// ── Escritura en Supabase (port de confirmarImportacion, sin bloqueos) ─────────
async function volcarObra(sb, obraId, resultadoFinal) {
  const resultadosConId = [];
  let fallosCrear = 0;

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
      if (rpcErr || !rpcData || rpcData.ok === false || !rpcData.id) {
        fallosCrear++;
        log('   ⚠ fallo crear/actualizar', r.dni, (rpcErr && rpcErr.message) || (rpcData && rpcData.error) || '');
        continue;
      }
      resultadosConId.push({ ...r, trabajadorId: rpcData.id });
    } catch (err) {
      fallosCrear++;
      log('   ⚠ excepción crear/actualizar', r.dni, err.message || String(err));
    }
  }

  const p_resultados = resultadosConId.map(r => ({
    trabajador_id: r.trabajadorId,
    estado: r.estadoCalculado,
    motivos: r.motivos.length ? r.motivos : null
  }));

  // POLÍTICA: nunca bloquear ausentes.
  const p_dnis_a_bloquear = [];

  let mainOk = true;
  if (p_resultados.length) {
    const { data: rpcResult, error: rpcErr } = await sb.rpc('aplicar_resultado_ecoordina', {
      p_obra_id: obraId,
      p_resultados,
      p_dnis_a_bloquear
    });
    if (rpcErr || (rpcResult && rpcResult.ok === false)) {
      mainOk = false;
      log('   ❌ aplicar_resultado_ecoordina', (rpcErr && rpcErr.message) || (rpcResult && rpcResult.error) || '');
    }
  }

  return { aplicados: p_resultados.length, fallosCrear, mainOk };
}

// ── MAIN ──────────────────────────────────────────────────────────────────────
async function main() {
  if (!EMAIL || !PASSWORD) { console.error('ERROR: faltan los secrets SUPABASE_EMAIL / SUPABASE_PASSWORD'); process.exit(1); }
  if (!fs.existsSync(CSV_PATH)) { console.error('ERROR: no existe ' + CSV_PATH + ' (¿corrió antes la descarga?)'); process.exit(1); }

  const sb = createClient(SUPABASE_URL, SUPABASE_ANON_KEY, { auth: { persistSession: false } });

  log('Autenticando en Supabase como', EMAIL);
  const { error: authErr } = await sb.auth.signInWithPassword({ email: EMAIL, password: PASSWORD });
  if (authErr) { console.error('ERROR de login en Supabase:', authErr.message); process.exit(1); }

  // Cargar reglas y empresas propias (global)
  {
    const { data, error } = await sb.from('reglas_documentales').select('*');
    if (error) { console.error('ERROR cargando reglas_documentales:', error.message); process.exit(1); }
    reglas = data || [];
  }
  {
    const { data, error } = await sb.from('empresas').select('nombre, cif, es_empresa_propia').eq('es_empresa_propia', true);
    if (error) { console.error('ERROR cargando empresas:', error.message); process.exit(1); }
    empresasPropias = new Set();
    for (const e of (data || [])) {
      const nNombre = normalizar(e.nombre), nCif = normalizar(e.cif);
      if (nNombre && nCif) empresasPropias.add(`${nNombre}|${nCif}`);
      if (nNombre) empresasPropias.add(`NOMBRE:${nNombre}`);
      if (nCif) empresasPropias.add(`CIF:${nCif}`);
    }
  }
  log(`Reglas: ${reglas.length} · Empresas propias: ${empresasPropias.size}`);

  // Trabajadores de la app (para marca enApp; no se crean los desconocidos aquí)
  const trabajadoresApp = {};
  {
    const { data, error } = await sb.from('trabajadores').select('id, nombre, dni');
    if (error) { console.error('ERROR cargando trabajadores:', error.message); process.exit(1); }
    (data || []).forEach(t => { if (t.dni) trabajadoresApp[String(t.dni).toUpperCase()] = { id: t.id, nombre: t.nombre }; });
  }

  // Obras activas
  const { data: obras, error: obrasErr } = await sb.from('obras')
    .select('id, nombre, ecoordina_centro').eq('activa', true).order('nombre');
  if (obrasErr) { console.error('ERROR cargando obras:', obrasErr.message); process.exit(1); }
  log(`Obras activas: ${(obras || []).length}`);

  // Leer y parsear el CSV una sola vez
  const filas = leerCsvComoFilas(CSV_PATH);
  log(`CSV: ${filas.length} filas de datos`);
  const centrosEnArchivo = new Set(filas.map(f => normalizar(f['Centro'])).filter(Boolean));

  let huboFalloGrave = false;
  const resumen = [];

  for (const obra of (obras || [])) {
    const centroObra = (obra.ecoordina_centro || '').trim();

    let filasObra;
    if (centrosEnArchivo.size === 0) {
      filasObra = filas; // CSV sin columna Centro (formato antiguo)
    } else if (!centroObra) {
      log(`— ${obra.nombre}: SALTADA (no tiene ecoordina_centro configurado)`);
      resumen.push({ obra: obra.nombre, estado: 'saltada (sin centro)' });
      continue;
    } else {
      const centroNorm = normalizar(centroObra);
      filasObra = filas.filter(f => normalizar(f['Centro']) === centroNorm);
      if (!filasObra.length) {
        log(`— ${obra.nombre}: 0 filas para el centro "${centroObra}"`);
        resumen.push({ obra: obra.nombre, estado: '0 filas' });
        continue;
      }
    }

    // Contratos vigentes de esta obra
    contratosVigentes = new Set();
    const hoy = new Date().toISOString().slice(0, 10);
    const { data: contratos, error: cErr } = await sb.from('contratos_empresa')
      .select('empresa:empresa_id(nombre, cif)')
      .eq('obra_id', obra.id)
      .lte('valido_desde', hoy)
      .or(`valido_hasta.is.null,valido_hasta.gte.${hoy}`);
    if (cErr) { log(`   ⚠ error cargando contratos de ${obra.nombre}:`, cErr.message); }
    for (const c of (contratos || [])) {
      const nNombre = normalizar(c.empresa?.nombre), nCif = normalizar(c.empresa?.cif);
      if (nNombre && nCif) contratosVigentes.add(`${nNombre}|${nCif}`);
      if (nNombre) contratosVigentes.add(`NOMBRE:${nNombre}`);
      if (nCif) contratosVigentes.add(`CIF:${nCif}`);
    }

    // Libros de subcontratación vigentes de esta obra (P-14)
    librosVigentes = new Set();
    const { data: libros, error: lErr } = await sb.from('libros_subcontratacion')
      .select('empresa:empresa_id(nombre, cif)')
      .eq('obra_id', obra.id)
      .lte('valido_desde', hoy)
      .or(`valido_hasta.is.null,valido_hasta.gte.${hoy}`);
    if (lErr) { log(`   ⚠ error cargando libros de subcontratación de ${obra.nombre}:`, lErr.message); }
    for (const l of (libros || [])) {
      const nNombre = normalizar(l.empresa?.nombre), nCif = normalizar(l.empresa?.cif);
      if (nNombre && nCif) librosVigentes.add(`${nNombre}|${nCif}`);
      if (nNombre) librosVigentes.add(`NOMBRE:${nNombre}`);
      if (nCif) librosVigentes.add(`CIF:${nCif}`);
    }

    const resultado = calcularResultadoObra(filasObra, trabajadoresApp);
    const cuenta = { verde: 0, naranja: 0, rojo: 0 };
    resultado.forEach(r => { cuenta[r.estadoCalculado] = (cuenta[r.estadoCalculado] || 0) + 1; });

    log(`▶ ${obra.nombre}: ${filasObra.length} filas → ${resultado.length} trabajadores (🟢${cuenta.verde} 🟠${cuenta.naranja} 🔴${cuenta.rojo})`);

    const res = await volcarObra(sb, obra.id, resultado);
    if (!res.mainOk) huboFalloGrave = true;
    log(`   guardado: ${res.aplicados} aplicados · ${res.fallosCrear} fallos al crear · RPC principal ${res.mainOk ? 'OK' : 'ERROR'}`);

    // Marcar la obra como sincronizada hoy (solo si se aplicó bien)
    if (res.mainOk && res.aplicados > 0) {
      const { error: updErr } = await sb.from('obras')
        .update({ ultima_sync_ecoordina: new Date().toISOString() })
        .eq('id', obra.id);
      if (updErr) log(`   ⚠ no se pudo marcar ultima_sync_ecoordina en ${obra.nombre}:`, updErr.message);
    }

    resumen.push({ obra: obra.nombre, trabajadores: resultado.length, ...cuenta, aplicados: res.aplicados, fallosCrear: res.fallosCrear, rpc: res.mainOk ? 'OK' : 'ERROR' });
  }

  log('================ RESUMEN ================');
  for (const r of resumen) log(JSON.stringify(r));

  // Registro global para el panel admin
  const obrasOk = resumen.filter(r => r.rpc === 'OK' && r.aplicados > 0).length;
  const obrasError = resumen.filter(r => r.rpc === 'ERROR').length;
  const estadoGlobal = obrasError > 0 ? 'error' : 'ok';
  {
    const { error: logErr } = await sb.from('ecoordina_sync').insert({
      estado: estadoGlobal,
      obras_ok: obrasOk,
      obras_error: obrasError,
      detalle: resumen
    });
    if (logErr) log('⚠ no se pudo guardar el registro en ecoordina_sync:', logErr.message);
    else log(`Registro global guardado (${estadoGlobal}, ${obrasOk} obras OK, ${obrasError} con error)`);
  }

  log('HITO 2 COMPLETADO' + (huboFalloGrave ? ' CON ERRORES ⚠' : ' ✅'));

  if (huboFalloGrave) process.exit(1);
}

main().catch(err => { console.error('ERROR no controlado:', err); process.exit(1); });
