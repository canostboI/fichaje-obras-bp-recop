/* ============================================================
   js/foto-identidad.js — La foto de la cara, en un solo sitio
   ------------------------------------------------------------
   Motivo (68ª, 30/8/2026 · UNIFICAR-FOTOS):

   1) HABÍA DOS ALMACENES DE FOTO SOBRE EL MISMO BUCKET. El de
      HABILITACIONES guardaba en la tabla `fotos_identidad`, con
      registro de quién mira cada cara y con borrado automático.
      El de PERSONA-INVISIBLE (67ª) guardaba la ruta en la columna
      `trabajadores.foto_path`, sin registro de lecturas y sin
      borrado: esas fotos no caducaban NUNCA. El cron existía y
      miraba el cajón equivocado.

      Desde hoy manda `fotos_identidad`. `trabajadores.foto_path`
      queda muerto a propósito: no se escribe ni se lee. No se
      borró la columna el mismo día para poder volver atrás.

   2) LA SUBIDA DIRECTA NO PODÍA REHACER UNA FOTO. El código viejo
      subía con `upsert: true`, y el bucket `identidad` solo tiene
      permiso de LEER y SUBIR: no tiene UPDATE. Sobrescribir habría
      fallado en silencio la segunda vez. Aquí cada foto lleva un
      nombre nuevo (la hora en milisegundos) y la RPC se encarga de
      borrar la anterior. Nunca quedan dos caras de la misma persona.

   3) LA PROMESA INCUMPLIDA. Al fallar la subida, la pantalla del
      encargado decía «se puede añadir más tarde desde su ficha» y
      no había ninguna forma de hacerlo. `FI.abrirAnadir` es esa
      forma (Paso 5).

   REGLA QUE NO SE PUEDE ROMPER: la foto NUNCA tumba un registro.
   La ficha se crea primero y la foto va después. Si la foto falla,
   se ha perdido una foto, no una persona. Por eso `FI.guardar`
   devuelve un resultado y no lanza jamás.

   El bucket es PRIVADO. Una foto solo se ve por enlace firmado y
   temporal, y pedirlo deja línea en `accesos_foto_log`.

   Dependencias: ninguna. Los estilos del visor los inyecta él mismo
   para no tener que tocar el CSS de cada página.

   Cómo se carga:
     <script src="../js/foto-identidad.js"></script>
   y una vez, después de crear el cliente:
     FI.init(sb);

   API pública (window.FI):
     FI.init(cliente)                        → guarda el cliente Supabase
     FI.reducir(file)                        → Promise<Blob> ~600 px
     FI.guardar(trabajadorId, obraId, blob)  → Promise<{ok, error}>
     FI.enlace(ruta)                         → Promise<url|null>
     FI.ver(trabajadorId)                    → Promise<{hay_foto, url}>
     FI.visor(url)                           → abre la foto a pantalla
     FI.montarCaptura(hueco, opts)           → botón + vista previa
     FI.abrirAnadir(trabajadorId, obraId, cb, opts)
                                             → añadir/rehacer más tarde
                                               opts.tema: 'oscuro' para
                                               la pantalla del jefe
   ============================================================ */

