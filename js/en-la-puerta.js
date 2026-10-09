/* ============================================================
   js/en-la-puerta.js — UN SOLO BLOQUE «EN LA PUERTA» EN PRESENCIA DEL JEFE
   ------------------------------------------------------------
   8/10/2026 (Dani: «es muy reiterativo y el hecho de que haya tantos
   banners me confunde un poco… ¿no se puede unificar esto de algún
   modo para que sea más usable?»; con más gente en la puerta: «ahora
   peor aún»).

   DE DÓNDE VIENE
   La cabecera de jefe/index.html tenía TRES bloques rojos que hablaban
   de las mismas personas: «Personas sin identificar», «Piden
   autorización en la puerta» y «N personas sin poder entrar». Youssef,
   El Kadaqui, Hammami y Zougagh salían en dos o tres a la vez, y la
   lista roja repetía a la misma persona dos veces (una fila por la nota
   «Sin registrar» de las 08:02, otra por el intento «Documentación» de
   las 08:57). Cada tarjeta de «Piden autorización» abría el formulario
   entero aunque no se fuera a tocar: tres personas = media pantalla de
   rojo. Y lo informativo (ronda, cierre de mes, RP, habilitaciones)
   pesaba lo mismo que lo urgente.

   QUÉ HACE
   1. UN BLOQUE arriba del todo: «En la puerta · N personas esperan tu
      decisión». UNA FILA POR PERSONA (fusionadas por DNI), con una
      etiqueta que dice qué le pasa (PIDE PASO · SIN IDENTIFICAR · SIN
      PODER ENTRAR · SIN REGISTRAR · YA PUEDE ENTRAR), una frase con todo
      lo suyo junto y, a la derecha, SOLO los botones que tocan a esa
      persona. El formulario de autorización se abre al pulsar
      «Resolver» (una fila abierta a la vez).
   2. LA CASILLA DEL 5/10 (Dani, caso del herrero): «Al autorizar, dar por
      buena su entrada de las HH:MM». Se entregó el 5/10 pero nunca llegó
      al repo; se rehace aquí sobre el archivo de hoy. Desmarcada por
      defecto, solo con ficha e intento denegado hoy, válida para «Ya
      está en regla», «He revisado sus papeles» y «Asumo el riesgo».
      Si el fichaje manual falla, se dice con la causa.
   3. LO INFORMATIVO BAJA a una franja fina «AVISOS DE HOY» debajo de
      los tres números: ronda del encargado, cierre de mes, RP,
      habilitaciones, autocierres, ausentes de e-Coordina y papeles de
      subcontratas. Mismo texto, mismos botones, menos peso.
      Regla: lo que exige actuar, arriba y abierto; lo que solo informa,
      abajo y discreto.

   CÓMO SE ENGANCHA (norma de la 111ª: pantalla grande, módulo pequeño)
   NO reescribe jefe/index.html. Envuelve cargarSolicitudes,
   cargarIdentidadesPendientes y cargarBloqueos: llama primero a la
   original (que pinta sus paneles de siempre, ahora escondidos) y
   después RECOLOCA esas mismas tarjetas, con sus botones y sus onclick,
   dentro de la fila de cada persona. No duplica nada: mueve los nodos.
   Los tres paneles viejos se esconden SOLO cuando la primera pintada ha
   salido bien (clase `puerta-activa` en <body>); si este módulo falla,
   la pantalla se queda como estaba.
   También envuelve resolverSol y confirmarPapeles para la casilla del
   5/10, que llama a registrar_fichaje_manual SOLO si la autorización
   salió bien y la casilla estaba marcada.

   4. QUIEN YA ESTÁ DENTRO (8/10, Dani: «¿por qué salen en el banner si
      ya están trabajando dentro?»). Una identidad pendiente NO se cierra
      al dejar pasar (regla del 23/9: «¿quién es?» es otra pregunta que
      «¿le dejo pasar?», y solo la cierra verificar en persona o el
      rechazo). Pero no es lo mismo que alguien parado en la valla: esa
      fila va en NARANJA, al final, con «Está dentro desde las HH:MM», y
      el título la cuenta aparte («· 3 dentro sin identificar»). Y el
      bloque entero va en NARANJA cuando no hay nadie parado en la valla;
      en rojo solo cuando sí lo hay.
   5. «VISTO» A UNA IDENTIDAD PENDIENTE (8/10, Dani). Botón «✓ Visto» en
      las filas de identidad: llama a marcar_identidad_vista (solo el jefe,
      firmado) y la fila deja de salir aquí. La identidad sigue pendiente:
      el recordatorio es la marca «🪪 Identificar» de los listados de
      presentes (js/marca-identidad.js), que no se va con el visto.

   6. «ES EL MISMO» (9/10/2026, Dani, caso Moussa el Kadaoui: ayer tenía
      ficha con su NIE Y9164508B; hoy tecleó Y9164508, sin la letra, y salió
      como «SIN REGISTRAR»). En las filas SIN REGISTRAR se pregunta a la BD
      (candidatos_es_el_mismo) si hay alguien con ficha en esta obra con el
      mismo DNI salvo la letra o con el mismo nombre. Si lo hay, sale un botón
      con su nombre, DNI y empresa; al pulsarlo (con confirmación) se llama a
      unir_es_el_mismo: la anotación queda enganchada a su ficha, con el DNI
      corregido, resuelta y firmada. Si no hay nadie parecido, no sale nada.
      La regla de quién se parece vive SOLO en la BD (_candidatos_es_el_mismo)
      y la unión solo acepta a alguien que esa regla haya propuesto.

   QUÉ NO HACE
   No toca la BD ni ninguna regla de fondo: el visto manda, «no se va al
   autorizar», los fallos de consulta se dicen (salen arriba del bloque),
   las identidades no caducan al cambiar el día, la ventana «Accesos
   denegados hoy» y la tarjeta «Denegados sin resolver» siguen igual.

   CANDADO: solo en /jefe/ index.html.
   PARA DESHACERLO: quitar `cargar('en-la-puerta.js')` de
   js/marca-portium.js. Nada más depende de este archivo.
   ============================================================ */
