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

export function calcularTotales(items: ItemFactura[], sinDiscriminarIva: boolean): Totales {
  if (sinDiscriminarIva) {
    const total = items.reduce((acumulado, item) => acumulado + calcularSubtotalItem(item), 0);
    return { neto: total, ivaPorAlicuota: {}, ivaTotal: 0, exento: 0, total };
  }

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

// A propósito NO usa `new Date(fechaIso).toLocaleDateString()`: un string
// "2026-09-26" se parsea como medianoche UTC, y en un huso horario detrás
// de UTC (como Argentina) eso cae en el día anterior — "26/09" terminaría
// mostrando "25/09". Como fechaIso ya viene en YYYY-MM-DD, alcanza con
// reordenar el texto, sin pasar por Date en ningún momento.
export function formatearFecha(fechaIso: string): string {
  const [anio, mes, dia] = fechaIso.split('-');
  return `${dia}/${mes}/${anio}`;
}
