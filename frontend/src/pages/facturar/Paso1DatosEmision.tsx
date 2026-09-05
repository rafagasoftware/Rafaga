import { Box, MenuItem, Stack, TextField, Typography } from '@mui/material';
import type { ChangeEvent } from 'react';
import { CONCEPTOS, CONDICIONES_VENTA, TIPOS_COMPROBANTE } from '../../constants/facturacion';
import type { PuntoVenta } from '../../types/domain';
import type { Paso1Valores } from './types';

interface Props {
  valores: Paso1Valores;
  onChange: (valores: Paso1Valores) => void;
  puntosVenta: PuntoVenta[];
}

export function Paso1DatosEmision({ valores, onChange, puntosVenta }: Props) {
  function handleChange(field: keyof Paso1Valores) {
    return (event: ChangeEvent<HTMLInputElement>) => {
      onChange({ ...valores, [field]: event.target.value });
    };
  }

  const incluyeServicios = valores.concepto === 'servicios' || valores.concepto === 'productos_servicios';

  return (
    <Stack spacing={2.5} sx={{ maxWidth: 480, mx: 'auto' }}>
      <TextField
        select
        label="Punto de venta"
        value={valores.puntoVentaId}
        onChange={handleChange('puntoVentaId')}
        required
        fullWidth
        helperText={puntosVenta.length === 0 ? 'Todavía no cargaste ningún punto de venta.' : undefined}
      >
        {puntosVenta.map((punto) => (
          <MenuItem key={punto.id} value={punto.id}>
            {String(punto.numero).padStart(4, '0')} {punto.descripcion ? `— ${punto.descripcion}` : ''}
          </MenuItem>
        ))}
      </TextField>

      <TextField select label="Tipo de comprobante" value={valores.tipoComprobante} onChange={handleChange('tipoComprobante')} required fullWidth>
        {TIPOS_COMPROBANTE.map((tipo) => (
          <MenuItem key={tipo.value} value={tipo.value}>
            {tipo.label}
          </MenuItem>
        ))}
      </TextField>

      <TextField
        label="Fecha de emisión"
        type="date"
        value={valores.fechaEmision}
        onChange={handleChange('fechaEmision')}
        required
        fullWidth
        slotProps={{ inputLabel: { shrink: true } }}
      />

      <TextField select label="Concepto" value={valores.concepto} onChange={handleChange('concepto')} required fullWidth>
        {CONCEPTOS.map((concepto) => (
          <MenuItem key={concepto.value} value={concepto.value}>
            {concepto.label}
          </MenuItem>
        ))}
      </TextField>

      {incluyeServicios && (
        <Box sx={{ display: 'flex', flexDirection: 'column', gap: 2.5, pl: 2, borderLeft: '2px solid', borderColor: 'divider' }}>
          <Typography variant="body2" color="text.secondary">
            Período facturado
          </Typography>
          <Stack direction="row" spacing={2}>
            <TextField
              label="Desde"
              type="date"
              value={valores.periodoDesde}
              onChange={handleChange('periodoDesde')}
              required
              fullWidth
              slotProps={{ inputLabel: { shrink: true } }}
            />
            <TextField
              label="Hasta"
              type="date"
              value={valores.periodoHasta}
              onChange={handleChange('periodoHasta')}
              required
              fullWidth
              slotProps={{ inputLabel: { shrink: true } }}
            />
          </Stack>
          <TextField
            label="Vencimiento para el pago"
            type="date"
            value={valores.vencimientoPago}
            onChange={handleChange('vencimientoPago')}
            required
            fullWidth
            slotProps={{ inputLabel: { shrink: true } }}
          />
        </Box>
      )}

      <TextField select label="Condición de venta" value={valores.condicionVenta} onChange={handleChange('condicionVenta')} required fullWidth>
        {CONDICIONES_VENTA.map((condicion) => (
          <MenuItem key={condicion} value={condicion}>
            {condicion}
          </MenuItem>
        ))}
      </TextField>

      <TextField label="Moneda" value="Pesos (ARS)" fullWidth disabled />
    </Stack>
  );
}
