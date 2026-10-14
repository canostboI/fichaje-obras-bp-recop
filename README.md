# Fichaje Obras — V2

App web de control de acceso y fichaje para obras de construcción.

## ⚠️ Regla de datos (obligatoria)

Este repositorio es **público**. Nunca se escribe en el código, en los
comentarios, en los documentos ni en los mensajes de commit ningún dato
real de una persona: **ni DNI/NIE, ni nombres, ni teléfonos, ni correos**
de trabajadores, encargados o jefes. Tampoco para explicar «el caso de
fulano»: se escribe «caso de un trabajador», «una subcontrata», etc.

Para ejemplos y maquetas se usan datos inventados: DNI `00000000T`,
NIE `Y0000000Z`, nombres como «NOMBRE APELLIDOS» o «Pere Inventat».
Las pruebas contra la base devuelven recuentos e identificadores, nunca
datos de personas. (Auditoría de octubre de 2026, hallazgo H-01.)

## Roles

- **Admin** — acceso total
- **Jefe de obra** — gestión de su(s) obra(s): trabajadores, documentos, fichajes, excepciones
- **Encargado** — lectura de su obra + ronda diaria
- **Trabajador** — ficha con QR + DNI, sin login

## Stack

- **Frontend**: HTML + CSS + JavaScript vainilla, sin build
- **Hosting**: GitHub Pages
- **Backend**: Supabase (PostgreSQL + Auth + RPC con SECURITY DEFINER + RLS)

## Estructura

```
/
├── js/
│   └── supabase-client.js    Conexión única a Supabase
├── estilos/
│   └── base.css              (pendiente) Estilos compartidos de paneles
└── fichaje/
    └── index.html            Pantalla de fichaje del trabajador
```

## URL de fichaje

La pantalla de fichaje se abre con un parámetro `?obra=<UUID>`:

```
https://<usuario>.github.io/<repo>/fichaje/?obra=UUID-DE-LA-OBRA
```

El QR impreso en cada obra debe apuntar a esa URL.

## Seguridad

- El trabajador anónimo no tiene acceso directo a ninguna tabla.
- Solo puede llamar a dos funciones RPC:
  - `validar_acceso(dni, obra_id)`: consulta estado documental.
  - `registrar_fichaje(dni, obra_id, lat, lng)`: registra fichaje con todas las validaciones.
- Admin, jefe de obra y encargado pasan por Supabase Auth y tienen RLS acotada por rol.

## Estado actual

- ✅ Backend y seguridad completos (Fase 1 y 2).
- 🚧 Pantalla de fichaje del trabajador (en curso).
- ⏳ Login unificado + paneles admin, jefe de obra, encargado.
- ⏳ Importación e-Coordina (Excel/CSV).
- 
