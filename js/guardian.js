/* ============================================================
   js/guardian.js — El guardián de sesión, en un solo sitio
   ------------------------------------------------------------
   Motivo (SILENCIO-GUARDIAN, 30ª + mitad viva de C5, 60ª):

   Las 20 pantallas con login repetían este arranque a mano:

     const { data: ua } = await sb.from('usuarios_app')
       .select('rol').eq('auth_user_id', session.user.id).single();
     if (!ua || ua.rol !== 'admin') { location.href = '../'; return; }

   Dos fallos, los dos en la misma línea:

   1. NO SE LEÍA `error`. Un corte de red devuelve data=null con
      error puesto, y el código lo trataba igual que "no eres
      admin": te echaba al login sin decir nada. Parecía una
      sesión caducada cuando era la conexión.

   2. NO SE MIRABA `activo`. Un usuario dado de baja con la
      sesión abierta entraba y veía la app VACÍA (RLS no le deja
      leer nada), sin ninguna explicación de por qué.

   Arreglarlo pantalla a pantalla las dejaría comportándose
   distinto entre sí. Por eso vive aquí.

   ------------------------------------------------------------
   Uso (cargar ANTES del script principal de la página):

     <script src="../js/guardian.js"></script>

   Y en el arranque:

     const g = await Guardian.entrar(sb, {
       rol: 'jefe_obra',        // o 'admin', o ['jefe_obra','encargado'], o null
       campos: 'id, nombre',    // lo que ADEMÁS necesite la página
       volver: '../'            // a dónde se echa al que no debe estar
     });
     if (!g) return;            // el guardián ya ha hecho lo que tocaba

     // A partir de aquí es seguro:
     g.usuario   → la fila de usuarios_app (con rol y activo incluidos)
     g.session   → la sesión de Supabase

   ------------------------------------------------------------
   Las cinco puertas, por orden:

     1. Sin sesión ............ → al login, callando (es lo normal)
     2. Fallo de lectura ...... → MENSAJE de conexión, NO se echa
     3. Sin fila en la tabla .. → al login
     4. activo = false ........ → PANTALLA "cuenta dada de baja"
     5. Rol que no toca ....... → al login

   Solo la 2 y la 4 hablan. Las otras tres redirigen, que es el
   comportamiento de siempre y el correcto.
   ============================================================ */
