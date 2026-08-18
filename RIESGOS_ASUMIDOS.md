# RIESGOS ASUMIDOS — Fichaje Obras V2

> Riesgos conocidos, analizados y **aceptados conscientemente** con sus
> mitigaciones. Este documento existe para que las decisiones queden
> escritas y no se redescubran como "bugs" en el futuro.
>
> Creado: 6/7/2026 (auditoría profunda, hallazgo MJ-19).
> Última actualización: 2/8/2026 (revisión de grants a `anon` y
> cierre documental de A-02).

---

## R-1 · Suplantación por DNI en el fichaje del trabajador

**Qué es:** el trabajador ficha con QR + DNI + GPS, **sin login ni
contraseña**. Cualquiera que conozca el DNI de un compañero y esté
físicamente en la obra puede fichar por él.

**Por qué se acepta:**
- Exigir login/contraseña a peones de subcontratas es inviable en la
  práctica (rotación alta, móviles compartidos, barrera idiomática).
- El riesgo equivale al del fichaje en papel que sustituye: firmar por
  un compañero siempre fue posible. La app no empeora la situación y
  añade trazabilidad (hora exacta, GPS, dispositivo).

**Mitigaciones activas:**
- GPS obligatorio y **recalculado en servidor**: hay que estar en la obra.
- Incidencia `movil_compartido`: si varios DNIs fichan desde el mismo
  contexto, queda registrado para revisión.
- El encargado confirma presencia real con la ronda diaria
  (`marcar_ronda`), que actúa como verificación humana cruzada.
- Todo fichaje queda auditado (hora, coordenadas, origen).

**Revisión futura:** si se implementa P-13 (portal del trabajador con
DNI + PIN), el PIN puede reutilizarse para endurecer el fichaje sin
romper la operativa.

---

## R-2 · GPS falseable (mock location) — B-15

**Qué es:** una app web no puede detectar aplicaciones de ubicación
falsa (mock location) en el móvil. Un trabajador con conocimientos
podría fichar "desde la obra" estando en otro sitio.

**Estado:** ✅ **ACEPTADO por Dani el 8/7/2026** con las mitigaciones
de abajo. Cierra el hallazgo B-15 de la auditoría profunda.

**Por qué se recomienda aceptar:**
- Detectar mock location de forma fiable requiere app nativa. Cambiar
  a app nativa rompe la decisión arquitectónica central del proyecto
  (web simple, sin instalación, sin tiendas de apps).
- El perfil de usuario y el incentivo real hacen el fraude poco
  probable; y de ocurrir, es detectable por las mitigaciones.

**Mitigaciones activas:**
- Coordenadas **recalculadas y validadas en servidor** contra el radio
  de la obra (el cliente no decide si está dentro).
- Fichajes fuera de zona → denegados + incidencia `fuera_de_zona`.
- Ronda diaria del encargado: contraste humano entre fichados y
  presentes.
- Resumen mensual (P-07): patrones anómalos de horas saltan a la vista.

---

## R-3 · Anon key de Supabase pública en el frontend

**Qué es:** la clave `anon` está visible en el código de todas las
páginas (es inevitable en una web estática sin servidor propio).

**Por qué se acepta:** es el diseño estándar de Supabase. La anon key
**no da acceso a nada por sí misma**: todo pasa por RLS + FORCE RLS y
por las 5 únicas RPC públicas. La seguridad no depende del secreto de
la clave, sino de las policies.

**Mitigaciones activas (verificadas en auditoría, 27/6; inventario de
RPC revisado y corregido el 2/8/2026):**
- `anon` solo puede ejecutar 5 RPC: `obra_publica`, `validar_acceso`,
  `registrar_fichaje`, `registrar_presente_sin_registrar`,
  `registrar_incidencia_movil_compartido`.
- Las 5 se invocan **únicamente desde `fichaje/index.html`** (página
  anónima del trabajador). Verificado por búsqueda en el repo el
  2/8/2026: ninguna de ellas se llama desde `jefe/`, `encargado/` ni
  `admin/` con sesión anónima.
- `sincronizar_activa_desde_estado()` tenía EXECUTE para `anon` sin
  justificación. **REVOCADO a `anon` y a `authenticated` el 17/8/2026**
  (verificado: `has_function_privilege` = false para los dos). Sigue
  siendo ejecutable por `postgres` y por el trigger interno.

  🔴 **CORRECCIÓN DEL 17/8/2026.** Este párrafo afirmaba que el REVOKE
  se hizo el **2/8/2026**. **Era falso.** El 17/8 se comprobó contra
  `pg_proc` y `anon` seguía teniendo EXECUTE: o nunca se ejecutó, o se
  deshizo. *Un documento describe lo que alguien quiso hacer; solo una
  consulta describe lo que pasó.*

  También era inexacta la descripción: no es una función «que escribe en
  masa», es una **función de trigger** (`RETURNS trigger`) de tres
  líneas que recalcula `obras.activa` a partir de `obras.estado`, y su
  único consumidor es el trigger `trg_sincronizar_activa`. Como
  PostgREST no expone funciones de trigger y Postgres no deja
  invocarlas a mano, **aquel EXECUTE era un permiso imposible de usar:
  no hubo exposición en ningún momento.**

  ⚠️ **El riesgo real era otro, y estuvo abierto quince días.** Esta
  función figuraba además en la lista blanca `rpc_publicas` de
  `auditoria_permisos()`. El bloque A de esa auditoría solo denuncia
  funciones abiertas a `anon` **que no estén en la lista**, así que dejó
  de mirarla: del 2/8 al 17/8 el vigilante escribió
  `hay_desviacion = false` todos los días con el permiso abierto
  delante. **No falló: estaba mirando a otro lado por diseño.**

  Corregido el 17/8 en un solo bloque (por separado, cualquiera de las
  dos mitades dispara un aviso de desviación falsa a las 07:00):
  REVOKE + lista blanca reducida a las 5 RPC reales + una guarda nueva
  que denuncia cualquier nombre de `rpc_publicas` cuya función devuelva
  `trigger`.
