import { useEffect, useState } from 'react';
import { useAuth } from '../auth/AuthContext';
import { emitirNotaCredito, reintentarFactura } from '../lib/facturasApi';
import { supabase } from '../lib/supabaseClient';
import type { ItemFactura } from '../pages/facturar/types';

export interface EmisorFactura {
  razon_social: string;
  cuit: string;
  condicion_iva: string;
  ingresos_brutos: string | null;
  inicio_actividades: string | null;
  domicilio: string | null;
}

export interface ClienteFactura {
  tipo_documento: string;
  numero_documento: string;
  razon_social: string;
  domicilio: string | null;
  condicion_iva: string;
}

export interface LoteFactura {
  tipo_comprobante: string;
  concepto: string;
  fecha_emision: string;
  periodo_desde: string | null;
  periodo_hasta: string | null;
  vencimiento_pago: string | null;
  condicion_venta: string | null;
  observaciones: string | null;
  punto_venta: { numero: number } | null;
  lote_items: Array<{
    id: string;
    catalogo_item_id: string | null;
    codigo: string;
    descripcion: string;
    cantidad: number;
    unidad_medida: string | null;
    precio_unitario: number;
    bonificacion_pct: number;
    alicuota_iva: ItemFactura['alicuotaIva'];
  }>;
}

export interface FacturaDetalle {
  id: string;
  numero_comprobante: string | null;
  cae: string | null;
  cae_vencimiento: string | null;
  estado: string;
  motivo_error: string | null;
  importe_total: number | null;
  cliente: ClienteFactura | null;
  lote: LoteFactura | null;
}

interface FilaFacturaCruda {
  id: string;
  numero_comprobante: string | null;
  cae: string | null;
  cae_vencimiento: string | null;
  estado: string;
  motivo_error: string | null;
  importe_total: number | null;
  cliente_tipo_documento: string | null;
  cliente_numero_documento: string | null;
  cliente_razon_social: string | null;
  cliente_domicilio: string | null;
  cliente_condicion_iva: string | null;
  lote: LoteFactura | null;
}

// El cliente se lee de la copia guardada en la propia factura (cliente_*),
// no con un join en vivo contra clientes: un comprobante ya emitido no
// debe cambiar si después se edita el cliente en la libreta.
const SELECT_FACTURA =
  'id, numero_comprobante, cae, cae_vencimiento, estado, motivo_error, importe_total, cliente_tipo_documento, cliente_numero_documento, cliente_razon_social, cliente_domicilio, cliente_condicion_iva, lote:lotes(*, punto_venta:puntos_venta(numero), lote_items(*))';

function mapearFactura(fila: FilaFacturaCruda): FacturaDetalle {
  return {
    id: fila.id,
    numero_comprobante: fila.numero_comprobante,
    cae: fila.cae,
    cae_vencimiento: fila.cae_vencimiento,
    estado: fila.estado,
    motivo_error: fila.motivo_error,
    importe_total: fila.importe_total,
    cliente: fila.cliente_razon_social
      ? {
          tipo_documento: fila.cliente_tipo_documento ?? '',
          numero_documento: fila.cliente_numero_documento ?? '',
          razon_social: fila.cliente_razon_social,
          domicilio: fila.cliente_domicilio,
          condicion_iva: fila.cliente_condicion_iva ?? '',
        }
      : null,
    lote: fila.lote,
  };
}

export interface NotaCreditoEmitida {
  numero_comprobante: string | null;
  cae: string | null;
}

// Carga una factura con todo lo necesario para mostrar su detalle, y el
// reintento de emisión — lo usan tanto el modal de detalle como la
// pantalla final del asistente de facturación.
export function useFacturaDetalle(facturaId: string | null, onHuboCambios?: () => void) {
  const { session } = useAuth();
  const [factura, setFactura] = useState<FacturaDetalle | null>(null);
  const [emisor, setEmisor] = useState<EmisorFactura | null>(null);
  const [loading, setLoading] = useState(true);
  const [notFound, setNotFound] = useState(false);
  const [reintentando, setReintentando] = useState(false);
  const [errorReintento, setErrorReintento] = useState<string | null>(null);
  const [tieneNotaCredito, setTieneNotaCredito] = useState(false);
  const [emitiendoNotaCredito, setEmitiendoNotaCredito] = useState(false);
  const [errorNotaCredito, setErrorNotaCredito] = useState<string | null>(null);
  const [notaCreditoEmitida, setNotaCreditoEmitida] = useState<NotaCreditoEmitida | null>(null);

  useEffect(() => {
    if (!facturaId || !session) return;
    let cancelado = false;
    setLoading(true);
    setNotFound(false);
    setErrorReintento(null);
    setErrorNotaCredito(null);
    setNotaCreditoEmitida(null);

    Promise.all([
      supabase.from('facturas').select(SELECT_FACTURA).eq('id', facturaId).single(),
      supabase.from('emisores').select('*').eq('id', session.user.id).single(),
      supabase.from('facturas').select('id', { count: 'exact', head: true }).eq('factura_original_id', facturaId).eq('estado', 'emitida'),
    ]).then(([facturaRes, emisorRes, notaCreditoRes]) => {
      if (cancelado) return;
      if (facturaRes.error || !facturaRes.data) {
        setNotFound(true);
      } else {
        setFactura(mapearFactura(facturaRes.data as unknown as FilaFacturaCruda));
      }
      setEmisor(emisorRes.data as EmisorFactura | null);
      setTieneNotaCredito((notaCreditoRes.count ?? 0) > 0);
      setLoading(false);
    });

    return () => {
      cancelado = true;
    };
  }, [facturaId, session]);

  async function handleReintentar() {
    if (!facturaId || !session) return;

    setReintentando(true);
    setErrorReintento(null);

    const resultado = await reintentarFactura(session.access_token, facturaId);
    setReintentando(false);

    if ('error' in resultado) {
      setErrorReintento(resultado.error);
      return;
    }

    const { data: facturaActualizada } = await supabase.from('facturas').select(SELECT_FACTURA).eq('id', facturaId).single();

    if (facturaActualizada) {
      setFactura(mapearFactura(facturaActualizada as unknown as FilaFacturaCruda));
    }
    onHuboCambios?.();
  }

  async function handleEmitirNotaCredito() {
    if (!facturaId || !session) return;

    setEmitiendoNotaCredito(true);
    setErrorNotaCredito(null);

    const resultado = await emitirNotaCredito(session.access_token, facturaId);
    setEmitiendoNotaCredito(false);

    if ('error' in resultado) {
      setErrorNotaCredito(resultado.error);
      return;
    }

    setNotaCreditoEmitida({ numero_comprobante: resultado.numeroComprobante, cae: resultado.cae });
    setTieneNotaCredito(true);
    onHuboCambios?.();
  }

  return {
    factura,
    emisor,
    loading,
    notFound,
    reintentando,
    errorReintento,
    handleReintentar,
    tieneNotaCredito,
    emitiendoNotaCredito,
    errorNotaCredito,
    notaCreditoEmitida,
    handleEmitirNotaCredito,
  };
}
