# AUDITORÍA DE SILENCIOS — Fichaje Obras V2

> Verificación sistemática de todo lo que ocurre "solo" sin que nadie
> mire el resultado. **Fecha: 22/7/2026.** Formato hermano de
> AUDITORIA_PROFUNDA.md (seguridad) y AUDITORIA_USABILIDAD.md (flujo).
>
> **Origen:** el autocierre nocturno estuvo MESES fallando en silencio
> (reparado 20/7) y Twilio estuvo un mes caído sin que nadie lo supiera
> (junio-julio). Dani pidió una forma sistemática de descubrir fallos
> por omisión ANTES de que un síntoma los delate.
>
> **Método:** solo lectura. ~12 consultas guiadas contra la BD real
> (`cron.job_run_details`, `avisos_ronda_enviados`, `fichajes`,
> `incidencias`, `usuarios_app`) + logs del panel de Brevo. Los únicos
> cambios de la sesión fueron 3 UPDATEs de higiene acordados sobre la
> marcha (documentados abajo).

---

## Resumen ejecutivo

- **7 automatismos verificados SANOS** de punta a punta (no solo "el
  cron corrió", sino "hizo lo que debía").
- **4 hallazgos cazados y arreglados en la misma sesión.**
- **4 hallazgos abiertos** que van a subloques de diseño ya existentes
  (US-6, US-7) o a decisión de Dani.
- **Remate pendiente:** el VIGILANTE DE CRONS (diseño acordado,
  implementación en próxima sesión).

La lección que confirma esta auditoría: `succeeded` en un cron solo
significa que la función corrió, no que hiciera algo útil. Twilio
puede devolver error con el cron en verde; un aviso puede "enviarse"
a nadie; una bandeja puede llenarse sin que exista botón para
vaciarla. Verificar = seguir la cadena hasta el efecto real.

---

## VERIFICADO SANO ✅

### S-01 · Cron de autocierre nocturno
- `cron.job_run_details`: ejecución del 21/7 00:30 → `succeeded`
  (primera exitosa tras la reparación del 20/7; los `failed` del
  18-20/7 son el fallo viejo).
- **Efecto real verificado:** cerró exactamente las 3 jornadas
  abiertas del lunes 20 (Martí, Fennouch, Essamery) a las 17:30.
- **Cero escapes en julio:** recuento por día de entradas sin salida
  del 2 al 20 de julio = 0 en todos los días. Certificado.

### S-02 · Crons de aviso de ronda (los 3)
- `job_run_details`: `succeeded` los días 17, 20 y 21 en sus horas.
- Nunca se habían mirado — mismo riesgo exacto que tenía el
  autocierre. Ahora verificados.

### S-03 · SMS Twilio (efecto real)
- `avisos_ronda_enviados` del 21/7: todos los envíos con
  `error_code: null` y `messaging_service_sid` correcto (remitente
  "BP Obras"). Twilio ACEPTA los mensajes, no solo los recibe la RPC.
- Llegada física confirmada por Dani (martes 21).

### S-04 · Sync nocturna e-Coordina
- Corrió el 22/7 a las 06:52, 2 obras actualizadas (badge del panel
  admin). Sin issues `sync-fallida` abiertas.

### S-05 · Emails Brevo (entrega real, no solo API OK)
- Logs del panel de Brevo: los emails de ronda al jefe del 20/7 →
  Enviado → **Entregado → Abierto** (canostboi+jefe). Ya no caen en
  spam. Los emails de Auth (signup, reset) del 19-20/7: todos
  entregados y abiertos.

### S-06 · Coherencia entrada/salida en toda la tabla
- **0 salidas huérfanas** en julio (salida sin entrada previa el
  mismo día). La barrera de la RPC aguanta y ningún camino lateral
  (manual, corrección, autocierre) la ha roto.

### S-07 · Excepciones rojas y obra de prueba
- **0 excepciones activas a futuro** (más allá de mañana): la
  autorización de 1-2 días no deja residuos.
- **0 fichajes en la Obra de Prueba Cornellà desde mayo**: nadie
  ficha ahí por error. Su único ruido eran los SMS (ver H-01).

---

## CAZADO Y ARREGLADO EN SESIÓN 🔧

### H-01 · SMS diarios a la obra de prueba y al móvil de Dani
- **Qué:** `encargado@test.com` conservaba el 2º número de Dani
  (+34619427906) — la reversión anotada el 19/7 NO estaba en la BD
  (otra vez el patrón "las notas mienten"). Ese usuario está en las
  3 obras → Dani recibía SMS de las 3, incluida la de prueba, que
  generaba SMS reales (con coste) cada mañana.
- Extra: `jefe@test.com` tenía un teléfono CORRUPTO (`+3461942790`,
  9 dígitos) — el número de Dani mal recortado.
- **Fix:** `telefono = NULL` en ambos usuarios de test. Verificado.

### H-02 · Escola Música Valls se quedaba sin receptor de avisos
- **Qué:** al limpiar H-01 se descubrió que el ÚNICO encargado con
  teléfono de Escola era el de test. El sistema "funcionaba" solo
  porque los SMS le llegaban a Dani por la ficha de test; el
  encargado real de Escola nunca los ha recibido. Aviso enviado a
  nadie = silencio de libro.
- **Fix (decisión de Dani):** teléfono +34619427906 añadido a la
  cuenta sombra **Dani Encargado** (está en las 2 obras reales, no
  en la de prueba). Reparto actual: Lester (Muralla) + Dani
  (Muralla y Escola). Cuando haya encargado real de Escola con
  ficha, se le pone teléfono desde el modal Equipo y Dani decide si
  retira el suyo.

### H-03 · Ficha y cuenta Auth vivas de una persona que ya no está
- **Qué:** ficha "Jamal" (`jamal@test.com`, rol encargado, activa,
  VINCULADA a Auth). Persona real que estuvo en obra y ya no está.
  Podía hacer login. Email de dominio test.com → irrecuperable y
  fuente de rebotes si el sistema le enviara algo.
- **Fix:** `activo = false` (SQL, verificado) + cuenta borrada de
  Supabase → Authentication → Users (panel). Sin efecto sobre
  histórico de fichajes (tabla `trabajadores` aparte).
- **Patrón nuevo para US-6:** el ciclo de vida de las personas
  (alta ✅ 19/7 / **baja** ← sin flujo) — dar de baja a alguien hoy
  es SQL + panel, dos pasos manuales fáciles de olvidar.

### H-04 · Escape del autocierre: 1 entrada abierta el 1/7
- **Qué:** AOURAGH, EL HASSAN (Muralla) fichó ENTRADA a las 17:30:04
  del 1/7 (olvidó la entrada de la mañana; al ir a fichar la salida
  el sistema le sugirió Entrar y le dio). La recuperación manual del
  20/7 no la cerró y además le generó un autocierre suelto el 2/7 a
  las 23:59.
- **Decisión de Dani:** conocido y ASUMIDO, no se corrige. (Si algún
  día molesta en el proforma: corregir la entrada del 1/7 a las 8:00
  y mover el autocierre del 2/7 al 1/7 17:30, desde la UI del jefe.)

---

## HALLAZGOS ABIERTOS 📋

### P-01 · `jefe@test.com` rebota en Brevo (Soft bounce)
- Los emails de ronda a ese usuario rebotan (dominio inexistente).
  Rebotes repetidos dañan la reputación del remitente Gmail (ya
  delicada por ser nuevo). Pregunta de fondo: **¿deben los usuarios
  de test estar asignados a las obras reales?** Con las cuentas
  sombra de Dani, probablemente sobran ahí. → **US-6.**

### P-02 · 1.006 avisos naranja en estado `nueva` que NADIE puede vaciar
- `incidencias` por tipo/estado: `aviso_naranja` acumula 1.006 filas
  en `nueva` desde abril, CERO revisadas — no existe pantalla que
  permita marcarlas. Los rojos sí tienen botón (74 revisadas de 361)
  y los autocierres se revisan al 100% (122/122).
- **Diagnóstico de fondo:** la tabla mezcla ALERTAS que piden acción
  (rojo, autocierre, fuera_de_zona) con RASTRO histórico (naranja,
  fichaje_corregido, excepcion_autorizada). Las segundas no
  necesitan flujo de revisión y contaminan los contadores.
  Separar ambos conceptos (p.ej. estado inicial distinto para el
  rastro) → sesión de diseño **US-7** (junto con U-10, la bandeja
  del admin sin acciones).

### P-03 · Abril–junio dimensionado: ~355 días-persona sin cerrar
- Recuento por día: entradas sin salida entre el 19/4 y el 30/6
  suman ~355 (el bloque que la reparación del autocierre dejó
  deliberadamente sin tocar). La decisión de Dani (cerrar histórico
  vs. dejarlo — cambiaría totales ya facturados) ya tiene número
  exacto. Inclinación actual: dejarlo. **Sin prisa.**

### P-04 · Martí Balsells no ficha las salidas (hábito)
- Autocerrado el 16/7 y el 20/7; casi no ficha entradas tampoco.
  No es fallo del sistema: hablar con él o con el encargado.

---

## REMATE: VIGILANTE DE CRONS (diseño acordado, pendiente de implementar)

**Problema:** pg_cron falla en silencio; `cron.job_run_details` solo
se mira cuando ya hay un síntoma. GitHub Actions sí avisa (Watch +
email); pg_cron no avisa de nada.

**Diseño elegido** (coherente con el stack, sin servidores nuevos):
- **Chivato en el dashboard del admin** (`admin/index.html`): al
  cargar, consulta las ejecuciones de las últimas 24h; si algún cron
  está `failed` — o directamente NO corrió cuando tocaba — banner
  rojo arriba del todo. El fallo silencioso se vuelve visible en la
  pantalla que Dani ya mira a diario.
- **Pega técnica:** `cron.job_run_details` no es legible con la anon
  key → hace falta una RPC pequeña de solo lectura (p.ej.
  `salud_crons()`), SECURITY DEFINER, GRANT solo a `authenticated`
  con chequeo `es_admin()` dentro, que devuelva por cada job su
  última ejecución (jobname, hora, status, mensaje).
- **Implementación:** próxima sesión (RPC + banner en admin/index).

---

## Registro

| # | Tipo | Estado | Nota |
|---|------|--------|------|
| S-01..S-07 | Verificación | ✅ SANO | Cadena completa comprobada 22/7 |
| H-01 | Hallazgo | ✅ ARREGLADO 22/7 | Teléfonos de test a NULL |
| H-02 | Hallazgo | ✅ ARREGLADO 22/7 | Dani Encargado cubre Escola |
| H-03 | Hallazgo | ✅ ARREGLADO 22/7 | Jamal: ficha inactiva + Auth borrado |
| H-04 | Hallazgo | ✅ ASUMIDO 22/7 | AOURAGH 1/7 — decisión Dani, no corregir |
| P-01 | Pendiente | ABIERTO | → US-6 (usuarios de test en obras reales) |
| P-02 | Pendiente | ABIERTO | → US-7 (alerta vs. rastro en incidencias) |
| P-03 | Pendiente | ABIERTO | Decisión Dani, sin prisa (~355 días-persona) |
| P-04 | Pendiente | ABIERTO | Hábito de Martí — gestión humana |
| Vigilante | Diseño | ACORDADO | Implementar: RPC `salud_crons()` + banner admin |
