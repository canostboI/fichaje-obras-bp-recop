/* ============================================================
   js/estado-obra.js — el estado de la obra, en la cabecera del jefe
   ------------------------------------------------------------
   20/9/2026 (Dani): «me gusta más un botón ahí al lado del QR, que ponga
   activa o algo así y que se vea claramente que se puede pulsar para
   pausarla, o incluso solicitar finalizarla y que sea el admin el que la
   cierre».

   POR QUÉ EXISTE
   Hasta hoy el estado de una obra solo lo podía cambiar el admin, y no
   por una decisión meditada: `obras` nunca se abrió al jefe para otra
   cosa que mirarla. Pero el que pisa la obra es el que sabe si está
   parada. Escola Música Valls llevaba CINCO SEMANAS sin un fichaje y
   seguía marcada como activa: la puerta abierta, la sincronización
   corriendo cada noche y los SMS de ronda saliendo cada mañana.

   QUÉ HACE
   Un botón en la cabecera, al lado de «Ver QR», que ENSEÑA el estado y
   se pulsa para cambiarlo:
     ● Activa            → Pausar la obra · Solicitar finalización
     ⏸ Pausada           → Reanudar la obra · Solicitar finalización
     ● Activa · fin pedido → Retirar la solicitud
   Cada acción abre una confirmación con la explicación de lo que va a
   pasar. Esa explicación NO se escribe aquí: la devuelve la propia
   función de la base de datos, para que sea la misma en cualquier
   pantalla donde pongamos el botón el día de mañana.

   LOS DOS PASOS
   La primera llamada a `cambiar_estado_obra` / `solicitar_fin_obra` no
   escribe nada: devuelve el aviso. Solo una segunda llamada con
   p_confirmar = true cambia algo. Un clic sin querer no puede parar una
   obra aunque este módulo tenga un fallo.

   DEGRADACIÓN (norma de la casa: un fallo nunca se pinta como un dato
   bueno). Si no se puede leer el estado, el botón lo DICE y no ofrece
   ninguna acción. Nunca enseña «Activa» por no haber podido mirar.

   PERMISOS: la guarda de verdad está en la base de datos (jefe de ESA
   obra, o admin). Aquí solo se esconde lo que no se puede usar.

   CANDADOS: solo dentro de /jefe/ Y solo si encuentra la cabecera con
   `#btn-ver-qr`. Las dos condiciones hacen falta: el panel del ENCARGADO
   tiene también su botón de QR, y sin el candado de carpeta el botón se
   le colaba en su pantalla (lo cazó la prueba de control con jsdom, no
   la lectura del código).

   PARA DESHACERLO: quitar la línea `cargar('estado-obra.js')` de
   js/marca-portium.js. Nada más depende de este archivo.
   ============================================================ */
