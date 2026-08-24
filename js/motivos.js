/* ==========================================================================
   js/motivos.js — Fichaje Obras V2
   --------------------------------------------------------------------------
   LA CASA DE UNA SOLA REGLA: cómo se limpia un motivo antes de leerlo.

   POR QUÉ EXISTE ESTE ARCHIVO
   Un motivo de bloqueo viaja como FRASE desde la base hasta las pantallas, y
   por el camino se le pegan cosas que no son el motivo. Hasta la 53ª sesión
   (24/8/2026) la limpieza estaba escrita DOS VECES, palabra por palabra
   igual, en `fichaje/index.html` y en `js/accesos-resueltos.js`. Las dos lo
   decían en su propio comentario. Dos copias de una regla acaban siendo dos
   reglas: la casa ya se ha comido eso antes (ICONOS_HAB en ocho sitios, el
   semáforo en tres). Esta es la única copia. Si hay que cambiar la limpieza,
   se cambia aquí y no se busca en ningún otro sitio.

   QUÉ LIMPIA (los dos casos, los dos medidos contra la base el 23/8/2026)

     1. El objeto JSON serializado. Formato anterior al 5/6/2026: el motivo
        venía envuelto en `{"motivo": "..."}` y se pintaba literal —con
        llaves y comillas— en los seis idiomas, castellano incluido. Ya no
        lo genera nadie: no queda ningún escritor en el repo. Quedan 4 filas
        en `validaciones_obra` (1 y 5 de junio) y 0 en `incidencias`.

     2. La nota `[sin regla definida, revisar Admin → Reglas]`. 46 en
        `validaciones_obra`, 464 en `incidencias`. La escriben
        `js/ecoordina-import.js` y `scripts/ecoordina-sync.mjs` cuando un par
        (documento, estado) no tiene regla. Es un recado PARA EL
        ADMINISTRADOR, y va DESPUÉS del `→ naranja`.

   POR QUÉ ESA NOTA IMPORTA MÁS DE LO QUE PARECE
   La gravedad del motivo va escrita AL FINAL de la cadena («… → rojo»,
   «… → naranja») y media aplicación decide mirando ese final. Lo que se pega
   detrás no estropea el texto: estropea la CUENTA, y en silencio. Medido el
   23/8/2026 antes de arreglarlo: 15 bloqueos reales enseñaban la causa
   equivocada y 1.256 avisos enseñaban una sección «BLOQUEA» que no debía
   existir.

   LAS FILAS VIEJAS NO SE REESCRIBEN
   Un registro del pasado no se toca para que encaje con una convención de
   hoy. Se normaliza AL LEER, y se normaliza aquí.

   QUÉ NO HACE
   No traduce, no clasifica, no pinta y no consulta la base. Recibe una
   cadena y devuelve una cadena. La traducción vive en `fichaje/index.html`
   y el reparto rojo/naranja en `js/accesos-resueltos.js`.

   QUIÉN LO CARGA
   fichaje/index.html · admin/index.html · jefe/index.html ·
   encargado/index.html.
   ⚠️ Tiene que ir ANTES que `js/accesos-resueltos.js`, que lo necesita para
   arrancar y se niega a hacerlo sin él.
   ========================================================================== */

window.Motivos = (function () {
  'use strict';

  /**
   * Quita de la cadena lo que NO es el motivo, antes de que nadie la lea.
   *
   * @param {*} crudo  el valor tal cual sale de la base (`incidencias.detalle`
   *                   ya parseado, o un elemento de `validaciones_obra.motivos`)
   * @returns {string} el motivo limpio, con su «→ rojo» / «→ naranja» INTACTO
   *                   al final: el sufijo de gravedad no se toca, porque es
   *                   justo lo que leen los que deciden.
   */
  function normalizar(crudo) {
    var t = String(crudo == null ? '' : crudo);
    if (t.charAt(0) === '{') {
      try {
        var o = JSON.parse(t);
        if (o && typeof o.motivo === 'string') t = o.motivo;
      } catch (e) { /* no era JSON: se queda como estaba */ }
    }
    return t.replace(/\s*\[sin regla definida[^\]]*\]\s*$/i, '').trim();
  }

  return {
    normalizar: normalizar
  };
})();
