/* =====================================================================
   js/incidencias-familias.js
   ---------------------------------------------------------------------
   FUENTE ÚNICA de la clasificación ALERTA / RASTRO de las incidencias.
   (P-02 · US-7 — cierre de mes)

   La tabla `incidencias` mezcla dos cosas distintas:

     · ALERTA → algo pasó y ALGUIEN TIENE QUE ACTUAR
                (revisar, corregir, autorizar).
     · RASTRO → registro auditable de algo YA hecho o informativo.
                Nadie tiene que hacer nada.

   La familia se DERIVA del tipo: no hay columna en la base de datos.
   Si algún día cambia la clasificación, se cambia AQUÍ y punto,
   sin tocar filas históricas.

   Regla de seguridad: un tipo DESCONOCIDO se considera ALERTA.
   Preferimos que algo nuevo salte a la vista antes que se esconda.

   Lo usan: admin/incidencias.html (y, más adelante, el cierre de mes
   del jefe). NUNCA duplicar este mapa dentro de una página.
   ===================================================================== */

(function () {
  'use strict';

  var ALERTA = 'alerta';
  var RASTRO = 'rastro';

  /* Tipos válidos según el CHECK de la tabla `incidencias`. */
  var FAMILIA_POR_TIPO = {
    // --- ALERTAS: requieren acción humana ---
    bloqueo_rojo:           ALERTA,  // intentó entrar con documentación en rojo
    presente_sin_registrar: ALERTA,  // persona en obra sin ficha en el sistema
    movil_compartido:       ALERTA,  // posible uso indebido del mismo móvil
    autocierre:             ALERTA,  // hora inventada: corregir antes del proforma
    otro:                   ALERTA,  // sin clasificar → que se vea

    // --- RASTRO: solo registro, sin acción pendiente ---
    // ⚠️ MEDIDO EN LA 54ª (24/8/2026). NO ES UNA BANDEJA ATRASADA.
    // Una consulta directa a la tabla enseña «1.438 nuevas, 0 revisadas»
    // desde abril y parece una bandeja que nadie abre. No lo es, por dos
    // motivos, los dos comprobados:
    //   · `incidencias.estado` tiene DEFAULT 'nueva' y en las filas de
    //     RASTRO no significa nada: `admin/incidencias.html` las manda a
    //     su pestaña, el contador de pendientes solo cuenta ALERTA y el
    //     botón de «marcar revisadas» solo sale en la otra pestaña. Esas
    //     1.438 «nuevas» NO salen en ninguna pantalla. (Prueba de que es
    //     residuo heredado: `fuera_de_zona`, también RASTRO, tiene 17
    //     «revisadas» de antes de que existiera este reparto.)
    //   · Y NO se pueden dejar de escribir. Las escribe solo
    //     `registrar_fichaje`, y su `detalle` es la FOTO CONGELADA de los
    //     motivos en el momento del fichaje. `validaciones_obra` no vale
    //     como sustituto: tiene una sola fila por persona y obra (237 filas
    //     para 237 pares) y se sobrescribe, así que solo sabe el estado de
    //     HOY. Comparado como conjunto: 991 de 1.075 filas comparables
    //     dicen algo DISTINTO de lo que dice hoy `validaciones_obra`, y 392
    //     son de gente que ya no está en naranja. Sin esta fila no quedaría
    //     rastro de por qué lo estuvo aquel día.
    // Conclusión: es un libro de registro, no un aviso. No archivarlas, no
    // dejar de escribirlas, y no volver a abrir esto como si fuera P-02.
    aviso_naranja:          RASTRO,  // entró con aviso; ya quedó constancia
    excepcion_autorizada:   RASTRO,  // el jefe ya autorizó
    fichaje_corregido:      RASTRO,  // ya se corrigió
    fichaje_manual:         RASTRO,  // ya se fichó a mano
    fuera_de_zona:          RASTRO   // fichó fuera del radio; queda registrado
  };

  /* Nombre legible por tipo.
     Sirve para construir el desplegable de filtros con una lista FIJA,
     en vez de deducir los tipos de las últimas filas de la tabla
     (que con 1.000+ registros deja tipos fuera). */
  var ETIQUETA_POR_TIPO = {
    bloqueo_rojo:           'Bloqueo rojo',
    presente_sin_registrar: 'Presente sin registrar',
    movil_compartido:       'Móvil compartido',
    autocierre:             'Autocierre',
    otro:                   'Otro',
    aviso_naranja:          'Aviso naranja',
    excepcion_autorizada:   'Excepción autorizada',
    fichaje_corregido:      'Fichaje corregido',
    fichaje_manual:         'Fichaje manual',
    fuera_de_zona:          'Fuera de zona'
  };

  /* Familia de un tipo. Desconocido o vacío → ALERTA. */
  function familia(tipo) {
    if (!tipo) return ALERTA;
    return FAMILIA_POR_TIPO[String(tipo).toLowerCase()] || ALERTA;
  }

  function esAlerta(tipo) { return familia(tipo) === ALERTA; }
  function esRastro(tipo) { return familia(tipo) === RASTRO; }

  /* Lista de tipos de una familia.
     Se usa para filtrar EN EL SERVIDOR con .in('tipo', tipos('alerta')),
     no para filtrar en el navegador después de traerlo todo. */
  function tipos(fam) {
    var objetivo = (fam === RASTRO) ? RASTRO : ALERTA;
    return Object.keys(FAMILIA_POR_TIPO).filter(function (t) {
      return FAMILIA_POR_TIPO[t] === objetivo;
    });
  }

  /* Todos los tipos conocidos, para desplegables. */
  function todosLosTipos() {
    return Object.keys(FAMILIA_POR_TIPO);
  }

  /* Etiqueta legible. Si el tipo no está en el mapa, se devuelve tal cual
     (así un tipo nuevo se ve, aunque salga con su nombre técnico). */
  function etiqueta(tipo) {
    if (!tipo) return '—';
    return ETIQUETA_POR_TIPO[String(tipo).toLowerCase()] || String(tipo);
  }

  window.IncidenciasFamilias = {
    ALERTA: ALERTA,
    RASTRO: RASTRO,
    familia: familia,
    esAlerta: esAlerta,
    esRastro: esRastro,
    tipos: tipos,
    todosLosTipos: todosLosTipos,
    etiqueta: etiqueta
  };
})();
