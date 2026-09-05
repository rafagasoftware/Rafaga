import { Autocomplete, Paper, Stack, TextField, Typography } from '@mui/material';
import type { Cliente } from '../../types/domain';

interface Props {
  clientes: Cliente[];
  clienteId: string | null;
  onChange: (clienteId: string | null) => void;
}

export function Paso2Simple({ clientes, clienteId, onChange }: Props) {
  const clienteSeleccionado = clientes.find((c) => c.id === clienteId) ?? null;

  return (
    <Stack spacing={3} sx={{ maxWidth: 480 }}>
      <Autocomplete
        options={clientes}
        value={clienteSeleccionado}
        onChange={(_e, valor) => onChange(valor?.id ?? null)}
        getOptionLabel={(cliente) => `${cliente.razon_social} — ${cliente.tipo_documento} ${cliente.numero_documento}`}
        isOptionEqualToValue={(a, b) => a.id === b.id}
        renderInput={(params) => <TextField {...params} label="Buscar cliente por nombre o documento" required />}
        noOptionsText="No hay clientes que coincidan"
      />

      {clienteSeleccionado && (
        <Paper variant="outlined" sx={{ p: 2.5 }}>
          <Typography variant="body2" color="text.secondary" sx={{ mb: 1.5 }}>
            Datos del cliente
          </Typography>
          <Stack spacing={1}>
            <Typography>
              <strong>{clienteSeleccionado.razon_social}</strong>
            </Typography>
            <Typography variant="body2" color="text.secondary">
              {clienteSeleccionado.tipo_documento} {clienteSeleccionado.numero_documento} · {clienteSeleccionado.condicion_iva}
            </Typography>
            {clienteSeleccionado.domicilio && (
              <Typography variant="body2" color="text.secondary">
                {clienteSeleccionado.domicilio}
              </Typography>
            )}
            {clienteSeleccionado.email && (
              <Typography variant="body2" color="text.secondary">
                {clienteSeleccionado.email}
              </Typography>
            )}
          </Stack>
        </Paper>
      )}

      {clientes.length === 0 && (
        <Typography color="text.secondary">
          Todavía no tenés clientes cargados en la libreta.
        </Typography>
      )}
    </Stack>
  );
}
