// evolucion-incidencias.js — 16/9/2026 (rev. 17/9/2026)
// Gráfico de evolución mensual para el Informe de incidencias (jefe y admin).
// Pinta, al lado del informe, una línea por tipo de documento con las
// personas frenadas cada mes. Datos: RPC `informe_rojos_evolucion`, que usa
// el mismo criterio que `informe_rojos` para que las cifras cuadren.
// Solo pantalla: no sale al imprimir (clase no-print en el contenedor).
// También aplica el tema oscuro del informe en pantalla (el PDF sigue en blanco).
(function () {
  const COLORES = ['#f44336', '#2196f3', '#ff9800', '#4caf50', '#ab47bc'];
  const COLOR_OTROS = '#8b909e';
  const MAX_LINEAS = 5;
  const MESES = ['ene', 'feb', 'mar', 'abr', 'may', 'jun', 'jul', 'ago', 'sep', 'oct', 'nov', 'dic'];

  // Fecha LOCAL (Madrid), nunca toISOString(), que pasa a UTC (regla de js/fechas.js).
  function isoLocal(f) { return f.getFullYear() + '-' + String(f.getMonth() + 1).padStart(2, '0') + '-' + String(f.getDate()).padStart(2, '0'); }

  function esc(txt) { const d = document.createElement('div'); d.textContent = String(txt == null ? '' : txt); return d.innerHTML; }

  function inyectarEstilos() {
    if (document.getElementById('evo-estilos')) return;
    const s = document.createElement('style');
    s.id = 'evo-estilos';
    s.textContent = `
      .con-grafico { display: flex; gap: 24px; align-items: flex-start; flex-wrap: wrap; }
      .con-grafico > #zona-informe { flex: 1 1 600px; max-width: 820px; min-width: 0; }
      .evo-panel { flex: 1 1 340px; min-width: 300px; position: sticky; top: 20px; background: var(--bg2); border: 1px solid var(--borde); border-radius: 10px; padding: 18px 20px; }
      .evo-panel:empty { display: none; }
      .evo-titulo { font-size: 13px; font-weight: 800; text-transform: uppercase; letter-spacing: 1px; color: var(--texto); }
      .evo-sub { font-size: 12px; color: var(--texto2); margin-top: 4px; line-height: 1.45; }
      .evo-svg { display: block; margin-top: 14px; max-width: 100%; }
      .evo-svg text { font-family: inherit; }
      .evo-leyenda { list-style: none; margin-top: 12px; display: flex; flex-direction: column; gap: 6px; }
      .evo-leyenda li { display: flex; align-items: center; gap: 8px; font-size: 12.5px; color: var(--texto); min-width: 0; }
      .evo-leyenda .pastilla { width: 14px; height: 3px; border-radius: 2px; flex: none; }
      .evo-leyenda .nombre { flex: 1; min-width: 0; overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
      .evo-leyenda .tend { flex: none; font-size: 12px; font-variant-numeric: tabular-nums; color: var(--texto2); }
      .evo-leyenda .tend.baja { color: var(--verde); }
      .evo-leyenda .tend.sube { color: var(--rojo); }
      .evo-leyenda li { cursor: default; border-radius: 6px; padding: 2px 6px; margin: 0 -6px; transition: background 0.12s, opacity 0.12s; }
      .evo-leyenda li:hover, .evo-leyenda li.activa { background: var(--bg3); }
      .evo-leyenda.resaltando li:not(.activa) { opacity: 0.45; }
      .evo-svg .serie { transition: opacity 0.12s; }
      .evo-svg.resaltando .serie:not(.activa) { opacity: 0.12; }
      .evo-svg .hit { fill: transparent; cursor: pointer; }
      .evo-nota { font-size: 11.5px; color: var(--texto2); margin-top: 12px; line-height: 1.45; }
      .evo-vacio { font-size: 13px; color: var(--texto2); margin-top: 12px; line-height: 1.5; }
      @media print { .evo-panel { display: none !important; } }

      /* Tema oscuro del informe EN PANTALLA, a juego con el resto de la web.
         Al imprimir / PDF se mantiene la hoja blanca original (solo @media screen). */
      @media screen {
        .informe { background: var(--bg2); color: var(--texto); border: 1px solid var(--borde); }
        .inf-cabecera { border-bottom-color: var(--borde); }
        .inf-titulo, .inf-meta { color: var(--texto2); }
        .inf-obra { color: var(--texto); }
        .inf-titular { background: var(--bg3); }
        .inf-titular .frase, .inf-titular .dos .rot { color: var(--texto); }
        .inf-titular .dos .nota { color: var(--texto2); }
        .inf-aviso-rojo { background: rgba(244,67,54,0.12); color: #f3b3ad; }
        .inf-aviso-rojo strong { color: #ffd0cb; }
        .des-limite { background: var(--bg3); color: var(--texto2); }
        .des-limite strong { color: var(--texto); }
        .des-fila { border-bottom-color: var(--borde); }
        .des-num, .des-tit { color: var(--texto); }
        .des-exp, .des-causas { color: var(--texto2); }
        .des-causas .doc, .des-causas .n { color: var(--texto); }
        .cat-corte td { background: var(--bg3); color: var(--texto2); }
        .inf-seccion h2 { color: var(--texto); border-bottom-color: var(--borde); }
        .inf-seccion .subtitulo { color: var(--texto2); }
        table.inf-tabla th { color: var(--texto2); border-bottom-color: var(--borde); }
        table.inf-tabla td { color: var(--texto); border-bottom-color: var(--borde); }
        table.inf-tabla tr.fila-suave td { color: var(--texto2); }
        .inf-genericos { background: var(--bg3); border-color: var(--borde); color: var(--texto2); }
        .inf-genericos strong { color: var(--texto); }
        .inf-pie { border-top-color: var(--borde); color: var(--texto2); }
        .inf-vacio { color: var(--texto2); }
      }
    `;
    document.head.appendChild(s);
  }

  // Todos los meses entre el primero y el último, aunque alguno no tenga datos.
  function rangoMeses(primero, ultimo) {
    const out = [];
    let [a, m] = primero.split('-').map(Number);
    const [a2, m2] = ultimo.split('-').map(Number);
    while (a < a2 || (a === a2 && m <= m2)) {
      out.push(`${a}-${String(m).padStart(2, '0')}`);
      m++; if (m > 12) { m = 1; a++; }
    }
    return out;
  }

  function etiquetaMes(clave, conAnio) {
    const [a, m] = clave.split('-');
    return MESES[Number(m) - 1] + (conAnio ? ` ${a.slice(2)}` : '');
  }

  function prepararSeries(filas) {
    const mesesConDatos = [...new Set(filas.map(f => f.mes))].sort();
    const meses = rangoMeses(mesesConDatos[0], mesesConDatos[mesesConDatos.length - 1]);
    const totales = {};
    filas.forEach(f => { totales[f.doc] = (totales[f.doc] || 0) + f.personas; });
    const ordenados = Object.keys(totales).sort((x, y) => totales[y] - totales[x] || x.localeCompare(y));
    const principales = ordenados.slice(0, MAX_LINEAS);
    const resto = ordenados.slice(MAX_LINEAS);
    const series = principales.map((doc, i) => ({ nombre: doc, color: COLORES[i], valores: meses.map(() => 0) }));
    const otros = resto.length ? { nombre: `Otros (${resto.length})`, color: COLOR_OTROS, valores: meses.map(() => 0), detalle: resto } : null;
    filas.forEach(f => {
      const idx = meses.indexOf(f.mes);
      const s = series.find(x => x.nombre === f.doc);
      if (s) s.valores[idx] += f.personas; else if (otros) otros.valores[idx] += f.personas;
    });
    if (otros) series.push(otros);
    return { meses, series };
  }

  function svgGrafico(meses, series, mesEnCurso, anchoPx) {
    const W = Math.max(280, Math.round(anchoPx || 460)), H = 260, izq = 30, der = 22, arr = 12, abj = 28;
    const ancho = W - izq - der, alto = H - arr - abj;
    const maxV = Math.max(1, ...series.flatMap(s => s.valores));
    const paso = maxV <= 5 ? 1 : maxV <= 10 ? 2 : maxV <= 25 ? 5 : 10;
    const techo = Math.ceil(maxV / paso) * paso;
    const x = i => izq + (meses.length === 1 ? ancho / 2 : (i * ancho) / (meses.length - 1));
    const y = v => arr + alto - (v / techo) * alto;
    const variosAnios = new Set(meses.map(m => m.slice(0, 4))).size > 1;
    const idxCurso = meses.indexOf(mesEnCurso);

    let g = '';
    for (let v = 0; v <= techo; v += paso) {
      g += `<line x1="${izq}" x2="${W - der}" y1="${y(v)}" y2="${y(v)}" stroke="var(--borde)" stroke-width="1"/>`;
      g += `<text x="${izq - 6}" y="${y(v) + 4}" text-anchor="end" font-size="10" fill="var(--texto2)">${v}</text>`;
    }
    meses.forEach((m, i) => {
      const enCurso = i === idxCurso;
      g += `<text x="${x(i)}" y="${H - 8}" text-anchor="middle" font-size="11" fill="var(--texto2)"${enCurso ? ' font-style="italic"' : ''}>${etiquetaMes(m, variosAnios)}${enCurso ? '*' : ''}</text>`;
    });

    // Se pintan de la menos a la más importante, para que la principal quede encima.
    [...series].map((s, idx) => ({ s, idx })).reverse().forEach(({ s, idx }) => {
      const pts = s.valores.map((v, i) => [x(i), y(v)]);
      g += `<g class="serie" data-serie="${idx}">`;
      const hastaCerrado = idxCurso >= 0 ? pts.slice(0, idxCurso) : pts;
      if (hastaCerrado.length > 1) g += `<polyline points="${hastaCerrado.map(p => p.join(',')).join(' ')}" fill="none" stroke="${s.color}" stroke-width="2.5" stroke-linejoin="round" stroke-linecap="round"/>`;
      if (idxCurso > 0) g += `<line x1="${pts[idxCurso - 1][0]}" y1="${pts[idxCurso - 1][1]}" x2="${pts[idxCurso][0]}" y2="${pts[idxCurso][1]}" stroke="${s.color}" stroke-width="2.5" stroke-dasharray="4 4" stroke-linecap="round"/>`;
      s.valores.forEach((v, i) => {
        g += `<circle cx="${pts[i][0]}" cy="${pts[i][1]}" r="3.5" fill="${s.color}" stroke="var(--bg2)" stroke-width="1.5"/>`;
        // Zona de ratón más grande que el punto, para que el aviso salga fácil.
        g += `<circle class="hit" cx="${pts[i][0]}" cy="${pts[i][1]}" r="9"><title>${esc(s.nombre)} — ${etiquetaMes(meses[i], true)}: ${v} ${v === 1 ? 'persona' : 'personas'}</title></circle>`;
      });
      g += '</g>';
    });

    return `<svg class="evo-svg" width="${W}" height="${H}" viewBox="0 0 ${W} ${H}" role="img" aria-label="Evolución mensual de personas frenadas por tipo de documento">${g}</svg>`;
  }

  function leyendaHTML(series, idxRef) {
    return `<ul class="evo-leyenda">${series.map((s, idx) => {
      const primero = s.valores[0], ultimo = s.valores[idxRef];
      const clase = ultimo < primero ? 'baja' : ultimo > primero ? 'sube' : '';
      const flecha = ultimo < primero ? '↓' : ultimo > primero ? '↑' : '=';
      const tooltip = s.detalle ? s.detalle.join(' · ') : s.nombre;
      return `<li data-serie="${idx}" title="${esc(tooltip)}"><span class="pastilla" style="background:${s.color}"></span><span class="nombre">${esc(s.nombre)}</span><span class="tend ${clase}">${primero} → ${ultimo} ${flecha}</span></li>`;
    }).join('')}</ul>`;
  }

  let peticion = 0;       // evita que una respuesta lenta pise a una más nueva
  let observador = null;  // redibuja al cambiar el ancho del panel

  function dibujar(contenedor, estado) {
    const { meses, series, mesEnCurso, idxRef, notas } = estado;
    const anchoPx = contenedor.clientWidth - 40; // descuenta el padding del panel
    contenedor.innerHTML = `
      <div class="evo-titulo">Evolución mensual</div>
      <div class="evo-sub">Personas frenadas por documento que faltaba</div>
      ${svgGrafico(meses, series, mesEnCurso, anchoPx)}
      ${leyendaHTML(series, idxRef)}
      <div class="evo-nota">${notas.map(esc).join('<br>')}</div>`;
    contenedor._evoAncho = contenedor.clientWidth;

    // Resaltar una línea al pasar el ratón por la leyenda o por la propia línea.
    const svg = contenedor.querySelector('.evo-svg');
    const ley = contenedor.querySelector('.evo-leyenda');
    const resaltar = idx => {
      const on = idx != null;
      svg.classList.toggle('resaltando', on);
      ley.classList.toggle('resaltando', on);
      svg.querySelectorAll('.serie').forEach(el => el.classList.toggle('activa', el.dataset.serie === String(idx)));
      ley.querySelectorAll('li').forEach(el => el.classList.toggle('activa', el.dataset.serie === String(idx)));
    };
    ley.querySelectorAll('li').forEach(li => {
      li.addEventListener('mouseenter', () => resaltar(li.dataset.serie));
      li.addEventListener('mouseleave', () => resaltar(null));
    });
    svg.querySelectorAll('.serie').forEach(el => {
      el.addEventListener('mouseenter', () => resaltar(el.dataset.serie));
      el.addEventListener('mouseleave', () => resaltar(null));
    });
  }

  function vigilarAncho(contenedor) {
    if (observador || !window.ResizeObserver) return;
    let espera = null;
    observador = new ResizeObserver(() => {
      clearTimeout(espera);
      espera = setTimeout(() => {
        const estado = contenedor._evoEstado;
        if (estado && Math.abs(contenedor.clientWidth - (contenedor._evoAncho || 0)) > 4) dibujar(contenedor, estado);
      }, 120);
    });
    observador.observe(contenedor);
  }

  function mensaje(contenedor, texto) {
    contenedor._evoEstado = null;
    contenedor.innerHTML = `<div class="evo-titulo">Evolución mensual</div><div class="evo-vacio">${esc(texto)}</div>`;
  }

  async function pintar(sb, contenedor, { obraId, desde, hasta }) {
    inyectarEstilos();
    vigilarAncho(contenedor);
    const mia = ++peticion;
    mensaje(contenedor, 'Cargando…');
    const marca = contenedor.querySelector('.evo-vacio');
    if (marca) marca.dataset.peticion = String(mia);
    const { data, error } = await sb.rpc('informe_rojos_evolucion', { p_obra_id: obraId || null, p_desde: desde || null, p_hasta: hasta || null });
    // Llegó tarde: ya se pidió otro periodo, o la página vació el panel entretanto
    // (p. ej. fechas invertidas). En ambos casos no se pinta nada.
    if (mia !== peticion || !contenedor.querySelector(`[data-peticion="${mia}"]`)) return;
    if (error) { mensaje(contenedor, `No se pudo cargar: ${error.message}`); return; }
    const filas = Array.isArray(data) ? data : [];
    if (!filas.length) { contenedor._evoEstado = null; contenedor.innerHTML = ''; return; }

    const { meses, series } = prepararSeries(filas);
    const hoy = isoLocal(new Date());
    const mesActual = hoy.slice(0, 7);
    const mesEnCurso = (!hasta || hasta >= hoy) && meses[meses.length - 1] === mesActual ? mesActual : null;

    if (meses.length < 2) {
      mensaje(contenedor, 'El periodo elegido cubre un solo mes. Elige un rango más amplio (por ejemplo «Desde el inicio») para ver cómo evolucionan las incidencias.');
      return;
    }

    // La tendencia de la leyenda compara el primer mes con el último mes CERRADO,
    // para que la caída de un mes a medias no parezca una mejora.
    const idxRef = mesEnCurso && meses.length > 2 ? meses.length - 2 : meses.length - 1;
    const notas = ['Personas distintas frenadas cada mes. Una persona con dos documentos pendientes cuenta en las dos líneas.'];
    if (mesEnCurso) notas.push(`* ${etiquetaMes(mesEnCurso, false)} está en curso (tramo discontinuo)${idxRef < meses.length - 1 ? '; la tendencia compara hasta el último mes cerrado' : ''}.`);
    if (series.some(s => s.detalle)) notas.push('«Otros» suma el resto de documentos; pasa el ratón para ver cuáles.');
    notas.push('Pasa el ratón por una línea o por la leyenda para resaltarla.');

    contenedor._evoEstado = { meses, series, mesEnCurso, idxRef, notas };
    dibujar(contenedor, contenedor._evoEstado);
  }

  // Estilos desde la carga, para que el informe no parpadee en blanco antes de pintarse.
  inyectarEstilos();

  window.EvolucionIncidencias = { pintar };
})();
