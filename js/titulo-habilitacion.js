// js/titulo-habilitacion.js — Título (carné, certificado) de una habilitación.
// 17/9/2026. Única casa de la subida y la consulta del título.
//
// Reglas (decisión de Dani, 17/9):
//   - Sube SOLO el jefe de obra (o el admin): es quien verifica que el título
//     es real y su caducidad. La BD lo impone (adjuntar_titulo_habilitacion y
//     la policy del almacén); este módulo no decide permisos.
//   - El encargado solo lo VE.
//   - Un título nuevo sustituye al anterior en la ficha; el archivo viejo se
//     queda en el almacén como rastro.
//
// Almacén privado 'habilitaciones'. Ruta: <trabajador_id>/<habilitacion_id>/<archivo>
// Acepta JPG, PNG o PDF de hasta 5 MB. Las fotos se reducen en el navegador
// (lado mayor 2000 px) antes de subir: una foto de móvil pasa de 4 MB a ~0,5.
//
// Uso:
//   TituloHab.subir(sb, { habilitacionId, trabajadorId })  → Promise<{ok}|{error}|{cancelado}>
//     ¡Llamar DIRECTAMENTE desde el clic (antes de cualquier await)! El
//     navegador solo abre el selector de archivos si viene de un gesto.
//   TituloHab.ver(sb, rutaTitulo)                          → Promise<{ok}|{error}>
//     Abre el título en una pestaña nueva con un enlace que caduca en 5 min.
//   TituloHab.fecha(isoTimestamp)                          → 'dd/mm/aaaa' (Madrid)

(function () {
  const BUCKET = 'habilitaciones';
  const MAX_BYTES = 5 * 1024 * 1024;
  const LADO_MAX = 2000;

  const ERRORES = {
    sin_permiso:           'Solo el jefe de obra puede guardar el título.',
    no_encontrada:         'Esa habilitación ya no existe. Recarga la página.',
    ruta_incorrecta:       'El archivo no se ha guardado en su sitio. Vuelve a intentarlo.',
    archivo_no_encontrado: 'El archivo no ha llegado a subirse. Vuelve a intentarlo.'
  };

  function elegirArchivo() {
    return new Promise(resolve => {
      const inp = document.createElement('input');
      inp.type = 'file';
      inp.accept = 'image/jpeg,image/png,application/pdf,image/*';
      inp.style.display = 'none';
      inp.addEventListener('change', () => {
        const f = inp.files && inp.files[0];
        inp.remove();
        resolve(f || null);
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
        reject(new Error('Ese archivo no se puede leer como foto. Prueba con una foto JPG o un PDF.'));
      };
      img.src = url;
    });
  }

  async function subir(sb, opts) {
    const habilitacionId = opts && opts.habilitacionId;
    const trabajadorId = opts && opts.trabajadorId;
    if (!sb || !habilitacionId || !trabajadorId) return { error: 'Faltan datos para guardar el título.' };

    const file = await elegirArchivo();
    if (!file) return { cancelado: true };

    let cuerpo, tipo, ext;
    try {
      if (file.type === 'application/pdf' || /\.pdf$/i.test(file.name || '')) {
        cuerpo = file; tipo = 'application/pdf'; ext = 'pdf';
      } else if ((file.type || '').startsWith('image/') || !file.type) {
        cuerpo = await reducirFoto(file); tipo = 'image/jpeg'; ext = 'jpg';
      } else {
        return { error: 'Solo se aceptan fotos (JPG, PNG) o PDF.' };
      }
    } catch (e) {
      return { error: e.message };
    }
    if (cuerpo.size > MAX_BYTES) {
      return { error: 'El archivo pesa más de 5 MB. Si es un PDF escaneado, hazle una foto al papel.' };
    }

    const ruta = trabajadorId + '/' + habilitacionId + '/' + Date.now() + '.' + ext;
    const { error: errSubida } = await sb.storage.from(BUCKET)
      .upload(ruta, cuerpo, { contentType: tipo, upsert: false });
    if (errSubida) {
      const m = String(errSubida.message || errSubida);
      if (/row-level security|policy|unauthorized|403/i.test(m)) return { error: ERRORES.sin_permiso };
      return { error: 'No se ha podido subir el archivo: ' + m };
    }

    const { data, error } = await sb.rpc('adjuntar_titulo_habilitacion', {
      p_habilitacion_id: habilitacionId,
      p_storage_path: ruta
    });
    if (error) return { error: 'El archivo se ha subido pero no se ha podido apuntar: ' + error.message };
    const res = typeof data === 'string' ? JSON.parse(data) : data;
    if (!res || res.error) {
      const cod = res && res.error;
      return { error: ERRORES[cod] || ('Error: ' + cod) };
    }
    return { ok: true, ruta };
  }

  async function ver(sb, ruta) {
    if (!ruta) return { error: 'Esta habilitación no tiene título guardado.' };
    // La pestaña se abre YA (dentro del clic) y luego se le da la dirección:
    // si se abre después del await, el navegador la bloquea.
    const pestana = window.open('', '_blank');
    if (pestana) {
      try { pestana.document.write('<p style="font-family:sans-serif;padding:20px">Abriendo título…</p>'); } catch (e) {}
    }
    const { data, error } = await sb.storage.from(BUCKET).createSignedUrl(ruta, 300);
    if (error || !data || !data.signedUrl) {
      if (pestana) pestana.close();
      const m = error ? String(error.message || error) : '';
      if (/not found|object/i.test(m)) return { error: 'No se encuentra el archivo del título.' };
      return { error: 'No tienes acceso a este título o no se ha podido abrir.' };
    }
    if (pestana) pestana.location.href = data.signedUrl;
    else window.open(data.signedUrl, '_blank');
    return { ok: true };
  }

  function fecha(iso) {
    if (!iso) return '';
    try {
      return new Date(iso).toLocaleDateString('es-ES',
        { timeZone: 'Europe/Madrid', day: '2-digit', month: '2-digit', year: 'numeric' });
    } catch (e) { return ''; }
  }

  window.TituloHab = { subir, ver, fecha };
})();
