/* ============================================================
   js/habilitaciones.js — Estado, umbral e iconos de habilitaciones
   ------------------------------------------------------------
   Motivo (auditoría habilitaciones, fase 0):

   1) El umbral de "caduca pronto" estaba escrito en CUATRO sitios
      distintos, los cuatro a 30 días y ninguno documentado. Ahora
      son DOS y ambos escritos: aquí (navegador) y dentro de la RPC
      get_habilitaciones_trabajador (servidor, para el aviso). Si
      cambia uno, hay que cambiar el otro. No hay forma de tenerlo
      en uno solo: son dos máquinas distintas.

   2) El diccionario de iconos estaba COPIADO en ocho archivos, y
      dos de ellos habían divergido ('arnes' vs 'altura con arnes').
      No llegó a dar la cara porque los tipos reales van con tilde,
      pero era una trampa armada. Aquí manda la versión permisiva.

   3) Ninguna pantalla distinguía "no caduca a propósito" de "nadie
      puso la fecha". Las dos salían en gris y parecían lo mismo.
      Ahora son dos estados distintos: no_caduca y falta_fecha.

   Dependencia: js/fechas.js (para la fecha de Madrid). Cargar SIEMPRE
   fechas.js ANTES que este archivo:
     <script src="../js/fechas.js"></script>
     <script src="../js/habilitaciones.js"></script>

   API pública (window.Hab):
     Hab.UMBRAL_DIAS          → 60
     Hab.estado(hab)          → 'no_caduca' | 'falta_fecha' |
                                'caducada' | 'proxima' | 'vigente'
     Hab.etiqueta(estado)     → texto para el badge
     Hab.clase(estado)        → clase CSS del badge
     Hab.icono(tipoNombre)    → emoji (solo texto plano: <option>, title="")
     Hab.iconoSvg(tipoNombre, px) → <svg> en línea (para HTML normal)
     Hab.diasRestantes(fecha) → nº de días hasta caducar (negativo si pasó)
     Hab.textoCaducidad(hab)  → línea de texto bajo el nombre

   'hab' es una fila con { fecha_caducidad, sin_caducidad }, tal cual
   viene de la tabla o de la RPC.
   ============================================================ */
