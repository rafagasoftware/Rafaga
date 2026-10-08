// ",", ".", ":", "(" y ")" son sintaxis reservada dentro de un filtro
// .or(...) de PostgREST — sin escapar, un nombre con coma o paréntesis
// (`Pérez, Gómez SRL`) rompe el filtro en vez de buscarlo.
export function escaparParaFiltro(texto: string): string {
  return texto.replace(/[\\,.:()]/g, '\\$&');
}
