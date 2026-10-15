# vendor/ — librerías de terceros servidas desde este repo (H-39)

Hasta el 15/10/2026 las páginas cargaban estas librerías de `cdn.jsdelivr.net`, y
`@supabase/supabase-js@2` sin versión fija: cualquier versión nueva (o un CDN
comprometido) se ejecutaba en todas las páginas, también en la valla.

Ahora se sirven desde aquí, con versión exacta y con `integrity` (el navegador
comprueba la huella y, si el fichero cambia, no lo ejecuta).

| Fichero | Paquete npm | Fichero original del paquete | Huella `integrity` |
|---|---|---|---|
| `supabase-js-2.117.3.js` | `@supabase/supabase-js@2.117.3` (07/10/2026) | `dist/umd/supabase.js` | `sha384-BWcjm9OdFth9TbhCxZPdm+gAOUMAzQy9nmTs12ioXdCcbVnJaPMn+fMUoQCLt60R` |
| `exceljs-4.4.0.min.js` | `exceljs@4.4.0` | `dist/exceljs.min.js` | `sha384-Pqp51FUN2/qzfxZxBCtF0stpc9ONI6MYZpVqmo8m20SoaQCzf+arZvACkLkirlPz` |
| `qrious-4.0.2.min.js` | `qrious@4.0.2` | `dist/qrious.min.js` | `sha384-Dr98ddmUw2QkdCarNQ+OL7xLty7cSxgR0T7v1tq4UErS/qLV0132sBYTolRAFuOV` |
| `xlsx-0.18.5.full.min.js` | `xlsx@0.18.5` | `dist/xlsx.full.min.js` | `sha384-vtjasyidUo0kW94K5MXDXntzOJpQgBKXmE7e2Ga4LG0skTTLeBi97eFAXsqewJjw` |

Los ficheros son copias exactas, byte a byte, de los del paquete publicado en npm
(no se han tocado; dos llevan una línea `sourceMappingURL` que solo usa el
navegador con las herramientas de desarrollador abiertas). Licencias en `licencias/`.

## Cómo actualizar una librería (no hace falta salvo fallo de seguridad)
1. Bajar el paquete nuevo de npm y copiar el mismo fichero de `dist/` aquí con la
   versión en el nombre.
2. Calcular la huella: `openssl dgst -sha384 -binary FICHERO | base64` → `sha384-…`.
3. Cambiar `src` e `integrity` en TODAS las páginas que la usan (buscar el nombre
   viejo) y esta tabla. Si una página tiene la huella vieja, la librería no carga.
4. Probar el login y la valla antes de dar por buena la subida.
