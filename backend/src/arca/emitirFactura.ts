import { supabase } from '../supabaseClient';
import type { Ambiente, Credenciales } from './wsaa';
import { solicitarCAE } from './wsfe';
import type { ClienteParaFactura, ComprobanteAsociado, DatosServicio, TotalesFactura } from './wsfe';

// Pide el CAE de una factura puntual y deja el resultado escrito en la
// fila (emitida con CAE, o con_error con el motivo). La usan tanto la
// emisión de un lote completo como el reintento de una factura sola —
// misma lógica, un solo lugar.
export async function emitirFactura(
  facturaId: string,
  credenciales: Credenciales,
  cuit: string,
  ptoVta: number,
  cbteTipo: number,
  cbteNro: number,
  cliente: ClienteParaFactura,
  totales: TotalesFactura,
  concepto: string,
  fechaEmisionIso: string,
  servicio: DatosServicio,
  ambiente: Ambiente,
  alcanzadoRg3368: boolean,
  actividadId: number | null,
  comprobanteAsociado?: ComprobanteAsociado,
): Promise<boolean> {
  // Copia del cliente tal como estaba en este intento — así la factura
  // no cambia visualmente si después se edita el cliente en la libreta.
  // Se pisa en cada intento (inicial o reintento), nunca en un intento ya
  // aprobado: una vez emitida no hay más intentos que la vuelvan a tocar.
  const snapshotCliente = {
    cliente_tipo_documento: cliente.tipo_documento,
    cliente_numero_documento: cliente.numero_documento,
    cliente_razon_social: cliente.razon_social,
    cliente_domicilio: cliente.domicilio,
    cliente_condicion_iva: cliente.condicion_iva,
  };

  try {
    const resultado = await solicitarCAE(
      credenciales,
      cuit,
      ptoVta,
      cbteTipo,
      cbteNro,
      cliente,
      totales,
      concepto,
      fechaEmisionIso,
      servicio,
      ambiente,
      alcanzadoRg3368,
      actividadId,
      comprobanteAsociado,
    );

    if (resultado.aprobado) {
      await supabase
        .from('facturas')
        .update({
          ...snapshotCliente,
          estado: 'emitida',
          numero_comprobante: String(cbteNro).padStart(8, '0'),
          cae: resultado.cae,
          cae_vencimiento: resultado.caeVencimiento,
          fecha_emision: new Date().toISOString(),
          motivo_error: null,
        })
        .eq('id', facturaId);
      return true;
    }

    await supabase
      .from('facturas')
      .update({ ...snapshotCliente, estado: 'con_error', motivo_error: resultado.motivo })
      .eq('id', facturaId);
    return false;
  } catch (wsfeError) {
    const motivo = wsfeError instanceof Error ? wsfeError.message : 'Error desconocido al conectar con ARCA.';
    await supabase
      .from('facturas')
      .update({ ...snapshotCliente, estado: 'con_error', motivo_error: motivo })
      .eq('id', facturaId);
    return false;
  }
}