(function () {
  'use strict';

  // ── Pantalla de aviso a página completa ───────────────────────
  // Se pinta encima, sin borrar el body: si algo falla al montar
  // el aviso, la página de debajo sigue ahí y no queda en blanco.
  function pantalla(opciones) {
    const color = opciones.color || '#f44336';
    const capa = document.createElement('div');
    capa.setAttribute('role', 'alert');
    capa.style.cssText =
      'position:fixed;inset:0;z-index:99999;background:#12141a;' +
      'display:flex;align-items:center;justify-content:center;padding:20px;' +
      'font-family:system-ui,-apple-system,Segoe UI,Roboto,sans-serif;';

    const caja = document.createElement('div');
    caja.style.cssText =
      'max-width:520px;width:100%;padding:26px;border-radius:14px;' +
      'border:1px solid ' + color + '77;background:#1b1e26;color:#e8eaf0;' +
      'line-height:1.6;font-size:15px;';

    const titulo = document.createElement('div');
    titulo.textContent = opciones.titulo;
    titulo.style.cssText =
      'font-size:19px;font-weight:700;color:' + color + ';margin-bottom:12px;';

    const cuerpo = document.createElement('div');
    cuerpo.textContent = opciones.texto;

    caja.appendChild(titulo);
    caja.appendChild(cuerpo);

    if (opciones.botones && opciones.botones.length) {
      const fila = document.createElement('div');
      fila.style.cssText = 'margin-top:22px;display:flex;gap:10px;flex-wrap:wrap;';
      opciones.botones.forEach(function (b) {
        const btn = document.createElement('button');
        btn.textContent = b.texto;
        btn.style.cssText =
          'padding:11px 18px;border-radius:9px;border:1px solid #ffffff2e;' +
          'background:' + (b.principal ? color : 'transparent') + ';' +
          'color:' + (b.principal ? '#12141a' : '#e8eaf0') + ';' +
          'font-size:15px;font-weight:600;cursor:pointer;';
        btn.addEventListener('click', b.accion);
        fila.appendChild(btn);
      });
      caja.appendChild(fila);
    }

    capa.appendChild(caja);
    document.body.appendChild(capa);
  }

  // ── Puerta 2: no se ha podido leer el usuario ─────────────────
  // NO se cierra la sesión ni se redirige: la sesión sigue siendo
  // buena. Lo que ha fallado es la conexión con la base.
  function avisoConexion() {
    pantalla({
      color: '#ffa726',
      titulo: 'No se ha podido comprobar tu usuario',
      texto: 'Tu sesión sigue abierta: lo que ha fallado es la conexión con ' +
             'la base de datos. Vuelve a cargar la página. Si sigue igual, avisa.',
      botones: [
        { texto: 'Volver a cargar', principal: true,
          accion: function () { location.reload(); } }
      ]
    });
  }

  // ── Puerta 4: cuenta dada de baja ─────────────────────────────
  function avisoDeBaja(sb, volver) {
    pantalla({
      color: '#f44336',
      titulo: 'Tu cuenta está dada de baja',
      texto: 'No puedes usar la aplicación con esta cuenta. Si crees que es ' +
             'un error, habla con administración.',
      botones: [
        { texto: 'Cerrar sesión', principal: true, accion: async function () {
            try { await sb.auth.signOut(); } catch (e) { /* da igual: igualmente salimos */ }
            location.href = volver;
          } }
      ]
    });
  }

  // ── Juntar los campos que pide la página con los obligatorios ──
  // El guardián necesita SIEMPRE rol y activo, los pida la página o no.
  function listaCampos(campos) {
    const pedidos = String(campos || '')
      .split(',')
      .map(function (c) { return c.trim(); })
      .filter(Boolean);
    ['rol', 'activo'].forEach(function (obligatorio) {
      if (pedidos.indexOf(obligatorio) === -1) pedidos.push(obligatorio);
    });
    return pedidos.join(', ');
  }

  // ── La puerta ─────────────────────────────────────────────────
  async function entrar(sb, opciones) {
    const op     = opciones || {};
    const volver = op.volver || '../';
    const campos = listaCampos(op.campos);

    // 1 · ¿Hay sesión?
    const { data: { session } } = await sb.auth.getSession();
    if (!session) { location.href = volver; return null; }

    // 2 · ¿Se puede leer el usuario?
    // maybeSingle() y no single(): con single(), "no hay fila" llega
    // como ERROR, y entonces no se puede distinguir de un fallo de red.
    const { data: usuario, error } = await sb
      .from('usuarios_app')
      .select(campos)
      .eq('auth_user_id', session.user.id)
      .maybeSingle();

    if (error) { console.error('[Guardian] usuarios_app:', error); avisoConexion(); return null; }

    // 3 · ¿Existe en usuarios_app?
    if (!usuario) { location.href = volver; return null; }

    // 4 · ¿Sigue de alta?
    // Se compara contra false a propósito: si la columna llegara
    // nula o ausente, NO se echa a nadie por un dato que falta.
    if (usuario.activo === false) { avisoDeBaja(sb, volver); return null; }

    // 5 · ¿El rol que toca?
    if (op.rol) {
      const permitidos = Array.isArray(op.rol) ? op.rol : [op.rol];
      if (permitidos.indexOf(usuario.rol) === -1) { location.href = volver; return null; }
    }

    return { session: session, usuario: usuario };
  }

  window.Guardian = { entrar: entrar };
})();
