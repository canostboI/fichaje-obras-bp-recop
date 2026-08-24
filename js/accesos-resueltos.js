/* ==========================================================================
   js/accesos-resueltos.js — Fichaje Obras V2
   --------------------------------------------------------------------------
   Clasificación de los accesos DENEGADOS de un día: qué sigue pendiente de
   verdad y qué se resolvió solo.

   POR QUÉ EXISTE
   Un intento denegado no significa que haya un problema. Muchos se arreglan
   solos en minutos: el GPS del móvil da la posición gorda de la antena y al
   reintentar entra; o la sincronización de e-Coordina de la mañana pasa a la
   persona de rojo a naranja y entra al rato. Si todos esos siguen contando
   como "pendiente de revisar", el jefe acaba con un número grande que no
   mira nadie.

   LA REGLA (una sola, y vive AQUÍ, no en las pantallas)
   Un intento denegado está RESUELTO si esa misma persona tiene una ENTRADA
   correcta ese día, en esa obra, POSTERIOR a su último intento fallido.
     · resuelto en <= MINUTOS_GRACIA desde el PRIMER intento → 'resuelto_rapido'
       (ruido: se agrega en una línea, no se nombra persona a persona)
     · resuelto más tarde                                    → 'resuelto'
       (interesa: dice cuánto tiempo estuvo alguien parado en la valla)
     · sin entrada posterior                                 → 'pendiente'
       (lo ÚNICO que cuenta en el contador rojo)

   Se mide desde el PRIMER intento a propósito: quien lo intentó a las 06:45,
   a las 07:30 y entró a las 08:15 estuvo hora y media parado, aunque su
   último intento fuera 5 minutos antes de entrar.

   ESTE MÓDULO NO CONSULTA LA BD Y NO PINTA HTML.
   Recibe datos y devuelve datos. Cada página los pinta con su CSS.
   Tampoco toca `incidencias.estado`: el registro queda intacto y la bandeja
   del admin las sigue teniendo. Aquí solo se decide qué se GRITA.

   MOTIVOS DEL BLOQUEO
   `incidencias.detalle` de un `bloqueo_rojo` guarda, desde el 15/6/2026, el
   array JSON de motivos tal cual estaban EN EL MOMENTO del intento, cada uno
   con su sufijo "→ rojo" / "→ naranja". Esa es la fuente buena: la foto
   congelada. NO usar `validaciones_obra`, que da el estado de AHORA (si a la
   persona le arreglaron los papeles, el motivo del bloqueo desaparece y el
   recuadro sale vacío).

   Compartido por: jefe/index.html, encargado/index.html, admin/index.html.
   ========================================================================== */

