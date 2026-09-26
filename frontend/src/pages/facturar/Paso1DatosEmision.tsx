import { Box, Checkbox, ListItemText, MenuItem, Stack, TextField, Typography } from '@mui/material';
import type { ChangeEvent } from 'react';
import { CONCEPTOS, CONDICIONES_VENTA, TIPOS_COMPROBANTE } from '../../constants/facturacion';
import type { ActividadArca, PuntoVenta } from '../../types/domain';
import type { Paso1Valores } from './types';

interface Props {
  valores: Paso1Valores;
  onChange: (valores: Paso1Valores) => void;
  puntosVenta: PuntoVenta[];
  tiposComprobanteDisponibles: string[];
  actividadesEmisor: ActividadArca[];
}

export function Paso1DatosEmision({ valores, onChange, puntosVenta, tiposComprobanteDisponibles, actividadesEmisor }: Props) {
  function handleChange(field: keyof Paso1Valores) {
    return (event: ChangeEvent<HTMLInputElement>) => {
      onChange({ ...valores, [field]: event.target.value });
    };
  }

  // ARCA no exige una sola condición de venta por comprobante — es habitual
  // que una factura acepte varias (ej. "Contado / Tarjeta de crédito").
  // TextField.onChange está tipado para un input común incluso en modo
  // select — con multiple:true el valor real en runtime es string[], pero
  // hay que forzarlo porque TS solo ve HTMLInputElement.value: string.
  function handleChangeCondicionesVenta(event: ChangeEvent<HTMLInputElement | HTMLTextAreaElement>) {
    const valor = event.target.value as unknown as string | string[];
    onChange({ ...valores, condicionesVenta: typeof valor === 'string' ? valor.split(',') : valor });
  }

  function handleChangeActividad(event: ChangeEvent<HTMLInputElement>) {
    onChange({ ...valores, actividadId: event.target.value === '' ? null : Number(event.target.value) });
  }

  // Al pasar a un concepto con período (servicios o productos y servicios)
  // se precargan las fechas del período con la de hoy, para no obligar a
  // tipearlas en el caso más común (facturar el día de hoy). Solo si
  // todavía están vacías: no pisa una fecha que el usuario ya haya tocado.
  function handleChangeConcepto(event: ChangeEvent<HTMLInputElement>) {
    const concepto = event.target.value as Paso1Valores['concepto'];
    const pasaAIncluirServicios = concepto === 'servicios' || concepto === 'productos_servicios';
    const hoy = new Date().toISOString().slice(0, 10);

    onChange({
      ...valores,
      concepto,
      periodoDesde: pasaAIncluirServicios && !valores.periodoDesde ? hoy : valores.periodoDesde,
      periodoHasta: pasaAIncluirServicios && !valores.periodoHasta ? hoy : valores.periodoHasta,
      vencimientoPago: pasaAIncluirServicios && !valores.vencimientoPago ? hoy : valores.vencimientoPago,
    });
  }

  const tiposDisponibles = TIPOS_COMPROBANTE.filter((tipo) => tiposComprobanteDisponibles.includes(tipo.value));

  const incluyeServicios = valores.concepto === 'servicios' || valores.concepto === 'productos_servicios';

  return (
    <Stack spacing={2.5} sx={{ maxWidth: 480 }}>
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
        {tiposDisponibles.map((tipo) => (
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

      <TextField select label="Concepto" value={valores.concepto} onChange={handleChangeConcepto} required fullWidth>
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

      <TextField
        select
        label="Condición de venta"
        value={valores.condicionesVenta}
        onChange={handleChangeCondicionesVenta}
        required
        fullWidth
        helperText="Podés elegir más de una."
        slotProps={{
          select: {
            multiple: true,
            renderValue: (seleccionadas) => (seleccionadas as string[]).join(', '),
          },
        }}
      >
        {CONDICIONES_VENTA.map((condicion) => (
          <MenuItem key={condicion} value={condicion}>
            <Checkbox checked={valores.condicionesVenta.includes(condicion)} size="small" />
            <ListItemText primary={condicion} />
          </MenuItem>
        ))}
      </TextField>

      {actividadesEmisor.length > 0 && (
        <TextField
          select
          label="Actividad"
          value={valores.actividadId ?? ''}
          onChange={handleChangeActividad}
          fullWidth
          helperText="Opcional — ARCA solo la exige para rubros específicos (cárnico, harinero, tabaco). Elegila si tu actividad lo pide."
        >
          <MenuItem value="">Sin especificar</MenuItem>
          {actividadesEmisor.map((actividad) => (
            <MenuItem key={actividad.id} value={actividad.id}>
              {actividad.id} — {actividad.descripcion}
            </MenuItem>
          ))}
        </TextField>
      )}

      <TextField label="Moneda" value="Pesos (ARS)" fullWidth disabled />
    </Stack>
  );
}
