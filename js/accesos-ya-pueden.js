/* ============================================================
   js/accesos-ya-pueden.js — «YA PUEDE ENTRAR» SEPARADO DE «SIGUE FUERA»
   ------------------------------------------------------------
   1/10/2026 (Dani: «sería más claro lo resuelto abajo y lo pendiente
   arriba, distinguible fácilmente»).

   DE DÓNDE VIENE
   La ventana «Accesos denegados hoy» de Presencia pone en «Se quedaron
   fuera» a todo el que fue rechazado y no ha vuelto a fichar, con el
   motivo CONGELADO del momento del intento (eso está bien y no se toca:
   ver el comentario de abrirModalAccesosDenegados en jefe/index.html).
   Pero si mientras tanto le has arreglado los papeles o le has
   autorizado, la tarjeta seguía igual, mezclada con los que siguen en
   rojo de verdad. Caso BAMSA del 1/10: renovado el contrato, Zroude y
   Boulmani ya estaban en verde y seguían saliendo como bloqueados.

   QUÉ HACE
   Después de pintar la ventana, mira el estado de AHORA de quien sigue
   fuera y la reparte en tres bloques, de arriba abajo:
     🚫 Siguen sin poder entrar        → lo que te toca resolver
     🔓 Ya pueden entrar               → falta que vuelvan a escanear el QR
     ✅ Resueltos hoy (ya existía)     → entraron más tarde
   Las tarjetas de «ya pueden» van en verde, sin el botón de autorizar
   (no hace falta) y con la razón: autorizado hoy / ya en verde / ya en
   naranja. El motivo del bloqueo se sigue viendo, apagado.

   QUÉ NO HACE
   No toca la BD ni `incidencias`. No cambia el contador de la tarjeta
   «Denegados sin resolver» ni el banner rojo (el banner ya dice «dile
   que vuelva a escanear el QR» persona a persona). Si la consulta del
   estado falla, la ventana se queda tal cual la pintó la página: un
   fallo de lectura NO se pinta como «ya puede entrar».

   CÓMO SE ENGANCHA
   Envuelve pintarDetalleAccesos de jefe/index.html (y de
   encargado/index.html, que tiene una gemela). Llama primero a la
   original: si este archivo falla, la ventana funciona como antes.

   CANDADO: solo en Presencia del jefe (/jefe/ index.html) y en el
   panel del encargado (/encargado/ index.html).
   PARA DESHACERLO: quitar `cargar('accesos-ya-pueden.js')` de
   js/marca-portium.js (hay una línea para el jefe y otra para el
   encargado). Nada más depende de este archivo.

   AÑADIDO 1/10/2026 (tarde) — TAMBIÉN EN EL ENCARGADO
   Dani: «la parte del encargado no lo refleja». Su ventana «Accesos
   denegados hoy» es gemela de la del jefe (mismas funciones
   pintarDetalleAccesos y tarjetaAcceso, mismos id), pero la obra se
   guarda con otro nombre: `obraActual` en el jefe, `obraActualId` en
   el encargado. Se lee la que exista. El encargado ya podía leer
   validaciones_obra y excepciones_acceso de sus obras (es_mi_obra).
   Única diferencia de texto: la autorización la suele dar el jefe, así
   que en el encargado no se dice «Le has autorizado» sino «Autorizado
   para hoy».
   ============================================================ */