(function () {
  'use strict';

  var SUPABASE_URL = 'https://istrnsicleopzbsrapsw.supabase.co';
  var SUPABASE_ANON_KEY = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6ImlzdHJuc2ljbGVvcHpic3JhcHN3Iiwicm9sZSI6ImFub24iLCJpYXQiOjE3NzU4MTIxMTYsImV4cCI6MjA5MTM4ODExNn0.5UXV2LWPXmbfLI7rKpZSG9YBzZsesjckHnhQabA0mTY';

  var RE_UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
  var cliente = null;
  var obraPintada = null;
  var ocupado = false;

  function sb() {
    if (cliente) return cliente;
    if (!window.supabase || !window.supabase.createClient) return null;
    cliente = window.supabase.createClient(SUPABASE_URL, SUPABASE_ANON_KEY);
    return cliente;
  }

  // La obra que el usuario está mirando: primero el selector, luego lo
  // guardado. Mismo criterio que js/logo-obra.js.
  function obraActiva() {
    var sel = document.getElementById('selector-obra');
    if (sel && sel.value && RE_UUID.test(sel.value)) return sel.value;
    try {
      var g = localStorage.getItem('jefe_obra_activa_id');
      if (g && RE_UUID.test(g)) return g;
    } catch (_) {}
    return null;
  }

  function estilos() {
    if (document.getElementById('estado-obra-css')) return;
    var s = document.createElement('style');
    s.id = 'estado-obra-css';
    s.textContent = [
      '#btn-estado-obra{position:relative}',
      '#btn-estado-obra .eo-punto{font-size:11px;line-height:1}',
      '#btn-estado-obra.eo-pausada{border-color:var(--naranja,#e0a020);color:var(--naranja,#e0a020)}',
      '#btn-estado-obra.eo-nose{opacity:.75;cursor:default}',
      '.eo-menu{position:absolute;top:calc(100% + 6px);right:0;z-index:60;min-width:230px;',
      'background:var(--bg2,#1d2129);border:1px solid var(--borde,#333a45);border-radius:10px;',
      'box-shadow:0 8px 24px rgba(0,0,0,.45);overflow:hidden}',
      '.eo-menu button{display:block;width:100%;text-align:left;background:none;border:0;',
      'color:var(--texto,#e8eaed);font-family:inherit;font-size:13px;padding:11px 14px;cursor:pointer}',
      '.eo-menu button:hover{background:var(--bg3,#262b34)}',
      '.eo-ovl{position:fixed;inset:0;z-index:90;background:rgba(0,0,0,.6);display:flex;',
      'align-items:center;justify-content:center;padding:16px}',
      '.eo-caja{background:var(--bg2,#1d2129);border:1px solid var(--borde,#333a45);border-radius:12px;',
      'max-width:520px;width:100%;max-height:85vh;overflow:auto;padding:20px}',
      '.eo-caja h3{margin:0 0 4px;font-size:17px;color:var(--texto,#e8eaed)}',
      '.eo-sub{font-size:13px;color:var(--texto2,#9aa4b2);margin-bottom:14px}',
      '.eo-caja ul{margin:0 0 14px;padding-left:18px}',
      '.eo-caja li{font-size:13px;color:var(--texto,#e8eaed);margin-bottom:7px;line-height:1.45}',
      '.eo-datos{display:flex;gap:14px;flex-wrap:wrap;font-size:12px;color:var(--texto2,#9aa4b2);',
      'border-top:1px solid var(--borde,#333a45);padding-top:10px;margin-bottom:14px}',
      '.eo-caja input[type=text]{width:100%;box-sizing:border-box;background:var(--bg3,#262b34);',
      'border:1px solid var(--borde,#333a45);border-radius:8px;color:var(--texto,#e8eaed);',
      'font-family:inherit;font-size:13px;padding:9px 11px;margin-bottom:14px}',
      '.eo-btns{display:flex;gap:10px;justify-content:flex-end}',
      '.eo-btns button{font-family:inherit;font-size:13px;padding:9px 16px;border-radius:8px;cursor:pointer}',
      '.eo-cancelar{background:var(--bg3,#262b34);border:1px solid var(--borde,#333a45);color:var(--texto,#e8eaed)}',
      '.eo-hacer{background:var(--color-acento,#ff9800);border:0;color:#fff;font-weight:600}',
      '.eo-hacer[disabled]{opacity:.6;cursor:wait}',
      '.eo-error{color:var(--rojo,#e24b4a);font-size:13px;margin-bottom:12px}'
    ].join('');
    document.head.appendChild(s);
  }

  function esc(t) {
    return String(t == null ? '' : t)
      .replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
  }

  function cerrarMenu() {
    var m = document.querySelector('.eo-menu');
    if (m) m.parentNode.removeChild(m);
  }

  function cerrarModal() {
    var o = document.querySelector('.eo-ovl');
    if (o) o.parentNode.removeChild(o);
  }

  // ── El aviso, con lo que devuelve la base de datos ──────────────────
  function pedirConfirmacion(aviso, titulo, textoBoton, conMotivo, alConfirmar) {
    estilos();
    cerrarModal();

    var lista = (aviso && aviso.consecuencias) || [];
    var datos = [];
    if (aviso && aviso.personas_en_obra != null) datos.push(aviso.personas_en_obra + ' personas en la obra');
    if (aviso && aviso.jornadas_abiertas)        datos.push('⚠ ' + aviso.jornadas_abiertas + ' con la jornada abierta ahora');
    if (aviso && aviso.ultimo_fichaje)           datos.push('último fichaje: ' + aviso.ultimo_fichaje.split('-').reverse().join('/'));
    if (aviso && aviso.meses_sin_cerrar)         datos.push('⚠ ' + aviso.meses_sin_cerrar + ' mes(es) sin cerrar');

    var html = '<div class="eo-caja" role="dialog" aria-modal="true">'
      + '<h3>' + esc(titulo) + '</h3>'
      + '<div class="eo-sub">' + esc((aviso && aviso.obra) || '') + '</div>'
      + '<ul>';
    for (var i = 0; i < lista.length; i++) html += '<li>' + esc(lista[i]) + '</li>';
    html += '</ul>';
    if (datos.length) html += '<div class="eo-datos"><span>' + datos.map(esc).join('</span><span>') + '</span></div>';
    if (conMotivo) html += '<input type="text" id="eo-motivo" maxlength="200" placeholder="Motivo (opcional): por qué se para, hasta cuándo…">';
    html += '<div class="eo-error" id="eo-error" style="display:none"></div>'
      + '<div class="eo-btns">'
      + '<button type="button" class="eo-cancelar" id="eo-no">Cancelar</button>'
      + '<button type="button" class="eo-hacer" id="eo-si">' + esc(textoBoton) + '</button>'
      + '</div></div>';

    var ovl = document.createElement('div');
    ovl.className = 'eo-ovl';
    ovl.innerHTML = html;
    ovl.addEventListener('click', function (ev) { if (ev.target === ovl) cerrarModal(); });
    document.body.appendChild(ovl);

    document.getElementById('eo-no').addEventListener('click', cerrarModal);
    document.getElementById('eo-si').addEventListener('click', function () {
      var btn = this;
      var campo = document.getElementById('eo-motivo');
      btn.disabled = true;
      btn.textContent = 'Un momento…';
      alConfirmar(campo ? campo.value : null, function (err) {
        btn.disabled = false;
        btn.textContent = esc(textoBoton);
        var caja = document.getElementById('eo-error');
        if (caja) { caja.style.display = 'block'; caja.textContent = err; }
      });
    });
  }

  // ── Acciones ────────────────────────────────────────────────────────
  function accion(rpc, args, titulo, textoBoton, conMotivo) {
    var c = sb();
    if (!c) return;
    cerrarMenu();
    c.rpc(rpc, args).then(function (r) {
      if (r.error) { alert('No se ha podido consultar: ' + r.error.message); return; }
      var d = r.data || {};
      // Sin cambios que hacer: no se molesta al usuario con un modal.
      if (d.ok === true && (d.accion === 'sin_cambios' || d.accion === 'ya_pedida')) { pintar(true); return; }
      if (d.ok === false && d.codigo !== 'CONFIRMAR') { alert(d.error || 'No se ha podido hacer.'); return; }

      pedirConfirmacion(d, titulo, textoBoton, conMotivo, function (motivo, fallo) {
        var args2 = {};
        for (var k in args) if (Object.prototype.hasOwnProperty.call(args, k)) args2[k] = args[k];
        args2.p_confirmar = true;
        if (conMotivo) args2.p_motivo = motivo || null;
        c.rpc(rpc, args2).then(function (r2) {
          if (r2.error) { fallo(r2.error.message); return; }
          var d2 = r2.data || {};
          if (d2.ok === false) { fallo(d2.error || 'No se ha podido hacer.'); return; }
          cerrarModal();
          // Al reanudar tras días parada, la documentación está sin
          // comprobar hasta la sincronización de la madrugada.
          if (d2.avisar_sync) {
            if (confirm('Obra reanudada.\n\nLa documentación no se comprueba desde hace '
                + (d2.dias_sin_sincronizar == null ? 'mucho' : d2.dias_sin_sincronizar + ' día(s)')
                + '. Hasta esta noche el semáforo enseña datos viejos.\n\n¿Abrir e-Coordina para actualizarla ahora?')) {
              window.location.href = 'documentos-ecoordina.html';
              return;
            }
          }
          window.location.reload();
        });
      });
    });
  }

  function menu(btn, estado, finPedido) {
    if (document.querySelector('.eo-menu')) { cerrarMenu(); return; }
    var obraId = obraActiva();
    if (!obraId) return;

    var m = document.createElement('div');
    m.className = 'eo-menu';
    var opciones = [];

    if (finPedido) {
      opciones.push(['Retirar la solicitud de fin', function () {
        accion('solicitar_fin_obra', { p_obra_id: obraId, p_solicitar: false },
          'Retirar la solicitud de terminar la obra', 'Retirar', false);
      }]);
    }
    if (estado === 'activa') {
      opciones.push(['⏸ Pausar la obra', function () {
        accion('cambiar_estado_obra', { p_obra_id: obraId, p_estado: 'pausada' },
          'Pausar la obra', 'Pausar', true);
      }]);
    } else if (estado === 'pausada') {
      opciones.push(['▶ Reanudar la obra', function () {
        accion('cambiar_estado_obra', { p_obra_id: obraId, p_estado: 'activa' },
          'Reanudar la obra', 'Reanudar', true);
      }]);
    }
    if (!finPedido) {
      opciones.push(['🏁 Solicitar finalización', function () {
        accion('solicitar_fin_obra', { p_obra_id: obraId, p_solicitar: true },
          'Solicitar que se termine la obra', 'Solicitar', true);
      }]);
    }

    opciones.forEach(function (o) {
      var b = document.createElement('button');
      b.type = 'button';
      b.textContent = o[0];
      b.addEventListener('click', o[1]);
      m.appendChild(b);
    });
    btn.appendChild(m);

    setTimeout(function () {
      document.addEventListener('click', function fuera(ev) {
        if (!btn.contains(ev.target)) { cerrarMenu(); document.removeEventListener('click', fuera); }
      });
    }, 0);
  }

  function hueco() {
    var qr = document.getElementById('btn-ver-qr');
    if (!qr || !qr.parentNode) return null;
    var b = document.getElementById('btn-estado-obra');
    if (!b) {
      b = document.createElement('button');
      b.id = 'btn-estado-obra';
      b.type = 'button';
      b.className = 'btn-qr';
      b.style.display = 'none';          // hasta saber el estado, no se enseña nada
      qr.parentNode.insertBefore(b, qr.nextSibling);
    }
    return b;
  }

  function pintar(forzar) {
    var b = hueco();
    if (!b) return;
    var obraId = obraActiva();
    if (!obraId) return;
    if (!forzar && obraPintada === obraId) return;
    if (ocupado) return;

    var c = sb();
    if (!c) return;
    ocupado = true;

    c.from('obras')
      .select('estado, fin_solicitado_en')
      .eq('id', obraId)
      .maybeSingle()
      .then(function (r) {
        ocupado = false;
        obraPintada = obraId;
        b.style.display = '';
        b.className = 'btn-qr';
        // Se repinta al cambiar de obra: con `onclick` (y no
        // addEventListener) la escucha se SUSTITUYE en vez de acumularse,
        // sin clonar el nodo. Clonarlo dejaba el botón sin padre cuando
        // el repintado llegaba dos veces seguidas.
        b.onclick = null;

        // No se ha podido leer: se DICE, no se inventa un «Activa».
        if (r.error || !r.data || !r.data.estado) {
          b.classList.add('eo-nose');
          b.innerHTML = '<span class="eo-punto">⚠</span> Estado no disponible';
          b.title = 'No se ha podido leer el estado de la obra. Recarga la página.';
          return;
        }

        var estado = r.data.estado;
        var finPedido = !!r.data.fin_solicitado_en;
        var texto, punto;
        if (estado === 'activa')       { texto = 'Activa';   punto = '🟢'; }
        else if (estado === 'pausada') { texto = 'Pausada';  punto = '⏸'; b.classList.add('eo-pausada'); }
        else                           { texto = estado.charAt(0).toUpperCase() + estado.slice(1); punto = '⚪'; }

        if (finPedido) texto += ' · fin solicitado';
        b.innerHTML = '<span class="eo-punto">' + punto + '</span> ' + esc(texto);

        // 'terminada' y 'oculta' son del admin: se enseña, no se toca.
        if (estado !== 'activa' && estado !== 'pausada') {
          b.classList.add('eo-nose');
          b.title = 'Esta obra la gestiona un administrador.';
          return;
        }
        b.title = 'Pulsa para pausar, reanudar o pedir que se termine';
        b.onclick = function (ev) {
          ev.stopPropagation();
          menu(b, estado, finPedido);
        };
      })
      .catch(function (e) {
        ocupado = false;
        console.warn('[estado-obra] no se ha podido leer el estado:', e);
      });
  }

  function iniciar() {
    try {
      // Candado de carpeta. El panel del encargado tiene su propio botón
      // de QR: sin esto, el botón de estado se le colaba en su pantalla.
      if (window.location.pathname.indexOf('/jefe/') === -1) return;
      if (!document.getElementById('btn-ver-qr')) return;   // no es esta cabecera
      estilos();
      pintar(true);
      var sel = document.getElementById('selector-obra');
      if (sel) sel.addEventListener('change', function () { setTimeout(function () { pintar(true); }, 0); });
    } catch (e) {
      console.warn('[estado-obra] no se ha podido montar el botón:', e);
    }
  }

  // La cabecera se rellena al arrancar la página: se espera a que el
  // selector tenga obra, con un tope para no quedarse mirando.
  function esperar(intentos) {
    if (obraActiva() || intentos <= 0) { iniciar(); return; }
    setTimeout(function () { esperar(intentos - 1); }, 300);
  }

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', function () { esperar(20); });
  } else {
    esperar(20);
  }
})();
