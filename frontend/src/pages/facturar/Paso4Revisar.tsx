import { Alert, Box, Button, Chip, Divider, Paper, Stack, Typography } from '@mui/material';
import { CONCEPTOS, TIPOS_COMPROBANTE } from '../../constants/facturacion';
import type { Cliente, PuntoVenta } from '../../types/domain';
import { calcularTotales, formatearMoneda } from './calculos';
import type { WizardState } from './types';

interface Props {
  estado: WizardState;
  puntosVenta: PuntoVenta[];
  clientes: Cliente[];
  onEditarPaso: (paso: number) => void;
  onEmitir: () => void;
  emitiendo: boolean;
  error: string | null;
}

export function Paso4Revisar({ estado, puntosVenta, clientes, onEditarPaso, onEmitir, emitiendo, error }: Props) {
  const puntoVenta = puntosVenta.find((p) => p.id === estado.paso1.puntoVentaId);
  const tipoLabel = TIPOS_COMPROBANTE.find((t) => t.value === estado.paso1.tipoComprobante)?.label ?? '';
  const conceptoLabel = CONCEPTOS.find((c) => c.value === estado.paso1.concepto)?.label ?? '';

  const clientesElegidos =
    estado.modo === 'simple'
      ? clientes.filter((c) => c.id === estado.clienteId)
      : clientes.filter((c) => estado.clienteIds.includes(c.id));

  const totalPorFactura = calcularTotales(estado.items).total;
  const cantidadFacturas = clientesElegidos.length;
  const totalLote = totalPorFactura * cantidadFacturas;

  const puedeEmitir = cantidadFacturas > 0 && estado.paso1.puntoVentaId && estado.items.length > 0;

  return (
    <Stack spacing={3} sx={{ maxWidth: 640, mx: 'auto' }}>
      <Paper variant="outlined" sx={{ p: 3, bgcolor: 'primary.main', color: 'primary.contrastText' }}>
        <Typography variant="h4" sx={{ mb: 0.5 }}>
          {cantidadFacturas === 1
            ? `1 factura para ${clientesElegidos[0]?.razon_social ?? '—'}`
            : `${cantidadFacturas} facturas, una por cliente`}
        </Typography>
        <Typography variant="body2" sx={{ opacity: 0.9 }}>
          {formatearMoneda(totalPorFactura)} por factura · {formatearMoneda(totalLote)} en total
        </Typography>
      </Paper>

      <Paper variant="outlined" sx={{ p: 3 }}>
        <Box sx={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', mb: 1.5 }}>
          <Typography variant="h6">Emisión</Typography>
          <Button size="small" onClick={() => onEditarPaso(1)}>
            Editar
          </Button>
        </Box>
        <Stack spacing={0.5}>
          <Typography variant="body2">
            {puntoVenta ? `Punto de venta ${String(puntoVenta.numero).padStart(4, '0')}` : 'Sin punto de venta'} · {tipoLabel}
          </Typography>
          <Typography variant="body2" color="text.secondary">
            {conceptoLabel} · Emisión {estado.paso1.fechaEmision} · {estado.paso1.condicionVenta || 'Sin condición de venta'}
          </Typography>
          {estado.paso1.periodoDesde && (
            <Typography variant="body2" color="text.secondary">
              Período {estado.paso1.periodoDesde} al {estado.paso1.periodoHasta} · Vence {estado.paso1.vencimientoPago}
            </Typography>
          )}
        </Stack>
      </Paper>

      <Paper variant="outlined" sx={{ p: 3 }}>
        <Box sx={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', mb: 1.5 }}>
          <Typography variant="h6">{estado.modo === 'simple' ? 'Destinatario' : 'Destinatarios'}</Typography>
          <Button size="small" onClick={() => onEditarPaso(2)}>
            Editar
          </Button>
        </Box>
        {estado.modo === 'simple' ? (
          <Typography variant="body2">{clientesElegidos[0]?.razon_social ?? 'Sin cliente elegido'}</Typography>
        ) : (
          <Box sx={{ display: 'flex', flexWrap: 'wrap', gap: 0.75 }}>
            {clientesElegidos.map((cliente) => (
              <Chip key={cliente.id} label={cliente.razon_social} size="small" />
            ))}
          </Box>
        )}
      </Paper>

      <Paper variant="outlined" sx={{ p: 3 }}>
        <Box sx={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', mb: 1.5 }}>
          <Typography variant="h6">Ítems</Typography>
          <Button size="small" onClick={() => onEditarPaso(3)}>
            Editar
          </Button>
        </Box>
        <Stack spacing={0.5}>
          {estado.items.map((item) => (
            <Box key={item.id} sx={{ display: 'flex', justifyContent: 'space-between' }}>
              <Typography variant="body2">
                {item.cantidad} × {item.descripcion || 'Sin descripción'}
              </Typography>
            </Box>
          ))}
        </Stack>
        <Divider sx={{ my: 1.5 }} />
        <Box sx={{ display: 'flex', justifyContent: 'space-between' }}>
          <Typography variant="subtitle2">Total por factura</Typography>
          <Typography variant="subtitle2" sx={{ fontVariantNumeric: 'tabular-nums' }}>
            {formatearMoneda(totalPorFactura)}
          </Typography>
        </Box>
      </Paper>

      {error && <Alert severity="error">{error}</Alert>}

      <Box>
        <Button variant="contained" size="large" onClick={onEmitir} disabled={!puedeEmitir || emitiendo}>
          {emitiendo ? 'Guardando…' : cantidadFacturas === 1 ? 'Emitir la factura' : `Emitir las ${cantidadFacturas} facturas`}
        </Button>
      </Box>
    </Stack>
  );
}
