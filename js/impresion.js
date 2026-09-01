/* ──────────────────────────────────────────────────────────────
   js/impresion.js — Módulo de impresión (QR + lista de presentes)
   Sesión 69 · 31/8/2026
   ────────────────────────────────────────────────────────────── */

/**
 * Escapa HTML para inyectar texto seguro en plantillas.
 * (Función interna; muchas páginas tienen su propia copia de esc(),
 *  pero las funciones de este módulo necesitan la suya propia
 *  para no depender de la que tenga o no tenga la página que lo carga.)
 */
function _escHtml(txt) {
  const d = document.createElement('div');
  d.textContent = String(txt || '');
  return d.innerHTML;
}

/**
 * Calcula la URL absoluta del logo de la marca actual.
 * Funciona desde cualquier subcarpeta (encargado/, jefe/, admin/…).
 * Devuelve '' si no hay branding.
 */
function _logoUrl(branding) {
  if (!branding || !branding.logo) return '';
  // Quita todo desde la última subcarpeta hacia la derecha
  const base = window.location.origin +
    window.location.pathname.replace(/[^/]+\/[^/]*$/, '');
  return base + branding.logo;
}

/**
 * Abre una ventana e imprime el QR de la obra.
 *
 * @param {Object} opciones
 * @param {string}      opciones.obraNombre   — nombre visible de la obra
 * @param {string}      opciones.qrDataUrl    — data-URL del canvas del QR (toDataURL)
 * @param {Object|null} opciones.branding     — brandingActual (puede ser null)
 */
function imprimirQR({ obraNombre, qrDataUrl, branding }) {
  const logoSrc = _logoUrl(branding);
  const marcaNombre = branding ? branding.nombre : '';
  const win = window.open('', '_blank');
  if (!win) { alert('El navegador ha bloqueado la ventana emergente.'); return; }
  win.document.write(`
    <!DOCTYPE html><html><head>
    <title>QR — ${_escHtml(obraNombre)}</title>
    <style>
      body { font-family: sans-serif; text-align: center; padding: 40px; }
      .logo-marca { max-height: 60px; max-width: 220px; margin-bottom: 20px; }
      h1 { font-size: 24px; margin-bottom: 8px; }
      p { color: #666; font-size: 14px; margin-bottom: 24px; }
      .sub-ar { display: block; margin-top: 8px; font-size: 18px; font-weight: 700; color: #444; direction: rtl; }
      img.qr { display: block; margin: 0 auto; width: 280px; }
      .aviso-obligatorio { margin: 26px auto 0; max-width: 560px; border: 2px solid #111; border-radius: 12px; padding: 16px 18px; color: #111; background: #fff; }
      .aviso-obligatorio .es { font-size: 16px; font-weight: 800; line-height: 1.35; margin-bottom: 10px; }
      .aviso-obligatorio .ar { font-size: 18px; font-weight: 800; line-height: 1.6; direction: rtl; }
    </style>
    </head><body>
    ${logoSrc ? `<img class="logo-marca" src="${logoSrc}" alt="${_escHtml(marcaNombre)}" />` : ''}
    <h1>${_escHtml(obraNombre)}</h1>
    <p>Escanea este código QR para fichar tu entrada/salida<span class="sub-ar" lang="ar" dir="rtl">امسح رمز QR هذا لتسجيل دخولك/خروجك</span></p>
    <img class="qr" src="${qrDataUrl}" />
    <div class="aviso-obligatorio">
      <div class="es">En esta obra es obligatorio fichar tanto a la entrada como a la salida. El incumplimiento puede tener consecuencias disciplinarias.</div>
      <div class="ar" lang="ar" dir="rtl">في هذا الموقع، تسجيل الحضور عند الدخول والخروج إلزامي.<br>عدم الامتثال قد يترتب عليه عواقب تأديبية.</div>
    </div>
    <script>window.onload = () => { window.print(); }<\/script>
    </body></html>`);
  win.document.close();
}

/**
 * Abre una ventana e imprime la lista de presentes en formato apaisado.
 *
 * @param {Object} opciones
 * @param {string}      opciones.obraNombre       — nombre visible de la obra
 * @param {string}      opciones.nombreEncargado   — nombre del encargado (pie de firma)
 * @param {Array}       opciones.presentes         — array con { nombre, dni, empresa, empresaId }
 * @param {Set}         opciones.empresasPropias   — Set de IDs de empresas propias
 * @param {Object|null} opciones.branding          — brandingActual (puede ser null)
 */
