import type { Cliente } from '../../types/domain';

const CLASE_A = new Set(['factura_a', 'nc_a']);
const CLASE_B = new Set(['factura_b', 'nc_b']);
const INSCRIPTO_O_MONOTRIBUTO = new Set(['Responsable Inscripto', 'Monotributista']);

// Mismas reglas que backend/src/arca/wsfe.ts (solicitarCAE): acá se usan
// para no ofrecer una combinación inválida en el asistente; allá se
// vuelven a chequear antes de llamar a ARCA, por si este paso se saltea.
export function motivoClienteInvalido(cliente: Cliente, tipoComprobante: string): string | null {
  const esInscriptoOMonotributo = INSCRIPTO_O_MONOTRIBUTO.has(cliente.condicion_iva);

  if (CLASE_A.has(tipoComprobante)) {
    if (cliente.tipo_documento !== 'CUIT') {
      return 'Los comprobantes tipo A solo se le pueden emitir a un cliente con CUIT.';
    }
    if (!esInscriptoOMonotributo) {
      return 'Los comprobantes tipo A solo se le pueden emitir a un cliente Responsable Inscripto o Monotributista.';
    }
  }

  if (CLASE_B.has(tipoComprobante) && esInscriptoOMonotributo) {
    return 'Los comprobantes tipo B no se le pueden emitir a un cliente Responsable Inscripto ni Monotributista — le corresponde un tipo A.';
  }

  return null;
}

export function esClienteValidoParaComprobante(cliente: Cliente, tipoComprobante: string): boolean {
  return motivoClienteInvalido(cliente, tipoComprobante) === null;
}

// Qué tipos de comprobante puede emitir el propio emisor según su
// condición de IVA — un Responsable Inscripto no puede emitir tipo C, y
// un Monotributista/Exento no discrimina IVA así que solo puede emitir C.
export function tiposComprobanteDisponibles(condicionIvaEmisor: string): string[] {
  switch (condicionIvaEmisor) {
    case 'Responsable Inscripto':
      return ['factura_a', 'factura_b'];
    case 'Monotributista':
    case 'Exento':
      return ['factura_c'];
    default:
      return ['factura_a', 'factura_b', 'factura_c'];
  }
}
