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

   QUÉ MÁS VIVE AQUÍ (54ª, 24/8/2026): EL CRITERIO DE «ESTO ES UNA EXENCIÓN»
   Una exención dice que un documento NO le aplica a una empresa. Se escribe
   como una línea más dentro de los motivos, con este molde EXACTO:

       [Exención] {nombre del documento} — no aplica: {explicación a mano}

   La escriben DOS sitios, y ninguno de los dos es una pantalla:
   `js/ecoordina-import.js:654` y `scripts/ecoordina-sync.mjs:426`. Usan
   plantillas idénticas byte a byte, raya «—» en U+2014 incluida.
   ⚠️ Hasta la 54ª, el comentario de `js/accesos-resueltos.js` y el de
   `fichaje/index.html` decían que la escribía `jefe/documentos-ecoordina.html`.
   Era FALSO: esa pantalla solo la LEE. Corregido en los dos.

   POR QUÉ EL CRITERIO ESTÁ AQUÍ Y NO EN CADA LECTOR
   Había DOS puertas al mismo problema con criterios distintos:
   `js/accesos-resueltos.js` con `/^\s*\[Exención\]/i` (tolerante) y
   `jefe/documentos-ecoordina.html` con `startsWith('[Exención]')` (exacto).
   No mordía porque los escritores son exactos, pero es la regla de la casa:
   dos puertas al mismo problema no pueden tener criterios de cero distintos.

   ⚠️ Y POR ESO `exencionDe()` DEVUELVE EL NOMBRE, NO UN SÍ/NO
   `jefe/documentos-ecoordina.html` no solo detectaba: además CORTABA por
   longitud fija (`slice('[Exención]'.length)`) para sacar el nombre del
   documento. Un detector tolerante a mayúsculas y espacios seguido de un
   corte fijo casa y devuelve basura. Aquí detectar y cortar son la MISMA
   operación, así que no pueden separarse nunca.

   QUIÉN LO CARGA
   fichaje/index.html · admin/index.html · jefe/index.html ·
   encargado/index.html · jefe/documentos-ecoordina.html.
   ⚠️ Tiene que ir ANTES que `js/accesos-resueltos.js`, que lo necesita para
   arrancar y se niega a hacerlo sin él.

   LOS TRES LECTORES FALLAN DISTINTO, A PROPÓSITO
     · `js/accesos-resueltos.js`      → se NIEGA a arrancar (allí decide
                                        rojo/naranja en el panel).
     · `fichaje/index.html`           → degrada (allí solo pinta; quien
                                        decide es `registrar_fichaje`).
     · `jefe/documentos-ecoordina.html` → degrada (allí solo cuenta para un
                                        cartel, y la página ya tiene puesto
                                        el aviso naranja de «ninguna casó»).
   No los «unifiques»: la consecuencia de fallar es distinta en cada uno.
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

  // ------------------------------------------------------------- exenciones

  // Tolerante a propósito al leer, EXACTO al escribir. Los escritores de hoy
  // son byte a byte idénticos; esto protege de un futuro copiado a mano o de
  // un acento perdido en una recodificación, sin abrir la puerta a otra cosa.
  var RE_EXENCION = /^\s*\[\s*exenci[óo]n\s*\]\s*/i;

  // Separador del molde. Va con la raya larga U+2014, tal cual la escriben
  // `js/ecoordina-import.js` y `scripts/ecoordina-sync.mjs`.
  var SEP_NO_APLICA = ' — no aplica:';

  /**
   * Lee una línea de exención y la parte en sus dos trozos.
   *
   * @param {*} crudo  un elemento de `validaciones_obra.motivos` o de
   *                   `incidencias.detalle` ya parseado, o una línea de los
   *                   `motivos` que acaba de calcular el importador.
   * @returns {{doc: string, motivo: string}|null}
   *          `null` si la línea NO es una exención. Si lo es:
   *            · `doc`    → nombre del documento, tal cual lo escribe e-Coordina
   *            · `motivo` → la explicación que tecleó un administrador
   *                         (cadena vacía si la línea viene sin ella)
   */
  function exencionDe(crudo) {
    var t = normalizar(crudo);
    if (!RE_EXENCION.test(t)) return null;
    var resto = t.replace(RE_EXENCION, '');
    var i = resto.indexOf(SEP_NO_APLICA);
    if (i === -1) return { doc: resto.trim(), motivo: '' };
    return {
      doc: resto.slice(0, i).trim(),
      motivo: resto.slice(i + SEP_NO_APLICA.length).trim()
    };
  }

  /**
   * ¿Esta línea es una exención?
   * Definida SOBRE `exencionDe` a propósito: así el sí/no no puede
   * separarse nunca del corte, que es justo el fallo que se venía a evitar.
   */
  function esExencion(crudo) {
    return exencionDe(crudo) !== null;
  }

  return {
    normalizar: normalizar,
    exencionDe: exencionDe,
    esExencion: esExencion
  };
})();
