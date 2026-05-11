// =====================================================================
// js/auto-logout.js — Auto-logout por inactividad (M4)
//
// Uso:
//   <script src="../js/auto-logout.js"></script>
//   ...una vez tengas el cliente sb inicializado:
//   AutoLogout.init(sb);
//
// Comportamiento:
//   - 28 min sin actividad → banner de aviso con cuenta atrás de 2 min
//   - 30 min sin actividad → signOut + redirect a la raíz del login
//   - Cualquier evento de usuario resetea el contador
// =====================================================================

window.AutoLogout = (function () {

  const TIEMPO_AVISO_MS  = 28 * 60 * 1000; // 28 minutos
  const TIEMPO_LOGOUT_MS = 30 * 60 * 1000; // 30 minutos

  let sbCliente       = null;
  let timerAviso      = null;
  let timerLogout     = null;
  let timerCuentaAtras = null;
  let bannerEl        = null;

  // ── Crear el banner ────────────────────────────────────────────────
  function crearBanner() {
    if (document.getElementById('autologout-banner')) return;

    const style = document.createElement('style');
    style.textContent = `
      #autologout-banner {
        position: fixed;
        bottom: 0; left: 0; right: 0;
        z-index: 9999;
        background: #1a1a2e;
        color: white;
        padding: 14px 20px;
        display: flex;
        align-items: center;
        justify-content: space-between;
        gap: 16px;
        font-family: sans-serif;
        font-size: 14px;
        box-shadow: 0 -2px 12px rgba(0,0,0,0.3);
        transform: translateY(100%);
        transition: transform 0.3s ease;
      }
      #autologout-banner.visible {
        transform: translateY(0);
      }
      #autologout-banner .al-texto {
        flex: 1;
      }
      #autologout-banner .al-segundos {
        font-weight: 700;
        color: #ffd54f;
      }
      #autologout-banner button {
        background: white;
        color: #1a1a2e;
        border: none;
        padding: 8px 16px;
        border-radius: 6px;
        font-size: 13px;
        font-weight: 700;
        cursor: pointer;
        white-space: nowrap;
        flex-shrink: 0;
      }
      #autologout-banner button:hover {
        background: #f0f0f0;
      }
    `;
    document.head.appendChild(style);

    bannerEl = document.createElement('div');
    bannerEl.id = 'autologout-banner';
    bannerEl.innerHTML = `
      <div class="al-texto">
        ⏱ Tu sesión se cerrará por inactividad en
        <span class="al-segundos" id="al-cuenta">2:00</span>
      </div>
      <button id="al-btn-continuar">Seguir conectado</button>
    `;
    document.body.appendChild(bannerEl);

    document.getElementById('al-btn-continuar').addEventListener('click', () => {
      resetear();
    });
  }

  // ── Mostrar / ocultar banner ───────────────────────────────────────
  function mostrarBanner() {
    if (!bannerEl) crearBanner();
    bannerEl = document.getElementById('autologout-banner');
    bannerEl.classList.add('visible');

    // Cuenta atrás visual de 2 minutos (120 segundos)
    let segs = 120;
    actualizarCuenta(segs);
    if (timerCuentaAtras) clearInterval(timerCuentaAtras);
    timerCuentaAtras = setInterval(() => {
      segs--;
      actualizarCuenta(segs);
      if (segs <= 0) clearInterval(timerCuentaAtras);
    }, 1000);
  }

  function ocultarBanner() {
    if (bannerEl) bannerEl.classList.remove('visible');
    if (timerCuentaAtras) { clearInterval(timerCuentaAtras); timerCuentaAtras = null; }
  }

  function actualizarCuenta(segs) {
    const el = document.getElementById('al-cuenta');
    if (!el) return;
    const m = Math.floor(segs / 60);
    const s = segs % 60;
    el.textContent = `${m}:${String(s).padStart(2, '0')}`;
  }

  // ── Logout ─────────────────────────────────────────────────────────
  async function hacerLogout() {
    ocultarBanner();
    limpiarTimers();
    if (sbCliente) {
      try { await sbCliente.auth.signOut(); } catch (_) {}
    }
    // Redirigir al login: sube hasta encontrar index.html en la raíz
    const path = window.location.pathname;
    const nivel = (path.match(/\//g) || []).length - 1;
    const subir = nivel > 1 ? '../'.repeat(nivel - 1) : './';
    window.location.href = subir + 'index.html';
  }

  // ── Timers ─────────────────────────────────────────────────────────
  function limpiarTimers() {
    if (timerAviso)  { clearTimeout(timerAviso);  timerAviso  = null; }
    if (timerLogout) { clearTimeout(timerLogout); timerLogout = null; }
  }

  function programar() {
    limpiarTimers();
    timerAviso  = setTimeout(mostrarBanner,  TIEMPO_AVISO_MS);
    timerLogout = setTimeout(hacerLogout,    TIEMPO_LOGOUT_MS);
  }

  function resetear() {
    ocultarBanner();
    programar();
  }

  // ── Eventos de actividad ───────────────────────────────────────────
  const EVENTOS = ['mousemove', 'mousedown', 'keydown', 'touchstart', 'scroll', 'click'];

  function onActividad() {
    // Solo resetear si el banner NO está visible (para no interrumpir
    // la cuenta atrás con movimientos accidentales del ratón)
    if (bannerEl && bannerEl.classList.contains('visible')) return;
    resetear();
  }

  // ── API pública ────────────────────────────────────────────────────
  function init(sb) {
    sbCliente = sb;
    crearBanner();
    EVENTOS.forEach(ev => window.addEventListener(ev, onActividad, { passive: true }));
    programar();
  }

  return { init };

})();
