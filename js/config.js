/*
 * js/config.js — dirección pública de la web de Portium (H-71 de la auditoría).
 *
 * Es el ÚNICO sitio donde está la dirección que llevan:
 *   - los carteles QR de las obras (admin/obras.html, jefe/index.html,
 *     encargado/index.html),
 *   - los enlaces de los correos de alta y de contraseña nueva
 *     (index.html, admin/obras.html),
 *   - el mensaje de bienvenida para WhatsApp (admin/obras.html).
 *
 * Si un día la web pasa a un dominio de la empresa (recomendado: los carteles
 * impresos con la dirección de GitHub dejan de funcionar si se renombra o se
 * pierde la cuenta, o si el repositorio pasa a privado):
 *   1. Configurar el dominio en GitHub Pages (Settings → Pages → Custom domain).
 *   2. Cambiar APP_URL aquí abajo (con la barra final).
 *   3. En Supabase → Authentication → URL Configuration: poner el dominio nuevo
 *      en «Site URL» y añadirlo a «Redirect URLs» (si no, los enlaces de los
 *      correos no funcionan).
 *   4. Reimprimir los carteles QR de todas las obras.
 *
 * La dirección del proyecto de Supabase y su clave pública siguen escritas en
 * cada página (y en la etiqueta Content-Security-Policy, que no puede leer
 * este fichero). Para cambiar de proyecto: buscar y reemplazar
 * «istrnsicleopzbsrapsw» y la clave en todo el repositorio.
 */
(function () {
  var APP_URL = 'https://canostboi.github.io/fichaje-obras-bp-recop/';
  window.PORTIUM_CONFIG = Object.freeze({
    APP_URL: APP_URL,
    // Dirección que lleva el QR de una obra (la valla).
    urlValla: function (obraId) {
      return APP_URL + 'fichaje/?obra=' + encodeURIComponent(String(obraId || ''));
    }
  });
})();
