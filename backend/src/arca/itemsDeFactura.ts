import { supabase } from '../supabaseClient';

export interface ItemDeFactura {
  catalogo_item_id: string | null;
  codigo: string;
  descripcion: string;
  cantidad: number;
  unidad_medida: string | null;
  precio_unitario: number;
  bonificacion_pct: number;
  alicuota_iva: string;
}

const COLUMNAS_LOTE = 'catalogo_item_id, codigo, descripcion, cantidad, unidad_medida, precio_unitario, bonificacion_pct, alicuota_iva';
const COLUMNAS_PROPIOS = 'factura_id, codigo, descripcion, cantidad, unidad_medida, precio_unitario, bonificacion_pct, alicuota_iva';

// PostgREST corta cada respuesta en 1000 filas: un lote grande de familias
// con varios hijos las pasa fácil, y los renglones que faltaran saldrían con
// un total más bajo sin avisar.
const TAMANO_PAGINA = 1000;

interface FilaPropia extends Omit<ItemDeFactura, 'catalogo_item_id'> {
  factura_id: string;
}

// Los renglones de una factura son los de factura_items si los tiene (las
// armadas desde alumnos: uno por hijo, con su nombre) y, si no, los del lote
// (iguales para todas, como siempre).
export interface ItemsDelLote {
  delLote: ItemDeFactura[];
  propios: Map<string, ItemDeFactura[]>;
}

export async function cargarItemsDelLote(loteId: string): Promise<ItemsDelLote> {
  const { data: delLote } = await supabase.from('lote_items').select(COLUMNAS_LOTE).eq('lote_id', loteId).order('orden');

  const propios = new Map<string, ItemDeFactura[]>();

  for (let desde = 0; ; desde += TAMANO_PAGINA) {
    const { data: pagina } = await supabase
      .from('factura_items')
      .select(`${COLUMNAS_PROPIOS}, facturas!inner(lote_id)`)
      .eq('facturas.lote_id', loteId)
      .order('factura_id')
      .order('orden')
      .order('id')
      .range(desde, desde + TAMANO_PAGINA - 1);

    for (const fila of (pagina ?? []) as unknown as FilaPropia[]) {
      const { factura_id, ...item } = fila;
      const actuales = propios.get(factura_id) ?? [];
      actuales.push({ catalogo_item_id: null, ...item });
      propios.set(factura_id, actuales);
    }

    if (!pagina || pagina.length < TAMANO_PAGINA) break;
  }

  return { delLote: (delLote ?? []) as ItemDeFactura[], propios };
}

export async function cargarItemsDeFactura(facturaId: string, loteId: string): Promise<ItemDeFactura[]> {
  const { data: propios } = await supabase
    .from('factura_items')
    .select(COLUMNAS_PROPIOS)
    .eq('factura_id', facturaId)
    .order('orden');

  if (propios && propios.length > 0) {
    return (propios as unknown as FilaPropia[]).map((fila) => ({
      catalogo_item_id: null,
      codigo: fila.codigo,
      descripcion: fila.descripcion,
      cantidad: fila.cantidad,
      unidad_medida: fila.unidad_medida,
      precio_unitario: fila.precio_unitario,
      bonificacion_pct: fila.bonificacion_pct,
      alicuota_iva: fila.alicuota_iva,
    }));
  }

  const { data: delLote } = await supabase.from('lote_items').select(COLUMNAS_LOTE).eq('lote_id', loteId).order('orden');
  return (delLote ?? []) as ItemDeFactura[];
}

// El importe guardado en la factura al crearla y el que sale de sus
// renglones tienen que coincidir: si no (ej. a una factura armada desde
// alumnos le faltan sus renglones y caería a los del lote, que son por
// alumno), emitir le pediría a ARCA un importe equivocado.
export function importeCoincide(importeGuardado: number | null, importeCalculado: number): boolean {
  return importeGuardado === null || Math.abs(importeGuardado - importeCalculado) < 0.01;
}

export const MOTIVO_IMPORTE_NO_COINCIDE =
  'El importe guardado de esta factura no coincide con sus renglones. No se emitió para no pedirle a ARCA un importe equivocado.';
