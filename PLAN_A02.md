# PLAN A-02 — Privacidad en `validar_acceso` (RGPD)

> **Estado: ✅ IMPLEMENTADO Y VERIFICADO EN CAMPO el 8/7/2026.**
> Este documento queda como registro de la decisión y del diseño.

---

## El problema (hallazgo A-02 de la auditoría, severidad ALTA)

El cartel QR de cada obra es público (cualquiera puede fotografiarlo y
obtener el UUID de la obra) y la anon key de Supabase también lo es
(inevitable en una web estática). Con esas dos piezas, **cualquier
persona ajena a la obra** podía llamar a la RPC `validar_acceso`
probando DNIs y obtener:

- Nombre **y apellidos** completos del trabajador.
- Si estaba dado de baja.
- Sus motivos documentales detallados (apto médico caducado, formación
  pendiente, etc.).
- En qué **otra obra** tenía la jornada abierta en ese momento.

Es decir: confirmación de que un DNI pertenece a una persona concreta
más información laboral y de localización. Incumplimiento de RGPD.

## La solución (desplegada 8/7/2026)

`validar_acceso` devuelve ahora **solo lo mínimo** que la pantalla de
fichaje necesita:

| Campo | Antes | Ahora |
|---|---|---|
| `trabajador_nombre` | nombre + apellidos | **solo nombre de pila** |
| `estado` | verde/naranja/rojo | igual (solo el color) |
| `tipo_sugerido` | entrada/salida | igual |
| `mensaje` | según estado | **genérico** ("Consulte con su encargado") |
| `tiene_excepcion_hoy` | boolean | igual |
| `aviso_autocierre` | fecha + hora exacta | **solo true/false** |
| `motivos` | lista documental detallada | **ELIMINADO** |
| `obra_abierta_otra` (+nombre) | UUID y nombre de otra obra | **ELIMINADO** |
| baja del trabajador | "Trabajador dado de baja" | rojo + mensaje genérico |

El detalle completo de los motivos **no se pierde**: sigue guardándose
en la incidencia `bloqueo_rojo` (visible solo para jefe/encargado/admin
con login y RLS) y en `validaciones_obra`, que los paneles internos
leen con normalidad.

## Arreglos de coherencia incluidos (mismo despliegue)

Al reescribir la RPC se corrigieron dos bugs alineándola con el
Subloque 2:

1. **Excepciones revocadas ya no autorizan:** la comprobación de
   excepción filtra ahora por `estado = 'activa'` (mismo fix que
   `registrar_fichaje_manual` v2).
2. **Día en Europe/Madrid:** todas las fechas ("hoy", "ayer",
   deduplicación de incidencias) se evalúan en zona Madrid, no en UTC.

## Cambios en frontend (`fichaje/index.html`, desplegado 8/7/2026)

- Naranja/rojo pintan un **mensaje genérico local traducido**
  (es/ar/ro): "Hay documentación pendiente / Consulta con tu
  encargado". Nuevas claves `aviso_generico_docs` y `bloqueo_generico`.
- El aviso de autocierre funciona con el sí/no nuevo (texto sin hora
  exacta, ajustado en los 3 idiomas).
- El repintado al cambiar de idioma usa los textos locales, no la
  respuesta del servidor.

## Verificación

- SQL aplicado en Supabase (SQL Editor) el 8/7/2026, con
  `REVOKE ... FROM PUBLIC` + `GRANT` explícito a `anon, authenticated,
  service_role` (sigue siendo una de las 4 RPC públicas).
- `fichaje/index.html` verificado en el repo con curl.
- **Prueba de campo (8/7):** DNI de prueba `12345678A` (dado de baja)
  en el QR de Muralla de Valls → "Acceso denegado" + mensaje genérico,
  **sin revelar** el motivo de baja ni ningún dato personal.

## Riesgo residual

Con A-02 desplegado, la combinación UUID de obra + anon key solo
permite saber si un DNI existe en el sistema y su color de semáforo en
esa obra. Riesgo residual aceptable — actualizado en el punto **R-4**
de `RIESGOS_ASUMIDOS.md`.
