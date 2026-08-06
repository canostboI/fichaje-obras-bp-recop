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
     Hab.icono(tipoNombre)    → emoji
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
    diasRestantes,
    textoCaducidad
  };
})();
