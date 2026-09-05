import CloseIcon from '@mui/icons-material/Close';
import PrintOutlinedIcon from '@mui/icons-material/PrintOutlined';
import {
  Alert,
  Box,
  Button,
  Chip,
  Dialog,
  DialogContent,
  Divider,
  Grid,
  IconButton,
  Paper,
  Skeleton,
  Stack,
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableRow,
  Tooltip,
  Typography,
} from '@mui/material';
import { useEffect, useState } from 'react';
import { useAuth } from '../auth/AuthContext';
import { ESTADO_COLOR, ESTADO_LABEL } from '../constants/estadosFactura';
import { ALICUOTAS_IVA, CONCEPTOS, TIPOS_COMPROBANTE } from '../constants/facturacion';
import { supabase } from '../lib/supabaseClient';
import { calcularSubtotalItem, calcularTotales, formatearMoneda } from '../pages/facturar/calculos';
import type { ItemFactura } from '../pages/facturar/types';

interface Emisor {
  razon_social: string;
  cuit: string;
  condicion_iva: string;
  ingresos_brutos: string | null;
  inicio_actividades: string | null;
  domicilio: string | null;
}

interface Cliente {
  tipo_documento: string;
  numero_documento: string;
  razon_social: string;
  domicilio: string | null;
  condicion_iva: string;
}