function imprimirListaPresentes({ obraNombre, nombreEncargado, presentes, empresasPropias, branding }) {
  if (!presentes || presentes.length === 0) {
    alert('No hay trabajadores presentes para imprimir en la fecha seleccionada.');
    return;
  }

  const ordenados = [...presentes].sort((a, b) => {
    const ea = (a.empresa || '').toLowerCase();
    const eb = (b.empresa || '').toLowerCase();
    if (ea !== eb) return ea.localeCompare(eb, 'es');
    return (a.nombre || '').localeCompare(b.nombre || '', 'es');
  });

  const total = ordenados.length;
  const logoSrc = _logoUrl(branding);
  const marcaNombre = branding ? branding.nombre : '';

  const filas = ordenados.map((t, i) => `
    <tr>
      <td class="col-num">${i + 1}</td>
      <td class="col-nombre">${_escHtml(t.nombre || '—')}</td>
      <td class="col-dni">${_escHtml(t.dni || '—')}</td>
      <td class="col-empresa">${_escHtml(t.empresa || '—')}</td>
      <td class="col-hora"></td>
      <td class="col-firma"></td>
      <td class="col-hora"></td>
      <td class="col-firma"></td>
    </tr>`).join('');

  const filasVacias = [1, 2, 3].map(n => `
    <tr class="fila-vacia">
      <td class="col-num">${total + n}</td>
      <td class="col-nombre"></td>
      <td class="col-dni"></td>
      <td class="col-empresa"></td>
      <td class="col-hora"></td>
      <td class="col-firma"></td>
      <td class="col-hora"></td>
      <td class="col-firma"></td>
    </tr>`).join('');

  const win = window.open('', '_blank');
  if (!win) { alert('El navegador ha bloqueado la ventana emergente.'); return; }
  win.document.write(`
    <!DOCTYPE html><html lang="es"><head>
    <meta charset="UTF-8">
    <title>Lista de presentes — ${_escHtml(obraNombre)}</title>
    <style>
      @page { size: landscape; margin: 10mm; }
      * { box-sizing: border-box; }
      body { font-family: sans-serif; color: #111; padding: 4px; }
      .cab { display: flex; align-items: center; justify-content: space-between; gap: 16px; border-bottom: 2px solid #111; padding-bottom: 8px; margin-bottom: 8px; }
      .cab-info h1 { font-size: 18px; margin: 0; }
      .logo-marca { max-height: 44px; max-width: 160px; }
      table { width: 100%; border-collapse: collapse; font-size: 12px; }
      th, td { border: 1px solid #333; padding: 6px 8px; }
      thead th { text-align: left; background: #ececec; font-size: 11px; text-transform: uppercase; letter-spacing: 0.3px; }
      .col-num { width: 28px; text-align: center; color: #555; }
      .col-dni { width: 95px; }
      .col-empresa { width: 160px; }
      .col-hora { width: 72px; }
      .col-firma { width: 130px; }
      tbody tr { height: 32px; }
      .pie { margin-top: 10px; font-size: 12px; page-break-inside: avoid; }
      .pie .firma-encargado { margin-top: 18px; border-top: 1px solid #111; width: 300px; padding-top: 4px; }
    </style>
    </head><body>
    <div class="cab">
      <div class="cab-info">
        <h1>Lista de presentes — ${_escHtml(obraNombre)}</h1>
      </div>
      ${logoSrc ? `<img class="logo-marca" src="${logoSrc}" alt="${_escHtml(marcaNombre)}" />` : ''}
    </div>
    <table>
      <thead>
        <tr>
          <th class="col-num">#</th>
          <th>Nombre</th>
          <th class="col-dni">DNI</th>
          <th class="col-empresa">Empresa</th>
          <th class="col-hora">H. entrada</th>
          <th class="col-firma">Firma</th>
          <th class="col-hora">H. salida</th>
          <th class="col-firma">Firma</th>
        </tr>
      </thead>
      <tbody>${filas}${filasVacias}</tbody>
    </table>
    <div class="pie">
      <div class="firma-encargado">Firma del encargado: ${_escHtml(nombreEncargado)}</div>
    </div>
    <script>window.onload = () => { window.print(); }<\/script>
    </body></html>`);
  win.document.close();
}