window.AccesosResueltos = (function () {
  'use strict';

  // Ventana de gracia, en minutos. Acordado con Dani el 27/7/2026.
  var MINUTOS_GRACIA = 30;

  // ---------------------------------------------------------------- utilidades

  // Hora local del navegador, IGUAL que el formatHora() de las páginas.
  // Se hace así a propósito: si aquí se forzara 'Europe/Madrid' y la página
  // no, dentro del mismo modal habría dos horas distintas para el mismo
  // fichaje. Los dispositivos de obra están en hora española.
  function hhmm(iso) {
    if (!iso) return '—';
    try {
      return new Date(iso).toLocaleTimeString('es-ES', { hour: '2-digit', minute: '2-digit' });
    } catch (e) { return '—'; }
  }

  function minutosEntre(isoA, isoB) {
    return Math.round((new Date(isoB) - new Date(isoA)) / 60000);
  }

  function textoDuracion(mins) {
    if (mins == null) return '';
    if (mins < 1) return 'menos de 1 min';
    if (mins < 60) return mins + ' min';
    var h = Math.floor(mins / 60);
    var m = mins % 60;
    return m === 0 ? h + ' h' : h + ' h ' + m + ' min';
  }

  /**
   * Quita de la cadena lo que NO es el motivo, antes de que nadie la lea.
   *
   * Un motivo lleva su gravedad escrita AL FINAL («… → naranja», «… → rojo»)
   * y media aplicación decide mirando ese final. Cualquier cosa pegada detrás
   * rompe la cuenta, no solo el texto. Medido el 23/8/2026 sobre la base:
   *
   *   · 464 motivos en 448 incidencias llevan detrás la nota del motor
   *     `[sin regla definida, revisar Admin → Reglas]`. Es un recado PARA EL
   *     ADMINISTRADOR, escrito por `js/ecoordina-import.js` y
   *     `scripts/ecoordina-sync.mjs` después del `→ naranja`. Consecuencia:
   *     `clasificarMotivos` no veía el «naranja» y contaba como CAUSA DEL
   *     BLOQUEO un documento que el propio motor había marcado como aviso.
   *
   *   · El objeto JSON serializado (formato anterior al 5/6/2026). Hoy hay
   *     0 en `incidencias` y 4 en `validaciones_obra`. Se desenvuelve igual:
   *     esta función y su gemela de `fichaje/index.html` tienen que hacer lo
   *     MISMO, o dentro de tres meses son dos reglas distintas.
   *
   * Las filas viejas no se reescriben: un registro del pasado no se toca para
   * que encaje con una convención de hoy. Se normaliza al leer.
   */
  function normalizarMotivo(crudo) {
    var t = String(crudo == null ? '' : crudo);
    if (t.charAt(0) === '{') {
      try {
        var o = JSON.parse(t);
        if (o && typeof o.motivo === 'string') t = o.motivo;
      } catch (e) { /* no era JSON: se queda como estaba */ }
    }
    return t.replace(/\s*\[sin regla definida[^\]]*\]\s*$/i, '').trim();
  }

  function limpiarMotivo(texto) {
    if (!texto) return '';
    return String(texto).replace(/\s*→\s*(verde|naranja|rojo)\s*$/i, '').trim();
  }

  // ------------------------------------------------- motivos congelados (N-4)

  /**
   * Separa los motivos de un bloqueo en lo que DENIEGA y lo que solo AVISA.
   * @param {string[]} detalles  valores crudos de `incidencias.detalle`
   * @returns {{rojos: string[], naranjas: string[]}}
   *
   * Regla de reparto: sufijo "→ naranja" = aviso. TODO lo demás, incluido lo
   * que no lleva sufijo ("Sin libro de subcontratación", "Sin contrato entre
   * empresas"…), cuenta como causa del bloqueo.
   * Los detalles antiguos (texto genérico anterior a junio de 2026) no son
   * JSON: se ignoran y la lista de rojos sale vacía, que es la señal para
   * que la página diga "Motivo no registrado".
   */
  function clasificarMotivos(detalles) {
    var rojos = [], naranjas = [], vistoR = {}, vistoN = {};
    (detalles || []).forEach(function (d) {
      var lista = null;
      try {
        var p = JSON.parse(d);
        if (Array.isArray(p)) lista = p;
      } catch (e) { /* detalle genérico antiguo, no es JSON */ }
      if (!lista) return;
      lista.forEach(function (m) {
        var crudo = normalizarMotivo(m);
        var txt = limpiarMotivo(crudo);
        if (!txt) return;
        // Una exención dice que un documento NO aplica a esa empresa: es una
        // nota explicativa, no una causa de bloqueo. Sin este caso cae en el
        // `else` de abajo —que cuenta como bloqueo A PROPÓSITO, por si acaso—
        // y el panel acababa diciendo que a alguien le impidió entrar justo el
        // papel del que estaba exento. Medido: 15 en incidencias el 23/8/2026.
        // La cadena `[Exención]` la escribe `jefe/documentos-ecoordina.html`,
        // que además la lee de vuelta con startsWith: es una interfaz.
        if (/^\s*\[Exención\]/i.test(crudo) || /→\s*naranja\s*$/i.test(crudo)) {
          if (!vistoN[txt]) { vistoN[txt] = true; naranjas.push(txt); }
        } else {
          if (!vistoR[txt]) { vistoR[txt] = true; rojos.push(txt); }
        }
      });
    });
    // Si algo ya sale como causa del bloqueo, no se repite abajo como aviso.
    naranjas = naranjas.filter(function (n) { return !vistoR[n]; });
    return { rojos: rojos, naranjas: naranjas };
  }

  // ------------------------------------------------------------- clasificación

  function normalizarDni(dni) {
    return dni ? String(dni).trim().toUpperCase() : null;
  }

  function trabajadorDe(fila) {
    // El jefe consulta con alias `trabajador:trabajador_id(...)`;
    // el encargado con `trabajadores(...)`. Se admiten los dos.
    return fila.trabajador || fila.trabajadores || null;
  }

  function indexarEntradas(fichajes) {
    var porId = {}, porDni = {};
    (fichajes || []).forEach(function (f) {
      if ((f.tipo || '') !== 'entrada') return;
      if (!f.hora) return;
      var t = trabajadorDe(f);
      var id = f.trabajador_id || (t && t.id) || null;
      var dni = normalizarDni(t && t.dni);
      if (id) { (porId[id] = porId[id] || []).push(f.hora); }
      if (dni) { (porDni[dni] = porDni[dni] || []).push(f.hora); }
    });
    return { porId: porId, porDni: porDni };
  }

  function primeraEntradaPosterior(listas, desdeISO) {
    var mejor = null;
    var corte = new Date(desdeISO).getTime();
    (listas || []).forEach(function (lista) {
      (lista || []).forEach(function (h) {
        var t = new Date(h).getTime();
        if (t > corte && (mejor === null || t < new Date(mejor).getTime())) mejor = h;
      });
    });
    return mejor;
  }

  function decidirEstado(g, gracia, entradasConocidas) {
    if (!entradasConocidas || !g.entrada) {
      // Sin datos de fichajes NO se resuelve nada: mejor un pendiente de más
      // que esconder a alguien que se quedó fuera.
      g.estado = 'pendiente';
      g.minutosParado = null;
      return;
    }
    g.minutosParado = minutosEntre(g.primerIntento, g.entrada);
    g.estado = (g.minutosParado <= gracia) ? 'resuelto_rapido' : 'resuelto';
  }

  /**
   * @param {Object} opciones
   *   incidencias   {Array}  filas de `incidencias` de tipo bloqueo_rojo /
   *                          fuera_de_zona del día y la obra.
   *   sinRegistrar  {Array}  grupos ya parseados de `presente_sin_registrar`
   *                          ({nombre, empresa, dni, intentos, ultimo_intento,
   *                           pendiente}).
   *   fichajes      {Array}  fichajes del día en esa obra. Si NO es un array
   *                          (null/undefined) se considera que no se sabe si
   *                          alguien entró y todo queda 'pendiente'.
   *   minutosGracia {number} opcional; por defecto MINUTOS_GRACIA.
   */
  function clasificar(opciones) {
    var o = opciones || {};
    var incidencias = o.incidencias || [];
    var sinRegistrar = o.sinRegistrar || [];
    var entradasConocidas = Array.isArray(o.fichajes);
    var gracia = (typeof o.minutosGracia === 'number') ? o.minutosGracia : MINUTOS_GRACIA;
    var idx = indexarEntradas(entradasConocidas ? o.fichajes : []);

    // --- agrupar los intentos por persona ---------------------------------
    var porPersona = {};
    incidencias.forEach(function (inc) {
      var t = trabajadorDe(inc);
      var key = (t && t.id) || inc.trabajador_id || ('anonimo_' + (inc.detalle || ''));
      if (!porPersona[key]) {
        porPersona[key] = {
          clase: 'trabajador',
          trabajador: t,
          trabajador_id: inc.trabajador_id || (t && t.id) || null,
          nombre: [t && t.nombre, t && t.apellidos].filter(Boolean).join(' ') || 'Trabajador no identificado',
          dni: (t && t.dni) || '',
          empresa: (t && t.empresa && t.empresa.nombre) || '',
          intentos: 0,
          pendientes: 0,
          revisados: 0,
          primerIntento: inc.created_at,
          ultimoIntento: inc.created_at,
          incidencia_id: inc.id || null,
          _idPendienteEn: null,
          tipos: [],
          detalles: [],
          detallesGps: []
        };
      }
      var g = porPersona[key];
      var tipo = inc.tipo || 'bloqueo_rojo';
      g.intentos++;
      if (g.tipos.indexOf(tipo) === -1) g.tipos.push(tipo);
      if ((inc.estado || 'nueva') === 'nueva') g.pendientes++; else g.revisados++;
      if (inc.created_at) {
        if (new Date(inc.created_at) > new Date(g.ultimoIntento)) g.ultimoIntento = inc.created_at;
        if (new Date(inc.created_at) < new Date(g.primerIntento)) g.primerIntento = inc.created_at;
      }
      if (inc.detalle) {
        if (tipo === 'fuera_de_zona') {
          if (g.detallesGps.indexOf(inc.detalle) === -1) g.detallesGps.push(inc.detalle);
        } else {
          if (g.detalles.indexOf(inc.detalle) === -1) g.detalles.push(inc.detalle);
        }
      }
      // El botón "✓ Visto" de la pantalla marca UNA incidencia: la pendiente
      // más reciente. Se compara por fecha, sin fiarse del orden de llegada.
      if ((inc.estado || 'nueva') === 'nueva' && inc.id && inc.created_at) {
        if (!g._idPendienteEn || new Date(inc.created_at) > new Date(g._idPendienteEn)) {
          g._idPendienteEn = inc.created_at;
          g.incidencia_id = inc.id;
        }
      }
    });

    var personas = Object.keys(porPersona).map(function (k) { return porPersona[k]; });

    // --- presentes sin registrar ------------------------------------------
    // No tienen ficha, así que solo se pueden casar por DNI declarado: si ese
    // DNI acabó fichando entrada, es que le dieron de alta y entró.
    sinRegistrar.forEach(function (sr) {
      personas.push({
        clase: 'sin_registrar',
        trabajador: null,
        trabajador_id: null,
        nombre: sr.nombre || 'Persona no identificada',
        dni: sr.dni || '',
        empresa: sr.empresa || '',
        intentos: sr.intentos || 1,
        pendientes: (sr.pendiente === false) ? 0 : (sr.intentos || 1),
        revisados: (sr.pendiente === false) ? (sr.intentos || 1) : 0,
        primerIntento: sr.primer_intento || sr.ultimo_intento,
        ultimoIntento: sr.ultimo_intento,
        incidencia_id: sr.incidencia_id || null,
        tipos: ['presente_sin_registrar'],
        detalles: [],
        detallesGps: []
      });
    });

    // --- resolver ----------------------------------------------------------
    personas.forEach(function (g) {
      var listas = [];
      if (g.trabajador_id && idx.porId[g.trabajador_id]) listas.push(idx.porId[g.trabajador_id]);
      var dni = normalizarDni(g.dni);
      if (dni && idx.porDni[dni]) listas.push(idx.porDni[dni]);
      g.entrada = listas.length ? primeraEntradaPosterior(listas, g.ultimoIntento) : null;
      decidirEstado(g, gracia, entradasConocidas);
    });

    // Pendientes primero y, dentro de cada bloque, lo más reciente arriba.
    var orden = { pendiente: 0, resuelto: 1, resuelto_rapido: 2 };
    personas.sort(function (a, b) {
      if (orden[a.estado] !== orden[b.estado]) return orden[a.estado] - orden[b.estado];
      return new Date(b.ultimoIntento) - new Date(a.ultimoIntento);
    });

    var pendientes = personas.filter(function (g) { return g.estado === 'pendiente'; });
    var resueltos = personas.filter(function (g) { return g.estado === 'resuelto'; });
    var rapidos = personas.filter(function (g) { return g.estado === 'resuelto_rapido'; });

    var suma = function (lista, campo) {
      return lista.reduce(function (s, g) { return s + (g[campo] || 0); }, 0);
    };

    return {
      entradasConocidas: entradasConocidas,
      minutosGracia: gracia,
      personas: personas,
      pendientes: pendientes,
      resueltos: resueltos,
      rapidos: rapidos,
      totales: {
        personas: personas.length,
        intentos: suma(personas, 'intentos'),
        personasPendientes: pendientes.length,
        intentosPendientes: suma(pendientes, 'intentos'),
        avisosPendientes: suma(pendientes, 'pendientes'),
        personasResueltas: resueltos.length + rapidos.length,
        personasResueltasTarde: resueltos.length,
        personasResueltasRapido: rapidos.length,
        intentosResueltos: suma(resueltos, 'intentos') + suma(rapidos, 'intentos')
      }
    };
  }

  // ------------------------------------------------------------ textos comunes

  /** Etiquetas de tipo, en texto plano. Cada página las pinta como quiera. */
  function etiquetas(g) {
    var out = [];
    if (g.tipos.indexOf('bloqueo_rojo') !== -1) out.push('🔴 Documentación');
    if (g.tipos.indexOf('fuera_de_zona') !== -1) out.push('📍 Fuera de zona GPS');
    if (g.tipos.indexOf('presente_sin_registrar') !== -1) out.push('🆕 Sin registrar');
    return out;
  }

  /** "Denegado 06:45 → entró 08:19 · 1 h 34 min parado" (texto plano). */
  function textoDesenlace(g) {
    if (g.estado === 'pendiente') {
      return g.intentos === 1
        ? 'Intento a las ' + hhmm(g.ultimoIntento) + ' · no llegó a entrar'
        : g.intentos + ' intentos · último a las ' + hhmm(g.ultimoIntento) + ' · no llegó a entrar';
    }
    return 'Denegado ' + hhmm(g.primerIntento) + ' → entró ' + hhmm(g.entrada) +
           ' · ' + textoDuracion(g.minutosParado) + ' parado';
  }

  return {
    MINUTOS_GRACIA: MINUTOS_GRACIA,
    clasificar: clasificar,
    clasificarMotivos: clasificarMotivos,
    limpiarMotivo: limpiarMotivo,
    normalizarMotivo: normalizarMotivo,
    etiquetas: etiquetas,
    textoDesenlace: textoDesenlace,
    textoDuracion: textoDuracion,
    hhmm: hhmm
  };
})();