(function () {
  'use strict';

  var turno = 0;   // si la ventana se repinta mientras se consulta, gana la última

  function estilos() {
    if (document.getElementById('ayp-css')) return;
    var s = document.createElement('style');
    s.id = 'ayp-css';
    s.textContent = [
      '.ayp-seccion{margin-top:20px}',
      '.ayp-titulo{font-size:12px;font-weight:700;text-transform:uppercase;letter-spacing:.6px;',
      'color:var(--verde,#4caf50);padding-bottom:6px;border-bottom:1px solid rgba(76,175,80,.4)}',
      '.ayp-sub{font-size:12px;color:var(--texto2,#9aa4b2);margin-top:6px;line-height:1.45}',
      '.acceso-item.ayp-item{border-color:rgba(76,175,80,.45);background:rgba(76,175,80,.06);',
      'border-left:4px solid var(--verde,#4caf50)}',
      '.acceso-item.ayp-item .acceso-contador{color:var(--texto2,#9aa4b2);font-weight:600}',
      '.acceso-item.ayp-item .acceso-motivos{opacity:.6}',
      '.acceso-item.ayp-item .acceso-bloque-titulo{color:var(--texto2,#9aa4b2)}',
      '.acceso-item.ayp-item .acceso-motivo-item{background:transparent;border-color:var(--borde,#333);color:var(--texto2,#9aa4b2)}',
      '.ayp-nota{margin-top:9px;font-size:13px;font-weight:700;color:var(--verde,#4caf50)}'
    ].join('');
    document.head.appendChild(s);
  }

  function hoyMadrid() {
    if (window.Fechas && typeof window.Fechas.hoyMadrid === 'function') return window.Fechas.hoyMadrid();
    return new Intl.DateTimeFormat('en-CA', {
      timeZone: 'Europe/Madrid', year: 'numeric', month: '2-digit', day: '2-digit'
    }).format(new Date());
  }

  var enEncargado = window.location.pathname.indexOf('/encargado/') !== -1;

  // Variables de la página (script clásico: se ven desde aquí).
  function cliente() {
    try { /* eslint-disable-next-line no-undef */ if (typeof sb !== 'undefined' && sb) return sb; } catch (_) {}
    return null;
  }
  // La obra: `obraActual` en jefe/index.html, `obraActualId` en
  // encargado/index.html.
  function obra() {
    try { /* eslint-disable-next-line no-undef */ if (typeof obraActual !== 'undefined' && obraActual) return obraActual; } catch (_) {}
    try { /* eslint-disable-next-line no-undef */ if (typeof obraActualId !== 'undefined' && obraActualId) return obraActualId; } catch (_) {}
    return null;
  }

  // Estado de AHORA de quien sigue fuera. Devuelve null si no se ha podido
  // saber (y entonces no se toca nada).
  async function estadoAhora(pendientes) {
    var c = cliente(), obraId = obra();
    if (!c || !obraId) return null;

    // Los «sin registrar» no tienen ficha en la anotación: se buscan por el
    // DNI que tecleó, solo entre la gente de ESTA obra (igual que el banner).
    var dnisSR = pendientes
      .filter(function (g) { return !g.trabajador_id && g.dni; })
      .map(function (g) { return String(g.dni).trim().toUpperCase(); });
    var fichaPorDni = {};
    if (dnisSR.length) {
      var rD = await c.from('validaciones_obra')
        .select('trabajador_id, trabajador:trabajador_id(id, dni, activo)')
        .eq('obra_id', obraId);
      if (rD.error) return null;
      (rD.data || []).forEach(function (v) {
        var t = v.trabajador;
        if (!t || t.activo === false || !t.dni) return;
        var k = String(t.dni).trim().toUpperCase();
        if (dnisSR.indexOf(k) !== -1) fichaPorDni[k] = t.id;
      });
    }

    var idDe = function (g) {
      return g.trabajador_id || (g.dni ? fichaPorDni[String(g.dni).trim().toUpperCase()] : null) || null;
    };
    var ids = pendientes.map(idDe).filter(Boolean);
    if (!ids.length) return { idDe: idDe, porId: {} };

    var res = await Promise.all([
      c.from('validaciones_obra').select('trabajador_id, estado')
        .eq('obra_id', obraId).in('trabajador_id', ids),
      c.from('excepciones_acceso').select('trabajador_id, estado')
        .eq('obra_id', obraId).eq('fecha', hoyMadrid()).in('trabajador_id', ids)
    ]);
    if (res[0].error || res[1].error) return null;
    var porId = {};
    (res[0].data || []).forEach(function (v) { porId[v.trabajador_id] = { estado: v.estado, excepcion: false }; });
    (res[1].data || []).forEach(function (e) {
      if (e.estado === 'activa' && porId[e.trabajador_id]) porId[e.trabajador_id].excepcion = true;
    });
    return { idDe: idDe, porId: porId };
  }

  function razon(a) {
    if (!a) return null;
    if (a.excepcion) return enEncargado ? 'Autorizado para hoy' : 'Le has autorizado hoy';
    if (a.estado === 'verde') return 'Su documentación ya está en verde';
    if (a.estado === 'naranja') return 'Ya no está en rojo (ahora naranja)';
    return null;   // sigue en rojo
  }

  async function repartir(original, clas, miTurno) {
    var contenido = document.getElementById('modal-accesos-contenido');
    var resumen = document.getElementById('modal-accesos-resumen');
    if (!contenido || !clas || !clas.pendientes || !clas.pendientes.length) return;

    var info;
    try { info = await estadoAhora(clas.pendientes); } catch (e) { info = null; }
    if (!info || miTurno !== turno) return;
    var overlay = document.getElementById('modal-accesos-overlay');
    if (overlay && !overlay.classList.contains('visible')) return;

    var siguen = [], yaPueden = [];
    clas.pendientes.forEach(function (g) {
      var r = razon(info.porId[info.idDe(g)]);
      if (r) { g.__aypRazon = r; yaPueden.push(g); } else siguen.push(g);
    });
    if (!yaPueden.length) return;   // nada que separar: se queda como está

    // El aviso que la página pone delante (si no pudo leer los «sin
    // registrar») se conserva al repintar.
    var aviso = contenido.firstElementChild;
    var avisoHtml = (aviso && aviso.classList.contains('modal-motivos-vacio')) ? aviso.outerHTML : '';

    var copia = {};
    Object.keys(clas).forEach(function (k) { copia[k] = clas[k]; });
    copia.pendientes = siguen;
    original(copia);

    // Si ya no queda nadie fuera, que se diga en vez de dejar el hueco.
    if (!siguen.length) {
      var hueco = document.createElement('div');
      hueco.className = 'accesos-seccion-titulo';
      hueco.textContent = '🚫 Siguen sin poder entrar: nadie';
      var primero = contenido.querySelector('.accesos-aviso');
      if (primero) primero.insertAdjacentElement('afterend', hueco);
      else contenido.insertBefore(hueco, contenido.firstChild);
    } else {
      contenido.querySelectorAll('.accesos-seccion-titulo').forEach(function (t) {
        if (t.textContent.indexOf('Se quedaron fuera') !== -1) t.textContent = '🚫 Siguen sin poder entrar';
      });
    }

    // Bloque «ya pueden entrar», justo debajo de los que siguen fuera.
    estilos();
    var sec = document.createElement('div');
    sec.className = 'ayp-seccion';
    var html = '<div class="ayp-titulo">🔓 Ya pueden entrar · falta que vuelvan a escanear el QR</div>'
      + '<div class="ayp-sub">Fueron rechazados hoy y ya está arreglado. Salen de aquí solos cuando fichen.</div>';
    yaPueden.forEach(function (g) {
      var tarjeta = (typeof tarjetaAcceso === 'function') ? tarjetaAcceso(g, false) : '';   // eslint-disable-line no-undef
      html += tarjeta;
    });
    sec.innerHTML = html;
    sec.querySelectorAll('.acceso-item').forEach(function (el, i) {
      el.classList.add('ayp-item');
      var btn = el.querySelector('.acceso-btn-ficha');
      if (btn) btn.remove();
      var nota = document.createElement('div');
      nota.className = 'ayp-nota';
      nota.textContent = '✅ ' + yaPueden[i].__aypRazon + ' — dile que vuelva a escanear el QR.';
      var top = el.querySelector('.acceso-top');
      if (top && top.nextSibling) el.insertBefore(nota, top.nextSibling);
      else el.appendChild(nota);
    });
    var despues = contenido.querySelector('.accesos-seccion, .accesos-rapidos, .accesos-nota');
    if (despues) contenido.insertBefore(sec, despues);
    else contenido.appendChild(sec);
    if (avisoHtml) contenido.insertAdjacentHTML('afterbegin', avisoHtml);

    // Resumen de arriba con las tres cifras.
    if (resumen) {
      var t = clas.totales || {};
      var nRes = t.personasResueltas || 0;
      resumen.style.display = 'block';
      resumen.className = siguen.length ? 'accesos-resumen' : 'accesos-resumen naranja';
      resumen.textContent = siguen.length + ' sin poder entrar · '
        + yaPueden.length + ' ya ' + (yaPueden.length === 1 ? 'puede' : 'pueden') + ' entrar · '
        + nRes + ' resuelto' + (nRes === 1 ? '' : 's') + ' · '
        + (t.intentos || 0) + ' intento' + (t.intentos === 1 ? '' : 's') + ' hoy';
    }
  }

  function iniciar() {
    try {
      var ruta = window.location.pathname;
      var pagina = ruta.split('/').pop() || '';
      var panel = ruta.indexOf('/jefe/') !== -1 || ruta.indexOf('/encargado/') !== -1;
      if (!panel || (pagina !== 'index.html' && pagina !== '')) return;
      var original = window.pintarDetalleAccesos;
      if (typeof original !== 'function' || original.__ayp) return;
      var envuelta = function (clas) {
        var r = original.apply(this, arguments);
        var miTurno = ++turno;
        try {
          repartir(original, clas, miTurno).catch(function (e) {
            console.warn('[accesos-ya-pueden]', e);
          });
        } catch (e) { console.warn('[accesos-ya-pueden]', e); }
        return r;
      };
      envuelta.__ayp = true;
      window.pintarDetalleAccesos = envuelta;
    } catch (e) {
      console.warn('[accesos-ya-pueden] no se ha podido montar:', e);
    }
  }

  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', iniciar);
  else iniciar();
})();
