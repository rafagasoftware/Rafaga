import { Alert, Box, Button, Chip, Divider, Paper, Stack, Typography } from '@mui/material';
import { CONCEPTOS, esComprobanteSinIva, TIPOS_COMPROBANTE } from '../../constants/facturacion';
import type { AlumnoConResponsable, Cliente, PuntoVenta } from '../../types/domain';
import { agruparPorResponsable, descripcionParaAlumno, itemsParaFamilia } from './alumnos';
import { calcularTotales, formatearMoneda } from './calculos';
import type { WizardState } from './types';

interface Props {
  estado: WizardState;
  puntosVenta: PuntoVenta[];
  clientesCache: Record<string, Cliente>;
  alumnosCache: Record<string, AlumnoConResponsable>;
  onEditarPaso: (paso: number) => void;
  onEmitir: () => void;
  emitiendo: boolean;
  error: string | null;
}

export function Paso4Revisar({ estado, puntosVenta, clientesCache, alumnosCache, onEditarPaso, onEmitir, emitiendo, error }: Props) {
  const puntoVenta = puntosVenta.find((p) => p.id === estado.paso1.puntoVentaId);
  const tipoLabel = TIPOS_COMPROBANTE.find((t) => t.value === estado.paso1.tipoComprobante)?.label ?? '';
  const conceptoLabel = CONCEPTOS.find((c) => c.value === estado.paso1.concepto)?.label ?? '';
  const sinIva = esComprobanteSinIva(estado.paso1.tipoComprobante);
  const porAlumno = estado.elegirPor === 'alumno';

  const idsClientes = estado.modo === 'simple' ? (estado.clienteId ? [estado.clienteId] : []) : estado.clienteIds;
  const clientesElegidos = idsClientes.map((id) => clientesCache[id]).filter((c): c is Cliente => Boolean(c));

  const idsAlumnos = estado.modo === 'simple' ? (estado.alumnoId ? [estado.alumnoId] : []) : estado.alumnoIds;
  const alumnosElegidos = idsAlumnos.map((id) => alumnosCache[id]).filter((a): a is AlumnoConResponsable => Boolean(a));
  // Una factura por responsable de pago, con un renglón por cada hijo elegido.
  const familias = porAlumno ? agruparPorResponsable(alumnosElegidos) : [];
  const totalesFamilias = familias.map((familia) => calcularTotales(itemsParaFamilia(estado.items, familia.alumnos), sinIva).total);

  const totalPorItems = calcularTotales(estado.items, sinIva).total;
  const cantidadFacturas = porAlumno ? familias.length : clientesElegidos.length;
  const totalLote = porAlumno ? totalesFamilias.reduce((acumulado, total) => acumulado + total, 0) : totalPorItems * cantidadFacturas;
  const nombreUnicaFactura = porAlumno ? familias[0]?.cliente.razon_social : clientesElegidos[0]?.razon_social;

  const puedeEmitir = cantidadFacturas > 0 && estado.paso1.puntoVentaId && estado.items.length > 0;

  return (
    <Stack spacing={3} sx={{ maxWidth: 640 }}>
      <Paper variant="outlined" sx={{ p: 3, bgcolor: 'primary.main', color: 'primary.contrastText' }}>
        <Typography variant="h4" sx={{ mb: 0.5 }}>
          {cantidadFacturas === 1
            ? `1 factura para ${nombreUnicaFactura ?? '—'}`
            : porAlumno
              ? `${cantidadFacturas} facturas, una por responsable de pago`
              : `${cantidadFacturas} facturas, una por cliente`}
        </Typography>
        <Typography variant="body2" sx={{ opacity: 0.9 }}>
          {porAlumno
            ? `${alumnosElegidos.length === 1 ? '1 alumno' : `${alumnosElegidos.length} alumnos`} · ${formatearMoneda(totalLote)} en total`
            : `${formatearMoneda(totalPorItems)} por factura · ${formatearMoneda(totalLote)} en total`}
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
            {conceptoLabel} · Emisión {estado.paso1.fechaEmision} ·{' '}
            {estado.paso1.condicionesVenta.length > 0 ? estado.paso1.condicionesVenta.join(', ') : 'Sin condición de venta'}
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
        {porAlumno ? (
          <Stack spacing={1.25}>
            {familias.length === 0 && <Typography variant="body2">Sin alumno elegido</Typography>}
            {familias.map((familia, indice) => (
              <Box key={familia.cliente.id} sx={{ display: 'flex', justifyContent: 'space-between', gap: 2 }}>
                <Box>
                  <Typography variant="body2">{familia.cliente.razon_social}</Typography>
                  <Typography variant="caption" color="text.secondary">
                    {familia.alumnos.map((alumno) => alumno.nombre).join(', ')}
                  </Typography>
                </Box>
                <Typography variant="body2" sx={{ fontVariantNumeric: 'tabular-nums', whiteSpace: 'nowrap' }}>
                  {formatearMoneda(totalesFamilias[indice])}
                </Typography>
              </Box>
            ))}
          </Stack>
        ) : estado.modo === 'simple' ? (
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
        {porAlumno && alumnosElegidos[0] && (
          <Typography variant="body2" color="text.secondary" sx={{ mb: 1 }}>
            Así sale para {alumnosElegidos[0].nombre}; lo mismo para cada alumno, con sus datos.
          </Typography>
        )}
        <Stack spacing={0.5}>
          {estado.items.map((item) => (
            <Box key={item.id} sx={{ display: 'flex', justifyContent: 'space-between' }}>
              <Typography variant="body2" sx={{ whiteSpace: 'pre-wrap' }}>
                {item.cantidad} ×{' '}
                {item.descripcion
                  ? porAlumno && alumnosElegidos[0]
                    ? descripcionParaAlumno(item.descripcion, alumnosElegidos[0])
                    : item.descripcion
                  : 'Sin descripción'}
              </Typography>
            </Box>
          ))}
        </Stack>
        <Divider sx={{ my: 1.5 }} />
        <Box sx={{ display: 'flex', justifyContent: 'space-between' }}>
          <Typography variant="subtitle2">{porAlumno ? 'Total por alumno' : 'Total por factura'}</Typography>
          <Typography variant="subtitle2" sx={{ fontVariantNumeric: 'tabular-nums' }}>
            {formatearMoneda(totalPorItems)}
          </Typography>
        </Box>
      </Paper>

      {error && <Alert severity="error">{error}</Alert>}

      <Box>
        <Button variant="contained" size="large" onClick={onEmitir} disabled={!puedeEmitir || emitiendo}>
          {emitiendo ? 'Emitiendo…' : cantidadFacturas === 1 ? 'Emitir la factura' : `Emitir las ${cantidadFacturas} facturas`}
        </Button>
      </Box>
    </Stack>
  );
}
