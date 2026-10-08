/* ============================================================
   js/marca-identidad.js — «🪪 IDENTIFICAR» EN LOS LISTADOS DE PRESENTES
   ------------------------------------------------------------
   8/10/2026 (Dani: «en el listado de personal tanto del encargado como
   del jefe de obra debería salir una marca que recuerde que hay que
   identificarlo»).

   DE DÓNDE VIENE
   Una persona registrada en la puerta nace con la identidad PENDIENTE
   («¿quién es?»), y eso no se cierra al dejarla pasar: solo lo cierra
   verificarla en persona con el documento o rechazarla (regla del
   23/9). Hasta hoy el único recordatorio era el bloque rojo de
   Presencia del jefe; con el «visto» de hoy esa fila desaparece, y el
   encargado nunca tuvo recordatorio. Lo lógico es que lo diga el sitio
   donde se mira a la gente: el listado de quién está dentro.

   QUÉ HACE
   Pinta una marca naranja «🪪 Identificar» al lado del nombre en:
     · jefe/index.html → tabla «Trabajadores en obra ahora»
       (#tabla-presencia; se casa por DNI, columna 2).
     · encargado/index.html → tarjetas de presentes
       (#lista-presencia .tarjeta-trab, data-trab de la tarjeta).
   Tocar la marca abre la ventana única de verificación
   (VerifIdentidad.identificar, la misma que en todas partes); al
   guardar, la BD cierra la identidad (trigger) y la marca se va sola.
   Los datos salen de identidades_pendientes_marca (BD, 8/10): TODOS los
   pendientes de la obra, con visto o sin él. El visto del jefe solo
   silencia su bloque; aquí no silencia nada: para eso es el recordatorio.

   CÓMO SE ENGANCHA
   No envuelve nada (en el encargado las funciones viven dentro de un
   cierre): observa el contenedor del listado y, cada vez que se
   repinta, vuelve a poner las marcas. La lista de pendientes se pide
   como mucho una vez por minuto y por obra. Si la consulta falla, no se
   pinta nada y se dice en consola: una marca falsa es peor que ninguna.

   CANDADO: solo en /jefe/ index.html y /encargado/ index.html.
   PARA DESHACERLO: quitar `cargar('marca-identidad.js')` de
   js/marca-portium.js (una línea en el bloque del jefe y otra en el del
   encargado). Nada más depende de este archivo.
   ============================================================ */
