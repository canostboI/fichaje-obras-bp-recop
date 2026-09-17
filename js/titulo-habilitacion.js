// js/titulo-habilitacion.js — Título (carné, certificado) de una habilitación.
// 17/9/2026. Única casa de la subida y la consulta del título.
//
// Reglas (decisiones de Dani, 17/9):
//   - Añade y quita SOLO el jefe de obra (o el admin): es quien verifica que el
//     título es real y su caducidad. La BD lo impone (adjuntar_titulo_habilitacion,
//     retirar_archivo_titulo y la policy del almacén); este módulo no decide permisos.
//   - El encargado solo lo VE.
//   - Un título puede ser VARIAS fotos o PDF (las dos caras del carné, las
//     páginas del certificado). Una fila por archivo en titulos_habilitacion_archivos.
//   - Quitar no borra: el archivo queda archivado con quién lo quitó y cuándo.
//
// Almacén privado 'habilitaciones'. Ruta: <trabajador_id>/<habilitacion_id>/<archivo>
// JPG, PNG o PDF de hasta 5 MB cada uno. Las fotos se reducen en el navegador
// (lado mayor 2000 px) antes de subir: una foto de móvil pasa de 4 MB a ~0,5.
//
// Uso:
//   TituloHab.subir(sb, { habilitacionId, trabajadorId, onProgreso(i, n) })
//     → Promise<{ ok, subidos, errores: [texto] } | { cancelado }>
//     Permite elegir varios archivos a la vez.
//     ¡Llamar DIRECTAMENTE desde el clic (antes de cualquier await)! El
//     navegador solo abre el selector de archivos si viene de un gesto.
//   TituloHab.galeria(sb, { archivos, titulo, puedeQuitar, onCambio })
//     Ventana con los archivos (miniatura para fotos, ficha para PDF). Tocar uno
//     lo abre en grande en otra pestaña. Con puedeQuitar, cada uno lleva «Quitar».
//     archivos = [{ id, storage_path, subido_en }] (lo que devuelve la RPC).
//   TituloHab.ver(sb, ruta)   → abre un archivo suelto (compatibilidad).
//   TituloHab.fecha(iso)      → 'dd/mm/aaaa' (Madrid)

