import { supabase } from '../supabaseClient';
import { emitirFactura } from './emitirFactura';
import type { Ambiente, Credenciales } from './wsaa';
import { obtenerCredencialesWSAA } from './wsaa';
import { CBTE_TIPO_ARCA, calcularTotalesItems, consultarUltimoAutorizado, esCbteTipoSinIva } from './wsfe';
import type { ClienteParaFactura, ItemParaTotales } from './wsfe';

// Todo lo que sale mal devuelve una Falla en vez de tirar: las rutas la
// traducen a una respuesta HTTP (emisión individual) o la cuentan y siguen
// con la próxima factura (emisión masiva de un lote).
export interface Falla {
  ok: false;
  status: number;
  error: string;
}

const NC_DESDE_FACTURA: Record<string, string> = {
  factura_a: 'nc_a',
  factura_b: 'nc_b',
  factura_c: 'nc_c',
};

interface FacturaOriginalCruda {
  id: string;
  estado: string;
  cliente_id: string;
  lote_id: string;
  numero_comprobante: string | null;
  clientes: ClienteParaFactura | null;
  lotes: {
    tipo_comprobante: string;
    concepto: string;
    periodo_desde: string | null;
    periodo_hasta: string | null;
    vencimiento_pago: string | null;
    condicion_venta: string;
    punto_venta_id: string;
    actividad_id: number | null;
    puntos_venta: { numero: number } | null;
  } | null;
}

type FacturaOriginal = Omit<FacturaOriginalCruda, 'clientes' | 'lotes'> & {
  clientes: ClienteParaFactura;
  lotes: NonNullable<FacturaOriginalCruda['lotes']>;
};

export interface NotaCreditoPreparada {
  original: FacturaOriginal;
  tipoComprobanteNc: string;
  cbteTipoNc: number;
  cbteTipoOriginal: number;
  ptoVta: number;
}

// Verifica que se le pueda emitir una nota de crédito a esta factura (existe,
// está emitida con CAE, no es ella misma una nota de crédito y no fue ya
// anulada) y junta lo necesario para pedirla. Solo lee: no escribe nada.
export async function prepararNotaCredito(
  facturaId: string,
  emisorId: string,
): Promise<{ ok: true; preparada: NotaCreditoPreparada } | Falla> {
  const { data } = await supabase
    .from('facturas')
    .select(
      'id, estado, cliente_id, lote_id, numero_comprobante, clientes!inner(tipo_documento, numero_documento, razon_social, domicilio, condicion_iva), lotes!inner(tipo_comprobante, concepto, periodo_desde, periodo_hasta, vencimiento_pago, condicion_venta, punto_venta_id, actividad_id, puntos_venta(numero))',
    )
    .eq('id', facturaId)
    .eq('emisor_id', emisorId)
    .single();

  const cruda = data as unknown as FacturaOriginalCruda | null;

  if (!cruda || !cruda.clientes || !cruda.lotes) {
    return { ok: false, status: 404, error: 'No se encontró la factura.' };
  }
  if (cruda.estado !== 'emitida' || !cruda.numero_comprobante) {
    return { ok: false, status: 400, error: 'Solo se le puede emitir una nota de crédito a una factura ya emitida, con CAE.' };
  }

  const original = cruda as FacturaOriginal;
  const tipoComprobanteNc = NC_DESDE_FACTURA[original.lotes.tipo_comprobante];
  const ptoVta = original.lotes.puntos_venta?.numero;
  const cbteTipoOriginal = CBTE_TIPO_ARCA[original.lotes.tipo_comprobante];
  const cbteTipoNc = tipoComprobanteNc ? CBTE_TIPO_ARCA[tipoComprobanteNc] : undefined;

  if (!tipoComprobanteNc || !ptoVta || !cbteTipoOriginal || !cbteTipoNc) {
    return { ok: false, status: 400, error: 'No se pudo determinar el tipo de nota de crédito para esta factura.' };
  }

  const { count: notasExistentes } = await supabase
    .from('facturas')
    .select('id', { count: 'exact', head: true })
    .eq('factura_original_id', original.id)
    .eq('estado', 'emitida');
  if (notasExistentes && notasExistentes > 0) {
    return { ok: false, status: 400, error: 'Ya se emitió una nota de crédito para esta factura.' };
  }

  return { ok: true, preparada: { original, tipoComprobanteNc, cbteTipoNc, cbteTipoOriginal, ptoVta } };
}

