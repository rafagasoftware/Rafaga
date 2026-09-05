import {
  Alert,
  Box,
  Button,
  Chip,
  Dialog,
  DialogActions,
  DialogContent,
  DialogTitle,
  MenuItem,
  TextField,
  Typography,
} from '@mui/material';
import { useEffect, useState, type ChangeEvent } from 'react';
import { CONDICIONES_IVA, TIPOS_DOCUMENTO } from '../../constants/fiscal';
import type { Cliente, Grupo } from '../../types/domain';

export interface ClienteFormValues {
  tipo_documento: string;
  numero_documento: string;
  razon_social: string;
  domicilio: string;
  condicion_iva: string;
  email: string;
}

const VALORES_VACIOS: ClienteFormValues = {
  tipo_documento: '',
  numero_documento: '',
  razon_social: '',
  domicilio: '',
  condicion_iva: '',
  email: '',
};

interface Props {
  open: boolean;
  cliente: Cliente | null;
  grupos: Grupo[];
  grupoIdsIniciales: string[];
  saving: boolean;
  error: string | null;
  onClose: () => void;
  onSave: (valores: ClienteFormValues, grupoIds: string[]) => void;
}

export function ClienteFormDialog({ open, cliente, grupos, grupoIdsIniciales, saving, error, onClose, onSave }: Props) {
  const [valores, setValores] = useState<ClienteFormValues>(VALORES_VACIOS);
  const [grupoIds, setGrupoIds] = useState<string[]>([]);

  useEffect(() => {
    if (!open) return;

    setValores(
      cliente
        ? {
            tipo_documento: cliente.tipo_documento,
            numero_documento: cliente.numero_documento,
            razon_social: cliente.razon_social,
            domicilio: cliente.domicilio ?? '',
            condicion_iva: cliente.condicion_iva,
            email: cliente.email ?? '',
          }
        : VALORES_VACIOS,
    );
    setGrupoIds(grupoIdsIniciales);
  }, [open, cliente, grupoIdsIniciales]);

  function handleChange(field: keyof ClienteFormValues) {
    return (event: ChangeEvent<HTMLInputElement>) => {
      setValores((prev) => ({ ...prev, [field]: event.target.value }));
    };
  }

  function toggleGrupo(id: string) {
    setGrupoIds((prev) => (prev.includes(id) ? prev.filter((g) => g !== id) : [...prev, id]));
  }

  return (
    <Dialog open={open} onClose={onClose} fullWidth maxWidth="xs">
      <DialogTitle>{cliente ? 'Editar cliente' : 'Nuevo cliente'}</DialogTitle>
      <DialogContent sx={{ display: 'flex', flexDirection: 'column', gap: 2, pt: 1 }}>
        <TextField
          select
          label="Tipo de documento"
          value={valores.tipo_documento}
          onChange={handleChange('tipo_documento')}
          required
          fullWidth
        >
          {TIPOS_DOCUMENTO.map((tipo) => (
            <MenuItem key={tipo} value={tipo}>
              {tipo}
            </MenuItem>
          ))}
        </TextField>
        <TextField
          label="Número de documento"
          value={valores.numero_documento}
          onChange={handleChange('numero_documento')}
          required
          fullWidth
        />
        <TextField
          label="Razón social o nombre"
          value={valores.razon_social}
          onChange={handleChange('razon_social')}
          required
          fullWidth
        />
        <TextField
          select
          label="Condición frente al IVA"
          value={valores.condicion_iva}
          onChange={handleChange('condicion_iva')}
          required
          fullWidth
        >
          {CONDICIONES_IVA.map((opcion) => (
            <MenuItem key={opcion} value={opcion}>
              {opcion}
            </MenuItem>
          ))}
        </TextField>
        <TextField label="Domicilio" value={valores.domicilio} onChange={handleChange('domicilio')} fullWidth />
        <TextField
          label="Correo electrónico"
          type="email"
          helperText="Para enviarle el PDF de la factura"
          value={valores.email}
          onChange={handleChange('email')}
          fullWidth
        />

        {grupos.length > 0 && (
          <Box>
            <Typography variant="body2" sx={{ mb: 1 }}>
              Grupos
            </Typography>
            <Box sx={{ display: 'flex', flexWrap: 'wrap', gap: 1 }}>
              {grupos.map((grupo) => (
                <Chip
                  key={grupo.id}
                  label={grupo.nombre}
                  clickable
                  color={grupoIds.includes(grupo.id) ? 'primary' : 'default'}
                  variant={grupoIds.includes(grupo.id) ? 'filled' : 'outlined'}
                  onClick={() => toggleGrupo(grupo.id)}
                />
              ))}
            </Box>
          </Box>
        )}

        {error && <Alert severity="error">{error}</Alert>}
      </DialogContent>
      <DialogActions sx={{ px: 3, pb: 3 }}>
        <Button onClick={onClose} disabled={saving}>
          Cancelar
        </Button>
        <Button variant="contained" disabled={saving} onClick={() => onSave(valores, grupoIds)}>
          {saving ? 'Guardando…' : 'Guardar'}
        </Button>
      </DialogActions>
    </Dialog>
  );
}
