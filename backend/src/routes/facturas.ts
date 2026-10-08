import { Router } from 'express';
import type { Response } from 'express';
import { emitirFactura } from '../arca/emitirFactura';
import {
  emitirNotaCredito,
  obtenerContextoEmision,
  prepararNotaCredito,
  proximoNumeroNotaCredito,
  type Falla,
} from '../arca/notaCredito';
import type { Ambiente } from '../arca/wsaa';
import { obtenerCredencialesWSAA } from '../arca/wsaa';
import { CBTE_TIPO_ARCA, calcularTotalesItems, consultarUltimoAutorizado, esCbteTipoSinIva } from '../arca/wsfe';
import type { ClienteParaFactura, ComprobanteAsociado } from '../arca/wsfe';
import { cargarItemsDeFactura, importeCoincide, MOTIVO_IMPORTE_NO_COINCIDE } from '../arca/itemsDeFactura';
import { requireAuth } from '../middleware/auth';
import { obtenerPdfDeFactura } from '../pdf/obtenerPdfFactura';
import { supabase } from '../supabaseClient';

export const facturasRouter = Router();

interface CertificadoLeido {
  certificado_pem: string;
  clave_privada_pem: string;
  ambiente: Ambiente;
}

interface FacturaConRelaciones {
  id: string;
  estado: string;
  importe_total: number | null;
  lote_id: string;
  factura_original_id: string | null;
  clientes: ClienteParaFactura | null;
  lotes: {
    tipo_comprobante: string;
    concepto: string;
    fecha_emision: string;
    periodo_desde: string | null;
    periodo_hasta: string | null;
    vencimiento_pago: string | null;
    actividad_id: number | null;
    puntos_venta: { numero: number } | null;
  } | null;
}

function responderFalla(res: Response, falla: Falla) {
  res.status(falla.status).json({ error: falla.error });
}