- `PUBLIC` no tiene EXECUTE en ninguna función del esquema.
- FORCE RLS en las 19 tablas activas; `anon` sin grants directos.
- `service_role` jamás en frontend, repo, chat ni documentación.

**Nota de mantenimiento:** hasta el 2/8/2026 este documento afirmaba
que `anon` podía ejecutar 4 RPC. Eran 5 (faltaba
`registrar_presente_sin_registrar`). El desfase se detectó al cruzar
`pg_proc` con el código del repo. Cualquier RPC nueva que se abra a
`anon` debe añadirse aquí en el mismo commit.

**Segunda nota (17/8/2026):** es la segunda vez que este documento se
desvía de la realidad, y las dos veces en la misma dirección — dando por
hecho algo que nadie volvió a comprobar. **Un cambio de permisos no se
anota como hecho hasta haberlo verificado con `has_function_privilege`
después de ejecutarlo.** «Success. No rows returned» no es verificación.

**Consulta de verificación** (SQL Editor, para repetir la comprobación
en futuras auditorías):

```sql
SELECT p.proname, pg_get_function_identity_arguments(p.oid) AS args
FROM pg_proc p
JOIN pg_namespace n ON n.oid = p.pronamespace
WHERE n.nspname = 'public'
  AND has_function_privilege('anon', p.oid, 'EXECUTE')
ORDER BY p.proname;
```

---

## R-4 · UUID de obra público en el cartel QR

**Qué es:** el QR de cada obra contiene su UUID
(`/fichaje/?obra=UUID`). Cualquiera que fotografíe el cartel conoce el
UUID y puede llamar a las RPC públicas de esa obra.

**Por qué se acepta parcialmente:** el QR debe ser fijo e imprimible
(requisito operativo). El UUID por sí solo no permite fichar sin DNI
válido ni GPS dentro del radio.

**Hallazgo A-02 (RGPD) — ✅ RESUELTO el 8/7/2026.** Antes, la
combinación UUID + anon key permitía enumerar DNIs y obtener apellidos,
motivos documentales detallados y en qué otra obra tenía jornada
abierta el trabajador. `validar_acceso` se reescribió para devolver
solo nombre de pila + color + acción sugerida + mensaje genérico. Ver
`PLAN_A02.md` para el diseño completo. **Verificado contra
`pg_get_functiondef` el 2/8/2026:** el `json_build_object` final no
contiene `motivos` ni `obra_abierta_otra`; los motivos detallados solo
se escriben en la incidencia `bloqueo_rojo` (uso interno, con RLS).

**Riesgo residual, ahora SÍ aceptado:** con un UUID de obra cualquiera
+ anon key todavía se puede comprobar si un DNI existe en el sistema y
obtener, de ese DNI:
- el **nombre de pila** (necesario para el saludo de la pantalla),
- el **color** del semáforo en esa obra,
- si hay excepción activa hoy.

Ojo al alcance: la búsqueda del trabajador **no filtra por obra**, así
que el UUID de una sola obra sirve para sondear DNIs contra toda la
base. Se acepta porque el dato revelado es mínimo y el atacante ya
necesita conocer el DNI completo de antemano (no es enumerable por
fuerza bruta con coste razonable: 8 dígitos + letra de control).

---

## R-5 · Dependencia de e-Coordina vía scraping (sin API)

**Qué es:** e-Coordina no ofrece API. La sync nocturna descarga el CSV
con un navegador automatizado (Playwright). Si e-Coordina cambia su web,
la sync se rompe sin previo aviso.

**Por qué se acepta:** no hay alternativa (API no disponible). El coste
de un fallo es bajo: los estados documentales simplemente no se
refrescan esa noche; nadie queda bloqueado indebidamente (política de
"desaparecidos": los ausentes de un import nunca se bloquean en
automático).

**Mitigaciones activas:**
- Issue automática en el repo si la sync falla (`ecoordina.yml`, MJ-20),
  con capturas de pantalla del fallo en el artifact `debug/`.
- Importador manual del jefe (`jefe/documentos-ecoordina.html`) y del
  admin como respaldo: misma lógica, mismo módulo compartido.

---

## Cómo mantener este documento

- Cada riesgo nuevo que se decida **no** resolver, se añade aquí con:
  qué es, por qué se acepta, mitigaciones, y cuándo revisarlo.
- Si una mitigación cambia (p. ej. se implementa A-02), actualizar el
  punto afectado con fecha.
- Si se abre o se cierra el EXECUTE de una RPC a `anon`, actualizar
  R-3 en el **mismo commit** que el cambio en base de datos.
- Este archivo vive en la raíz del repo y en el knowledge del proyecto.
