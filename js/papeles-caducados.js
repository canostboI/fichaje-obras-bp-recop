/* ============================================================
   js/papeles-caducados.js — «NO TIENE CONTRATO» CUANDO SÍ LO TIENE
   ------------------------------------------------------------
   1/10/2026 (Dani: «hazlo también»).

   DE DÓNDE VIENE
   La pantalla de Trabajadores solo carga los contratos y libros
   VIGENTES. Si una empresa tenía uno y caducó, el modal decía «no
   tiene contrato registrado», que es falso: lo tiene, vencido. Pasó
   con BAMSA en MURALLA DE VALLS el 1/10 (contrato 01/06–30/09).
   Además, al registrar el nuevo, la BD daba «duplicate key»; eso ya
   se arregló en la BD (trigger contratos_empresa_renovar: renueva la
   fila en vez de duplicarla).

   QUÉ HACE
   Cuando se abre el modal de contrato o de libro y no hay uno
   vigente, mira si hay uno CADUCADO o uno que AÚN NO HA EMPEZADO y
   cambia el texto para decirlo, con la fecha. No toca nada más: ni
   el formulario, ni los botones, ni lo que se guarda.

   CÓMO SE ENGANCHA
   Envuelve abrirModalContrato y abrirModalLibro de
   jefe/trabajadores.html (las llaman los onclick de la tabla por su
   nombre global, así que el envoltorio se usa solo). Llama primero a
   la original: si este archivo falla, el modal funciona como antes.

   CANDADO: solo en /jefe/trabajadores.html.
   PARA DESHACERLO: quitar `cargar('papeles-caducados.js')` de
   js/marca-portium.js. Nada más depende de este archivo.
   ============================================================ */
