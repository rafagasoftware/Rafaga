import {
  Alert,
  Autocomplete,
  Box,
  Button,
  Checkbox,
  Dialog,
  DialogActions,
  DialogContent,
  DialogTitle,
  TextField,
  Typography,
} from '@mui/material';
import { useEffect, useState } from 'react';
import type { Cliente, Grupo } from '../../types/domain';

interface Props {
  open: boolean;
  grupo: Grupo | null;
  clientes: Cliente[];
  clienteIdsIniciales: string[];
  saving: boolean;
  error: string | null;
  onClose: () => void;
  onSave: (nombre: string, clienteIds: string[]) => void;
}

export function GrupoFormDialog({ open, grupo, clientes, clienteIdsIniciales, saving, error, onClose, onSave }: Props) {
  const [nombre, setNombre] = useState('');
  const [clienteIds, setClienteIds] = useState<string[]>([]);

  useEffect(() => {
    if (!open) return;
    setNombre(grupo?.nombre ?? '');
    setClienteIds(clienteIdsIniciales);
  }, [open, grupo, clienteIdsIniciales]);

  const clientesSeleccionados = clientes.filter((c) => clienteIds.includes(c.id));

  return (
    <Dialog open={open} onClose={onClose} fullWidth maxWidth="xs">
      <DialogTitle>{grupo ? 'Editar grupo' : 'Nuevo grupo'}</DialogTitle>
      <DialogContent sx={{ display: 'flex', flexDirection: 'column', gap: 2, pt: 1 }}>
        <TextField label="Nombre del grupo" value={nombre} onChange={(e) => setNombre(e.target.value)} required fullWidth autoFocus />

        <Box>
          <Typography variant="body2" sx={{ mb: 1 }}>
            Clientes en el grupo
          </Typography>
          <Autocomplete
            multiple
            options={clientes}
            value={clientesSeleccionados}
            onChange={(_e, valor) => setClienteIds(valor.map((c) => c.id))}
            getOptionLabel={(cliente) => `${cliente.razon_social} — ${cliente.tipo_documento} ${cliente.numero_documento}`}
            isOptionEqualToValue={(a, b) => a.id === b.id}
            disableCloseOnSelect
            renderOption={(props, cliente, { selected }) => {
              const { key, ...rest } = props;
              return (
                <li key={key} {...rest}>
                  <Checkbox checked={selected} size="small" sx={{ mr: 1 }} />
                  {cliente.razon_social} — {cliente.tipo_documento} {cliente.numero_documento}
                </li>
              );
            }}
            slotProps={{ chip: { size: 'small' } }}
            renderInput={(params) => <TextField {...params} placeholder="Buscar cliente por nombre o documento" />}
            noOptionsText="No hay clientes que coincidan"
          />
        </Box>

        {error && <Alert severity="error">{error}</Alert>}
      </DialogContent>
      <DialogActions sx={{ px: 3, pb: 3 }}>
        <Button onClick={onClose} disabled={saving}>
          Cancelar
        </Button>
        <Button variant="contained" disabled={saving || !nombre.trim()} onClick={() => onSave(nombre.trim(), clienteIds)}>
          {saving ? 'Guardando…' : 'Guardar'}
        </Button>
      </DialogActions>
    </Dialog>
  );
}
