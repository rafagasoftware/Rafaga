import {
  Alert,
  Box,
  Button,
  Chip,
  Paper,
  Skeleton,
  Snackbar,
  Stack,
  Step,
  StepLabel,
  Stepper,
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableRow,
  Typography,
} from '@mui/material';
import { useCallback, useEffect, useState } from 'react';
import { Navigate, useNavigate, useParams } from 'react-router-dom';
import { useAuth } from '../../auth/AuthContext';
import { AccionesFactura } from '../../components/AccionesFactura';
import type { MensajeAccion } from '../../components/AccionesFactura';
import { FacturaDetalleContenido } from '../../components/FacturaDetalleContenido';
import { FacturaDetalleModal } from '../../components/FacturaDetalleModal';
import { esComprobanteSinIva } from '../../constants/facturacion';
import { ESTADO_COLOR, ESTADO_LABEL } from '../../constants/estadosFactura';
import { backendUrl } from '../../lib/backendUrl';
import { idsConNotaCredito } from '../../lib/facturasApi';
import { supabase } from '../../lib/supabaseClient';
import type { ActividadArca, CatalogoItem, Cliente, Grupo, PuntoVenta } from '../../types/domain';
import { AccionesLote } from './AccionesLote';
import { calcularTotales, formatearMoneda } from './calculos';
import { Paso1DatosEmision } from './Paso1DatosEmision';
import { Paso2Multiple } from './Paso2Multiple';
import { Paso2Simple } from './Paso2Simple';
import { Paso3Items } from './Paso3Items';
import { Paso4Revisar } from './Paso4Revisar';
import { crearItemVacio, PASO1_INICIAL, type WizardState } from './types';
import { esClienteValidoParaComprobante, tiposComprobanteDisponibles } from './validacionComprobante';

interface FacturaResumen {
  id: string;
  estado: string;
  numero_comprobante: string | null;
  cae: string | null;
  importe_total: number | null;
  cliente_razon_social: string | null;
  tiene_nota_credito: boolean;
}