interface Lote {
  tipo_comprobante: string;
  concepto: string;
  fecha_emision: string;
  periodo_desde: string | null;
  periodo_hasta: string | null;
  vencimiento_pago: string | null;
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

interface Factura {
  id: string;
  numero_comprobante: string | null;
  cae: string | null;
  cae_vencimiento: string | null;
  estado: string;
  motivo_error: string | null;
  importe_total: number | null;
  cliente: Cliente | null;
  lote: Lote | null;
}

interface Props {
  facturaId: string | null;
  onClose: () => void;
}

export function FacturaDetalleModal({ facturaId, onClose }: Props) {
  const { session } = useAuth();
  const [factura, setFactura] = useState<Factura | null>(null);
  const [emisor, setEmisor] = useState<Emisor | null>(null);
  const [loading, setLoading] = useState(true);
  const [notFound, setNotFound] = useState(false);

  useEffect(() => {
    if (!facturaId || !session) return;
    let cancelado = false;
    setLoading(true);
    setNotFound(false);

    Promise.all([
      supabase
        .from('facturas')
        .select(
          'id, numero_comprobante, cae, cae_vencimiento, estado, motivo_error, importe_total, cliente:clientes(*), lote:lotes(*, punto_venta:puntos_venta(numero), lote_items(*))',
        )
        .eq('id', facturaId)
        .single(),
      supabase.from('emisores').select('*').eq('id', session.user.id).single(),
    ]).then(([facturaRes, emisorRes]) => {
      if (cancelado) return;
      if (facturaRes.error || !facturaRes.data) {
        setNotFound(true);
      } else {
        setFactura(facturaRes.data as unknown as Factura);
      }
      setEmisor(emisorRes.data as Emisor | null);
      setLoading(false);
    });

    return () => {
      cancelado = true;
    };
  }, [facturaId, session]);

  const items: ItemFactura[] =
    factura?.lote?.lote_items.map((row) => ({
      id: row.id,
      catalogoItemId: row.catalogo_item_id,
      codigo: row.codigo,
      descripcion: row.descripcion,
      cantidad: String(row.cantidad),
      unidadMedida: row.unidad_medida ?? '',
      precioUnitario: String(row.precio_unitario),
      bonificacionPct: String(row.bonificacion_pct),
      alicuotaIva: row.alicuota_iva,
    })) ?? [];

  const totales = calcularTotales(items);
  const tipoComprobante = TIPOS_COMPROBANTE.find((t) => t.value === factura?.lote?.tipo_comprobante);
  const conceptoLabel = CONCEPTOS.find((c) => c.value === factura?.lote?.concepto)?.label ?? '';

  return (
    <Dialog open={Boolean(facturaId)} onClose={onClose} maxWidth="md" fullWidth>
      <IconButton onClick={onClose} className="no-imprimir" sx={{ position: 'absolute', right: 8, top: 8 }} aria-label="Cerrar">
        <CloseIcon />
      </IconButton>

      <DialogContent className="rafaga-imprimible" sx={{ pt: 5 }}>
        {loading && (
          <Box>
            <Skeleton variant="rounded" width={300} height={40} sx={{ mb: 2 }} />
            <Paper variant="outlined" sx={{ p: 4 }}>
              <Grid container spacing={2} sx={{ mb: 2 }}>
                <Grid size={5}>
                  <Skeleton variant="text" width="80%" height={32} />
                  <Skeleton variant="text" width="60%" />
                  <Skeleton variant="text" width="70%" />
                </Grid>
                <Grid size={2} sx={{ display: 'flex', justifyContent: 'center' }}>
                  <Skeleton variant="rounded" width={64} height={64} />
                </Grid>
                <Grid size={5}>
                  <Skeleton variant="text" width="60%" height={32} sx={{ ml: 'auto' }} />
                  <Skeleton variant="text" width="50%" sx={{ ml: 'auto' }} />
                  <Skeleton variant="text" width="50%" sx={{ ml: 'auto' }} />
                </Grid>
              </Grid>
              <Divider sx={{ mb: 2 }} />
              <Skeleton variant="rounded" height={70} sx={{ mb: 3 }} />
              {Array.from({ length: 3 }).map((_, i) => (
                <Skeleton key={i} variant="text" height={40} />
              ))}
              <Box sx={{ display: 'flex', justifyContent: 'flex-end', mt: 3 }}>
                <Skeleton variant="rounded" width={260} height={110} />
              </Box>
            </Paper>
          </Box>
        )}

        {!loading && (notFound || !factura || !factura.lote || !factura.cliente || !emisor) && (
          <Alert severity="error">No se encontró la factura.</Alert>
        )}

        {!loading && factura && factura.lote && factura.cliente && emisor && (
          <Box>
            <Box sx={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', mb: 2 }} className="no-imprimir">
              <Chip
                label={ESTADO_LABEL[factura.estado] ?? factura.estado}
                color={ESTADO_COLOR[factura.estado] ?? 'default'}
                variant="outlined"
              />
              <Stack direction="row" spacing={1}>
                <Button startIcon={<PrintOutlinedIcon />} onClick={() => window.print()}>
                  Imprimir
                </Button>
                <Tooltip title="Disponible cuando esté conectado ARCA">
                  <span>
                    <Button disabled>Descargar PDF</Button>
                  </span>
                </Tooltip>
                <Tooltip title="Disponible cuando esté conectado ARCA">
                  <span>
                    <Button disabled>Enviar por correo</Button>
                  </span>
                </Tooltip>
                <Tooltip title="Disponible cuando esté conectado ARCA">
                  <span>
                    <Button disabled>Emitir nota de crédito</Button>
                  </span>
                </Tooltip>
              </Stack>
            </Box>

            {factura.estado === 'con_error' && factura.motivo_error && (
              <Alert severity="error" sx={{ mb: 2 }}>
                {factura.motivo_error}
              </Alert>
            )}

            <Paper variant="outlined" sx={{ p: 4 }}>
              <Grid container spacing={2} sx={{ mb: 2 }}>
                <Grid size={5}>
                  <Typography variant="h5">{emisor.razon_social}</Typography>
                  <Typography variant="body2" color="text.secondary">
                    {emisor.condicion_iva}
                  </Typography>
                  {emisor.domicilio && (
                    <Typography variant="body2" color="text.secondary">
                      {emisor.domicilio}
                    </Typography>
                  )}
                </Grid>
                <Grid size={2} sx={{ display: 'flex', justifyContent: 'center' }}>
                  <Box sx={{ border: '2px solid', borderColor: 'text.primary', width: 64, textAlign: 'center', py: 0.5 }}>
                    <Typography variant="h3" component="div" sx={{ lineHeight: 1 }}>
                      {tipoComprobante?.letra ?? '?'}
                    </Typography>
                    <Typography variant="caption" sx={{ fontVariantNumeric: 'tabular-nums' }}>
                      COD. {tipoComprobante?.codigo ?? '—'}
                    </Typography>
                  </Box>
                </Grid>
                <Grid size={5} sx={{ textAlign: 'right' }}>
                  <Typography variant="h5">{tipoComprobante?.label ?? 'Factura'}</Typography>
                  <Typography variant="body2" sx={{ fontVariantNumeric: 'tabular-nums' }}>
                    {factura.lote.punto_venta ? String(factura.lote.punto_venta.numero).padStart(4, '0') : '----'}-
                    {factura.numero_comprobante ?? 'pendiente'}
                  </Typography>
                  <Typography variant="body2" color="text.secondary">
                    Emisión {new Date(factura.lote.fecha_emision).toLocaleDateString('es-AR')}
                  </Typography>
                </Grid>
              </Grid>

              <Divider sx={{ mb: 2 }} />

              <Grid container spacing={2} sx={{ mb: 2 }}>
                <Grid size={6}>
                  <Typography variant="body2" color="text.secondary">
                    CUIT: <span style={{ fontVariantNumeric: 'tabular-nums' }}>{emisor.cuit}</span>
                  </Typography>
                  {emisor.ingresos_brutos && (
                    <Typography variant="body2" color="text.secondary">
                      Ingresos brutos: {emisor.ingresos_brutos}
                    </Typography>
                  )}
                  {emisor.inicio_actividades && (
                    <Typography variant="body2" color="text.secondary">
                      Inicio de actividades: {new Date(emisor.inicio_actividades).toLocaleDateString('es-AR')}
                    </Typography>
                  )}
                </Grid>
                <Grid size={6} sx={{ textAlign: 'right' }}>
                  <Typography variant="body2" color="text.secondary">
                    Concepto: {conceptoLabel}
                  </Typography>
                  {factura.lote.periodo_desde && (
                    <Typography variant="body2" color="text.secondary">
                      Período: {factura.lote.periodo_desde} al {factura.lote.periodo_hasta}
                    </Typography>
                  )}
                  {factura.lote.vencimiento_pago && (
                    <Typography variant="body2" color="text.secondary">
                      Vencimiento de pago: {factura.lote.vencimiento_pago}
                    </Typography>
                  )}
                </Grid>
              </Grid>

              <Paper variant="outlined" sx={{ p: 2, mb: 3, bgcolor: 'background.default' }}>
                <Typography variant="caption" color="text.secondary">
                  RECEPTOR
                </Typography>
                <Typography variant="body1">{factura.cliente.razon_social}</Typography>
                <Typography variant="body2" color="text.secondary">
                  {factura.cliente.tipo_documento} {factura.cliente.numero_documento} · {factura.cliente.condicion_iva}
                </Typography>
                {factura.cliente.domicilio && (
                  <Typography variant="body2" color="text.secondary">
                    {factura.cliente.domicilio}
                  </Typography>
                )}
              </Paper>

              <Table size="small" sx={{ mb: 3 }}>
                <TableHead>
                  <TableRow>
                    <TableCell>Código</TableCell>
                    <TableCell>Descripción</TableCell>
                    <TableCell align="right">Cant.</TableCell>
                    <TableCell align="right">P. unitario</TableCell>
                    <TableCell align="right">Bonif. %</TableCell>
                    <TableCell>IVA</TableCell>
                    <TableCell align="right">Subtotal</TableCell>
                  </TableRow>
                </TableHead>
                <TableBody>
                  {items.map((item) => (
                    <TableRow key={item.id}>
                      <TableCell sx={{ fontVariantNumeric: 'tabular-nums' }}>{item.codigo || '—'}</TableCell>
                      <TableCell>{item.descripcion}</TableCell>
                      <TableCell align="right" sx={{ fontVariantNumeric: 'tabular-nums' }}>
                        {item.cantidad} {item.unidadMedida}
                      </TableCell>
                      <TableCell align="right" sx={{ fontVariantNumeric: 'tabular-nums' }}>
                        {formatearMoneda(Number(item.precioUnitario) || 0)}
                      </TableCell>
                      <TableCell align="right" sx={{ fontVariantNumeric: 'tabular-nums' }}>
                        {item.bonificacionPct}
                      </TableCell>
                      <TableCell>{ALICUOTAS_IVA.find((a) => a.value === item.alicuotaIva)?.label}</TableCell>
                      <TableCell align="right" sx={{ fontVariantNumeric: 'tabular-nums' }}>
                        {formatearMoneda(calcularSubtotalItem(item))}
                      </TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>

              <Box sx={{ display: 'flex', justifyContent: 'flex-end', mb: 3 }}>
                <Box sx={{ width: 260 }}>
                  <Box sx={{ display: 'flex', justifyContent: 'space-between' }}>
                    <Typography variant="body2">Neto gravado</Typography>
                    <Typography variant="body2" sx={{ fontVariantNumeric: 'tabular-nums' }}>
                      {formatearMoneda(totales.neto)}
                    </Typography>
                  </Box>
                  {Object.entries(totales.ivaPorAlicuota).map(([alicuota, monto]) => (
                    <Box key={alicuota} sx={{ display: 'flex', justifyContent: 'space-between' }}>
                      <Typography variant="body2">IVA {alicuota === '10.5' ? '10,5' : alicuota}%</Typography>
                      <Typography variant="body2" sx={{ fontVariantNumeric: 'tabular-nums' }}>
                        {formatearMoneda(monto)}
                      </Typography>
                    </Box>
                  ))}
                  {totales.exento > 0 && (
                    <Box sx={{ display: 'flex', justifyContent: 'space-between' }}>
                      <Typography variant="body2">Exento</Typography>
                      <Typography variant="body2" sx={{ fontVariantNumeric: 'tabular-nums' }}>
                        {formatearMoneda(totales.exento)}
                      </Typography>
                    </Box>
                  )}
                  <Divider sx={{ my: 1 }} />
                  <Box sx={{ display: 'flex', justifyContent: 'space-between' }}>
                    <Typography variant="subtitle1">Total</Typography>
                    <Typography variant="subtitle1" sx={{ fontVariantNumeric: 'tabular-nums' }}>
                      {formatearMoneda(totales.total)}
                    </Typography>
                  </Box>
                </Box>
              </Box>

              <Divider sx={{ mb: 2 }} />

              <Box sx={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                {factura.cae ? (
                  <>
                    <Box>
                      <Typography variant="body2">
                        CAE: <span style={{ fontVariantNumeric: 'tabular-nums' }}>{factura.cae}</span>
                      </Typography>
                      <Typography variant="body2" color="text.secondary">
                        Vencimiento CAE: {factura.cae_vencimiento}
                      </Typography>
                    </Box>
                    <Box sx={{ border: '1px solid', borderColor: 'divider', px: 3, py: 1 }}>
                      <Typography variant="caption" color="text.secondary">
                        código de barras
                      </Typography>
                    </Box>
                  </>
                ) : (
                  <Typography variant="body2" color="text.secondary">
                    Todavía no tiene CAE — el código de barras y el número de autorización van a aparecer acá cuando se emita.
                  </Typography>
                )}
              </Box>
            </Paper>
          </Box>
        )}
      </DialogContent>
    </Dialog>
  );
}