(function () {
  const BUCKET = 'habilitaciones';
  const MAX_BYTES = 5 * 1024 * 1024;
  const LADO_MAX = 2000;
  const SEGUNDOS_ENLACE = 300;

  const ERRORES = {
    sin_permiso:           'Solo el jefe de obra puede tocar el título.',
    no_encontrada:         'Esa habilitación ya no existe. Recarga la página.',
    no_encontrado:         'Ese archivo ya no existe. Recarga la página.',
    ruta_incorrecta:       'El archivo no se ha guardado en su sitio. Vuelve a intentarlo.',
    archivo_no_encontrado: 'El archivo no ha llegado a subirse. Vuelve a intentarlo.',
    ya_adjuntado:          'Ese archivo ya estaba guardado.'
  };
  function textoError(cod) { return ERRORES[cod] || ('Error: ' + cod); }

  function escHtml(s) {
    return String(s == null ? '' : s)
      .replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;')
      .replace(/"/g, '&quot;').replace(/'/g, '&#39;');
  }

  function fecha(iso) {
    if (!iso) return '';
    try {
      return new Date(iso).toLocaleDateString('es-ES',
        { timeZone: 'Europe/Madrid', day: '2-digit', month: '2-digit', year: 'numeric' });
    } catch (e) { return ''; }
  }

  function esPdf(ruta) { return /\.pdf$/i.test(ruta || ''); }

  // ── Elegir archivos ────────────────────────────────────────────
  function elegirArchivos() {
    return new Promise(resolve => {
      const inp = document.createElement('input');
      inp.type = 'file';
      inp.multiple = true;
      inp.accept = 'image/jpeg,image/png,application/pdf,image/*';
      inp.style.display = 'none';
      inp.addEventListener('change', () => {
        const lista = inp.files ? Array.from(inp.files) : [];
        inp.remove();
        resolve(lista);
      });
      // Si cierra el selector sin elegir, no pasa nada: la promesa se queda
      // esperando y no se sube nada. NO se detecta «cancelado» por el foco de
      // la ventana: en móviles lentos, al volver de la cámara, el foco llega
      // antes que la foto y se perdería.
      document.body.appendChild(inp);
      inp.click();
    });
  }

  function reducirFoto(file) {
    return new Promise((resolve, reject) => {
      const url = URL.createObjectURL(file);
      const img = new Image();
      img.onload = () => {
        let w = img.naturalWidth, h = img.naturalHeight;
        const esc = Math.min(1, LADO_MAX / Math.max(w, h));
        w = Math.round(w * esc); h = Math.round(h * esc);
        const cv = document.createElement('canvas');
        cv.width = w; cv.height = h;
        const ctx = cv.getContext('2d');
        ctx.fillStyle = '#ffffff';
        ctx.fillRect(0, 0, w, h);
        ctx.drawImage(img, 0, 0, w, h);
        URL.revokeObjectURL(url);
        cv.toBlob(b => b ? resolve(b) : reject(new Error('No se ha podido preparar la foto.')),
                  'image/jpeg', 0.85);
      };
      img.onerror = () => {
        URL.revokeObjectURL(url);
        reject(new Error('no se puede leer como foto (prueba con JPG o PDF)'));
      };
      img.src = url;
    });
  }

  async function subirUno(sb, file, habilitacionId, trabajadorId, n) {
    let cuerpo, tipo, ext;
    if (file.type === 'application/pdf' || /\.pdf$/i.test(file.name || '')) {
      cuerpo = file; tipo = 'application/pdf'; ext = 'pdf';
    } else if ((file.type || '').startsWith('image/') || !file.type) {
      cuerpo = await reducirFoto(file); tipo = 'image/jpeg'; ext = 'jpg';
    } else {
      throw new Error('solo se aceptan fotos (JPG, PNG) o PDF');
    }
    if (cuerpo.size > MAX_BYTES) throw new Error('pesa más de 5 MB');

    const ruta = trabajadorId + '/' + habilitacionId + '/' + Date.now() + '-' + n + '.' + ext;
    const { error: errSubida } = await sb.storage.from(BUCKET)
      .upload(ruta, cuerpo, { contentType: tipo, upsert: false });
    if (errSubida) {
      const m = String(errSubida.message || errSubida);
      if (/row-level security|policy|unauthorized|403/i.test(m)) throw new Error(ERRORES.sin_permiso);
      throw new Error('no se ha podido subir (' + m + ')');
    }

    const { data, error } = await sb.rpc('adjuntar_titulo_habilitacion', {
      p_habilitacion_id: habilitacionId,
      p_storage_path: ruta
    });
    if (error) throw new Error('subido pero no apuntado (' + error.message + ')');
    const res = typeof data === 'string' ? JSON.parse(data) : data;
    if (!res || res.error) throw new Error(textoError(res && res.error));
  }

  async function subir(sb, opts) {
    const habilitacionId = opts && opts.habilitacionId;
    const trabajadorId = opts && opts.trabajadorId;
    const onProgreso = (opts && typeof opts.onProgreso === 'function') ? opts.onProgreso : null;
    if (!sb || !habilitacionId || !trabajadorId) return { error: 'Faltan datos para guardar el título.' };

    const files = await elegirArchivos();
    if (!files.length) return { cancelado: true };

    let subidos = 0;
    const errores = [];
    // De uno en uno: si falla uno, los demás siguen.
    for (let i = 0; i < files.length; i++) {
      if (onProgreso) onProgreso(i + 1, files.length);
      const nombre = files[i].name || ('archivo ' + (i + 1));
      try {
        await subirUno(sb, files[i], habilitacionId, trabajadorId, i + 1);
        subidos++;
      } catch (e) {
        errores.push(nombre + ': ' + e.message);
      }
    }
    return { ok: subidos > 0, subidos, errores };
  }

  // ── Ver ────────────────────────────────────────────────────────
  async function ver(sb, ruta) {
    if (!ruta) return { error: 'No hay archivo que abrir.' };
    // La pestaña se abre YA (dentro del clic) y luego se le da la dirección:
    // si se abre después del await, el navegador la bloquea.
    const pestana = window.open('', '_blank');
    const { data, error } = await sb.storage.from(BUCKET).createSignedUrl(ruta, SEGUNDOS_ENLACE);
    if (error || !data || !data.signedUrl) {
      if (pestana) pestana.close();
      return { error: 'No tienes acceso a este archivo o no se ha podido abrir.' };
    }
    if (pestana) pestana.location.href = data.signedUrl;
    else window.open(data.signedUrl, '_blank');
    return { ok: true };
  }

  // Estilos propios con colores fijos (sirve en tema claro y oscuro).
  function ponerEstilos() {
    if (document.getElementById('tha-estilos')) return;
    const st = document.createElement('style');
    st.id = 'tha-estilos';
    st.textContent = `
      .tha-fondo { position: fixed; inset: 0; background: rgba(0,0,0,0.72); z-index: 9999;
        display: flex; align-items: center; justify-content: center; padding: 16px; }
      .tha-caja { background: #ffffff; color: #222; border-radius: 12px; width: 100%; max-width: 640px;
        max-height: 90vh; display: flex; flex-direction: column; overflow: hidden;
        font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif; }
      .tha-cab { display: flex; align-items: center; justify-content: space-between; gap: 10px;
        padding: 14px 16px; border-bottom: 1px solid #e3e6ea; }
      .tha-cab h3 { font-size: 16px; margin: 0; }
      .tha-cerrar { background: transparent; border: 1px solid #ccd; border-radius: 8px; padding: 6px 12px;
        font-size: 14px; cursor: pointer; color: #333; }
      .tha-cuerpo { padding: 14px 16px; overflow-y: auto; }
      .tha-rejilla { display: grid; grid-template-columns: repeat(auto-fill, minmax(140px, 1fr)); gap: 12px; }
      .tha-ficha { border: 1px solid #e3e6ea; border-radius: 10px; overflow: hidden; background: #f7f8fa;
        display: flex; flex-direction: column; }
      .tha-mini { display: flex; align-items: center; justify-content: center; height: 140px;
        background: #eceff3; color: #555; text-decoration: none; font-size: 13px; }
      .tha-mini img { width: 100%; height: 100%; object-fit: cover; display: block; }
      .tha-mini.pdf { flex-direction: column; gap: 4px; font-size: 32px; color: #b71c1c; }
      .tha-mini.pdf span { font-size: 12px; color: #555; font-weight: 600; }
      .tha-pie { padding: 6px 8px; font-size: 12px; color: #666; display: flex; align-items: center;
        justify-content: space-between; gap: 6px; }
      .tha-quitar { background: transparent; border: 1px solid #ef9a9a; color: #b71c1c; border-radius: 6px;
        padding: 2px 8px; font-size: 12px; cursor: pointer; }
      .tha-quitar:disabled { opacity: 0.5; cursor: default; }
      .tha-aviso { font-size: 13px; color: #666; margin-top: 12px; }
      .tha-error { font-size: 13px; color: #b71c1c; margin-top: 10px; }
    `;
    document.head.appendChild(st);
  }

  function galeria(sb, opts) {
    const archivos = (opts && Array.isArray(opts.archivos)) ? opts.archivos.slice() : [];
    const puedeQuitar = !!(opts && opts.puedeQuitar);
    const onCambio = (opts && typeof opts.onCambio === 'function') ? opts.onCambio : null;
    let abierta = true;
    let cambiado = false;
    const minis = [];   // miniatura de cada archivo, en el mismo orden

    ponerEstilos();
    const fondo = document.createElement('div');
    fondo.className = 'tha-fondo';
    fondo.innerHTML = `
      <div class="tha-caja" role="dialog" aria-modal="true">
        <div class="tha-cab">
          <h3>📄 ${escHtml((opts && opts.titulo) || 'Título')}</h3>
          <button type="button" class="tha-cerrar">✕ Cerrar</button>
        </div>
        <div class="tha-cuerpo">
          <div class="tha-rejilla"></div>
          <div class="tha-aviso">Toca un archivo para verlo en grande.</div>
          <div class="tha-error" style="display:none"></div>
        </div>
      </div>`;
    document.body.appendChild(fondo);

    const rejilla = fondo.querySelector('.tha-rejilla');
    const cajaError = fondo.querySelector('.tha-error');

    function cerrar() {
      if (!abierta) return;
      abierta = false;
      fondo.remove();
      document.removeEventListener('keydown', alTeclado);
      if (cambiado && onCambio) onCambio();
    }
    function alTeclado(ev) { if (ev.key === 'Escape') cerrar(); }
    fondo.querySelector('.tha-cerrar').addEventListener('click', cerrar);
    fondo.addEventListener('click', ev => { if (ev.target === fondo) cerrar(); });
    document.addEventListener('keydown', alTeclado);

    function pintarVacio() {
      if (!rejilla.children.length) {
        rejilla.innerHTML = '<div style="grid-column:1/-1;color:#666;font-size:14px">No queda ningún archivo en este título.</div>';
      }
    }

    archivos.forEach((a, i) => {
      const ficha = document.createElement('div');
      ficha.className = 'tha-ficha';
      const pdf = esPdf(a.storage_path);
      ficha.innerHTML = `
        <a class="tha-mini ${pdf ? 'pdf' : ''}" target="_blank" rel="noopener">
          ${pdf ? '📄<span>PDF</span>' : 'Cargando…'}
        </a>
        <div class="tha-pie">
          <span>${escHtml(fecha(a.subido_en))}</span>
          ${puedeQuitar ? '<button type="button" class="tha-quitar">Quitar</button>' : ''}
        </div>`;
      rejilla.appendChild(ficha);

      const mini = ficha.querySelector('.tha-mini');
      minis[i] = mini;
      // Hasta que el enlace esté listo, tocar no hace nada.
      mini.addEventListener('click', ev => { if (!mini.getAttribute('href')) ev.preventDefault(); });

      const btnQuitar = ficha.querySelector('.tha-quitar');
      if (btnQuitar) {
        btnQuitar.addEventListener('click', async () => {
          if (!confirm('¿Quitar este archivo del título? Quedará archivado, no se borra.')) return;
          btnQuitar.disabled = true;
          cajaError.style.display = 'none';
          const { data, error } = await sb.rpc('retirar_archivo_titulo', { p_archivo_id: a.id });
          const res = error ? { error: error.message } : (typeof data === 'string' ? JSON.parse(data) : data);
          if (!res || res.error) {
            btnQuitar.disabled = false;
            cajaError.textContent = error ? ('Error: ' + error.message) : textoError(res && res.error);
            cajaError.style.display = 'block';
            return;
          }
          cambiado = true;
          ficha.remove();
          pintarVacio();
        });
      }
    });
    pintarVacio();

    // Enlaces temporales de uno en uno (cada archivo es un documento de una
    // persona: no se piden de golpe ni se dejan abiertos más de 5 min).
    (async () => {
      for (let i = 0; i < archivos.length; i++) {
        const a = archivos[i], mini = minis[i];
        if (!abierta) return;
        const { data, error } = await sb.storage.from(BUCKET).createSignedUrl(a.storage_path, SEGUNDOS_ENLACE);
        if (!abierta) return;
        if (error || !data || !data.signedUrl) {
          if (!esPdf(a.storage_path)) mini.textContent = 'No se puede abrir';
          continue;
        }
        mini.setAttribute('href', data.signedUrl);
        if (!esPdf(a.storage_path)) {
          mini.textContent = '';
          const img = document.createElement('img');
          img.alt = 'Título';
          img.src = data.signedUrl;
          mini.appendChild(img);
        }
      }
    })();

    return { cerrar };
  }

  window.TituloHab = { subir, galeria, ver, fecha };
})();
