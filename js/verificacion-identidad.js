/**
 * verificacion-identidad.js — Módulo compartido de verificación de identidad
 *
 * Uso:  cargar ../js/verificacion-identidad.js con una etiqueta script (después de foto-identidad.js)
 *
 * Expone window.VerifIdentidad con:
 *   .IDIOMAS   — array de { code, label }
 *   .METODOS   — { dni: '...', dni_tpc: '...' }
 *   .abrir(sb, trabajadorId, obraId, opts)  — abre el modal
 *   .guardar(sb, opts)                      — guarda desde el modal
 *   .cerrar()                               — cierra el modal
 *   .selIdioma(btn)                         — marca el botón de idioma
 *
 * opts (en .abrir):
 *   esc(texto)       — función de escape HTML de la página
 *   onGuardado(tid)  — callback tras guardar con éxito
 *
 * El HTML del modal (#vfm-overlay, #vfm-cuerpo, #vfm-titulo, #vfm-msg,
 * #vfm-btns-guardar, #vfm-btn-guardar, #vfm-informado, #vfm-idiomas-wrap)
 * ya debe existir en la página. Este módulo no lo crea: cada pantalla
 * tiene su propio bloque HTML con su propio CSS.
 */
(function() {
  'use strict';

  var IDIOMAS = [
    { code: 'es', label: 'Español' },
    { code: 'ca', label: 'Català' },
    { code: 'en', label: 'English' },
    { code: 'ro', label: 'Română' },
    { code: 'ar', label: 'العربية' },
    { code: 'ur', label: 'اردو' },
    { code: 'pa', label: 'ਪੰਜਾਬੀ' }
  ];

  var METODOS = { dni: 'DNI/NIE físico', dni_tpc: 'App TPC', doc_foto: 'Documento con foto' };

  // Estado interno del modal
  var _trabajadorId = null;
  var _obraId = null;
  var _idiomaSel = null;
  var _opts = {};

  function _esc(txt) {
    // Usa el esc() de la página si se proporcionó; si no, uno básico.
    if (_opts.esc) return _opts.esc(txt);
    var d = document.createElement('div');
    d.textContent = String(txt == null ? '' : txt);
    return d.innerHTML;
  }

  /**
   * Abre el modal de verificación para un trabajador.
   * @param {object} sb  — cliente Supabase
   * @param {string} trabajadorId
   * @param {string} obraId — puede ser null; si lo es, el modal avisa
   * @param {object} opts — { esc, onGuardado }
   */
  async function abrir(sb, trabajadorId, obraId, opts) {
    _trabajadorId = trabajadorId;
    _obraId = obraId;
    _idiomaSel = null;
    _opts = opts || {};

    var tituloEl = document.getElementById('vfm-titulo');
    var msgEl = document.getElementById('vfm-msg');
    var cuerpoEl = document.getElementById('vfm-cuerpo');
    var btnsEl = document.getElementById('vfm-btns-guardar');
    var overlayEl = document.getElementById('vfm-overlay');

    msgEl.textContent = '';
    msgEl.className = 'vfm-msg';

    try {
      var res = await sb.rpc('historial_verificacion_identidad', { p_trabajador_id: trabajadorId });
      var data = res.data;
      var error = res.error;
      if (error || !data || !data.ok) throw new Error((data && data.error) || 'Error');

      var lista = data.verificaciones || [];
      tituloEl.textContent = lista.length ? 'Verificación de identidad' : 'Registrar verificación';

      var html = '';
      if (lista.length) {
        html += '<span class="vfm-label">Verificaciones registradas</span>';
        html += lista.map(function(v) {
          var fecha = new Date(v.verificado_en).toLocaleString('es-ES', {
            day: '2-digit', month: '2-digit', year: 'numeric',
            hour: '2-digit', minute: '2-digit', timeZone: 'Europe/Madrid'
          });
          return '<div class="vfm-h-item">' +
            '📅 <strong>' + _esc(fecha) + '</strong> · 👤 <strong>' + _esc(v.verificado_por || '—') + '</strong><br>' +
            '🏗️ ' + _esc(v.obra || '—') + ' · 🪪 ' + _esc(METODOS[v.metodo] || v.metodo || '—') + '<br>' +
            '📄 Hoja: <strong>' + (v.informado ? '✓ ' + _esc(v.idioma_informacion || '') : '✗ No entregada') + '</strong>' +
            '</div>';
        }).join('');
        html += '<hr class="vfm-sep"><span class="vfm-label">Añadir nueva verificación</span>';
      }

      html += '<div class="vfm-opciones">' +
        '<label class="vfm-opcion"><input type="radio" name="vfm-metodo" value="dni"> <span>🪪 DNI / NIE físico (documento en mano)</span></label>' +
        '<label class="vfm-opcion"><input type="radio" name="vfm-metodo" value="dni_tpc"> <span>📱 App TPC (verificación digital)</span></label>' +
        '</div>';

      html += '<div class="vfm-check-fila">' +
        '<input type="checkbox" id="vfm-informado">' +
        '<label class="vfm-check-txt" for="vfm-informado">He entregado y explicado la <strong>hoja informativa de protección de datos</strong></label>' +
        '</div>' +
        '<div id="vfm-idiomas-wrap" style="display:none">' +
        '<span class="vfm-label" style="margin:8px 0 4px;display:block">Idioma en que se explicó</span>' +
        '<div class="vfm-idiomas">' +
        IDIOMAS.map(function(i) {
          return '<button class="vfm-idioma" data-code="' + i.code + '" onclick="VerifIdentidad.selIdioma(this)">' + i.label + '</button>';
        }).join('') +
        '</div></div>' +
        '<button class="vfm-hoja-btn" onclick="window.open(\'../assets/hoja-informativa.html\',\'_blank\')">📄 Ver hoja informativa (7 idiomas)</button>';

      cuerpoEl.innerHTML = html;

      if (obraId) {
        btnsEl.style.display = 'flex';
      } else {
        btnsEl.style.display = 'none';
        msgEl.className = 'vfm-msg mal';
        msgEl.textContent = 'Selecciona una obra primero.';
      }

      var chk = document.getElementById('vfm-informado');
      if (chk) {
        chk.addEventListener('change', function() {
          document.getElementById('vfm-idiomas-wrap').style.display = this.checked ? 'block' : 'none';
          if (!this.checked) {
            _idiomaSel = null;
            document.querySelectorAll('.vfm-idioma').forEach(function(b) { b.classList.remove('sel'); });
          }
        });
      }

      overlayEl.classList.remove('oculto');
    } catch (e) {
      alert('No se pudo cargar la verificación. ' + e.message);
    }
  }

  /**
   * Guarda la verificación desde el modal abierto.
   * @param {object} sb — cliente Supabase
   */
  async function guardar(sb) {
    var metodoEl = document.querySelector('input[name="vfm-metodo"]:checked');
    var chk = document.getElementById('vfm-informado');
    var informado = chk && chk.checked;
    var msg = document.getElementById('vfm-msg');
    msg.className = 'vfm-msg';

    if (!metodoEl) { msg.className = 'vfm-msg mal'; msg.textContent = 'Elige el método de verificación.'; return; }
    if (informado && !_idiomaSel) { msg.className = 'vfm-msg mal'; msg.textContent = 'Indica el idioma en que se explicó la hoja.'; return; }
    if (!_obraId) { msg.className = 'vfm-msg mal'; msg.textContent = 'No se puede determinar la obra.'; return; }

    var btn = document.getElementById('vfm-btn-guardar');
    btn.disabled = true;
    msg.textContent = 'Guardando…';

    var res = await sb.rpc('verificar_identidad', {
      p_trabajador_id: _trabajadorId,
      p_obra_id: _obraId,
      p_metodo: metodoEl.value,
      p_informado: !!informado,
      p_idioma: informado ? _idiomaSel : null
    });
    var data = res.data;
    var error = res.error;

    if (error || !data || !data.ok) {
      msg.className = 'vfm-msg mal';
      msg.textContent = (data && data.error) || 'Error al guardar.';
      btn.disabled = false;
      return;
    }

    msg.className = 'vfm-msg ok';
    msg.textContent = '✓ Verificación registrada.';

    if (_opts.onGuardado) _opts.onGuardado(_trabajadorId);
    setTimeout(cerrar, 1000);
  }

  function selIdioma(btn) {
    document.querySelectorAll('.vfm-idioma').forEach(function(b) { b.classList.remove('sel'); });
    btn.classList.add('sel');
    _idiomaSel = btn.dataset.code;
  }

  function cerrar() {
    document.getElementById('vfm-overlay').classList.add('oculto');
    _trabajadorId = null;
    _obraId = null;
    _idiomaSel = null;
    _opts = {};
  }

  // ════════════════════════════════════════════════════════════════
  // VENTANA ÚNICA «Identificar persona» (17/9/2026, Dani)
  // ════════════════════════════════════════════════════════════════
  // Antes eran dos botones (🪪 verificar y 📷 foto) para un mismo gesto,
  // y la verificación pedía elegir DNI físico / App TPC e idioma de una
  // hoja informativa. Ahora: foto + dos casillas + un Guardar.
  //  · «He comprobado su identidad con un documento con foto» → metodo
  //    'doc_foto' (vale DNI, NIE, pasaporte...).
  //  · «Le he informado de que puede consultar la protección de datos al
  //    escanear el QR» → informado = true, sin idioma (el panel de la valla
  //    está en 7 idiomas). La RPC la EXIGE para doc_foto (segundo pestillo).
  // Orden al guardar: primero la verificación, después la foto, porque
  // registrar_foto_identidad no acepta foto sin verificación.
  // AUTÓNOMA: crea su HTML y su CSS con colores fijos (tema claro u oscuro).
  // Necesita js/foto-identidad.js (window.FI) cargado e inicializado.
  // La API vieja (abrir/guardar/cerrar) se queda para las páginas que aún
  // no se han actualizado; se retira cuando ninguna la use.
  //
  // Uso:
  //   VerifIdentidad.identificar(sb, trabajadorId, obraId, {
  //     tema: 'claro' | 'oscuro',
  //     nombre: 'NOMBRE', empresa: 'Empresa',     // opcionales, cabecera
  //     onGuardado: function (tid, r) { ... }     // r = {verificado, foto}
  //   });

  var TXT_METODO = {
    doc_foto: 'documento con foto',
    dni: 'DNI/NIE físico',
    dni_tpc: 'App TPC'
  };

  var _estilosUnica = false;
  function estilosUnica() {
    if (_estilosUnica) return;
    _estilosUnica = true;
    var s = document.createElement('style');
    s.textContent =
      '.viu-fondo{position:fixed;inset:0;background:rgba(0,0,0,.5);display:flex;'
    +   'align-items:center;justify-content:center;z-index:9998;padding:1rem}'
    + '.viu-caja{background:#fff;color:#333;border-radius:10px;padding:1.1rem;'
    +   'max-width:380px;width:100%;max-height:92vh;overflow-y:auto;box-sizing:border-box;font-family:inherit}'
    + '.viu-cab{display:flex;justify-content:space-between;align-items:flex-start;gap:8px}'
    + '.viu-cab h3{margin:0;font-size:1.05rem;color:#333}'
    + '.viu-x{background:none;border:0;font-size:1.2rem;line-height:1;cursor:pointer;color:#888;padding:0 2px}'
    + '.viu-sub{margin:.15rem 0 .8rem;font-size:.86rem;color:#777}'
    + '.viu-foto{width:100%;max-height:260px;object-fit:contain;border-radius:8px;'
    +   'background:#f3f3f3;display:block;margin-bottom:.7rem}'
    + '.viu-hueco{margin-bottom:.4rem}'
    + '.viu-check{display:flex;gap:10px;align-items:flex-start;font-size:.93rem;'
    +   'line-height:1.35;margin:.7rem 0;cursor:pointer}'
    + '.viu-check input{width:20px;height:20px;margin:1px 0 0;flex:0 0 auto;accent-color:#fb8c00}'
    + '.viu-ok{background:#e8f5e9;color:#1b5e20;border-radius:6px;padding:.55rem .7rem;'
    +   'font-size:.86rem;line-height:1.35;margin:.2rem 0 .4rem}'
    + '.viu-msg{font-size:.86rem;min-height:1.1em;margin-top:.5rem}'
    + '.viu-msg.mal{color:#c62828}.viu-msg.bien{color:#2e7d32}'
    + '.viu-btns{display:flex;gap:8px;margin-top:.8rem}'
    + '.viu-btns button{flex:1;padding:.6rem;border:0;border-radius:6px;font-family:inherit;'
    +   'font-size:.93rem;cursor:pointer;background:#eee;color:#555}'
    + '.viu-btns button.viu-prim{background:#fb8c00;color:#fff}'
    + '.viu-btns button:disabled{opacity:.6;cursor:default}'
    + '.viu-caja.viu-oscuro{background:#1a1d24;color:#e8eaf0;border:1px solid #2e3340}'
    + '.viu-oscuro .viu-cab h3{color:#e8eaf0}'
    + '.viu-oscuro .viu-sub{color:#9aa3b2}'
    + '.viu-oscuro .viu-foto{background:#22262f}'
    + '.viu-oscuro .viu-ok{background:#1e3a26;color:#a5d6a7}'
    + '.viu-oscuro .viu-msg.mal{color:#ef9a9a}.viu-oscuro .viu-msg.bien{color:#a5d6a7}'
    + '.viu-oscuro .viu-btns button{background:#2a2f3a;color:#ccd2de}'
    + '.viu-oscuro .viu-btns button.viu-prim{background:#fb8c00;color:#fff}';
    document.head.appendChild(s);
  }

  function escU(t) {
    var d = document.createElement('div');
    d.textContent = String(t == null ? '' : t);
    return d.innerHTML;
  }

  function fechaCorta(iso) {
    try {
      return new Date(iso).toLocaleDateString('es-ES', {
        day: '2-digit', month: '2-digit', year: 'numeric', timeZone: 'Europe/Madrid'
      });
    } catch (e) { return '—'; }
  }

  function textoVerificacion(v) {
    var partes = ['Identificado el ' + fechaCorta(v.verificado_en)];
    if (v.verificado_por) partes[0] += ' por ' + v.verificado_por;
    if (v.obra) partes.push(v.obra);
    partes.push(TXT_METODO[v.metodo] || v.metodo || '—');
    if (v.metodo === 'doc_foto') partes.push(v.informado ? 'informado del QR' : 'sin informar');
    else partes.push(v.informado ? 'hoja informativa entregada' : 'sin hoja informativa');
    return partes.join(' · ');
  }

  async function identificar(sb, trabajadorId, obraId, opts) {
    opts = opts || {};
    estilosUnica();

    if (!window.FI || typeof FI.montarCaptura !== 'function') {
      alert('Falta el módulo de fotos. Recarga la página.');
      return;
    }
    if (!obraId) {
      alert('Selecciona una obra primero.');
      return;
    }

    // Tres lecturas en paralelo. Ninguna es bloqueante salvo el historial:
    // sin él no sabemos si ya está verificado.
    var rHist, rObra, rFoto;
    try {
      var res = await Promise.all([
        sb.rpc('historial_verificacion_identidad', { p_trabajador_id: trabajadorId }),
        sb.from('obras').select('captura_foto_activa').eq('id', obraId).maybeSingle(),
        (typeof FI.ver === 'function') ? FI.ver(trabajadorId) : Promise.resolve({ hay_foto: false, url: null })
      ]);
      rHist = res[0]; rObra = res[1]; rFoto = res[2] || { hay_foto: false, url: null };
    } catch (e) {
      alert('No se ha podido abrir la identificación. ' + (e && e.message ? e.message : ''));
      return;
    }
    if (rHist.error || !rHist.data || rHist.data.ok !== true) {
      alert('No se ha podido abrir la identificación. ' + ((rHist.data && rHist.data.error) || ''));
      return;
    }

    var lista = rHist.data.verificaciones || [];
    var ultima = lista.length ? lista[0] : null;
    // captura: true = encendida · false = apagada · null = no se ha podido leer.
    // Si no se sabe, se enseña la cámara pero la foto no se exige (si la
    // obra la tuviera apagada, la BD lo diría al guardar).
    var captura = (rObra && !rObra.error && rObra.data) ? (rObra.data.captura_foto_activa === true) : null;
    var hayCamara = captura !== false;
    var fotoObligatoria = captura === true;

    var estado = { verificado: !!ultima, foto: !!rFoto.hay_foto };
    var mando = null;

    var fondo = document.createElement('div');
    fondo.className = 'viu-fondo';
    var caja = document.createElement('div');
    caja.className = 'viu-caja' + (opts.tema === 'oscuro' ? ' viu-oscuro' : '');
    fondo.appendChild(caja);

    var sub = [opts.nombre, opts.empresa].filter(Boolean).join(' · ');

    function cerrarU() { fondo.remove(); }

    // A propósito NO se cierra pulsando fuera: un dedo torpe no puede
    // tirar una foto ya hecha. Se cierra con ✕ o Cancelar/Cerrar.

    function pintar(modoCamara) {
      var html = '<div class="viu-cab"><h3>Identificar persona</h3>'
        + '<button class="viu-x" data-a="cerrar" aria-label="Cerrar">✕</button></div>'
        + '<p class="viu-sub">' + escU(sub || ' ') + '</p>';

      if (rFoto.hay_foto && rFoto.url && !modoCamara) {
        html += '<img class="viu-foto" alt="Foto de identidad" src="' + escU(rFoto.url) + '">';
      }

      if (estado.verificado) {
        // ── B: ya identificada ──
        html += '<div class="viu-ok">✓ ' + escU(ultima ? textoVerificacion(ultima) : 'Identidad verificada') + '</div>';
        if (hayCamara && modoCamara) {
          html += '<div class="viu-hueco"></div>';
        }
        html += '<div class="viu-msg"></div><div class="viu-btns">';
        if (hayCamara && modoCamara) {
          html += '<button data-a="cerrar">Cancelar</button>'
                + '<button class="viu-prim" data-a="guardar-foto">Guardar foto</button>';
        } else if (hayCamara) {
          html += '<button data-a="camara">📷 ' + (estado.foto ? 'Rehacer foto' : 'Hacer foto') + '</button>'
                + '<button data-a="cerrar">Cerrar</button>';
        } else {
          html += '<button data-a="cerrar">Cerrar</button>';
        }
        html += '</div>';
      } else {
        // ── A: sin identificar ──
        if (hayCamara) html += '<div class="viu-hueco"></div>';
        html += '<label class="viu-check"><input type="checkbox" class="viu-c-doc">'
              + '<span>He comprobado su identidad con un <strong>documento con foto</strong> (DNI, NIE, pasaporte…)</span></label>'
              + '<label class="viu-check"><input type="checkbox" class="viu-c-qr">'
              + '<span>Le he informado de que puede consultar la <strong>protección de datos</strong> al escanear el QR de la valla</span></label>'
              + '<div class="viu-msg"></div>'
              + '<div class="viu-btns"><button data-a="cerrar">Cancelar</button>'
              + '<button class="viu-prim" data-a="guardar">Guardar</button></div>';
      }

      caja.innerHTML = html;
      var hueco = caja.querySelector('.viu-hueco');
      mando = hueco ? FI.montarCaptura(hueco, {}) : null;
    }

    function msg(texto, clase) {
      var m = caja.querySelector('.viu-msg');
      if (!m) return;
      m.className = 'viu-msg' + (clase ? ' ' + clase : '');
      m.textContent = texto || '';
    }

    function botones(activos) {
      caja.querySelectorAll('.viu-btns button, .viu-x').forEach(function (b) { b.disabled = !activos; });
    }

    function avisar() {
      if (typeof opts.onGuardado === 'function') {
        try { opts.onGuardado(trabajadorId, { verificado: estado.verificado, foto: estado.foto }); }
        catch (e) { console.warn('[identificar] onGuardado:', e); }
      }
    }

    async function subirFoto() {
      var r = await FI.guardar(trabajadorId, obraId, mando.blob);
      if (!r || !r.ok) return { ok: false, error: (r && r.error) || 'No se ha podido guardar la foto.' };
      estado.foto = true;
      return { ok: true };
    }

    caja.addEventListener('click', async function (ev) {
      var b = ev.target.closest('[data-a]');
      if (!b || b.disabled) return;
      var accion = b.getAttribute('data-a');

      if (accion === 'cerrar') { cerrarU(); return; }
      if (accion === 'camara') { pintar(true); return; }

      if (accion === 'guardar-foto') {
        if (!mando || !mando.blob) { msg('Primero haz o sube la foto.', 'mal'); return; }
        botones(false); msg('Guardando…');
        var rf = await subirFoto();
        if (!rf.ok) { botones(true); msg(rf.error, 'mal'); return; }
        msg('✓ Foto guardada.', 'bien');
        avisar();
        setTimeout(cerrarU, 900);
        return;
      }

      if (accion === 'guardar') {
        var cDoc = caja.querySelector('.viu-c-doc');
        var cQr = caja.querySelector('.viu-c-qr');
        if (hayCamara && fotoObligatoria && (!mando || !mando.blob)) { msg('Falta la foto.', 'mal'); return; }
        if (!cDoc || !cDoc.checked) { msg('Marca que has comprobado su identidad con un documento con foto.', 'mal'); return; }
        if (!cQr || !cQr.checked) { msg('Marca que le has informado de la protección de datos del QR.', 'mal'); return; }

        botones(false); msg('Guardando…');

        var rv;
        try {
          rv = await sb.rpc('verificar_identidad', {
            p_trabajador_id: trabajadorId,
            p_obra_id: obraId,
            p_metodo: 'doc_foto',
            p_informado: true,
            p_idioma: null
          });
        } catch (e) { rv = { error: e }; }
        if (rv.error || !rv.data || rv.data.ok !== true) {
          botones(true);
          msg((rv.data && rv.data.error) || 'No se ha podido guardar la identificación.', 'mal');
          return;
        }
        estado.verificado = true;
        ultima = {
          verificado_en: new Date().toISOString(),
          verificado_por: rv.data.verificado_por, obra: null,
          metodo: 'doc_foto', informado: true
        };

        if (mando && mando.blob) {
          var rf2 = await subirFoto();
          if (!rf2.ok) {
            // La identificación YA está guardada. Se avisa a la página y se
            // pasa a la vista B con la cámara abierta, para reintentar solo la foto.
            avisar();
            pintar(true);
            msg('Identificación guardada, pero la foto no (' + String(rf2.error).replace(/[.\s]+$/, '') + '). Vuelve a intentarlo.', 'mal');
            return;
          }
        }
        msg(estado.foto ? '✓ Persona identificada.' : '✓ Identificación guardada.', 'bien');
        avisar();
        setTimeout(cerrarU, 900);
      }
    });

    pintar(false);
    document.body.appendChild(fondo);
  }

  window.VerifIdentidad = {
    IDIOMAS: IDIOMAS,
    METODOS: METODOS,
    abrir: abrir,
    guardar: guardar,
    cerrar: cerrar,
    selIdioma: selIdioma,
    identificar: identificar
  };
})();