(function () {
  'use strict';

  var SUPABASE_URL = 'https://istrnsicleopzbsrapsw.supabase.co';
  var SUPABASE_ANON_KEY = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6ImlzdHJuc2ljbGVvcHpic3JhcHN3Iiwicm9sZSI6ImFub24iLCJpYXQiOjE3NzU4MTIxMTYsImV4cCI6MjA5MTM4ODExNn0.5UXV2LWPXmbfLI7rKpZSG9YBzZsesjckHnhQabA0mTY';

  var cliente = null;
  function sb() {
    if (cliente) return cliente;
    if (!window.supabase || !window.supabase.createClient) return null;
    cliente = window.supabase.createClient(SUPABASE_URL, SUPABASE_ANON_KEY);
    return cliente;
  }

  function esc(t) {
    return String(t == null ? '' : t)
      .replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;')
      .replace(/"/g, '&quot;');
  }

  function fecha(iso) {
    var p = String(iso || '').slice(0, 10).split('-');
    return p.length === 3 ? p[2] + '/' + p[1] + '/' + p[0] : String(iso || '');
  }

  // Día de hoy en España, igual que el resto de la app.
  function hoy() {
    if (window.Fechas && typeof window.Fechas.hoyMadrid === 'function') return window.Fechas.hoyMadrid();
    return new Intl.DateTimeFormat('en-CA', {
      timeZone: 'Europe/Madrid', year: 'numeric', month: '2-digit', day: '2-digit'
    }).format(new Date());
  }

  // La obra elegida en la pantalla (variable de jefe/trabajadores.html).
  function obraActual() {
    try {
      // eslint-disable-next-line no-undef
      if (typeof obraFiltroTrabajadores !== 'undefined' && obraFiltroTrabajadores) return obraFiltroTrabajadores;
    } catch (_) {}
    return null;
  }

  function nombreObra() {
    try {
      // eslint-disable-next-line no-undef
      if (typeof obtenerObraFiltro === 'function') {
        var o = obtenerObraFiltro();
        if (o && o.nombre) return o.nombre;
      }
    } catch (_) {}
    return 'esta obra';
  }

  // cfg: { tabla, introId, formId, palabra ('contrato'|'libro de subcontratación'),
  //        articulo ('El'|'El'), nuevo ('el contrato nuevo'|'el libro nuevo'),
  //        sustituye (texto sobre lo que pasa al guardar) }
  function revisar(cfg, empresaId, empresaNombre) {
    var form = document.getElementById(cfg.formId);
    // Si el formulario está oculto, hay uno VIGENTE: el texto original ya es bueno.
    if (!form || form.style.display === 'none') return;
    var obraId = obraActual();
    var c = sb();
    if (!obraId || !c || !empresaId) return;

    c.from(cfg.tabla)
      .select('valido_desde, valido_hasta')
      .eq('empresa_id', empresaId)
      .eq('obra_id', obraId)
      .then(function (r) {
        if (r.error || !r.data || !r.data.length) return;
        var intro = document.getElementById(cfg.introId);
        // Si entretanto se ha cerrado o se ha abierto otro modal, no tocar.
        if (!intro || form.style.display === 'none') return;
        var overlay = form.closest('.modal-overlay');
        if (overlay && !overlay.classList.contains('abierto')) return;

        var h = hoy();
        var futuro = null, ultimoFin = null;
        r.data.forEach(function (x) {
          if (x.valido_desde && x.valido_desde > h) {
            if (!futuro || x.valido_desde < futuro.valido_desde) futuro = x;
          } else if (x.valido_hasta && x.valido_hasta < h) {
            if (!ultimoFin || x.valido_hasta > ultimoFin) ultimoFin = x.valido_hasta;
          }
        });

        var emp = '<strong>' + esc(empresaNombre) + '</strong>';
        var obra = '<strong>' + esc(nombreObra()) + '</strong>';
        if (futuro) {
          intro.innerHTML = emp + ' tiene ' + cfg.unUna + ' ' + cfg.palabra + ' registrado en ' + obra
            + ' que <strong>todavía no ha empezado</strong>: válido desde <strong>'
            + fecha(futuro.valido_desde) + '</strong>.<br>' + cfg.siGuardas;
        } else if (ultimoFin) {
          intro.innerHTML = cfg.articulo + ' ' + cfg.palabra + ' de ' + emp + ' en ' + obra
            + ' <strong>caducó el ' + fecha(ultimoFin) + '</strong>.<br>Registra las fechas de '
            + cfg.nuevo + '. ' + cfg.siGuardas;
        }
      })
      .catch(function (e) {
        console.warn('[papeles-caducados] no se ha podido mirar el ' + cfg.palabra + ' anterior:', e);
      });
  }

  function envolver(nombre, cfg) {
    var original = window[nombre];
    if (typeof original !== 'function' || original.__papelesCaducados) return false;
    var envuelta = function (empresaId, empresaNombre) {
      var res = original.apply(this, arguments);
      try { revisar(cfg, empresaId, empresaNombre); }
      catch (e) { console.warn('[papeles-caducados]', e); }
      return res;
    };
    envuelta.__papelesCaducados = true;
    window[nombre] = envuelta;
    return true;
  }

  function iniciar() {
    try {
      var pagina = window.location.pathname.split('/').pop() || '';
      if (window.location.pathname.indexOf('/jefe/') === -1 || pagina !== 'trabajadores.html') return;
      envolver('abrirModalContrato', {
        tabla: 'contratos_empresa',
        introId: 'contrato-intro',
        formId: 'contrato-form',
        palabra: 'contrato',
        unUna: 'un',
        articulo: 'El',
        nuevo: 'el contrato nuevo',
        // Contratos: una fila por empresa y obra; el trigger la renueva.
        siGuardas: 'Al registrar, se sustituye el anterior.'
      });
      envolver('abrirModalLibro', {
        tabla: 'libros_subcontratacion',
        introId: 'libro-intro',
        formId: 'libro-form',
        palabra: 'libro de subcontratación',
        unUna: 'un',
        articulo: 'El',
        nuevo: 'la firma nueva',
        // Libros: cada firma es una fila; el anterior se queda como historial.
        siGuardas: 'Al registrar, el anterior se queda como historial.'
      });
    } catch (e) {
      console.warn('[papeles-caducados] no se ha podido montar:', e);
    }
  }

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', iniciar);
  } else {
    iniciar();
  }
})();
