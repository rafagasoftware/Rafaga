export const TIPOS_COMPROBANTE = [
  { value: 'factura_a', label: 'Factura A' },
  { value: 'factura_b', label: 'Factura B' },
  { value: 'factura_c', label: 'Factura C' },
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
];

export const ALICUOTAS_IVA = [
  { value: '21', label: '21%' },
  { value: '10.5', label: '10,5%' },
  { value: '0', label: '0%' },
  { value: 'exento', label: 'Exento' },
];
