import type { ItemFactura } from './types';

export interface Totales {
  neto: number;
  ivaPorAlicuota: Record<string, number>;
  ivaTotal: number;
  exento: number;
  total: number;
}

export function calcularSubtotalItem(item: ItemFactura): number {
  const cantidad = Number(item.cantidad) || 0;
  const precio = Number(item.precioUnitario) || 0;
  const bonificacion = Number(item.bonificacionPct) || 0;
  return cantidad * precio * (1 - bonificacion / 100);
}

export function calcularTotales(items: ItemFactura[]): Totales {
  let neto = 0;
  let exento = 0;
  const ivaPorAlicuota: Record<string, number> = {};

  for (const item of items) {
    const subtotal = calcularSubtotalItem(item);

    if (item.alicuotaIva === 'exento') {
      exento += subtotal;
      continue;
    }

    neto += subtotal;
    const tasa = Number(item.alicuotaIva) / 100;
    const iva = subtotal * tasa;
    ivaPorAlicuota[item.alicuotaIva] = (ivaPorAlicuota[item.alicuotaIva] ?? 0) + iva;
  }

  const ivaTotal = Object.values(ivaPorAlicuota).reduce((acumulado, valor) => acumulado + valor, 0);

  return { neto, ivaPorAlicuota, ivaTotal, exento, total: neto + ivaTotal + exento };
}

const formateadorMoneda = new Intl.NumberFormat('es-AR', { style: 'currency', currency: 'ARS' });

export function formatearMoneda(valor: number): string {
  return formateadorMoneda.format(valor);
}