// Reintenta pedir el CAE de una única factura que quedó "con_error" —
// vuelve a consultar el último autorizado (puede haber cambiado desde el
// intento anterior) y llama a ARCA de nuevo con los mismos datos del lote.
facturasRouter.post('/:id/reintentar', requireAuth, async (req, res) => {
  const { data } = await supabase
    .from('facturas')
    .select(
      'id, estado, importe_total, lote_id, factura_original_id, clientes!inner(tipo_documento, numero_documento, razon_social, domicilio, condicion_iva), lotes!inner(tipo_comprobante, concepto, fecha_emision, periodo_desde, periodo_hasta, vencimiento_pago, actividad_id, puntos_venta(numero))',
    )
    .eq('id', req.params.id)
    .eq('emisor_id', req.emisorId)
    .single();

  const factura = data as unknown as FacturaConRelaciones | null;

  if (!factura || !factura.clientes || !factura.lotes) {
    res.status(404).json({ error: 'No se encontró la factura.' });
    return;
  }
  if (factura.estado !== 'con_error') {
    res.status(400).json({ error: 'Solo se pueden reintentar facturas que quedaron con error.' });
    return;
  }

  const lote = factura.lotes;
  const cbteTipo = CBTE_TIPO_ARCA[lote.tipo_comprobante];
  const ptoVta = lote.puntos_venta?.numero;

  if (!cbteTipo || !ptoVta) {
    res.status(400).json({ error: 'El lote tiene un punto de venta o tipo de comprobante inválido.' });
    return;
  }

  // Una nota de crédito tiene que volver a mandar a qué factura corrige
  // (CbtesAsoc), igual que la primera vez.
  let comprobanteAsociado: ComprobanteAsociado | undefined;
  if (factura.factura_original_id) {
    const { data: dataOriginal } = await supabase
      .from('facturas')
      .select('numero_comprobante, lotes!inner(tipo_comprobante)')
      .eq('id', factura.factura_original_id)
      .single();
    const original = dataOriginal as unknown as { numero_comprobante: string | null; lotes: { tipo_comprobante: string } | null } | null;
    const cbteTipoOriginal = original?.lotes ? CBTE_TIPO_ARCA[original.lotes.tipo_comprobante] : undefined;

    if (!original?.numero_comprobante || !cbteTipoOriginal) {
      res.status(400).json({ error: 'No se encontró la factura original de esta nota de crédito.' });
      return;
    }
    comprobanteAsociado = { tipo: cbteTipoOriginal, ptoVta, nro: Number(original.numero_comprobante) };
  }

  const [items, { data: certificado }, { data: emisor }] = await Promise.all([
    cargarItemsDeFactura(factura.id, factura.lote_id),
    supabase.rpc('leer_certificado_arca', { p_emisor_id: req.emisorId }).maybeSingle<CertificadoLeido>(),
    supabase.from('emisores').select('cuit, alcanzado_rg_3368').eq('id', req.emisorId).single(),
  ]);

  if (!certificado?.certificado_pem || !certificado.clave_privada_pem) {
    res.status(400).json({ error: 'Todavía no configuraste el certificado de ARCA para esta cuenta.' });
    return;
  }
  if (!emisor || items.length === 0) {
    res.status(400).json({ error: 'No se encontraron los ítems del lote.' });
    return;
  }

  const totales = calcularTotalesItems(items, esCbteTipoSinIva(cbteTipo));
  if (!importeCoincide(factura.importe_total, totales.total)) {
    res.status(400).json({ error: MOTIVO_IMPORTE_NO_COINCIDE });
    return;
  }
  const ambiente = certificado.ambiente;

  let credenciales;
  try {
    credenciales = await obtenerCredencialesWSAA(req.emisorId as string, certificado.certificado_pem, certificado.clave_privada_pem, ambiente);
  } catch (wsaaError) {
    res.status(502).json({ error: wsaaError instanceof Error ? wsaaError.message : 'Error desconocido al conectar con ARCA.' });
    return;
  }

  let siguienteNumero: number;
  try {
    siguienteNumero = (await consultarUltimoAutorizado(credenciales, emisor.cuit, ptoVta, cbteTipo, ambiente)) + 1;
  } catch (wsfeError) {
    res.status(502).json({ error: wsfeError instanceof Error ? wsfeError.message : 'Error desconocido al conectar con ARCA.' });
    return;
  }

  const aprobado = await emitirFactura(
    factura.id,
    credenciales,
    emisor.cuit,
    ptoVta,
    cbteTipo,
    siguienteNumero,
    factura.clientes,
    totales,
    lote.concepto,
    lote.fecha_emision,
    { periodoDesde: lote.periodo_desde, periodoHasta: lote.periodo_hasta, vencimientoPago: lote.vencimiento_pago },
    ambiente,
    emisor.alcanzado_rg_3368,
    lote.actividad_id,
    comprobanteAsociado,
  );

  if (aprobado) {
    const { data: loteActual } = await supabase.from('lotes').select('emitidas, con_error').eq('id', factura.lote_id).single();
    if (loteActual) {
      await supabase
        .from('lotes')
        .update({ emitidas: loteActual.emitidas + 1, con_error: Math.max(0, loteActual.con_error - 1) })
        .eq('id', factura.lote_id);
    }
  }

  res.json({ aprobado });
});

facturasRouter.get('/:id/pdf', requireAuth, async (req, res) => {
  const resultado = await obtenerPdfDeFactura(req.params.id, req.emisorId as string);
  if (!resultado.ok) {
    responderFalla(res, resultado);
    return;
  }

  res.setHeader('Content-Type', 'application/pdf');
  res.setHeader('Content-Disposition', `attachment; filename="${resultado.nombreArchivo}"`);
  res.send(resultado.pdf);
});

facturasRouter.post('/:id/nota-credito', requireAuth, async (req, res) => {
  const emisorId = req.emisorId as string;

  const preparada = await prepararNotaCredito(req.params.id, emisorId);
  if (!preparada.ok) {
    responderFalla(res, preparada);
    return;
  }

  const contexto = await obtenerContextoEmision(emisorId);
  if (!contexto.ok) {
    responderFalla(res, contexto);
    return;
  }

  const numero = await proximoNumeroNotaCredito(contexto.contexto, preparada.preparada);
  if (!numero.ok) {
    responderFalla(res, numero);
    return;
  }

  const resultado = await emitirNotaCredito(preparada.preparada, emisorId, contexto.contexto, numero.numero);
  if (!resultado.ok) {
    responderFalla(res, resultado);
    return;
  }

  res.json({ aprobado: resultado.aprobado, factura: resultado.factura });
});
