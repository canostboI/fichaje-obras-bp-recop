# Fichaje Obras — V2

App web de control de acceso y fichaje para obras de construcción.

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
