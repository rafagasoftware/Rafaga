import { supabase } from '../supabaseClient';
import { generarFacturaPdf } from './facturaPdf';

interface FacturaParaPdf {
  numero_comprobante: string | null;
  cae: string | null;
  cae_vencimiento: string | null;
  importe_total: number | null;
  estado: string;
  cliente_tipo_documento: string | null;
  cliente_numero_documento: string | null;
  cliente_razon_social: string | null;
  cliente_domicilio: string | null;
  cliente_condicion_iva: string | null;
  lotes: {
    tipo_comprobante: string;
    fecha_emision: string;
    periodo_desde: string | null;
    periodo_hasta: string | null;
    vencimiento_pago: string | null;
    condicion_venta: string | null;
    puntos_venta: { numero: number } | null;
    lote_items: Array<{
      codigo: string;
      descripcion: string;
      cantidad: number;
      unidad_medida: string | null;
      precio_unitario: number;
      bonificacion_pct: number;
      alicuota_iva: string;
    }>;
  } | null;
}

export interface EmisorParaPdf {
  razon_social: string;
  cuit: string;
  condicion_iva: string;
  domicilio: string | null;
  ingresos_brutos: string | null;
  inicio_actividades: string | null;
  leyenda_pdf: string | null;
  nombre_fantasia: string | null;
  logo: Buffer | null;
}

export type ResultadoPdf =
  | { ok: true; pdf: Buffer; nombreArchivo: string; clienteRazonSocial: string }
  | { ok: false; status: number; error: string };

export async function cargarEmisorParaPdf(emisorId: string): Promise<EmisorParaPdf | null> {
  const { data } = await supabase
    .from('emisores')
    .select('razon_social, cuit, condicion_iva, domicilio, ingresos_brutos, inicio_actividades, leyenda_pdf, nombre_fantasia, logo_path')
    .eq('id', emisorId)
    .single();
  if (!data) return null;

  const { logo_path, ...resto } = data;
  let logo: Buffer | null = null;
  if (logo_path) {
    const { data: archivo } = await supabase.storage.from('logos-emisor').download(logo_path);
    if (archivo) logo = Buffer.from(await archivo.arrayBuffer());
  }

  return { ...resto, logo };
}

// Genera el PDF del comprobante al vuelo (no se guarda: es rápido de
// generar de nuevo, así que no vale la pena la complejidad de cachearlo
// en Storage). Solo tiene sentido para una factura que ya tiene CAE.
// emisorPrecargado evita una lectura por factura cuando se generan varias
// seguidas (ZIP de un lote).
export async function obtenerPdfDeFactura(facturaId: string, emisorId: string, emisorPrecargado?: EmisorParaPdf): Promise<ResultadoPdf> {
  const { data } = await supabase
    .from('facturas')
    .select(
      'numero_comprobante, cae, cae_vencimiento, importe_total, estado, cliente_tipo_documento, cliente_numero_documento, cliente_razon_social, cliente_domicilio, cliente_condicion_iva, lotes!inner(tipo_comprobante, fecha_emision, periodo_desde, periodo_hasta, vencimiento_pago, condicion_venta, puntos_venta(numero), lote_items(codigo, descripcion, cantidad, unidad_medida, precio_unitario, bonificacion_pct, alicuota_iva))',
    )
    .eq('id', facturaId)
    .eq('emisor_id', emisorId)
    .single();

  const factura = data as unknown as FacturaParaPdf | null;

  if (!factura || !factura.lotes) {
    return { ok: false, status: 404, error: 'No se encontró la factura.' };
  }
  if (factura.estado !== 'emitida' || !factura.cae || !factura.numero_comprobante) {
    return { ok: false, status: 400, error: 'Esta factura todavía no tiene un CAE — no se puede generar el PDF.' };
  }

  const ptoVta = factura.lotes.puntos_venta?.numero;
  if (!ptoVta) {
    return { ok: false, status: 400, error: 'El lote no tiene un punto de venta válido.' };
  }

  const emisor = emisorPrecargado ?? (await cargarEmisorParaPdf(emisorId));
  if (!emisor) {
    return { ok: false, status: 404, error: 'No se encontró el emisor.' };
  }

  const pdf = await generarFacturaPdf({
    emisor,
    factura: {
      numero_comprobante: factura.numero_comprobante,
      cae: factura.cae,
      cae_vencimiento: factura.cae_vencimiento ?? '',
      importe_total: factura.importe_total ?? 0,
      cliente_tipo_documento: factura.cliente_tipo_documento ?? '',
      cliente_numero_documento: factura.cliente_numero_documento ?? '',
      cliente_razon_social: factura.cliente_razon_social ?? '',
      cliente_domicilio: factura.cliente_domicilio,
      cliente_condicion_iva: factura.cliente_condicion_iva ?? '',
    },
    lote: {
      tipo_comprobante: factura.lotes.tipo_comprobante,
      fecha_emision: factura.lotes.fecha_emision,
      periodo_desde: factura.lotes.periodo_desde,
      periodo_hasta: factura.lotes.periodo_hasta,
      vencimiento_pago: factura.lotes.vencimiento_pago,
      condicion_venta: factura.lotes.condicion_venta,
      punto_venta_numero: ptoVta,
    },
    items: factura.lotes.lote_items,
  });

  return {
    ok: true,
    pdf,
    nombreArchivo: `factura-${String(ptoVta).padStart(4, '0')}-${factura.numero_comprobante}.pdf`,
    clienteRazonSocial: factura.cliente_razon_social ?? '',
  };
}
