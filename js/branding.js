// Branding por empresa-marca
// Uso: BRANDING[obra.empresa_marca]
// Devuelve: { nombre, color_principal, color_acento, color_acento_rgb, color_texto, logo, logo_blanco }
//
// 18/9/2026 — Colores corporativos reales, decididos por Dani mirando prueba-colores.html:
//   Bosch Pascual -> teal      #1A7A8A
//   Rècop         -> terracota #A0392B
// Los mismos que usa el Excel proforma (js/excel-proforma.js).
// El tema oscuro de los paneles NO depende de la marca: solo cambia el acento.

const BRANDING = {
  bosch_pascual: {
    nombre: 'Bosch Pascual',
    color_principal: '#1A7A8A',
    color_acento: '#1A7A8A',
    color_acento_rgb: '26,122,138',
    color_texto: '#ffffff',
    logo: 'assets/logos/bosch_pascual_logo.svg',
    logo_blanco: 'assets/logos/bosch_pascual_logo_white.svg'
  },
  recop: {
    nombre: 'Rècop',
    color_principal: '#A0392B',
    color_acento: '#A0392B',
    color_acento_rgb: '160,57,43',
    color_texto: '#ffffff',
    logo: 'assets/logos/recop_logo.svg',
    logo_blanco: 'assets/logos/recop_logo_white.svg'
  }
};

// Función helper: aplica el branding a una página
// Recibe el código de empresa ('bosch_pascual' o 'recop')
// Devuelve el objeto de branding, o el de bosch_pascual si no se encuentra
function obtenerBranding(empresa_marca) {
  return BRANDING[empresa_marca] || BRANDING.bosch_pascual;
}

// Función helper: aplica las variables CSS del branding al documento
// Así cualquier página puede usar var(--color-principal), var(--color-acento), etc.
function aplicarBranding(empresa_marca) {
  const b = obtenerBranding(empresa_marca);
  const root = document.documentElement;
  root.style.setProperty('--color-principal', b.color_principal);
  root.style.setProperty('--color-acento', b.color_acento);
  root.style.setProperty('--color-acento-rgb', b.color_acento_rgb);
  root.style.setProperty('--color-texto', b.color_texto);
  return b;
}
