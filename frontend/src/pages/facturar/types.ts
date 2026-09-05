export interface Paso1Valores {
  puntoVentaId: string;
  tipoComprobante: string;
  fechaEmision: string;
  concepto: 'productos' | 'servicios' | 'productos_servicios';
  periodoDesde: string;
  periodoHasta: string;
  vencimientoPago: string;
  condicionVenta: string;
}

export interface ItemFactura {
  id: string;
  catalogoItemId: string | null;
  codigo: string;
  descripcion: string;
  cantidad: string;
  unidadMedida: string;
  precioUnitario: string;
  bonificacionPct: string;
  alicuotaIva: '21' | '10.5' | '0' | 'exento';
}

export interface WizardState {
  modo: 'simple' | 'multiple';
  paso1: Paso1Valores;
  clienteId: string | null;
  clienteIds: string[];
  items: ItemFactura[];
  observaciones: string;
}

export const PASO1_INICIAL: Paso1Valores = {
  puntoVentaId: '',
  tipoComprobante: 'factura_b',
  fechaEmision: new Date().toISOString().slice(0, 10),
  concepto: 'productos',
  periodoDesde: '',
  periodoHasta: '',
  vencimientoPago: '',
  condicionVenta: '',
};

export function crearItemVacio(): ItemFactura {
  return {
    id: crypto.randomUUID(),
    catalogoItemId: null,
    codigo: '',
    descripcion: '',
    cantidad: '1',
    unidadMedida: '',
    precioUnitario: '',
    bonificacionPct: '0',
    alicuotaIva: '21',
  };
}