(function () {
  'use strict';

  var BUCKET   = 'identidad';
  var MAX_LADO = 600;    // pixeles
  var CALIDAD  = 0.8;    // JPEG

  var cliente = null;

  function init(sb) { cliente = sb; return window.FI; }

  function db() {
    var c = cliente || window.sb || null;
    if (!c) console.warn('[foto] FI.init(sb) no se ha llamado');
    return c;
  }

  // ── Reducir ──────────────────────────────────────────────────
  // El movil hace fotos de 3-4 MB. Con la cobertura de una obra eso
  // tarda o falla, y una subida que falla no puede llevarse por
  // delante un registro. Se reduce AQUI, antes de subir.
  function reducir(file) {
    return new Promise(function (resolve, reject) {
      var img = new Image();
      var url = URL.createObjectURL(file);
      img.onload = function () {
        URL.revokeObjectURL(url);
        var w = img.width, h = img.height;
        if (w > h && w > MAX_LADO) { h = Math.round(h * MAX_LADO / w); w = MAX_LADO; }
        else if (h >= w && h > MAX_LADO) { w = Math.round(w * MAX_LADO / h); h = MAX_LADO; }
        var c = document.createElement('canvas');
        c.width = w; c.height = h;
        c.getContext('2d').drawImage(img, 0, 0, w, h);
        c.toBlob(function (b) {
          if (b) resolve(b); else reject(new Error('sin blob'));
        }, 'image/jpeg', CALIDAD);
      };
      img.onerror = function () {
        URL.revokeObjectURL(url);
        reject(new Error('no es imagen'));
      };
      img.src = url;
    });
  }

  // ── Guardar ──────────────────────────────────────────────────
  // NUNCA lanza. Dos pasos, y el segundo es el que manda: si el
  // fichero sube pero la RPC lo rechaza, el fichero queda huerfano
  // y se borra aqui mismo. Un huerfano en un bucket privado es una
  // cara sin duenno: nadie sabria que existe ni cuando caduca.
  async function guardar(trabajadorId, obraId, blob) {
    var sb = db();
    if (!sb) return { ok: false, error: 'Sin conexion con el servidor' };
    if (!trabajadorId || !obraId || !blob) {
      return { ok: false, error: 'Faltan datos para guardar la foto' };
    }

    // La carpeta DEBE ser el id del trabajador: la politica del bucket
    // mira storage.foldername(name)[1] para saber si esa persona esta
    // en una obra tuya. El nombre lleva la hora para no chocar nunca
    // con la anterior (el bucket no tiene permiso de sobrescribir).
    var ruta = trabajadorId + '/' + Date.now() + '.jpg';

    try {
      var sub = await sb.storage.from(BUCKET)
        .upload(ruta, blob, { contentType: 'image/jpeg', upsert: false });
      if (sub.error) {
        console.warn('[foto] subida:', sub.error);
        return { ok: false, error: 'No se ha podido subir la foto' };
      }
    } catch (e) {
      console.warn('[foto] excepcion subiendo:', e);
      return { ok: false, error: 'No se ha podido subir la foto' };
    }

    try {
      var r = await sb.rpc('registrar_foto_identidad', {
        p_trabajador_id: trabajadorId,
        p_obra_id: obraId,
        p_storage_path: ruta
      });
      if (r.error || !r.data || r.data.ok !== true) {
        await limpiar(ruta);
        return {
          ok: false,
          error: (r.data && r.data.error) || (r.error && r.error.message)
                 || 'El servidor no ha aceptado la foto'
        };
      }
      return { ok: true, ruta: ruta, sustituida: !!r.data.sustituida };
    } catch (e) {
      console.warn('[foto] excepcion registrando:', e);
      await limpiar(ruta);
      return { ok: false, error: 'El servidor no ha aceptado la foto' };
    }
  }

  // Borrado de cortesia del huerfano. El bucket no da DELETE a nadie
  // salvo al duenno, asi que esto puede fallar sin consecuencias: si
  // falla, el fichero lo recogera el cron de caducidad.
  async function limpiar(ruta) {
    try { await db().storage.from(BUCKET).remove([ruta]); } catch (e) { /* da igual */ }
  }

  // ── Mirar ────────────────────────────────────────────────────
  // El bucket es privado: la foto solo se ve con enlace firmado.
  async function enlace(ruta) {
    if (!ruta) return null;
    try {
      var r = await db().storage.from(BUCKET).createSignedUrl(ruta, 3600);
      if (r.error || !r.data) return null;
      return r.data.signedUrl;
    } catch (e) { return null; }
  }

  // Pedir la foto de UNA persona. Va por RPC a proposito: es la que
  // anota en accesos_foto_log quien ha mirado esa cara.
  async function ver(trabajadorId) {
    try {
      var r = await db().rpc('ver_foto_identidad', { p_trabajador_id: trabajadorId });
      if (r.error || !r.data || r.data.ok !== true) return { hay_foto: false, url: null };
      if (!r.data.hay_foto) return { hay_foto: false, url: null };
      return { hay_foto: true, url: await enlace(r.data.path) };
    } catch (e) { return { hay_foto: false, url: null }; }
  }

  // ── Estilos propios ──────────────────────────────────────────
  var estilosPuestos = false;
  function estilos() {
    if (estilosPuestos) return;
    estilosPuestos = true;
    var s = document.createElement('style');
    s.textContent =
      '.fi-fila{display:flex;align-items:center;gap:10px;margin-bottom:.5rem}'
    + '.fi-btn{flex:1;padding:.55rem;border:1px solid #ddd;border-radius:6px;'
    +   'background:#fafafa;color:#444;font-size:.92rem;font-family:inherit;'
    +   'cursor:pointer;text-align:left}'
    + '.fi-prev{width:46px;height:46px;border-radius:6px;object-fit:cover;'
    +   'border:1px solid #ddd;display:none;flex:0 0 auto}'
    + '.fi-visor{position:fixed;inset:0;background:rgba(0,0,0,.85);display:flex;'
    +   'align-items:center;justify-content:center;z-index:9999;padding:1rem}'
    + '.fi-visor img{max-width:100%;max-height:90vh;border-radius:8px}'
    + '.fi-modal{position:fixed;inset:0;background:rgba(0,0,0,.5);display:flex;'
    +   'align-items:center;justify-content:center;z-index:9998;padding:1rem}'
    + '.fi-caja{background:#fff;border-radius:10px;padding:1.1rem;max-width:340px;width:100%}'
    + '.fi-caja h3{margin:0 0 .2rem;font-size:1.02rem;color:#333}'
    + '.fi-caja p{margin:0 0 .8rem;font-size:.86rem;color:#777;line-height:1.35}'
    + '.fi-caja .fi-btns{display:flex;gap:8px;margin-top:.9rem}'
    + '.fi-caja .fi-btns button{flex:1;padding:.55rem;border:0;border-radius:6px;'
    +   'font-family:inherit;font-size:.92rem;cursor:pointer}'
    + '.fi-msg{font-size:.85rem;margin-top:.6rem;min-height:1.1em}'
    // La pantalla del jefe de obra es oscura y la del encargado clara. Un
    // dialogo blanco sobre fondo negro se lee como un error del navegador,
    // no como una parte de la app.
    + '.fi-caja.fi-oscuro{background:#1a1d24;border:1px solid #2e3340}'
    + '.fi-caja.fi-oscuro h3{color:#e8eaf0}'
    + '.fi-caja.fi-oscuro p{color:#9aa3b2}'
    + '.fi-oscuro .fi-btn{background:#22262f;color:#ccd2de;border-color:#2e3340}'
    + '.fi-oscuro .fi-prev{border-color:#2e3340}';
    document.head.appendChild(s);
  }

  function visor(url) {
    if (!url) return;
    estilos();
    var d = document.createElement('div');
    d.className = 'fi-visor';
    var img = document.createElement('img');
    img.src = url;
    d.appendChild(img);
    d.addEventListener('click', function () { d.remove(); });
    document.body.appendChild(d);
  }

  // ── Captura dentro de un formulario ──────────────────────────
  // Devuelve un mando con .blob (lo que haya elegido el usuario) y
  // .limpiar(). El formulario del encargado se borra al enviar, asi
  // que la foto tiene que vivir fuera de el.
  function montarCaptura(hueco, opts) {
    estilos();
    opts = opts || {};
    var texto  = opts.texto  || '\uD83D\uDCF7 Foto de la cara';
    var idBase = 'fi-' + Math.random().toString(36).slice(2, 8);

    hueco.innerHTML =
        '<div class="fi-fila">'
      + '<button type="button" class="fi-btn" id="' + idBase + '-btn"></button>'
      + '<img class="fi-prev" id="' + idBase + '-prev" alt="">'
      + '<input type="file" accept="image/*" capture="user" id="' + idBase + '-file" style="display:none">'
      + '</div>';

    var btn  = document.getElementById(idBase + '-btn');
    var prev = document.getElementById(idBase + '-prev');
    var file = document.getElementById(idBase + '-file');
    btn.textContent = texto;

    var mando = { blob: null, limpiar: function () { mando.blob = null; } };

    btn.addEventListener('click', function () { file.click(); });

    file.addEventListener('change', async function () {
      var f = this.files && this.files[0];
      if (!f) return;
      btn.textContent = 'Preparando la foto\u2026';
      try {
        mando.blob = await reducir(f);
        prev.src = URL.createObjectURL(mando.blob);
        prev.style.display = 'block';
        btn.textContent = '\uD83D\uDCF7 Cambiar la foto';
      } catch (e) {
        mando.blob = null;
        prev.style.display = 'none';
        btn.textContent = texto;
      }
      if (typeof opts.alCambiar === 'function') opts.alCambiar(mando.blob);
    });

    return mando;
  }

  // ── PASO 5: anadir o rehacer la foto mas tarde ───────────────
  // Lo que faltaba. Hasta hoy la foto solo se podia hacer en el
  // momento de registrar a la persona, y si el encargado no la hacia
  // entonces no habia ninguna forma de anadirla. `alTerminar` se
  // llama solo cuando la foto ha quedado guardada de verdad.
  function abrirAnadir(trabajadorId, obraId, alTerminar, opts) {
    estilos();
    opts = opts || {};
    var claseTema = (opts.tema === 'oscuro') ? ' fi-oscuro' : '';

    var fondo = document.createElement('div');
    fondo.className = 'fi-modal';
    fondo.innerHTML =
        '<div class="fi-caja' + claseTema + '">'
      + '<h3>Foto de la cara</h3>'
      + '<p>Sirve para saber quién entró. Enséñale a la persona para qué es antes de hacerla.</p>'
      + '<div class="fi-hueco"></div>'
      + '<div class="fi-msg"></div>'
      + '<div class="fi-btns">'
      +   '<button class="fi-cancelar" style="background:#eee;color:#555">Cancelar</button>'
      +   '<button class="fi-guardar" style="background:#fb8c00;color:#fff">Guardar la foto</button>'
      + '</div>'
      + '</div>';

    document.body.appendChild(fondo);

    var caja     = fondo.querySelector('.fi-caja');
    var msg      = fondo.querySelector('.fi-msg');
    var bGuardar = fondo.querySelector('.fi-guardar');
    var bCerrar  = fondo.querySelector('.fi-cancelar');
    var mando    = montarCaptura(fondo.querySelector('.fi-hueco'), {});

    // Cerrar pulsando fuera, pero NO dentro: un dedo torpe sobre el
    // formulario no puede tirar por tierra una foto ya elegida.
    fondo.addEventListener('click', function (ev) {
      if (ev.target === fondo) cerrar();
    });
    caja.addEventListener('click', function (ev) { ev.stopPropagation(); });
    bCerrar.addEventListener('click', cerrar);

    function cerrar() { fondo.remove(); }

    bGuardar.addEventListener('click', async function () {
      if (!mando.blob) {
        msg.style.color = '#c62828';
        msg.textContent = 'Primero haz la foto.';
        return;
      }
      bGuardar.disabled = true;
      bCerrar.disabled = true;
      msg.style.color = '#666';
      msg.textContent = 'Guardando\u2026';

      var r = await guardar(trabajadorId, obraId, mando.blob);

      if (!r.ok) {
        bGuardar.disabled = false;
        bCerrar.disabled = false;
        msg.style.color = '#c62828';
        msg.textContent = r.error || 'No se ha podido guardar.';
        return;
      }
      cerrar();
      if (typeof alTerminar === 'function') alTerminar(r);
    });
  }

  window.FI = {
    init: init,
    reducir: reducir,
    guardar: guardar,
    enlace: enlace,
    ver: ver,
    visor: visor,
    montarCaptura: montarCaptura,
    abrirAnadir: abrirAnadir
  };
})();