async function cargarFacturasDelLote(loteId: string): Promise<FacturaResumen[]> {
  const { data } = await supabase
    .from('facturas')
    .select('id, estado, numero_comprobante, cae, importe_total, cliente_razon_social')
    .eq('lote_id', loteId)
    .order('creado_en');

  const facturas = (data as unknown as Omit<FacturaResumen, 'tiene_nota_credito'>[]) ?? [];
  const conNotaCredito = await idsConNotaCredito(facturas.map((factura) => factura.id));
  return facturas.map((factura) => ({ ...factura, tiene_nota_credito: conNotaCredito.has(factura.id) }));
}

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
  const { session } = useAuth();

  const [paso, setPaso] = useState(1);
  const [estado, setEstado] = useState<WizardState>(() => estadoInicial(modo));

  const [puntosVenta, setPuntosVenta] = useState<PuntoVenta[]>([]);
  // No se precargan todos los clientes (pueden ser miles): Paso2Simple busca
  // por texto y Paso2Multiple pagina, cada uno contra Supabase directamente.
  // Este cache solo guarda los clientes que esos pasos ya mostraron o
  // seleccionaron, para poder validar el paso 2 y mostrar nombres en el
  // paso 4 sin volver a pedirlos.
  const [clientesCache, setClientesCache] = useState<Record<string, Cliente>>({});
  const [grupos, setGrupos] = useState<Grupo[]>([]);
  const [clienteGrupos, setClienteGrupos] = useState<Record<string, string[]>>({});
  const [catalogoItems, setCatalogoItems] = useState<CatalogoItem[]>([]);
  const [cargando, setCargando] = useState(true);
  const [condicionIvaEmisor, setCondicionIvaEmisor] = useState<string | null>(null);
  const [actividadesEmisor, setActividadesEmisor] = useState<ActividadArca[]>([]);

  const [emitiendo, setEmitiendo] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [guardado, setGuardado] = useState<{ loteId: string; facturas: FacturaResumen[] } | null>(null);
  const [facturaSeleccionada, setFacturaSeleccionada] = useState<string | null>(null);
  const [mensajeAccion, setMensajeAccion] = useState<MensajeAccion | null>(null);

  useEffect(() => {
    if (!session) return;

    async function cargar() {
      const [pv, gr, cg, ci, em] = await Promise.all([
        supabase.from('puntos_venta').select('*').eq('habilitado', true).order('numero'),
        supabase.from('grupos').select('*').order('nombre'),
        supabase.from('clientes_grupos').select('cliente_id, grupo_id'),
        supabase.from('catalogo_items').select('*').order('codigo'),
        supabase.from('emisores').select('condicion_iva, condicion_iva_arca, actividades').eq('id', session!.user.id).single(),
      ]);

      setPuntosVenta(pv.data ?? []);
      setGrupos(gr.data ?? []);
      setCatalogoItems(ci.data ?? []);
      setCondicionIvaEmisor(em.data ? (em.data.condicion_iva_arca ?? em.data.condicion_iva) : null);
      setActividadesEmisor(em.data?.actividades ?? []);

      const mapa: Record<string, string[]> = {};
      for (const relacion of cg.data ?? []) {
        mapa[relacion.cliente_id] = [...(mapa[relacion.cliente_id] ?? []), relacion.grupo_id];
      }
      setClienteGrupos(mapa);
      setCargando(false);
    }

    cargar();
  }, [session]);

  const registrarClientes = useCallback((vistos: Cliente[]) => {
    setClientesCache((prev) => {
      let cambio = false;
      const siguiente = { ...prev };
      for (const cliente of vistos) {
        if (siguiente[cliente.id] !== cliente) {
          siguiente[cliente.id] = cliente;
          cambio = true;
        }
      }
      return cambio ? siguiente : prev;
    });
  }, []);

  const tiposDisponibles = tiposComprobanteDisponibles(condicionIvaEmisor ?? '');

  // Si la condición de IVA del emisor restringe las opciones (ej. pasa a
  // ser Monotributista, que solo puede facturar C) y el tipo elegido ya
  // no está disponible, se corrige solo al primero que sí lo esté.
  useEffect(() => {
    if (tiposDisponibles.length > 0 && !tiposDisponibles.includes(estado.paso1.tipoComprobante)) {
      setEstado((prev) => ({ ...prev, paso1: { ...prev.paso1, tipoComprobante: tiposDisponibles[0] } }));
    }
  }, [tiposDisponibles.join(','), estado.paso1.tipoComprobante]);

  if (!modoValido) {
    return <Navigate to="/" replace />;
  }

  function puedeAvanzar(): boolean {
    if (paso === 1) {
      const p1 = estado.paso1;
      const base = Boolean(p1.puntoVentaId && p1.tipoComprobante && p1.fechaEmision && p1.concepto) && p1.condicionesVenta.length > 0;
      const servicios = p1.concepto === 'servicios' || p1.concepto === 'productos_servicios';
      return base && (!servicios || Boolean(p1.periodoDesde && p1.periodoHasta && p1.vencimientoPago));
    }
    if (paso === 2) {
      const tipoComprobante = estado.paso1.tipoComprobante;
      if (estado.modo === 'simple') {
        const cliente = estado.clienteId ? clientesCache[estado.clienteId] : undefined;
        return Boolean(cliente) && esClienteValidoParaComprobante(cliente!, tipoComprobante);
      }
      const clientesElegidos = estado.clienteIds.map((id) => clientesCache[id]).filter((c): c is Cliente => Boolean(c));
      return (
        clientesElegidos.length === estado.clienteIds.length &&
        clientesElegidos.length > 0 &&
        clientesElegidos.every((c) => esClienteValidoParaComprobante(c, tipoComprobante))
      );
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
    const totales = calcularTotales(estado.items, esComprobanteSinIva(estado.paso1.tipoComprobante));

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
        condicion_venta: estado.paso1.condicionesVenta.join(', '),
        actividad_id: estado.paso1.actividadId,
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

    try {
      const response = await fetch(`${backendUrl}/lotes/${lote.id}/emitir`, {
        method: 'POST',
        headers: { Authorization: `Bearer ${session?.access_token}` },
      });
      const data = await response.json();

      if (!response.ok) {
        setError(data.error ?? 'No se pudo emitir con ARCA. Las facturas quedaron guardadas como pendientes.');
        return;
      }

      setGuardado({ loteId: lote.id, facturas: await cargarFacturasDelLote(lote.id) });
    } catch {
      setError('No se pudo conectar con el servidor. Las facturas quedaron guardadas como pendientes.');
    } finally {
      setEmitiendo(false);
    }
  }

  if (guardado) {
    const { facturas } = guardado;
    const esUnaSola = facturas.length === 1;
    const total = facturas.length;
    const emitidas = facturas.filter((f) => f.estado === 'emitida').length;
    const conError = facturas.filter((f) => f.estado === 'con_error').length;
    const recargarResultados = async () => setGuardado({ loteId: guardado.loteId, facturas: await cargarFacturasDelLote(guardado.loteId) });

    return (
      <Box>
        <Typography variant="h4" sx={{ mb: 1.5 }}>
          {conError === 0 ? 'Listo' : emitidas === 0 ? 'ARCA rechazó las facturas' : 'Terminado con errores'}
        </Typography>
        <Typography color="text.secondary" sx={{ mb: 3 }}>
          {emitidas > 0 && (emitidas === 1 ? '1 factura emitida con CAE. ' : `${emitidas} facturas emitidas con CAE. `)}
          {conError > 0 &&
            (conError === 1
              ? esUnaSola
                ? 'Quedó con error — el motivo está más abajo.'
                : '1 quedó con error.'
              : `${conError} de ${total} quedaron con error.`)}
        </Typography>

        {esUnaSola && <FacturaDetalleContenido facturaId={facturas[0].id} onHuboCambios={recargarResultados} />}

        {!esUnaSola && <AccionesLote loteId={guardado.loteId} facturas={facturas} onCambio={recargarResultados} onMensaje={setMensajeAccion} />}

        {!esUnaSola && (
          <Paper variant="outlined">
            <Table>
              <TableHead>
                <TableRow>
                  <TableCell>Cliente</TableCell>
                  <TableCell>Número</TableCell>
                  <TableCell>CAE</TableCell>
                  <TableCell align="right">Importe</TableCell>
                  <TableCell>Estado</TableCell>
                  <TableCell align="right">Acciones</TableCell>
                </TableRow>
              </TableHead>
              <TableBody>
                {facturas.map((factura) => (
                  <TableRow key={factura.id} hover onClick={() => setFacturaSeleccionada(factura.id)} sx={{ cursor: 'pointer' }}>
                    <TableCell>{factura.cliente_razon_social ?? '—'}</TableCell>
                    <TableCell sx={{ fontVariantNumeric: 'tabular-nums' }}>{factura.numero_comprobante ?? 'Pendiente'}</TableCell>
                    <TableCell sx={{ fontVariantNumeric: 'tabular-nums' }}>{factura.cae ?? '—'}</TableCell>
                    <TableCell align="right" sx={{ fontVariantNumeric: 'tabular-nums' }}>
                      {factura.importe_total != null ? formatearMoneda(factura.importe_total) : '—'}
                    </TableCell>
                    <TableCell>
                      <Chip
                        label={ESTADO_LABEL[factura.estado] ?? factura.estado}
                        color={ESTADO_COLOR[factura.estado] ?? 'default'}
                        size="small"
                        variant="outlined"
                      />
                      {factura.tiene_nota_credito && <Chip label="Con nota de crédito" size="small" variant="outlined" sx={{ ml: 1 }} />}
                    </TableCell>
                    <TableCell align="right">
                      <AccionesFactura
                        factura={factura}
                        tipoComprobante={estado.paso1.tipoComprobante}
                        tieneNotaCredito={factura.tiene_nota_credito}
                        onVerDetalle={() => setFacturaSeleccionada(factura.id)}
                        onCambio={recargarResultados}
                        onMensaje={setMensajeAccion}
                      />
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          </Paper>
        )}

        <FacturaDetalleModal
          facturaId={facturaSeleccionada}
          onClose={async (huboCambios) => {
            setFacturaSeleccionada(null);
            if (huboCambios) await recargarResultados();
          }}
        />

        <Snackbar
          open={mensajeAccion !== null}
          autoHideDuration={8000}
          onClose={() => setMensajeAccion(null)}
          anchorOrigin={{ vertical: 'bottom', horizontal: 'center' }}
        >
          {mensajeAccion ? (
            <Alert severity={mensajeAccion.severidad} variant="filled" onClose={() => setMensajeAccion(null)}>
              {mensajeAccion.texto}
            </Alert>
          ) : undefined}
        </Snackbar>
        <Box sx={{ display: 'flex', gap: 2, mt: 3 }}>
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
      </Box>
    );
  }

  if (cargando) {
    return (
      <Box>
        <Skeleton variant="text" width={260} height={44} sx={{ mb: 1 }} />
        <Skeleton variant="rounded" height={40} sx={{ mb: 4, maxWidth: 720 }} />
        <Stack spacing={2.5} sx={{ maxWidth: 480 }}>
          {Array.from({ length: 5 }).map((_, i) => (
            <Skeleton key={i} variant="rounded" height={56} />
          ))}
        </Stack>
      </Box>
    );
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
        <Paso1DatosEmision
          valores={estado.paso1}
          onChange={(paso1) => setEstado((prev) => ({ ...prev, paso1 }))}
          puntosVenta={puntosVenta}
          tiposComprobanteDisponibles={tiposDisponibles}
          actividadesEmisor={actividadesEmisor}
        />
      )}

      {paso === 2 && estado.modo === 'simple' && (
        <Paso2Simple
          clienteId={estado.clienteId}
          onChange={(clienteId) => setEstado((prev) => ({ ...prev, clienteId }))}
          onClientesVistos={registrarClientes}
          tipoComprobante={estado.paso1.tipoComprobante}
        />
      )}

      {paso === 2 && estado.modo === 'multiple' && (
        <Paso2Multiple
          grupos={grupos}
          clienteGrupos={clienteGrupos}
          seleccionados={estado.clienteIds}
          onChange={(clienteIds) => setEstado((prev) => ({ ...prev, clienteIds }))}
          onClientesVistos={registrarClientes}
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
          tipoComprobante={estado.paso1.tipoComprobante}
        />
      )}

      {paso === 4 && (
        <Paso4Revisar
          estado={estado}
          puntosVenta={puntosVenta}
          clientesCache={clientesCache}
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
