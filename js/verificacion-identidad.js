/**
 * verificacion-identidad.js — Módulo compartido de verificación de identidad
 *
 * Uso:  <script src="../js/verificacion-identidad.js"></script>
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

  var METODOS = { dni: 'DNI/NIE físico', dni_tpc: 'App TPC' };

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

  window.VerifIdentidad = {
    IDIOMAS: IDIOMAS,
    METODOS: METODOS,
    abrir: abrir,
    guardar: guardar,
    cerrar: cerrar,
    selIdioma: selIdioma
  };
})();
