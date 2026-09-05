import { Alert, Box, Button, Paper, Step, StepLabel, Stepper, Typography } from '@mui/material';
import { useEffect, useState } from 'react';
import { Navigate, useNavigate, useParams } from 'react-router-dom';
import { supabase } from '../../lib/supabaseClient';
import type { CatalogoItem, Cliente, Grupo, PuntoVenta } from '../../types/domain';
import { calcularTotales } from './calculos';
import { Paso1DatosEmision } from './Paso1DatosEmision';
import { Paso2Multiple } from './Paso2Multiple';
import { Paso2Simple } from './Paso2Simple';
import { Paso3Items } from './Paso3Items';
import { Paso4Revisar } from './Paso4Revisar';
import { crearItemVacio, PASO1_INICIAL, type WizardState } from './types';

const TITULOS_PASO = ['Datos de emisión', 'Destinatarios', 'Ítems e importes', 'Revisar y emitir'];

function estadoInicial(modo: 'simple' | 'multiple'): WizardState {
  return {
    modo,
    paso1: { ...PASO1_INICIAL },
    clienteId: null,
    clienteIds: [],
    items: [crearItemVacio()],
    observaciones: '',
  };
}

export function FacturarWizardPage() {
  const { modo: modoParam } = useParams<{ modo: string }>();
  const modoValido = modoParam === 'simple' || modoParam === 'multiple';
  const modo: 'simple' | 'multiple' = modoParam === 'multiple' ? 'multiple' : 'simple';
  const navigate = useNavigate();

  const [paso, setPaso] = useState(1);
  const [estado, setEstado] = useState<WizardState>(() => estadoInicial(modo));

  const [puntosVenta, setPuntosVenta] = useState<PuntoVenta[]>([]);
  const [clientes, setClientes] = useState<Cliente[]>([]);
  const [grupos, setGrupos] = useState<Grupo[]>([]);
  const [clienteGrupos, setClienteGrupos] = useState<Record<string, string[]>>({});
  const [catalogoItems, setCatalogoItems] = useState<CatalogoItem[]>([]);
  const [cargando, setCargando] = useState(true);

  const [emitiendo, setEmitiendo] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [guardado, setGuardado] = useState<{ cantidad: number } | null>(null);

  useEffect(() => {
    async function cargar() {
      const [pv, cl, gr, cg, ci] = await Promise.all([
        supabase.from('puntos_venta').select('*').eq('habilitado', true).order('numero'),
        supabase.from('clientes').select('*').order('razon_social'),
        supabase.from('grupos').select('*').order('nombre'),
        supabase.from('clientes_grupos').select('cliente_id, grupo_id'),
        supabase.from('catalogo_items').select('*').order('codigo'),
      ]);

      setPuntosVenta(pv.data ?? []);
      setClientes(cl.data ?? []);
      setGrupos(gr.data ?? []);
      setCatalogoItems(ci.data ?? []);

      const mapa: Record<string, string[]> = {};
      for (const relacion of cg.data ?? []) {
        mapa[relacion.cliente_id] = [...(mapa[relacion.cliente_id] ?? []), relacion.grupo_id];
      }
      setClienteGrupos(mapa);
      setCargando(false);
    }

    cargar();
  }, []);

  if (!modoValido) {
    return <Navigate to="/" replace />;
  }

  function puedeAvanzar(): boolean {
    if (paso === 1) {
      const p1 = estado.paso1;
      const base = Boolean(p1.puntoVentaId && p1.tipoComprobante && p1.fechaEmision && p1.concepto && p1.condicionVenta);
      const servicios = p1.concepto === 'servicios' || p1.concepto === 'productos_servicios';
      return base && (!servicios || Boolean(p1.periodoDesde && p1.periodoHasta && p1.vencimientoPago));
    }
    if (paso === 2) {
      return estado.modo === 'simple' ? Boolean(estado.clienteId) : estado.clienteIds.length > 0;
    }
    if (paso === 3) {
      return estado.items.some((item) => item.descripcion && Number(item.cantidad) > 0);
    }
    return true;
  }

  async function handleEmitir() {
    setEmitiendo(true);
    setError(null);

    const clienteIds = estado.modo === 'simple' ? [estado.clienteId!] : estado.clienteIds;
    const totales = calcularTotales(estado.items);

    const { data: lote, error: loteError } = await supabase
      .from('lotes')
      .insert({
        punto_venta_id: estado.paso1.puntoVentaId,
        tipo_comprobante: estado.paso1.tipoComprobante,
        concepto: estado.paso1.concepto,
        fecha_emision: estado.paso1.fechaEmision,
        periodo_desde: estado.paso1.periodoDesde || null,
        periodo_hasta: estado.paso1.periodoHasta || null,
        vencimiento_pago: estado.paso1.vencimientoPago || null,
        condicion_venta: estado.paso1.condicionVenta,
        observaciones: estado.observaciones || null,
        total_clientes: clienteIds.length,
      })
      .select('id')
      .single();

    if (loteError || !lote) {
      setError('No se pudo guardar el lote.');
      setEmitiendo(false);
      return;
    }

    const { error: itemsError } = await supabase.from('lote_items').insert(
      estado.items.map((item, index) => ({
        lote_id: lote.id,
        catalogo_item_id: item.catalogoItemId,
        codigo: item.codigo,
        descripcion: item.descripcion,
        cantidad: Number(item.cantidad) || 0,
        unidad_medida: item.unidadMedida || null,
        precio_unitario: Number(item.precioUnitario) || 0,
        bonificacion_pct: Number(item.bonificacionPct) || 0,
        alicuota_iva: item.alicuotaIva,
        orden: index,
      })),
    );

    if (itemsError) {
      setError('No se pudieron guardar los ítems.');
      setEmitiendo(false);
      return;
    }

    const { error: facturasError } = await supabase.from('facturas').insert(
      clienteIds.map((clienteId) => ({
        lote_id: lote.id,
        cliente_id: clienteId,
        estado: 'pendiente',
        importe_neto: totales.neto,
        iva_total: totales.ivaTotal,
        otros_tributos: 0,
        importe_total: totales.total,
      })),
    );

    if (facturasError) {
      setError('No se pudieron guardar las facturas.');
      setEmitiendo(false);
      return;
    }

    setEmitiendo(false);
    setGuardado({ cantidad: clienteIds.length });
  }

  if (guardado) {
    return (
      <Paper variant="outlined" sx={{ p: 4, maxWidth: 480 }}>
        <Typography variant="h4" sx={{ mb: 1.5 }}>
          Quedó guardado
        </Typography>
        <Typography color="text.secondary" sx={{ mb: 3 }}>
          {guardado.cantidad === 1
            ? 'La factura quedó pendiente de emitir.'
            : `Las ${guardado.cantidad} facturas quedaron pendientes de emitir.`}{' '}
          Todavía no está conectado el servicio de ARCA para esta cuenta, así que van a esperar ahí hasta que se configure el certificado.
        </Typography>
        <Box sx={{ display: 'flex', gap: 2 }}>
          <Button variant="contained" onClick={() => navigate('/')}>
            Volver al inicio
          </Button>
          <Button
            onClick={() => {
              setEstado(estadoInicial(modo));
              setPaso(1);
              setGuardado(null);
            }}
          >
            Cargar otra factura
          </Button>
        </Box>
      </Paper>
    );
  }

  if (cargando) {
    return <Typography color="text.secondary">Cargando…</Typography>;
  }

  return (
    <Box>
      <Typography variant="h3" sx={{ mb: 1 }}>
        {modo === 'simple' ? 'Factura simple' : 'Facturación múltiple'}
      </Typography>
      <Stepper activeStep={paso - 1} sx={{ mb: 4, maxWidth: 720 }}>
        {TITULOS_PASO.map((titulo) => (
          <Step key={titulo}>
            <StepLabel>{titulo}</StepLabel>
          </Step>
        ))}
      </Stepper>

      {puntosVenta.length === 0 && paso === 1 && (
        <Alert severity="warning" sx={{ mb: 3, maxWidth: 480 }}>
          Todavía no tenés ningún punto de venta habilitado. Cargá uno primero.
        </Alert>
      )}

      {paso === 1 && (
        <Paso1DatosEmision valores={estado.paso1} onChange={(paso1) => setEstado((prev) => ({ ...prev, paso1 }))} puntosVenta={puntosVenta} />
      )}

      {paso === 2 && estado.modo === 'simple' && (
        <Paso2Simple clientes={clientes} clienteId={estado.clienteId} onChange={(clienteId) => setEstado((prev) => ({ ...prev, clienteId }))} />
      )}

      {paso === 2 && estado.modo === 'multiple' && (
        <Paso2Multiple
          clientes={clientes}
          grupos={grupos}
          clienteGrupos={clienteGrupos}
          seleccionados={estado.clienteIds}
          onChange={(clienteIds) => setEstado((prev) => ({ ...prev, clienteIds }))}
          paso1={estado.paso1}
        />
      )}

      {paso === 3 && (
        <Paso3Items
          items={estado.items}
          onChange={(items) => setEstado((prev) => ({ ...prev, items }))}
          observaciones={estado.observaciones}
          onChangeObservaciones={(observaciones) => setEstado((prev) => ({ ...prev, observaciones }))}
          catalogoItems={catalogoItems}
          modo={estado.modo}
        />
      )}

      {paso === 4 && (
        <Paso4Revisar
          estado={estado}
          puntosVenta={puntosVenta}
          clientes={clientes}
          onEditarPaso={setPaso}
          onEmitir={handleEmitir}
          emitiendo={emitiendo}
          error={error}
        />
      )}

      {paso < 4 && (
        <Box sx={{ display: 'flex', gap: 2, mt: 4 }}>
          {paso > 1 && <Button onClick={() => setPaso((p) => p - 1)}>Atrás</Button>}
          <Button variant="contained" onClick={() => setPaso((p) => p + 1)} disabled={!puedeAvanzar()}>
            Siguiente
          </Button>
        </Box>
      )}
    </Box>
  );
}