(function () {
  'use strict';

  // ── El umbral. Un solo número, un solo sitio (en el navegador).
  //    Gemelo obligado: get_habilitaciones_trabajador, en la BD.
  const UMBRAL_DIAS = 60;

  // ── Diccionario de RESERVA ─────────────────────────────────────
  // Provisional: en la fase 1 el icono pasa a ser una columna de
  // tipos_habilitacion y esto se queda solo como respaldo para los
  // tipos que aún no lo tengan puesto.
  //
  // Las claves van SIN TILDES a propósito: la comparación quita los
  // acentos antes de buscar. Antes había que escribir cada clave dos
  // veces ('electrico' y 'eléctrico') y se olvidaba. Ya no.
  //
  // OJO: hoy los 7 tipos INACTIVOS (retroexcavadora, pala cargadora,
  // bulldozer, motoniveladora, miniexcavadora, compactadora, grúa
  // autopropulsada) no casan con ninguna clave y saldrían con el
  // icono genérico. Se arregla en la fase 1 con la columna, no aquí:
  // escribirlos ahora obligaría a escribirlos otra vez después.
  const ICONOS = [
    { clave: 'movimiento de tierras', icono: '🚜' },
    { clave: 'dumper',                icono: '🚛' },
    { clave: 'grua torre',            icono: '🏗️' },
    { clave: 'plataforma elevadora',  icono: '🛗' },
    { clave: 'carretilla elevadora',  icono: '🛺' },
    { clave: 'toro',                  icono: '🛺' },
    { clave: 'andamio',               icono: '🪜' },
    { clave: 'altura con arnes',      icono: '🧗' },
    { clave: 'arnes',                 icono: '🧗' },
    { clave: 'electric',              icono: '⚡' }
  ];

  const ICONO_GENERICO = '🔧';

  // ── Iconos SVG (septiembre 2026) ───────────────────────────────
  // Motivo: Unicode no tiene excavadora, toro, dumper, plataforma
  // articulada ni andamio. Los emojis de arriba eran aproximaciones
  // (ascensor, tuk-tuk, escalera de mano…) que no se entendían, cada
  // sistema los dibuja distinto y salían del tamaño de la letra.
  //
  // Siluetas de línea en un lienzo de 48×48. Usan currentColor, así
  // que heredan el color del texto donde se pinten (naranja en un
  // aviso, rojo en caducada…).
  //
  // Mismas claves y mismo orden que ICONOS: el primero que casa gana.
  // Si se añade una clave allí, hay que añadirla aquí.
  //
  // NO sustituye a Hab.icono(): un <svg> no se puede meter dentro de
  // un <option> ni de un atributo title="". Esas pantallas siguen con
  // el emoji hasta que se migren una a una.
  const SVG_TRAZOS = {
    'movimiento de tierras': '<rect x="4" y="35" width="28" height="8" rx="4"/><rect x="7" y="25" width="22" height="10" rx="1"/><path d="M9 25V15h10v10"/><path d="M27 27L35 8l7 14"/><path d="M40 20l7 6-6 7z"/>',
    'dumper':                '<circle cx="13" cy="38" r="6"/><circle cx="36" cy="38" r="6"/><path d="M6 30v-4h20v4M20 30h9"/><path d="M24 26l2-12h20l-4 12z"/><path d="M8 26L9 7h12l-1 19"/><path d="M14 20l4-4"/>',
    'grua torre':            '<path d="M15 44V12M21 44V12M15 44l6-8-6-8 6-8-6-8"/><path d="M4 12h41M4 16h17"/><path d="M18 12V4l22 8M18 4L6 12"/><path d="M36 12v14"/><path d="M33 26h6l-3 5"/><path d="M8 40h20"/>',
    'plataforma elevadora':  '<circle cx="13" cy="40" r="4"/><circle cx="35" cy="40" r="4"/><rect x="6" y="30" width="36" height="6" rx="1"/><rect x="18" y="24" width="12" height="6" rx="1"/><path d="M24 24L12 14l18-5"/><path d="M30 12h14V4M30 12V6h14"/>',
    'carretilla elevadora':  '<circle cx="12" cy="39" r="4"/><circle cx="28" cy="39" r="4"/><path d="M4 35V24h28v11z"/><path d="M11 24V10h17v14"/><path d="M35 4v36"/><path d="M35 40h11M35 30h5v10"/>',
    'andamio':               '<path d="M11 4v36M37 4v36"/><path d="M11 12h26M11 36h26"/><rect x="9" y="21" width="30" height="4" rx="1"/><path d="M11 36l26-11"/><path d="M11 8h3M11 16h3M11 30h3M34 8h3M34 16h3M34 30h3"/><circle cx="11" cy="43" r="2.5"/><circle cx="37" cy="43" r="2.5"/>',
    'altura con arnes':      '<circle cx="20" cy="12" r="4"/><path d="M20 17v15l-6 12M20 32l6 12M12 22l16 4"/><path d="M15 18l10 12M25 18L15 30"/><path d="M24 19q10-7 16-15"/><path d="M36 4h8"/>',
    'electric':              '<path d="M27 4L10 27h12l-3 17 19-25H26z"/>'
  };
  SVG_TRAZOS['toro'] = SVG_TRAZOS['carretilla elevadora'];
  SVG_TRAZOS['arnes'] = SVG_TRAZOS['altura con arnes'];

  const SVG_GENERICO = '<path d="M30 6a10 10 0 0 0-9 14L7 34a4 4 0 0 0 6 6l14-14a10 10 0 0 0 14-9l-6 6-6-2-2-6z"/>';

  const ETIQUETAS = {
    vigente:     'Vigente',
    proxima:     'Caduca pronto',
    caducada:    'Caducada',
    no_caduca:   'No caduca',
    falta_fecha: 'Falta fecha'
  };

  // El badge de falta_fecha NO puede parecerse al de no_caduca.
  // Uno es una decisión y el otro es un agujero. La clase
  // 'falta-fecha' se define en el CSS de cada pantalla (fase 0,
  // bloque 3).
  const CLASES = {
    vigente:     'vigente',
    proxima:     'proxima',
    caducada:    'caducada',
    no_caduca:   'sin_caducidad',
    falta_fecha: 'falta-fecha'
  };

  function normalizar(txt) {
    return String(txt || '')
      .toLowerCase()
      .normalize('NFD')
      .replace(/[\u0300-\u036f]/g, '');
  }

  function hoyMadrid() {
    if (!window.Fechas || typeof window.Fechas.hoyMadrid !== 'function') {
      throw new Error(
        'js/habilitaciones.js necesita js/fechas.js y no está cargado. ' +
        'Añade <script src="../js/fechas.js"></script> ANTES de este archivo.'
      );
    }
    return window.Fechas.hoyMadrid();
  }

  // Suma días a un 'YYYY-MM-DD' usando aritmética UTC pura: así el
  // cambio de hora de marzo/octubre no puede desplazar el resultado.
  function sumarDias(fechaISO, dias) {
    const [y, m, d] = String(fechaISO).split('-').map(Number);
    const t = new Date(Date.UTC(y, m - 1, d + dias));
    const mm = String(t.getUTCMonth() + 1).padStart(2, '0');
    const dd = String(t.getUTCDate()).padStart(2, '0');
    return `${t.getUTCFullYear()}-${mm}-${dd}`;
  }

  function diasRestantes(fechaISO) {
    if (!fechaISO) return null;
    const [y1, m1, d1] = hoyMadrid().split('-').map(Number);
    const [y2, m2, d2] = String(fechaISO).split('-').map(Number);
    const a = Date.UTC(y1, m1 - 1, d1);
    const b = Date.UTC(y2, m2 - 1, d2);
    return Math.round((b - a) / 86400000);
  }

  // Mismo orden de preguntas que la RPC. Si aquí y allí no coinciden,
  // la pantalla dice una cosa y el correo otra.
  function estado(hab) {
    const h = hab || {};
    if (h.sin_caducidad === true) return 'no_caduca';
    if (!h.fecha_caducidad)       return 'falta_fecha';

    const hoy = hoyMadrid();
    const fecha = String(h.fecha_caducidad).slice(0, 10);

    // Comparación de textos 'YYYY-MM-DD': ordena igual que la fecha
    // y no pasa por new Date(), que es donde se cuelan los husos.
    if (fecha < hoy) return 'caducada';
    if (fecha <= sumarDias(hoy, UMBRAL_DIAS)) return 'proxima';
    return 'vigente';
  }

  function etiqueta(est) {
    return ETIQUETAS[est] || est;
  }

  function clase(est) {
    return CLASES[est] || '';
  }

  function icono(tipoNombre) {
    const n = normalizar(tipoNombre);
    const m = ICONOS.find(r => n.includes(r.clave));
    return m ? m.icono : ICONO_GENERICO;
  }

  // Devuelve un <svg> listo para meter con innerHTML. 'px' es el lado
  // (por defecto 24). Lleva vertical-align para ir en línea con texto.
  function iconoSvg(tipoNombre, px) {
    const n = normalizar(tipoNombre);
    const m = ICONOS.find(r => n.includes(r.clave));
    const trazos = (m && SVG_TRAZOS[m.clave]) || SVG_GENERICO;
    const lado = Number(px) > 0 ? Number(px) : 24;
    return '<svg class="hab-svg" width="' + lado + '" height="' + lado + '" viewBox="0 0 48 48" ' +
      'fill="none" stroke="currentColor" stroke-width="2.4" stroke-linecap="round" stroke-linejoin="round" ' +
      'style="vertical-align:middle;flex:none" aria-hidden="true" focusable="false">' +
      trazos + '</svg>';
  }

  function formatearFecha(fechaISO) {
    const [y, m, d] = String(fechaISO).slice(0, 10).split('-');
    return `${d}/${m}/${y}`;
  }

  function textoCaducidad(hab) {
    const h = hab || {};
    const est = estado(h);
    if (est === 'no_caduca')   return 'No caduca';
    if (est === 'falta_fecha') return '⚠ Sin fecha de caducidad';

    const txt = formatearFecha(h.fecha_caducidad);
    if (est === 'caducada') return `Caducó: ${txt}`;

    const dias = diasRestantes(h.fecha_caducidad);
    if (est === 'proxima') {
      if (dias === 0) return `Caduca HOY (${txt})`;
      if (dias === 1) return `Caduca mañana (${txt})`;
      return `Caduca en ${dias} días (${txt})`;
    }
    return `Hasta: ${txt}`;
  }

  window.Hab = {
    UMBRAL_DIAS,
    estado,
    etiqueta,
    clase,
    icono,
    iconoSvg,
    diasRestantes,
    textoCaducidad
  };
})();