export interface ContextoEmision {
  credenciales: Credenciales;
  ambiente: Ambiente;
  cuit: string;
  alcanzadoRg3368: boolean;
}

interface CertificadoLeido {
  certificado_pem: string;
  clave_privada_pem: string;
  ambiente: Ambiente;
}

// Certificado, CUIT y ticket de acceso vigente del emisor. En una emisión
// masiva se pide una sola vez y se reusa para todas las facturas.
export async function obtenerContextoEmision(emisorId: string): Promise<{ ok: true; contexto: ContextoEmision } | Falla> {
  const [{ data: certificado }, { data: emisor }] = await Promise.all([
    supabase.rpc('leer_certificado_arca', { p_emisor_id: emisorId }).maybeSingle<CertificadoLeido>(),
    supabase.from('emisores').select('cuit, alcanzado_rg_3368').eq('id', emisorId).single(),
  ]);

  if (!certificado?.certificado_pem || !certificado.clave_privada_pem || !emisor) {
    return { ok: false, status: 400, error: 'Todavía no configuraste el certificado de ARCA para esta cuenta.' };
  }

  try {
    const credenciales = await obtenerCredencialesWSAA(emisorId, certificado.certificado_pem, certificado.clave_privada_pem, certificado.ambiente);
    return {
      ok: true,
      contexto: { credenciales, ambiente: certificado.ambiente, cuit: emisor.cuit, alcanzadoRg3368: emisor.alcanzado_rg_3368 },
    };
  } catch (wsaaError) {
    return { ok: false, status: 502, error: wsaaError instanceof Error ? wsaaError.message : 'Error desconocido al conectar con ARCA.' };
  }
}

// Próximo número de nota de crédito disponible para el punto de venta y tipo
// de esta factura. En una emisión masiva se pide una sola vez y después se
// va incrementando a medida que ARCA aprueba cada una.
export async function proximoNumeroNotaCredito(
  contexto: ContextoEmision,
  preparada: NotaCreditoPreparada,
): Promise<{ ok: true; numero: number } | Falla> {
  try {
    const ultimo = await consultarUltimoAutorizado(contexto.credenciales, contexto.cuit, preparada.ptoVta, preparada.cbteTipoNc, contexto.ambiente);
    return { ok: true, numero: ultimo + 1 };
  } catch (wsfeError) {
    return { ok: false, status: 502, error: wsfeError instanceof Error ? wsfeError.message : 'Error desconocido al conectar con ARCA.' };
  }
}

export interface NotaCreditoResultado {
  id: string;
  estado: string;
  numero_comprobante: string | null;
  cae: string | null;
  cae_vencimiento: string | null;
  motivo_error: string | null;
  importe_total: number | null;
}