(function () {
  'use strict';

  var TAG = '[en-la-puerta]';
  var fresco = { sol: false, ident: false, bloq: false };   // qué panel acaba de repintarse
  var guardados = { sol: [], ident: [], bloq: [] };         // nodos ya movidos (los que no se repintaron)
  var fallos = { sol: [], ident: [], bloq: [] };            // avisos de consulta fallida de cada panel
  var abierta = null;            // id de la solicitud con el formulario desplegado
  var cerradas = {};             // solicitudes que el jefe plegó a mano: no se vuelven a abrir solas
  var borradores = {};           // lo escrito en un formulario antes de que la página lo repinte
  var intentosPorDni = {};       // DNI → { ref, iso, hora } del PRIMER intento denegado de hoy
  var temporizador = null;
  var obsAvisos = null;
  var mismos = {};               // incidencia SIN REGISTRAR → { lista, en, pidiendo } (candidatos «Es el mismo»)
  var MISMOS_VIGENCIA = 60000;   // se vuelve a preguntar como mucho una vez por minuto

  // ───────────────────────────── utilidades ─────────────────────────────
  function esc(t) {
    return String(t == null ? '' : t)
      .replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;')
      .replace(/"/g, '&quot;').replace(/'/g, '&#39;');
  }
  function normDni(d) {
    return String(d || '').toUpperCase().replace(/[^A-Z0-9]/g, '');
  }
  function texto(el) {
    return el ? String(el.textContent || '').replace(/\s+/g, ' ').trim() : '';
  }
  function obraDeAhora() {
    try { if (typeof obraActual !== 'undefined' && obraActual) return obraActual; } catch (_) {}
    try { return (window.obraActual) || ''; } catch (_) { return ''; }
  }
  function hhmm(iso) {
    try {
      return new Date(iso).toLocaleTimeString('es-ES',
        { hour: '2-digit', minute: '2-digit', timeZone: 'Europe/Madrid' });
    } catch (_) { return ''; }
  }
  function rangoHoy() {
    var a = new Date();
    var d = new Date(a.getFullYear(), a.getMonth(), a.getDate(), 0, 0, 0, 0);
    var h = new Date(a.getFullYear(), a.getMonth(), a.getDate(), 23, 59, 59, 999);
    return { desde: d.toISOString(), hasta: h.toISOString() };
  }

  // ───────────────────────────── estilos ─────────────────────────────
  function estilos() {
    if (document.getElementById('puerta-css')) return;
    var s = document.createElement('style');
    s.id = 'puerta-css';
    s.textContent = [
      // Los tres paneles viejos se esconden solo cuando el bloque nuevo está en pie.
      'body.puerta-activa #panel-ident,body.puerta-activa #panel-sol,body.puerta-activa #panel-bloqueos{display:none!important}',
      // El bloque
      '.puerta{background:rgba(244,67,54,.08);border:1px solid rgba(244,67,54,.45);border-radius:12px;padding:14px 16px 12px;margin-bottom:18px}',
      '.puerta.oculto{display:none}',
      '.puerta.naranja{background:rgba(255,152,0,.07);border-color:rgba(255,152,0,.45)}',
      '.puerta.naranja .puerta-cab h3{color:var(--naranja,#ff9800)}',
      '.puerta.naranja .puerta-cab h3 .puerta-punto{background:var(--naranja,#ff9800)}',
      '.puerta-cab{display:flex;flex-wrap:wrap;justify-content:space-between;align-items:baseline;gap:6px 12px;margin-bottom:10px}',
      '.puerta-cab h3{margin:0;font-size:15px;font-weight:800;color:var(--rojo,#f44336);display:flex;align-items:center;gap:8px}',
      '.puerta-cab h3 .puerta-punto{display:inline-block;width:10px;height:10px;border-radius:50%;background:var(--rojo,#f44336);flex:0 0 auto}',
      '.puerta-cab h3.verde{color:var(--verde,#4caf50)}',
      '.puerta-cab h3.verde .puerta-punto{background:var(--verde,#4caf50)}',
      '.puerta-sub{font-size:12.5px;color:var(--texto2,#8b909e)}',
      '.puerta-fallos{display:flex;flex-direction:column;gap:6px;margin-bottom:10px}',
      '.puerta-fallos>*{margin:0;font-size:13px;font-weight:700;color:var(--rojo,#f44336);background:rgba(244,67,54,.12);border:1px solid rgba(244,67,54,.4);border-radius:8px;padding:9px 12px;display:block}',
      '.puerta-filas{display:flex;flex-direction:column;gap:8px}',
      // La fila
      '.puerta-fila{background:var(--bg2,#1a1d24);border:1px solid var(--borde,#2e3340);border-radius:10px;padding:12px 14px}',
      '.puerta-fila.abierta{border-color:var(--naranja,#ff9800)}',
      '.puerta-fila.verde{background:rgba(76,175,80,.06);border-color:rgba(76,175,80,.35)}',
      '.puerta-cabfila{display:flex;flex-wrap:wrap;justify-content:space-between;align-items:flex-start;gap:10px 12px}',
      '.puerta-quien{flex:1 1 380px;min-width:0;display:flex;flex-direction:column;gap:4px}',
      '.puerta-linea1{display:flex;flex-wrap:wrap;align-items:center;gap:8px}',
      '.puerta-linea1 strong{font-size:15px}',
      '.puerta-meta{font-size:12px;color:var(--texto2,#8b909e)}',
      '.puerta-resumen{font-size:13px;color:var(--texto,#e8eaf0);line-height:1.45}',
      '.puerta-resumen.verde{color:var(--verde,#4caf50)}',
      '.puerta-etq{font-size:11px;font-weight:800;letter-spacing:.04em;padding:2px 8px;border-radius:6px;border:1px solid;white-space:nowrap}',
      '.puerta-etq.pide{background:rgba(255,152,0,.18);border-color:rgba(255,152,0,.6);color:var(--naranja,#ff9800)}',
      '.puerta-etq.roja{background:rgba(244,67,54,.18);border-color:rgba(244,67,54,.6);color:var(--rojo,#f44336)}',
      '.puerta-etq.verde{background:rgba(76,175,80,.18);border-color:rgba(76,175,80,.6);color:var(--verde,#4caf50)}',
      '.puerta-etq.dentro{background:rgba(255,152,0,.14);border-color:rgba(255,152,0,.5);color:var(--naranja,#ff9800)}',
      '.puerta-fila.dentro{border-color:rgba(255,152,0,.35)}',
      // Los botones de la derecha
      '.puerta-acciones{display:flex;flex-wrap:wrap;gap:8px;align-items:center;justify-content:flex-end}',
      '.puerta-acciones .btn-visto-rojo,.puerta-acciones .puerta-btn{background:var(--bg2,#1a1d24);border:1px solid var(--borde,#2e3340);color:var(--texto,#e8eaf0);font-size:13px;padding:8px 14px;border-radius:8px;cursor:pointer;font-family:inherit;white-space:nowrap;min-height:38px;display:inline-flex;align-items:center;text-decoration:none;box-sizing:border-box}',
      '.puerta-acciones .btn-visto-rojo:hover,.puerta-acciones .puerta-btn:hover{background:var(--bg3,#22262f)}',
      '.puerta-btn.resolver{background:rgba(255,152,0,.15);border-color:rgba(255,152,0,.6);color:var(--naranja,#ff9800);font-weight:700}',
      '.puerta-btn.resolver:hover{background:rgba(255,152,0,.25)}',
      '.puerta-btn:disabled{opacity:.5;cursor:default}',
      // Tarjeta de bloqueo movida a la fila: solo sus botones
      '.puerta-acciones .bloqueo-item{display:contents}',
      '.puerta-acciones .bloqueo-item .bloqueo-info{display:none}',
      '.puerta-acciones .bloqueo-item .btn-visto-rojo.puerta-oculto{display:none}',
      // Tarjeta de identidad movida a la fila: foto pequeña y sus dos botones; el texto ya está en la fila
      '.puerta-acciones .ident-item{background:none;border:0;padding:0;margin:0;display:contents}',
      '.puerta-acciones .ident-item .ident-foto{width:38px;height:38px;border-radius:8px;margin:0}',
      '.puerta-acciones .ident-item .ident-sinfoto{display:none}',
      '.puerta-acciones .ident-item .ident-txt{display:contents}',
      '.puerta-acciones .ident-item .ident-nombre,.puerta-acciones .ident-item .ident-meta,.puerta-acciones .ident-item .ident-txt>.ident-dias,.puerta-acciones .ident-item .ident-txt>br{display:none}',
      '.puerta-acciones .ident-item .ident-form .ident-dias{display:inline-block;margin:0 0 8px}',
      '.puerta-acciones .ident-item .ident-foto-btn,.puerta-acciones .ident-item .ident-cerrar{margin:0;padding:8px 13px;border-radius:8px;font-size:13px;min-height:38px}',
      '.puerta-acciones .ident-item .ident-foto-btn{color:var(--texto,#e8eaf0);border-color:var(--borde,#2e3340)}',
      '.puerta-acciones .ident-item .ident-form-hueco{flex:1 1 100%}',
      '.puerta-acciones .ident-item .ident-form-hueco:empty{display:none}',
      // Cuando el rechazo abre su formulario, la zona de botones ocupa todo el ancho
      '.puerta-fila:has(.ident-form-hueco:not(:empty)) .puerta-acciones{flex:1 1 100%;justify-content:flex-start}',
      // Formulario de autorización desplegado: la tarjeta de siempre, sin su cabecera (ya está en la fila)
      '.puerta-desplegable{border-top:1px solid var(--borde,#2e3340);margin-top:10px;padding-top:10px}',
      '.puerta-desplegable[hidden]{display:none}',
      '.puerta-desplegable .sol-item{background:transparent;border:0;padding:0;margin:0}',
      '.puerta-desplegable .sol-item .sol-quien,.puerta-desplegable .sol-item .sol-datos{display:none}',
      '.puerta-desplegable .sol-item>.sol-causa:first-of-type{margin-top:0}',
      // La casilla del 5/10
      '.puerta-hora{display:flex;gap:9px;align-items:flex-start;margin-top:12px;padding:9px 10px;background:var(--bg3,#22262f);border:1px dashed var(--borde,#2e3340);border-radius:8px;font-size:12.5px;color:var(--texto,#e8eaf0);line-height:1.45;cursor:pointer}',
      '.puerta-hora input{margin-top:2px;width:16px;height:16px;flex-shrink:0;cursor:pointer}',
      '.puerta-hora small{display:block;color:var(--texto2,#8b909e);margin-top:2px}',
      // La franja de avisos
      '#puerta-avisos{display:flex;flex-direction:column;gap:6px;margin-top:14px}',
      '#puerta-avisos.oculto{display:none}',
      '#puerta-avisos .puerta-avisos-titulo{font-size:11px;font-weight:700;letter-spacing:.08em;color:var(--texto2,#8b909e);padding-left:2px}',
      '#puerta-avisos>*:not(.puerta-avisos-titulo){background:var(--bg2,#1a1d24)!important;border:1px solid var(--borde,#2e3340)!important;border-radius:10px!important;padding:10px 14px!important;margin:0!important;font-size:13px!important;line-height:1.45}',
      '#puerta-avisos>.oculto,#puerta-avisos>[hidden],#puerta-avisos>*:empty{display:none!important}',
      '#puerta-avisos>.banner-ronda{display:flex}',
      '#puerta-avisos>.banner-ronda.oculto{display:none!important}',
      '#puerta-avisos>.banner-ronda.confirmado{color:var(--verde,#4caf50)}',
      '#puerta-avisos>.banner-ronda.alerta{color:var(--rojo,#f44336)}',
      '#puerta-avisos>.banner-ronda.pendiente{color:var(--texto2,#8b909e)}',
      '#puerta-avisos>.banner-cierres{color:var(--texto,#e8eaf0)}',
      '#puerta-avisos>.panel-avisos h3,#puerta-avisos h3,#puerta-avisos h4{font-size:12px;margin:0 0 6px}',
      '#puerta-avisos .banner-ronda button,#puerta-avisos button{min-height:30px;padding:5px 11px;font-size:12.5px}',
      // «Es el mismo» (9/10)
      '.puerta-mismo{display:flex;flex-wrap:wrap;align-items:center;gap:6px 8px;margin-top:6px;font-size:12.5px;color:var(--texto2,#8b909e)}',
      '.puerta-btn.mismo{background:rgba(76,175,80,.12);border:1px solid rgba(76,175,80,.55);color:var(--verde,#4caf50);font-size:12.5px;padding:6px 12px;border-radius:8px;cursor:pointer;font-family:inherit;min-height:34px;font-weight:700;text-align:left;white-space:normal}',
      '.puerta-btn.mismo:hover{background:rgba(76,175,80,.22)}',
      '.puerta-btn.mismo small{font-weight:400;color:var(--texto2,#8b909e);margin-left:4px}',
      '@media (max-width:600px){.puerta{padding:12px 12px 10px}.puerta-acciones{justify-content:flex-start}}'
    ].join('\n');
    document.head.appendChild(s);
  }

  // ───────────────────────────── el bloque ─────────────────────────────
  function bloque() {
    var b = document.getElementById('puerta');
    if (b) return b;
    var contenido = document.querySelector('.contenido');
    if (!contenido) return null;
    b = document.createElement('section');
    b.id = 'puerta';
    b.className = 'puerta oculto';
    b.innerHTML =
      '<div class="puerta-cab"><h3><span class="puerta-punto"></span><span class="puerta-titulo">En la puerta</span></h3>' +
      '<span class="puerta-sub">Una fila por persona. Lo que solo tú puedes resolver va primero.</span></div>' +
      '<div class="puerta-fallos" style="display:none"></div>' +
      '<div class="puerta-filas"></div>';
    contenido.insertBefore(b, contenido.firstChild);
    return b;
  }

  // Recoge las tarjetas de un panel. Si el panel acaba de repintarse, lo que
  // haya en su lista es lo bueno (aunque esté vacía); si no, valen las que ya
  // se movieron en una pintada anterior (siguen vigentes).
  function recoger(clave, idLista, selItem) {
    var lista = document.getElementById(idLista);
    if (!lista) return { items: guardados[clave], fallos: fallos[clave] };
    if (fresco[clave]) {
      fresco[clave] = false;
      var items = Array.prototype.slice.call(lista.querySelectorAll(':scope > ' + selItem));
      var malos = Array.prototype.slice.call(lista.children).filter(function (n) {
        return !n.matches(selItem) && texto(n);
      });
      guardados[clave] = items;
      fallos[clave] = malos;
      return { items: items, fallos: malos };
    }
    // No se ha repintado: pero si la lista tiene contenido nuevo sin pasar por aquí
    // (no debería), se prefiere lo que hay en ella.
    var nuevos = Array.prototype.slice.call(lista.querySelectorAll(':scope > ' + selItem));
    if (nuevos.length) { guardados[clave] = nuevos; }
    return { items: guardados[clave], fallos: fallos[clave] };
  }

  // ── Lectura de cada tipo de tarjeta ──
  function leerSol(item) {
    var datos = texto(item.querySelector('.sol-datos')).split(' · ');
    var quien = item.querySelector('.sol-quien');
    var nombre = quien ? texto(quien).replace(/No está en la app$/i, '').trim() : '';
    var causa = '';
    var causas = item.querySelectorAll(':scope > .sol-causa:not(.sol-ecoordina)');
    if (causas.length) causa = texto(causas[0]);
    return {
      tipo: 'sol', nodo: item, id: (item.id || '').replace(/^sol-/, ''),
      nombre: nombre, dni: datos[0] || '', empresa: datos[1] || '',
      hora: datos[2] || '', pide: (datos[3] || '').replace(/^lo pide\s*/i, ''),
      nueva: item.getAttribute('data-nueva') === '1', causa: causa,
      resuelta: item.classList.contains('sol-resuelta')
    };
  }
  function leerIdent(item) {
    var meta = item.querySelector('.ident-meta');
    var lineas = [''];
    if (meta) {
      Array.prototype.forEach.call(meta.childNodes, function (n) {
        if (n.nodeType === 1 && n.tagName === 'BR') lineas.push('');
        else lineas[lineas.length - 1] += (n.textContent || '');
      });
    }
    lineas = lineas.map(function (l) { return l.replace(/\s+/g, ' ').trim(); });
    var l1 = (lineas[0] || '').split(' · ');
    var btn = item.querySelector('.ident-foto-btn');
    var m = btn && /verificarIdent\('([^']+)'/.exec(btn.getAttribute('onclick') || '');
    return {
      tipo: 'ident', nodo: item, ref: m ? m[1] : '',
      nombre: texto(item.querySelector('.ident-nombre')), dni: l1[0] || '',
      empresa: /^sin empresa$/i.test(l1[1] || '') ? '' : (l1[1] || ''),
      registradoPor: (lineas[1] || '').replace(/^Registrado por\s*/i, ''),
      cuando: texto(item.querySelector('.ident-dias'))
    };
  }
  function leerBloq(item) {
    var detalles = item.querySelectorAll('.bloqueo-info .detalle');
    var d1 = detalles[0] ? texto(detalles[0]) : '';
    var verde = detalles[1] ? texto(detalles[1]) : '';
    var partes = d1.split(' — ');
    var dni = partes.length > 1 ? partes[partes.length - 1] : '';
    var cab = partes[0].split(' · ');   // etiquetas · HH:MM · N intentos
    var n = 1, hora = '';
    cab.forEach(function (p) {
      var mi = /^(\d+)\s+intento/.exec(p);
      if (mi) n = parseInt(mi[1], 10);
      if (/^\d{1,2}:\d{2}$/.test(p)) hora = p;
    });
    var etiquetas = cab.filter(function (p) { return !/^\d{1,2}:\d{2}$/.test(p) && !/intento/.test(p); });
    var ficha = item.querySelector('a[href*="trabajador="]');
    var mr = ficha && /[?&]trabajador=([^&]+)/.exec(ficha.getAttribute('href') || '');
    var alta = item.querySelector('a[href*="dni="]');
    var md = alta && /[?&]dni=([^&]+)/.exec(alta.getAttribute('href') || '');
    // La empresa viaja en el enlace «Avisar a …» (?empresa=) cuando la hay.
    var aviso = item.querySelector('a[href*="empresa="]');
    var me = aviso && /[?&]empresa=([^&]*)/.exec(aviso.getAttribute('href') || '');
    var empresa = '';
    try { empresa = me ? decodeURIComponent(me[1].replace(/\+/g, ' ')) : ''; } catch (_) { empresa = ''; }
    return {
      empresa: empresa,
      tipo: 'bloq', nodo: item, incidencia: item.getAttribute('data-id') || '',
      nombre: texto(item.querySelector('.bloqueo-info strong')),
      dni: dni || (md ? decodeURIComponent(md[1]) : ''),
      ref: mr ? decodeURIComponent(mr[1]) : '',
      intentos: n, hora: hora, etiquetas: etiquetas,
      sinRegistrar: etiquetas.some(function (e) { return /sin registrar/i.test(e); }),
      verde: verde
    };
  }

  // Quién está DENTRO ahora mismo, por DNI y por id, a partir de los fichajes de
  // hoy que la página ya tiene leídos (fichajesHoyCache). Sin dato → nadie.
  function dentroAhora() {
    var out = { dni: {}, ref: {} };
    var fich = null;
    try { fich = (typeof fichajesHoyCache !== 'undefined') ? fichajesHoyCache : null; } catch (_) { fich = null; }
    if (!fich || !fich.length) return out;
    var saldo = {}, entrada = {}, dniDe = {};
    fich.forEach(function (f) {
      var id = f.trabajador_id;
      if (!id) return;
      if (!(id in saldo)) saldo[id] = 0;
      if (f.tipo === 'entrada') { saldo[id] += 1; entrada[id] = f.hora; }
      else saldo[id] -= 1;
      if (f.trabajador && f.trabajador.dni) dniDe[id] = normDni(f.trabajador.dni);
    });
    Object.keys(saldo).forEach(function (id) {
      if (saldo[id] <= 0) return;
      var h = hhmm(entrada[id]);
      out.ref[id] = h;
      if (dniDe[id]) out.dni[dniDe[id]] = h;
    });
    return out;
  }

  // ── Fusión por persona ──
  function fusionar(sols, idents, bloqs) {
    var personas = {}, orden = [];
    function clave(x) {
      var d = normDni(x.dni);
      if (d) return 'D:' + d;
      if (x.ref) return 'R:' + x.ref;
      return 'N:' + String(x.nombre || '').toUpperCase();
    }
    function p(x) {
      var k = clave(x);
      if (!personas[k]) {
        personas[k] = { clave: k, nombre: '', dni: x.dni || '', empresa: '', ref: '', sol: null, ident: null, bloqs: [] };
        orden.push(k);
      }
      var o = personas[k];
      if (!o.nombre && x.nombre) o.nombre = x.nombre;
      if (!o.dni && x.dni) o.dni = x.dni;
      if (!o.empresa && x.empresa) o.empresa = x.empresa;
      if (!o.ref && x.ref) o.ref = x.ref;
      return o;
    }
    sols.forEach(function (s) { var o = p(s); o.sol = s; if (s.nombre) o.nombre = s.nombre; });
    idents.forEach(function (i) { var o = p(i); o.ident = i; });
    bloqs.forEach(function (b) { var o = p(b); o.bloqs.push(b); });
    return orden.map(function (k) { return personas[k]; });
  }

  function clasificar(o, dentro) {
    var verde = o.bloqs.length && o.bloqs.every(function (b) { return !!b.verde; }) && !o.sol && !o.ident;
    if (o.sol) return { clase: 'pide', etq: 'PIDE PASO', peso: 0 };
    if (o.ident) {
      var h = dentro.dni[normDni(o.dni)] || dentro.ref[o.ref] || '';
      if (h) return { clase: 'dentro', etq: 'DENTRO · SIN IDENTIFICAR', peso: 2.5, desde: h };
      return { clase: 'roja', etq: 'SIN IDENTIFICAR', peso: 1 };
    }
    if (verde) return { clase: 'verde', etq: 'YA PUEDE ENTRAR', peso: 3 };
    if (o.bloqs.some(function (b) { return b.sinRegistrar; }) && !o.ref) return { clase: 'roja', etq: 'SIN REGISTRAR', peso: 2 };
    return { clase: 'roja', etq: 'SIN PODER ENTRAR', peso: 2 };
  }

  function resumenDe(o, cl) {
    var partes = [];
    var intentos = 0, ultima = '';
    o.bloqs.forEach(function (b) {
      intentos += b.intentos || 0;
      if (b.hora && (!ultima || b.hora > ultima)) ultima = b.hora;
    });
    var vecesTxt = intentos
      ? (intentos === 1 ? 'ha intentado entrar 1 vez' : 'ha intentado entrar ' + intentos + ' veces') +
        (ultima ? ' (la última a las ' + ultima + ')' : '')
      : '';
    if (o.sol) {
      var s = o.sol;
      if (s.resuelta) partes.push('Resuelta ahora mismo: mira el mensaje de abajo.');
      else if (s.nueva) partes.push('No estaba en la app: se le ha hecho ficha en la puerta.');
      else if (s.causa) partes.push(s.causa.replace(/^Rojo por:\s*/i, 'En rojo por: '));
      var quien = s.pide ? '<strong>' + esc(s.pide) + '</strong>' : 'el encargado';
      partes.push('Lo pide ' + quien + (s.hora ? ' desde las ' + esc(s.hora) : ''));
      if (vecesTxt) partes.push(esc(vecesTxt));
      return partes.join(' · ');
    }
    if (o.ident) {
      var i = o.ident;
      if (cl.clase === 'dentro') {
        partes.push('Está dentro desde las <strong>' + esc(cl.desde) + '</strong>, pero nadie le ha visto el documento todavía');
        partes.push(esc(i.cuando || 'Registrado en la puerta') +
          (i.registradoPor ? ' por <strong>' + esc(i.registradoPor) + '</strong>' : ''));
        return partes.join(' · ');
      }
      partes.push(esc(i.cuando || 'Registrado en la puerta') +
        (i.registradoPor ? ' por <strong>' + esc(i.registradoPor) + '</strong>' : '') +
        ', nadie le ha visto el documento');
      if (o.bloqs.length) {
        var v = o.bloqs.filter(function (b) { return b.verde; })[0];
        if (v) partes.push('<span class="verde">' + esc(v.verde) + '</span>');
        else partes.push('sigue sin poder entrar: ' + esc(o.bloqs[0].etiquetas.join(', ').replace(/[🔴📍🆕]\s*/g, '').toLowerCase()) +
          (vecesTxt ? ' · ' + esc(vecesTxt) : ''));
      }
      return partes.join(' · ');
    }
    if (cl.clase === 'verde') return esc(o.bloqs.filter(function (b) { return b.verde; })[0].verde);
    var b0 = o.bloqs[0];
    var etq = b0.etiquetas.join(', ').replace(/[🔴📍🆕]\s*/g, '').toLowerCase();
    if (cl.etq === 'SIN REGISTRAR') partes.push('Lo escribió él mismo en la valla: no está en la app');
    else partes.push('Denegado por ' + esc(etq || 'documentación'));
    if (vecesTxt) partes.push(esc(vecesTxt));
    return partes.join(' · ');
  }

  // ── Botones de la derecha ──
  function botonesDe(o, fila) {
    var acc = fila.querySelector('.puerta-acciones');
    // 1) Resolver (solo con solicitud)
    if (o.sol) {
      var b = document.createElement('button');
      b.type = 'button';
      b.className = 'puerta-btn resolver';
      b.textContent = (abierta === o.sol.id) ? 'Resolver ▴' : 'Resolver ▾';
      b.addEventListener('click', function () { alternar(o.sol.id); });
      acc.appendChild(b);
    }
    // 2) Identidad: su tarjeta entera (texto escondido por CSS), con sus dos botones y el hueco del rechazo
    if (o.ident) {
      acc.appendChild(o.ident.nodo);
      if (o.ident.ref) {
        var vi = document.createElement('button');
        vi.type = 'button';
        vi.className = 'puerta-btn';
        vi.textContent = '✓ Visto';
        vi.title = 'Ya lo sé: deja de salir aquí. La identidad sigue pendiente y la marca 🪪 queda en los listados.';
        vi.addEventListener('click', function () { vistoIdentidad(o.ident.ref, vi); });
        acc.appendChild(vi);
      }
    }
    // 3) Bloqueos: sus enlaces, sin repetir; los «Visto» se sustituyen por uno solo para toda la persona
    var vistos = [];
    var hrefs = {};
    o.bloqs.forEach(function (bq) {
      Array.prototype.slice.call(bq.nodo.querySelectorAll(':scope > a, :scope > button')).forEach(function (n) {
        if (n.tagName === 'BUTTON' && /Visto|Marcando/.test(n.textContent)) {
          n.classList.add('puerta-oculto');
          if (bq.incidencia) vistos.push(bq.incidencia);
          return;
        }
        n.classList.remove('puerta-oculto');
        var h = n.getAttribute('href') || n.textContent;
        // El mismo enlace repetido por dos anotaciones de la misma persona: uno basta.
        if (hrefs[h]) n.classList.add('puerta-oculto'); else hrefs[h] = true;
        // «Avisar a …» sobra si ya se va a resolver con «Resolver»? No: el aviso a la
        // empresa es independiente de dejarle pasar. Se queda.
      });
      acc.appendChild(bq.nodo);
    });
    if (vistos.length) {
      var v = document.createElement('button');
      v.type = 'button';
      v.className = 'puerta-btn';
      v.textContent = '✓ Visto';
      v.title = vistos.length > 1 ? 'Marca como vistas sus ' + vistos.length + ' anotaciones de hoy' : 'Marcar como visto';
      v.addEventListener('click', function () { marcarVistos(vistos, v); });
      acc.appendChild(v);
    }
  }

  // ── «Es el mismo» (9/10) ──
  // La anotación SIN REGISTRAR de una fila (la del intento en la valla).
  function incidenciaSinRegistrar(o) {
    for (var i = 0; i < o.bloqs.length; i++) {
      if (o.bloqs[i].sinRegistrar && o.bloqs[i].incidencia) return o.bloqs[i].incidencia;
    }
    return '';
  }

  // Pide los candidatos a la BD. Mientras llegan se pinta lo que hubiera
  // (o nada); al llegar se repinta. Un fallo no se pinta como «no hay nadie»:
  // simplemente no sale el botón, y se intenta otra vez al minuto.
  function pedirMismos(idInc) {
    var m = mismos[idInc];
    if (m && (m.pidiendo || (Date.now() - m.en) < MISMOS_VIGENCIA)) return;
    if (typeof sb === 'undefined') return;
    if (!m) m = mismos[idInc] = { lista: null, en: 0, pidiendo: false };
    m.pidiendo = true;
    Promise.resolve(sb.rpc('candidatos_es_el_mismo', { p_incidencia_id: idInc })).then(function (r) {
      m.pidiendo = false;
      m.en = Date.now();
      if (r && !r.error && r.data && r.data.ok === true) {
        m.lista = Array.isArray(r.data.candidatos) ? r.data.candidatos : [];
      } else {
        console.warn(TAG, 'candidatos_es_el_mismo:', (r && (r.error || r.data)) || r);
      }
      programar();
    }, function (e) {
      m.pidiendo = false;
      m.en = Date.now();
      console.warn(TAG, 'candidatos_es_el_mismo:', e);
    });
  }

  function pintarMismos(o, fila) {
    var idInc = incidenciaSinRegistrar(o);
    if (!idInc) return;
    pedirMismos(idInc);
    var m = mismos[idInc];
    if (!m || !m.lista || !m.lista.length) return;
    var quien = fila.querySelector('.puerta-quien');
    if (!quien) return;
    var caja = document.createElement('div');
    caja.className = 'puerta-mismo';
    var lbl = document.createElement('span');
    lbl.textContent = m.lista.length === 1 ? '¿Es alguien que ya tiene ficha?' : '¿Es alguno de estos, que ya tienen ficha?';
    caja.appendChild(lbl);
    m.lista.forEach(function (c) {
      var b = document.createElement('button');
      b.type = 'button';
      b.className = 'puerta-btn mismo';
      var porQue = c.motivo === 'dni' ? 'mismo DNI salvo la letra' : 'mismo nombre';
      b.innerHTML = 'Es ' + esc(c.nombre || '—') + ' · ' + esc(c.dni || 'sin DNI') +
        (c.empresa ? ' · ' + esc(c.empresa) : '') + '<small>(' + esc(porQue) + ')</small>';
      b.title = 'Une esta anotación a su ficha: queda resuelta y firmada por ti.';
      b.addEventListener('click', function () { unirMismo(idInc, c, b); });
      caja.appendChild(b);
    });
    quien.appendChild(caja);
  }

  async function unirMismo(idInc, c, btn) {
    var txt = '¿Unir esta anotación a la ficha de ' + (c.nombre || '—') + ' (' + (c.dni || 'sin DNI') + ')?\n\n' +
      'Quedará resuelta, con su DNI corregido y firmada por ti.';
    if (!window.confirm(txt)) return;
    btn.disabled = true;
    var antes = btn.innerHTML;
    btn.textContent = 'Uniendo…';
    try {
      var r = await sb.rpc('unir_es_el_mismo', { p_incidencia_id: idInc, p_trabajador_id: c.trabajador_id });
      if (r.error || !r.data || r.data.ok !== true) {
        throw new Error((r.data && r.data.error) || (r.error && r.error.message) || 'No se pudo unir');
      }
      delete mismos[idInc];
      if (typeof window.cargarBloqueos === 'function') await window.cargarBloqueos();
    } catch (e) {
      btn.disabled = false;
      btn.innerHTML = antes;
      alert('Error: ' + (e && e.message ? e.message : e));
    }
  }

  async function vistoIdentidad(ref, btn) {
    var obra = obraDeAhora();
    if (!obra) return;
    btn.disabled = true;
    btn.textContent = 'Marcando…';
    try {
      var r = await sb.rpc('marcar_identidad_vista', { p_trabajador_id: ref, p_obra_id: obra });
      if (r.error || !r.data || r.data.ok !== true) {
        throw new Error((r.error && r.error.message) || (r.data && r.data.error) || 'No se pudo marcar');
      }
      if (typeof window.cargarIdentidadesPendientes === 'function') await window.cargarIdentidadesPendientes();
      try { if (window.MarcaIdentidad && typeof window.MarcaIdentidad.repintar === 'function') window.MarcaIdentidad.repintar(); } catch (_) {}
    } catch (e) {
      btn.disabled = false;
      btn.textContent = '✓ Visto';
      alert('Error: ' + (e && e.message ? e.message : e));
    }
  }

  async function marcarVistos(ids, btn) {
    btn.disabled = true;
    btn.textContent = 'Marcando…';
    try {
      for (var i = 0; i < ids.length; i++) {
        var r = await sb.rpc('marcar_incidencia_vista', { p_incidencia_id: ids[i] });
        if (r.error || !r.data || !r.data.success) {
          throw new Error((r.error && r.error.message) || (r.data && r.data.error) || 'No se pudo marcar');
        }
      }
      if (typeof window.cargarBloqueos === 'function') await window.cargarBloqueos();
    } catch (e) {
      btn.disabled = false;
      btn.textContent = '✓ Visto';
      alert('Error: ' + (e && e.message ? e.message : e));
    }
  }

  function alternar(idSol) {
    if (abierta === idSol) { abierta = null; cerradas[idSol] = true; }
    else { abierta = idSol; delete cerradas[idSol]; }
    pintarDesplegables();
  }

  // Lo escrito en un formulario (empresa elegida, CIF, nota de identidad) se
  // guarda ANTES de que la página repinte las tarjetas, y se vuelve a poner
  // después. La lista se repinta cada minuto: sin esto, lo escrito a medias se
  // perdía (patrón de la 142ª: «lo que se escribe a medias no se pisa»).
  function capturarBorradores() {
    Array.prototype.forEach.call(document.querySelectorAll('#puerta .sol-item, #sol-lista .sol-item'), function (it) {
      var id = (it.id || '').replace(/^sol-/, '');
      if (!id) return;
      var b = {};
      var sel = it.querySelector('.sol-empresa-sel');
      if (sel && sel.value) b.sel = sel.value;
      ['.sol-empresa-nueva', '.sol-cif', '.sol-nota'].forEach(function (c) {
        var inp = it.querySelector(c);
        if (inp && inp.value) b[c] = inp.value;
      });
      if (Object.keys(b).length) borradores[id] = b;
    });
  }
  function restaurarBorrador(item, id) {
    var b = borradores[id];
    if (!b || !item) return;
    var sel = item.querySelector('.sol-empresa-sel');
    if (sel && b.sel && sel.value !== b.sel &&
        Array.prototype.some.call(sel.options, function (o) { return o.value === b.sel; })) {
      sel.value = b.sel;
      try { if (typeof window.solEmpresaCambia === 'function') window.solEmpresaCambia(sel); } catch (_) {}
    }
    ['.sol-empresa-nueva', '.sol-cif', '.sol-nota'].forEach(function (c) {
      var inp = item.querySelector(c);
      if (inp && b[c] && !inp.value) inp.value = b[c];
    });
  }

  function pintarDesplegables() {
    var filas = document.querySelectorAll('#puerta .puerta-fila');
    Array.prototype.forEach.call(filas, function (f) {
      var d = f.querySelector('.puerta-desplegable');
      var b = f.querySelector('.puerta-btn.resolver');
      if (!d) return;
      var esta = f.getAttribute('data-sol') === abierta;
      d.hidden = !esta;
      f.classList.toggle('abierta', esta);
      if (b) b.textContent = esta ? 'Resolver ▴' : 'Resolver ▾';
    });
  }

  // ── La casilla del 5/10 dentro del formulario de autorización ──
  // Sale solo si la persona TIENE FICHA y lo ha intentado hoy en la valla (un
  // bloqueo_rojo exige ficha). El 5/10 se excluía al «desconocido», pero desde el
  // 21/9 su ficha nace en la puerta y su intento de después es tan real como
  // cualquier otro (caso Youssef, 8/10: ficha a las 08:37, intento a las 08:57).
  function casillaHora(o, marcadas) {
    var s = o.sol;
    if (!s) return;
    var dni = normDni(o.dni);
    var it = dni ? intentosPorDni[dni] : null;
    var ref = o.ref || (it && it.ref) || '';
    if (!it || !ref) return;
    var item = s.nodo;
    if (item.querySelector('.puerta-hora')) return;   // ya la tiene (no se repintó)
    var acciones = item.querySelector('.sol-acciones');
    if (!acciones) return;
    var lab = document.createElement('label');
    lab.className = 'puerta-hora';
    lab.innerHTML =
      '<input type="checkbox" class="sol-hora-ok" data-ref="' + esc(ref) + '" data-hora="' + esc(it.iso) + '" data-texto="' + esc(it.hora) + '"' +
      (marcadas[s.id] ? ' checked' : '') + '>' +
      '<span>Al autorizar, dar por buena su entrada de las <strong>' + esc(it.hora) + '</strong>' +
      '<small>Es la hora a la que lo intentó en la valla. Márcalo solo si ya está trabajando: ' +
      'se registra como fichaje manual con tu nombre y no tendrá que bajar a fichar.</small></span>';
    item.insertBefore(lab, acciones);
  }

  // Hora del PRIMER intento denegado de hoy (bloqueo_rojo) por persona, con su
  // DNI para casar con la fila. Si falla devuelve vacío: sin dato no hay casilla.
  async function cargarIntentosHoy() {
    var obra = obraDeAhora();
    if (!obra || typeof sb === 'undefined') { intentosPorDni = {}; return; }
    var r = rangoHoy();
    try {
      var res = await sb.from('incidencias')
        .select('trabajador_id, created_at, trabajador:trabajador_id(dni)')
        .eq('obra_id', obra).eq('tipo', 'bloqueo_rojo')
        .gte('created_at', r.desde).lte('created_at', r.hasta)
        .order('created_at', { ascending: true });
      if (res.error || !res.data) { console.warn(TAG, 'intentos denegados:', res.error); intentosPorDni = {}; return; }
      var out = {};
      res.data.forEach(function (i) {
        var d = normDni(i.trabajador && i.trabajador.dni);
        if (!d || !i.trabajador_id || out[d]) return;
        out[d] = { ref: i.trabajador_id, iso: i.created_at, hora: hhmm(i.created_at) };
      });
      intentosPorDni = out;
    } catch (e) { console.warn(TAG, 'intentos denegados:', e); intentosPorDni = {}; }
  }

  // Se llama DESPUÉS de que la autorización haya salido bien. Si la casilla no
  // está marcada no hace nada. Devuelve el texto a añadir al mensaje.
  async function entradaAlAutorizar(item) {
    var chk = item ? item.querySelector('.sol-hora-ok') : null;
    if (!chk || !chk.checked || chk.disabled) return '';
    var ref = chk.getAttribute('data-ref') || '';
    var iso = chk.getAttribute('data-hora') || '';
    var h = chk.getAttribute('data-texto') || '';
    var obra = obraDeAhora();
    if (!ref || !iso || !obra) return ' ⚠ No se ha podido registrar su entrada (faltan datos). Hazlo desde Fichajes.';
    chk.disabled = true;   // una sola vez, pase lo que pase
    var r = await sb.rpc('registrar_fichaje_manual', {
      p_trabajador_id: ref, p_obra_id: obra, p_tipo: 'entrada', p_hora: iso,
      p_motivo: 'Entrada dada por buena por el jefe de obra al autorizar el acceso: ' +
                'intentó fichar en la valla a las ' + h + ' y se le denegó.'
    });
    if (r.error || !r.data || r.data.success !== true) {
      var causa = (r.data && r.data.error) || (r.error && r.error.message) || 'error desconocido';
      console.warn(TAG, 'registrar_fichaje_manual:', r.error || r.data);
      return ' ⚠ Pero NO se ha registrado su entrada de las ' + h + ': ' + causa + ' Hazlo desde Fichajes.';
    }
    try { if (typeof window.cargarPresencia === 'function') await window.cargarPresencia(); } catch (_) {}
    return ' ✓ Entrada registrada a las ' + h + ' (fichaje manual).';
  }

  // ───────────────────────────── pintar ─────────────────────────────
  function pintar() {
    var b = bloque();
    if (!b) return;
    // Lo que el jefe ya había marcado no se pierde al repintar.
    var marcadas = {};
    Array.prototype.forEach.call(document.querySelectorAll('#puerta .sol-hora-ok:checked'), function (c) {
      var it = c.closest('.sol-item');
      if (it) marcadas[(it.id || '').replace(/^sol-/, '')] = true;
    });

    var rs = recoger('sol', 'sol-lista', '.sol-item');
    var ri = recoger('ident', 'ident-lista', '.ident-item');
    var rb = recoger('bloq', 'bloqueos-lista', '.bloqueo-item');

    var sols = rs.items.map(leerSol);
    var idents = ri.items.map(leerIdent);
    var bloqs = rb.items.map(leerBloq);
    var personas = fusionar(sols, idents, bloqs);

    // Fallos de consulta: arriba del bloque, nunca escondidos.
    var cajaFallos = b.querySelector('.puerta-fallos');
    var fallosNodos = rs.fallos.concat(ri.fallos, rb.fallos);
    cajaFallos.innerHTML = '';
    fallosNodos.forEach(function (n) { cajaFallos.appendChild(n); });
    cajaFallos.style.display = fallosNodos.length ? '' : 'none';

    // Orden: pide paso · sin identificar · sin poder entrar / sin registrar ·
    // dentro sin identificar · ya puede entrar
    var dentro = dentroAhora();
    var filasDatos = personas.map(function (o) { return { o: o, cl: clasificar(o, dentro) }; });
    filasDatos.sort(function (a, b2) {
      if (a.cl.peso !== b2.cl.peso) return a.cl.peso - b2.cl.peso;
      return String(a.o.nombre).localeCompare(String(b2.o.nombre), 'es');
    });

    var cont = b.querySelector('.puerta-filas');
    cont.innerHTML = '';
    var pendientes = 0, dentroSinId = 0;
    filasDatos.forEach(function (fd) {
      var o = fd.o, cl = fd.cl;
      if (cl.clase === 'dentro') dentroSinId++;
      else if (cl.clase !== 'verde') pendientes++;
      var fila = document.createElement('article');
      fila.className = 'puerta-fila' + (cl.clase === 'verde' ? ' verde' : '') + (cl.clase === 'dentro' ? ' dentro' : '');
      fila.setAttribute('data-clave', o.clave);
      if (o.sol) fila.setAttribute('data-sol', o.sol.id);
      fila.innerHTML =
        '<div class="puerta-cabfila">' +
          '<div class="puerta-quien">' +
            '<div class="puerta-linea1"><span class="puerta-etq ' + cl.clase + '">' + cl.etq + '</span>' +
              '<strong>' + esc(o.nombre || '—') + '</strong>' +
              '<span class="puerta-meta">' + esc(o.dni || 'sin DNI') + ' · ' + esc(o.empresa || 'sin empresa') + '</span></div>' +
            '<div class="puerta-resumen' + (cl.clase === 'verde' ? ' verde' : '') + '">' + resumenDe(o, cl) + '</div>' +
          '</div>' +
          '<div class="puerta-acciones"></div>' +
        '</div>';
      botonesDe(o, fila);
      if (cl.etq === 'SIN REGISTRAR') pintarMismos(o, fila);
      if (o.sol) {
        var d = document.createElement('div');
        d.className = 'puerta-desplegable';
        d.hidden = true;
        d.appendChild(o.sol.nodo);
        // El texto de la página («se le crea la ficha en rojo») es de antes del
        // 21/9: la ficha ya nace en la puerta. Se dice lo que pasa de verdad.
        if (o.sol.nueva) {
          var c0 = o.sol.nodo.querySelector(':scope > .sol-causa:not(.sol-ecoordina)');
          if (c0 && /se le crea la ficha/i.test(c0.textContent)) {
            c0.innerHTML = 'Su ficha nació en la puerta, <strong>en rojo</strong> y sin documentación validada. ' +
              'Si le das paso es solo por hoy: mañana volverá a estar bloqueado hasta que e-Coordina lo ponga en regla.';
          }
        }
        casillaHora(o, marcadas);
        restaurarBorrador(o.sol.nodo, o.sol.id);
        fila.appendChild(d);
      }
      cont.appendChild(fila);
    });

    // Una solicitud resuelta se abre sola para que se lea el mensaje; si solo
    // hay una pendiente, también (un clic menos).
    var pendientesSol = filasDatos.filter(function (fd) { return fd.o.sol; });
    if (abierta && !pendientesSol.some(function (fd) { return fd.o.sol.id === abierta; })) abierta = null;
    if (!abierta) {
      var res = pendientesSol.filter(function (fd) { return fd.o.sol.resuelta; })[0];
      if (res) abierta = res.o.sol.id;
      else if (pendientesSol.length === 1 && !cerradas[pendientesSol[0].o.sol.id]) abierta = pendientesSol[0].o.sol.id;
    }
    pintarDesplegables();
    Object.keys(borradores).forEach(function (id) {
      if (!pendientesSol.some(function (fd) { return fd.o.sol.id === id; })) delete borradores[id];
    });

    var h3 = b.querySelector('.puerta-cab h3');
    var tit = b.querySelector('.puerta-titulo');
    var n = filasDatos.length;
    var cola = dentroSinId ? ' · ' + dentroSinId + ' dentro sin identificar' : '';
    if (pendientes) {
      tit.textContent = 'En la puerta · ' + pendientes + (pendientes === 1 ? ' persona espera tu decisión' : ' personas esperan tu decisión') + cola;
      h3.classList.remove('verde');
    } else if (dentroSinId) {
      tit.textContent = 'En la puerta · nadie parado' + cola;
      h3.classList.remove('verde');
    } else if (n) {
      tit.textContent = 'En la puerta · nadie pendiente de ti';
      h3.classList.add('verde');
    }
    b.classList.toggle('naranja', !pendientes);
    b.classList.toggle('oculto', !n && !fallosNodos.length);
    document.body.classList.add('puerta-activa');
  }

  function programar() {
    clearTimeout(temporizador);
    temporizador = setTimeout(function () {
      try { pintar(); }
      catch (e) {
        console.warn(TAG, 'no se ha podido pintar el bloque; se enseñan los paneles de siempre:', e);
        document.body.classList.remove('puerta-activa');
        var b = document.getElementById('puerta');
        if (b) b.classList.add('oculto');
      }
      try { recogerAvisos(); } catch (e2) { console.warn(TAG, 'avisos:', e2); }
    }, 40);
  }

  // ───────────────────────────── la franja de avisos ─────────────────────────────
  var AVISOS = ['ausentes-ecoordina', 'papeles-subcontratas', 'banner-ronda', 'banner-cierres',
                'banner-sin-rp', 'banner-rp-presente', 'banner-rp-baja', 'banner-rp-formacion',
                'banner-hab-caducidad', 'panel-avisos'];

  function franja() {
    var f = document.getElementById('puerta-avisos');
    if (f) return f;
    var stats = document.querySelector('.contenido .stats');
    if (!stats || !stats.parentNode) return null;
    f = document.createElement('div');
    f.id = 'puerta-avisos';
    f.className = 'oculto';
    f.innerHTML = '<div class="puerta-avisos-titulo">AVISOS DE HOY</div>';
    stats.parentNode.insertBefore(f, stats.nextSibling);
    return f;
  }

  function visible(n) {
    if (!n || n.classList.contains('oculto') || n.hidden) return false;
    try { if (getComputedStyle(n).display === 'none') return false; } catch (_) {}
    return !!texto(n);
  }

  function recogerAvisos() {
    var f = franja();
    if (!f) return;
    AVISOS.forEach(function (id) {
      var n = document.getElementById(id);
      if (n && n.parentNode !== f) f.appendChild(n);
    });
    var alguno = Array.prototype.some.call(f.children, function (c) {
      return !c.classList.contains('puerta-avisos-titulo') && visible(c);
    });
    f.classList.toggle('oculto', !alguno);
    if (!obsAvisos && window.MutationObserver) {
      var pendiente = null;
      obsAvisos = new MutationObserver(function () {
        clearTimeout(pendiente);
        pendiente = setTimeout(function () {
          var alg = Array.prototype.some.call(f.children, function (c) {
            return !c.classList.contains('puerta-avisos-titulo') && visible(c);
          });
          f.classList.toggle('oculto', !alg);
        }, 60);
      });
      obsAvisos.observe(f, { attributes: true, childList: true, subtree: true, characterData: true,
                             attributeFilter: ['class', 'style', 'hidden'] });
      // Los módulos que cuelgan sus banners después (ausentes, papeles) se recogen al aparecer.
      var main = document.querySelector('.main');
      if (main) {
        new MutationObserver(function (muts) {
          var hay = muts.some(function (m) {
            return Array.prototype.some.call(m.addedNodes, function (n) {
              return n.nodeType === 1 && AVISOS.indexOf(n.id) !== -1;
            });
          });
          if (hay) recogerAvisos();
        }).observe(main, { childList: true });
      }
    }
  }

  // ───────────────────────────── enganche ─────────────────────────────
  function envolverCargador(nombre, clave, antesDePintar) {
    var original = window[nombre];
    if (typeof original !== 'function' || original.__puerta) return false;
    var envuelta = async function () {
      if (clave === 'sol') { try { capturarBorradores(); } catch (_) {} }
      var r = await original.apply(this, arguments);
      try {
        if (antesDePintar) await antesDePintar();
        fresco[clave] = true;
        programar();
      } catch (e) { console.warn(TAG, nombre + ':', e); }
      return r;
    };
    envuelta.__puerta = true;
    window[nombre] = envuelta;
    return true;
  }

  function envolverResolucion() {
    var rs = window.resolverSol;
    if (typeof rs === 'function' && !rs.__puerta) {
      var envR = async function (id, accion, clave) {
        var r = await rs.apply(this, arguments);
        try {
          if (accion === 'autorizar') {
            var msg = document.getElementById('sol-msg-' + id);
            var item = document.getElementById('sol-' + id);
            if (msg && item && /\bok\b/.test(msg.className)) {
              var extra = await entradaAlAutorizar(item);
              if (extra) msg.textContent += extra;
            }
          }
        } catch (e) { console.warn(TAG, 'resolverSol:', e); }
        return r;
      };
      envR.__puerta = true;
      window.resolverSol = envR;
    }
    var cp = window.confirmarPapeles;
    if (typeof cp === 'function' && !cp.__puerta) {
      var envP = async function () {
        var r = await cp.apply(this, arguments);
        try {
          var pa = null;
          try { pa = (typeof papActual !== 'undefined') ? papActual : null; } catch (_) { pa = null; }
          var res = document.getElementById('pap-resultado');
          if (pa && pa.hecho && res && /^✓/.test(res.textContent || '')) {
            var item = document.getElementById('sol-' + pa.id);
            var extra = await entradaAlAutorizar(item);
            if (extra) {
              if (extra.indexOf('✓') !== -1) res.textContent = res.textContent.replace(' Ya puede fichar en la valla.', '');
              res.textContent += extra;
            }
          }
        } catch (e) { console.warn(TAG, 'confirmarPapeles:', e); }
        return r;
      };
      envP.__puerta = true;
      window.confirmarPapeles = envP;
    }
  }

  function iniciar() {
    try {
      var ruta = window.location.pathname;
      var pagina = ruta.split('/').pop() || '';
      if (ruta.indexOf('/jefe/') === -1 || (pagina !== 'index.html' && pagina !== '')) return;
      if (!document.getElementById('panel-sol') || !document.getElementById('panel-bloqueos')) return;
      estilos();
      var a = envolverCargador('cargarSolicitudes', 'sol', cargarIntentosHoy);
      var b = envolverCargador('cargarIdentidadesPendientes', 'ident', null);
      var c = envolverCargador('cargarBloqueos', 'bloq', null);
      if (!a || !b || !c) { console.warn(TAG, 'faltan funciones de la página; no se monta'); return; }
      envolverResolucion();
      // Si la página ya había pintado antes de que llegáramos, se recoge lo que haya.
      var hay = document.querySelector('#sol-lista .sol-item, #ident-lista .ident-item, #bloqueos-lista .bloqueo-item');
      if (hay) {
        fresco.sol = fresco.ident = fresco.bloq = true;
        cargarIntentosHoy().then(programar, programar);
      }
      recogerAvisos();
    } catch (e) {
      console.warn(TAG, 'no se ha podido montar:', e);
    }
  }

  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', iniciar);
  else iniciar();

  window.EnLaPuerta = { repintar: programar };
})();
