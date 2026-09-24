export const TIPOS_COMPROBANTE = [
  { value: 'factura_a', label: 'Factura A', letra: 'A', codigo: '001' },
  { value: 'factura_b', label: 'Factura B', letra: 'B', codigo: '006' },
  { value: 'factura_c', label: 'Factura C', letra: 'C', codigo: '011' },
  // Las notas de crédito no se eligen en el asistente (Paso1 solo ofrece los
  // tipos de factura): están para mostrarlas bien en el listado y el detalle.
  { value: 'nc_a', label: 'Nota de crédito A', letra: 'A', codigo: '003' },
  { value: 'nc_b', label: 'Nota de crédito B', letra: 'B', codigo: '008' },
  { value: 'nc_c', label: 'Nota de crédito C', letra: 'C', codigo: '013' },
];

export const CONCEPTOS = [
  { value: 'productos', label: 'Productos' },
  { value: 'servicios', label: 'Servicios' },
  { value: 'productos_servicios', label: 'Productos y servicios' },
];

export const CONDICIONES_VENTA = [
  'Contado',
  'Cuenta corriente',
  'Tarjeta de crédito',
  'Tarjeta de débito',
  'Transferencia bancaria',
  'Cheque',
  'Otra',
];

export const ALICUOTAS_IVA = [
  { value: '21', label: '21%' },
  { value: '10.5', label: '10,5%' },
  { value: '0', label: '0%' },
  { value: 'exento', label: 'Exento' },
];

// Factura/NC "C": el emisor es monotributista o exento, así que no
// discrimina IVA en absoluto (el impuesto ya está integrado en la cuota
// del monotributo) — a diferencia de A y B, que siempre lo discriminan.
export function esComprobanteSinIva(tipoComprobante: string): boolean {
  return tipoComprobante === 'factura_c' || tipoComprobante === 'nc_c';
}