(function () {
  'use strict';

  var TAG = '[marca-identidad]';
  var cache = { obra: null, en: 0, personas: [] };
  var pidiendo = null;
  var temporizador = null;
  var modo = null;   // 'jefe' | 'encargado'

  function normDni(d) { return String(d || '').toUpperCase().replace(/[^A-Z0-9]/g, ''); }
  function esc(t) {
    return String(t == null ? '' : t).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;')
      .replace(/"/g, '&quot;').replace(/'/g, '&#39;');
  }
  function obraDeAhora() {
    try { if (modo === 'jefe' && typeof obraActual !== 'undefined' && obraActual) return obraActual; } catch (_) {}
    try { if (modo === 'encargado' && typeof obraActualId !== 'undefined' && obraActualId) return obraActualId; } catch (_) {}
    try { return window.obraActual || window.obraActualId || ''; } catch (_) { return ''; }
  }

  function estilos() {
    if (document.getElementById('mi-css')) return;
    var s = document.createElement('style');
    s.id = 'mi-css';
    s.textContent = [
      '.mi-marca{display:inline-flex;align-items:center;gap:4px;margin-left:8px;padding:2px 8px;border-radius:6px;',
      'font-size:11px;font-weight:800;letter-spacing:.03em;white-space:nowrap;cursor:pointer;vertical-align:middle;',
      'background:rgba(255,152,0,.16);border:1px solid rgba(255,152,0,.6);color:#e07b00;font-family:inherit;line-height:1.4}',
      '.mi-marca:hover{background:rgba(255,152,0,.28)}',
      '.mi-marca:disabled{opacity:.5;cursor:default}',
      // Fondo oscuro del jefe: el naranja de la casa.
      '#tabla-presencia .mi-marca{color:var(--naranja,#ff9800)}',
      // Tarjeta del encargado: el nombre recorta a dos líneas; la marca va debajo del nombre.
      '.tarjeta-nombre .mi-marca{margin-left:0;margin-top:3px;display:inline-flex}'
    ].join('');
    document.head.appendChild(s);
  }

  // ── Datos ──
  async function pendientes(forzar) {
    var obra = obraDeAhora();
    if (!obra || typeof sb === 'undefined') return [];
    var ahora = Date.now();
    if (!forzar && cache.obra === obra && (ahora - cache.en) < 55000) return cache.personas;
    if (pidiendo) return pidiendo;
    pidiendo = (async function () {
      try {
        var r = await sb.rpc('identidades_pendientes_marca', { p_obra_id: obra });
        if (r.error || !r.data || r.data.ok !== true) {
          console.warn(TAG, 'identidades_pendientes_marca:', r.error || r.data);
          return cache.obra === obra ? cache.personas : [];
        }
        cache = { obra: obra, en: Date.now(), personas: r.data.personas || [] };
        return cache.personas;
      } catch (e) {
        console.warn(TAG, e);
        return [];
      } finally { pidiendo = null; }
    })();
    return pidiendo;
  }

  // ── La marca ──
  function marca(p) {
    var b = document.createElement('button');
    b.type = 'button';
    b.className = 'mi-marca';
    b.setAttribute('data-mi', p.trabajador_id);
    b.title = 'Registrado en la puerta y nadie le ha visto el documento todavía. Toca para identificarlo en persona.';
    b.innerHTML = '🪪 <span>Identificar</span>';
    b.addEventListener('click', function (ev) {
      ev.preventDefault(); ev.stopPropagation();
      identificar(p, b);
    });
    return b;
  }

  async function identificar(p, btn) {
    var obra = obraDeAhora();
    if (!obra) return;
    btn.disabled = true;
    try {
      if (modo === 'encargado' && typeof window.clicIdentEnc === 'function') {
        // La ventana del encargado ya existe y sabe su tema: se reutiliza.
        await window.clicIdentEnc(p.trabajador_id, btn);
      } else if (window.VerifIdentidad && typeof VerifIdentidad.identificar === 'function') {
        await VerifIdentidad.identificar(sb, p.trabajador_id, obra, {
          tema: modo === 'jefe' ? 'oscuro' : 'claro',
          nombre: p.nombre || '', empresa: p.empresa || '',
          onGuardado: function () {
            cache.en = 0;
            try { if (typeof window.cargarIdentidadesPendientes === 'function') window.cargarIdentidadesPendientes(); } catch (_) {}
            programar(true);
          }
        });
      } else {
        alert('La página tiene una versión antigua guardada. Recarga la página.');
      }
    } finally {
      btn.disabled = false;
      programar(true);
    }
  }

  // ── Pintar ──
  async function pintar(forzar) {
    var personas = await pendientes(forzar);
    var porDni = {}, porId = {};
    personas.forEach(function (p) { if (p.dni) porDni[normDni(p.dni)] = p; porId[p.trabajador_id] = p; });

    if (modo === 'jefe') {
      var filas = document.querySelectorAll('#tabla-presencia tbody tr');
      Array.prototype.forEach.call(filas, function (tr) {
        var tds = tr.querySelectorAll('td');
        if (tds.length < 2) return;
        var p = porDni[normDni(tds[1].textContent)];
        var ya = tr.querySelector('.mi-marca');
        if (!p) { if (ya) ya.remove(); return; }
        if (ya) return;
        var hueco = tr.querySelector('.celda-nombre > div') || tds[0];
        hueco.appendChild(marca(p));
      });
    } else {
      var tarjetas = document.querySelectorAll('#lista-presencia .tarjeta-trab');
      Array.prototype.forEach.call(tarjetas, function (card) {
        var ini = card.querySelector('[data-trab]');
        var id = ini ? ini.getAttribute('data-trab') : '';
        var p = id ? porId[id] : null;
        var ya = card.querySelector('.mi-marca');
        if (!p) { if (ya) ya.remove(); return; }
        if (ya) return;
        var hueco = card.querySelector('.tarjeta-nombre') || card;
        hueco.appendChild(marca(p));
      });
    }
  }

  function programar(forzar) {
    clearTimeout(temporizador);
    temporizador = setTimeout(function () {
      pintar(forzar).catch(function (e) { console.warn(TAG, e); });
    }, 80);
  }

  function iniciar() {
    try {
      var ruta = window.location.pathname;
      var pagina = ruta.split('/').pop() || '';
      if (pagina !== 'index.html' && pagina !== '') return;
      if (ruta.indexOf('/jefe/') !== -1) modo = 'jefe';
      else if (ruta.indexOf('/encargado/') !== -1) modo = 'encargado';
      else return;
      var cont = document.getElementById(modo === 'jefe' ? 'tabla-presencia' : 'lista-presencia');
      if (!cont) return;
      estilos();
      // Cada repintado del listado vuelve a poner las marcas (se observa el
      // contenedor, no la función que lo pinta).
      new MutationObserver(function (muts) {
        // Lo que añade este mismo módulo no cuenta.
        var ajeno = muts.some(function (m) {
          return Array.prototype.some.call(m.addedNodes, function (n) {
            return !(n.nodeType === 1 && n.classList && n.classList.contains('mi-marca'));
          }) || m.removedNodes.length;
        });
        if (ajeno) programar(false);
      }).observe(cont, { childList: true, subtree: true });
      programar(false);
      window.MarcaIdentidad = { repintar: function () { programar(true); } };
    } catch (e) {
      console.warn(TAG, 'no se ha podido montar:', e);
    }
  }

  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', iniciar);
  else iniciar();
})();
