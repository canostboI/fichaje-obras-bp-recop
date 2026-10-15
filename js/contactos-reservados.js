/*
 * js/contactos-reservados.js — H-27 de la auditoría (Tanda 9, 15/10/2026).
 *
 * El teléfono y el correo de las cuentas de la app (usuarios_app) y el
 * teléfono de las fichas (trabajadores) ya no se pueden leer directamente
 * desde la API: solo el administrador, con dos funciones de la base
 * (contactos_usuarios_app y telefonos_trabajadores). Así un jefe o un
 * encargado no puede sacar los datos de contacto de sus compañeros.
 *
 * Uso (solo en pantallas del admin):
 *   await ContactosReservados.completarUsuarios(sb, lista, x => x.usuario_app);
 *   await ContactosReservados.completarTrabajadores(sb, lista, x => x);
 * La función de la segunda parte devuelve el objeto que lleva el `id`
 * (la cuenta o la ficha); se le añaden `email`/`telefono`.
 * Si la llamada falla, deja los campos vacíos y avisa en la consola: la
 * pantalla sigue funcionando, solo sin teléfonos ni correos.
 */
(function () {
  async function mapa(sb, rpc, clave) {
    try {
      const { data, error } = await sb.rpc(rpc);
      if (error || !data || data.ok === false) {
        console.warn('[ContactosReservados] ' + rpc + ':', (error && error.message) || (data && data.error) || 'sin datos');
        return new Map();
      }
      return new Map((data[clave] || []).map(function (x) { return [x.id, x]; }));
    } catch (e) {
      console.warn('[ContactosReservados] ' + rpc + ':', e && e.message);
      return new Map();
    }
  }

  function completar(lista, sacar, m, campos) {
    (lista || []).forEach(function (x) {
      const o = sacar ? sacar(x) : x;
      if (!o || !o.id) return;
      const d = m.get(o.id) || {};
      campos.forEach(function (c) { o[c] = d[c] != null ? d[c] : null; });
    });
    return lista;
  }

  window.ContactosReservados = Object.freeze({
    completarUsuarios: async function (sb, lista, sacar) {
      return completar(lista, sacar, await mapa(sb, 'contactos_usuarios_app', 'usuarios'), ['email', 'telefono']);
    },
    completarTrabajadores: async function (sb, lista, sacar) {
      return completar(lista, sacar, await mapa(sb, 'telefonos_trabajadores', 'trabajadores'), ['telefono']);
    }
  });
})();
