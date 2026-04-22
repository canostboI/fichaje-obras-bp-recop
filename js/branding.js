// Branding por empresa-marca
// Uso: BRANDING[obra.empresa_marca]
// Devuelve: { nombre, color_principal, color_acento, color_texto, logo, logo_blanco }

const BRANDING = {
  bosch_pascual: {
    nombre: 'Bosch Pascual',
    color_principal: '#1a1a1a',
    color_acento: '#c8102e',
    color_texto: '#ffffff',
    logo: 'assets/logos/bosch_pascual_logo.svg',
    logo_blanco: 'assets/logos/bosch_pascual_logo_white.svg'
  },
  recop: {
    nombre: 'Rècop',
    color_principal: '#6b3410',
    color_acento: '#c9a876',
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
  root.style.setProperty('--color-texto', b.color_texto);
  return b;
}
