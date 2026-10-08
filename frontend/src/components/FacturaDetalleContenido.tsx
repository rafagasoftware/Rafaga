import PrintOutlinedIcon from '@mui/icons-material/PrintOutlined';
import {
  Alert,
  Box,
  Button,
  Chip,
  Dialog,
  DialogActions,
  DialogContent,
  DialogContentText,
  DialogTitle,
  Divider,
  Grid,
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
import { useState } from 'react';
import { useAuth } from '../auth/AuthContext';
import { useFacturaDetalle } from '../hooks/useFacturaDetalle';
import { ESTADO_COLOR, ESTADO_LABEL } from '../constants/estadosFactura';
import { ALICUOTAS_IVA, CONCEPTOS, esComprobanteSinIva, TIPOS_COMPROBANTE } from '../constants/facturacion';
import { descargarPdfFactura } from '../lib/facturasApi';
import { calcularSubtotalItem, calcularTotales, formatearFecha, formatearMoneda } from '../pages/facturar/calculos';
import type { ItemFactura } from '../pages/facturar/types';

interface Props {
  facturaId: string;
  onHuboCambios?: () => void;
}

export function FacturaDetalleContenido({ facturaId, onHuboCambios }: Props) {
  const { session } = useAuth();
  const {
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
  } = useFacturaDetalle(facturaId, onHuboCambios);
  const [descargando, setDescargando] = useState(false);
  const [errorDescarga, setErrorDescarga] = useState<string | null>(null);
  const [confirmandoNotaCredito, setConfirmandoNotaCredito] = useState(false);

  async function handleDescargarPdf() {
    if (!session) return;

    setDescargando(true);
    setErrorDescarga(null);
    setErrorDescarga(await descargarPdfFactura(session.access_token, facturaId));
    setDescargando(false);
  }

  const items: ItemFactura[] =
    factura?.items.map((row) => ({
      id: row.id,
      catalogoItemId: row.catalogo_item_id ?? null,
      codigo: row.codigo,
      descripcion: row.descripcion,
      cantidad: String(row.cantidad),
      unidadMedida: row.unidad_medida ?? '',
      precioUnitario: String(row.precio_unitario),
      bonificacionPct: String(row.bonificacion_pct),
      alicuotaIva: row.alicuota_iva,
    })) ?? [];

  const sinIva = esComprobanteSinIva(factura?.lote?.tipo_comprobante ?? '');
  const totales = calcularTotales(items, sinIva);
  const tipoComprobante = TIPOS_COMPROBANTE.find((t) => t.value === factura?.lote?.tipo_comprobante);
  const conceptoLabel = CONCEPTOS.find((c) => c.value === factura?.lote?.concepto)?.label ?? '';

  if (loading) {
    return (
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
    );
  }

  if (notFound || !factura || !factura.lote || !factura.cliente || !emisor) {
    return <Alert severity="error">No se encontró la factura.</Alert>;
  }

  return (
    <Box>
      <Box sx={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', mb: 2 }} className="no-imprimir">
        <Chip label={ESTADO_LABEL[factura.estado] ?? factura.estado} color={ESTADO_COLOR[factura.estado] ?? 'default'} variant="outlined" />
        <Stack direction="row" spacing={1}>
          <Button startIcon={<PrintOutlinedIcon />} onClick={() => window.print()}>
            Imprimir
          </Button>
          {factura.estado === 'con_error' && (
            <Button variant="contained" onClick={handleReintentar} disabled={reintentando}>
              {reintentando ? 'Reintentando…' : 'Reintentar'}
            </Button>
          )}
          {factura.estado === 'emitida' ? (
            <Button onClick={handleDescargarPdf} disabled={descargando}>
              {descargando ? 'Generando…' : 'Descargar PDF'}
            </Button>
          ) : (
            <Tooltip title="Solo disponible para facturas ya emitidas, con CAE">
              <span>
                <Button disabled>Descargar PDF</Button>
              </span>
            </Tooltip>
          )}
          <Tooltip title="Disponible cuando esté conectado ARCA">
            <span>
              <Button disabled>Enviar por correo</Button>
            </span>
          </Tooltip>
          {factura.estado === 'emitida' && !tieneNotaCredito && (
            <Button onClick={() => setConfirmandoNotaCredito(true)}>Emitir nota de crédito</Button>
          )}
          {factura.estado === 'emitida' && tieneNotaCredito && (
            <Tooltip title="Ya se emitió una nota de crédito para esta factura">
              <span>
                <Button disabled>Nota de crédito emitida</Button>
              </span>
            </Tooltip>
          )}
          {factura.estado !== 'emitida' && (
            <Tooltip title="Solo disponible para facturas ya emitidas, con CAE">
              <span>
                <Button disabled>Emitir nota de crédito</Button>
              </span>
            </Tooltip>
          )}
        </Stack>
      </Box>

      {factura.estado === 'con_error' && factura.motivo_error && (
        <Alert severity="error" sx={{ mb: 2 }}>
          {factura.motivo_error}
        </Alert>
      )}

      {errorReintento && (
        <Alert severity="error" sx={{ mb: 2 }} className="no-imprimir">
          {errorReintento}
        </Alert>
      )}

      {errorDescarga && (
        <Alert severity="error" sx={{ mb: 2 }} className="no-imprimir">
          {errorDescarga}
        </Alert>
      )}

      {errorNotaCredito && (
        <Alert severity="error" sx={{ mb: 2 }} className="no-imprimir">
          {errorNotaCredito}
        </Alert>
      )}

      {notaCreditoEmitida && (
        <Alert severity="success" sx={{ mb: 2 }} className="no-imprimir">
          Nota de crédito emitida: comprobante {notaCreditoEmitida.numero_comprobante}, CAE {notaCreditoEmitida.cae}. Buscala en Facturas para
          verla completa.
        </Alert>
      )}

      <Dialog open={confirmandoNotaCredito} onClose={() => setConfirmandoNotaCredito(false)}>
        <DialogTitle>¿Emitir nota de crédito?</DialogTitle>
        <DialogContent>
          <DialogContentText>
            Se va a emitir una nota de crédito por el total de esta factura ({formatearMoneda(factura.importe_total ?? 0)}), a nombre de{' '}
            {factura.cliente.razon_social}. Esta acción no se puede deshacer.
          </DialogContentText>
        </DialogContent>
        <DialogActions>
          <Button onClick={() => setConfirmandoNotaCredito(false)} disabled={emitiendoNotaCredito}>
            Cancelar
          </Button>
          <Button
            variant="contained"
            onClick={async () => {
              await handleEmitirNotaCredito();
              setConfirmandoNotaCredito(false);
            }}
            disabled={emitiendoNotaCredito}
          >
            {emitiendoNotaCredito ? 'Emitiendo…' : 'Confirmar'}
          </Button>
        </DialogActions>
      </Dialog>

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
              Emisión {formatearFecha(factura.lote.fecha_emision)}
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
                Inicio de actividades: {formatearFecha(emisor.inicio_actividades)}
              </Typography>
            )}
          </Grid>
          <Grid size={6} sx={{ textAlign: 'right' }}>
            <Typography variant="body2" color="text.secondary">
              Concepto: {conceptoLabel}
            </Typography>
            {factura.lote.periodo_desde && (
              <Typography variant="body2" color="text.secondary">
                Período: Desde {formatearFecha(factura.lote.periodo_desde)} Hasta {formatearFecha(factura.lote.periodo_hasta!)}
              </Typography>
            )}
            {factura.lote.vencimiento_pago && (
              <Typography variant="body2" color="text.secondary">
                Vencimiento de pago: {formatearFecha(factura.lote.vencimiento_pago)}
              </Typography>
            )}
            {factura.lote.condicion_venta && (
              <Typography variant="body2" color="text.secondary">
                Condición de venta: {factura.lote.condicion_venta}
              </Typography>
            )}
          </Grid>
        </Grid>

        <Paper variant="outlined" sx={{ p: 2, mb: 3, bgcolor: 'background.default' }}>
          <Typography variant="caption" color="text.secondary">
            CLIENTE
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
              {!sinIva && <TableCell>IVA</TableCell>}
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
                {!sinIva && <TableCell>{ALICUOTAS_IVA.find((a) => a.value === item.alicuotaIva)?.label}</TableCell>}
                <TableCell align="right" sx={{ fontVariantNumeric: 'tabular-nums' }}>
                  {formatearMoneda(calcularSubtotalItem(item))}
                </TableCell>
              </TableRow>
            ))}
          </TableBody>
        </Table>

        <Box sx={{ display: 'flex', justifyContent: 'flex-end', mb: 3 }}>
          <Box sx={{ width: 260 }}>
            {!sinIva && (
              <>
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
              </>
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
            <Box>
              <Typography variant="body2">
                CAE: <span style={{ fontVariantNumeric: 'tabular-nums' }}>{factura.cae}</span>
              </Typography>
              <Typography variant="body2" color="text.secondary">
                Vencimiento CAE: {factura.cae_vencimiento ? formatearFecha(factura.cae_vencimiento) : '—'}
              </Typography>
            </Box>
          ) : (
            <Typography variant="body2" color="text.secondary">
              Todavía no tiene CAE — el número de autorización va a aparecer acá cuando se emita.
            </Typography>
          )}
        </Box>
      </Paper>
    </Box>
  );
}