// Emite una nota de crédito por el 100% de una factura ya emitida: copia sus
// ítems a un lote nuevo (mismo punto de venta, tipo nc_a/b/c según la
// factura original) y pide el CAE asociándola a la factura original vía
// CbtesAsoc, como exige ARCA desde la RG 4540/19. No admite notas de crédito
// parciales todavía — sirve para anular una factura completa.
export async function emitirNotaCredito(
  preparada: NotaCreditoPreparada,
  emisorId: string,
  contexto: ContextoEmision,
  numeroNc: number,
): Promise<{ ok: true; aprobado: boolean; factura: NotaCreditoResultado | null } | Falla> {
  const { original, tipoComprobanteNc, cbteTipoNc, cbteTipoOriginal, ptoVta } = preparada;

  const { data: itemsOriginales } = await supabase
    .from('lote_items')
    .select('catalogo_item_id, codigo, descripcion, cantidad, unidad_medida, precio_unitario, bonificacion_pct, alicuota_iva')
    .eq('lote_id', original.lote_id)
    .order('orden');

  if (!itemsOriginales || itemsOriginales.length === 0) {
    return { ok: false, status: 400, error: 'No se encontraron los ítems de la factura original.' };
  }

  const totales = calcularTotalesItems(itemsOriginales as ItemParaTotales[], esCbteTipoSinIva(cbteTipoNc));
  const hoy = new Date().toISOString().slice(0, 10);

  const { data: loteNc, error: errorLote } = await supabase
    .from('lotes')
    .insert({
      emisor_id: emisorId,
      punto_venta_id: original.lotes.punto_venta_id,
      tipo_comprobante: tipoComprobanteNc,
      concepto: original.lotes.concepto,
      fecha_emision: hoy,
      periodo_desde: original.lotes.periodo_desde,
      periodo_hasta: original.lotes.periodo_hasta,
      vencimiento_pago: original.lotes.vencimiento_pago,
      condicion_venta: original.lotes.condicion_venta,
      actividad_id: original.lotes.actividad_id,
      observaciones: `Nota de crédito por factura ${original.numero_comprobante}`,
      total_clientes: 1,
    })
    .select('id')
    .single();

  if (errorLote || !loteNc) {
    return { ok: false, status: 500, error: `No se pudo crear el lote de la nota de crédito: ${errorLote?.message ?? 'error desconocido'}` };
  }

  // Si algo falla antes de llegar a ARCA, se borra el lote (los ítems y la
  // factura caen en cascada) para no dejar comprobantes a medias.
  const descartarLote = () => supabase.from('lotes').delete().eq('id', loteNc.id);

  const { error: errorItems } = await supabase.from('lote_items').insert(
    itemsOriginales.map((item, index) => ({
      lote_id: loteNc.id,
      catalogo_item_id: item.catalogo_item_id,
      codigo: item.codigo,
      descripcion: item.descripcion,
      cantidad: item.cantidad,
      unidad_medida: item.unidad_medida,
      precio_unitario: item.precio_unitario,
      bonificacion_pct: item.bonificacion_pct,
      alicuota_iva: item.alicuota_iva,
      orden: index,
    })),
  );

  if (errorItems) {
    await descartarLote();
    return { ok: false, status: 500, error: `No se pudieron copiar los ítems a la nota de crédito: ${errorItems.message}` };
  }

  const { data: facturaNc, error: errorFactura } = await supabase
    .from('facturas')
    .insert({
      lote_id: loteNc.id,
      cliente_id: original.cliente_id,
      factura_original_id: original.id,
      estado: 'pendiente',
      importe_neto: totales.neto,
      iva_total: totales.ivaTotal,
      otros_tributos: 0,
      importe_total: totales.total,
    })
    .select('id')
    .single();

  if (errorFactura || !facturaNc) {
    await descartarLote();
    return { ok: false, status: 500, error: `No se pudo crear la nota de crédito: ${errorFactura?.message ?? 'error desconocido'}` };
  }

  const aprobado = await emitirFactura(
    facturaNc.id,
    contexto.credenciales,
    contexto.cuit,
    ptoVta,
    cbteTipoNc,
    numeroNc,
    original.clientes,
    totales,
    original.lotes.concepto,
    hoy,
    { periodoDesde: original.lotes.periodo_desde, periodoHasta: original.lotes.periodo_hasta, vencimientoPago: original.lotes.vencimiento_pago },
    contexto.ambiente,
    contexto.alcanzadoRg3368,
    original.lotes.actividad_id,
    { tipo: cbteTipoOriginal, ptoVta, nro: Number(original.numero_comprobante) },
  );

  const { data: facturaFinal } = await supabase
    .from('facturas')
    .select('id, estado, numero_comprobante, cae, cae_vencimiento, motivo_error, importe_total')
    .eq('id', facturaNc.id)
    .single();

  return { ok: true, aprobado, factura: facturaFinal };
}
