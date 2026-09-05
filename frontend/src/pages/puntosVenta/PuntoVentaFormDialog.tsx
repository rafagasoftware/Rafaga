import {
  Alert,
  Button,
  Dialog,
  DialogActions,
  DialogContent,
  DialogTitle,
  FormControlLabel,
  Switch,
  TextField,
} from '@mui/material';
import { useEffect, useState, type ChangeEvent } from 'react';
import type { PuntoVenta } from '../../types/domain';

export interface PuntoVentaFormValues {
  numero: string;
  descripcion: string;
  habilitado: boolean;
}

const VALORES_VACIOS: PuntoVentaFormValues = {
  numero: '',
  descripcion: '',
  habilitado: true,
};

interface Props {
  open: boolean;
  puntoVenta: PuntoVenta | null;
  saving: boolean;
  error: string | null;
  onClose: () => void;
  onSave: (valores: PuntoVentaFormValues) => void;
}

export function PuntoVentaFormDialog({ open, puntoVenta, saving, error, onClose, onSave }: Props) {
  const [valores, setValores] = useState<PuntoVentaFormValues>(VALORES_VACIOS);

  useEffect(() => {
    if (!open) return;

    setValores(
      puntoVenta
        ? {
            numero: String(puntoVenta.numero),
            descripcion: puntoVenta.descripcion ?? '',
            habilitado: puntoVenta.habilitado,
          }
        : VALORES_VACIOS,
    );
  }, [open, puntoVenta]);

  function handleChange(field: 'numero' | 'descripcion') {
    return (event: ChangeEvent<HTMLInputElement>) => {
      setValores((prev) => ({ ...prev, [field]: event.target.value }));
    };
  }

  return (
    <Dialog open={open} onClose={onClose} fullWidth maxWidth="xs">
      <DialogTitle>{puntoVenta ? 'Editar punto de venta' : 'Nuevo punto de venta'}</DialogTitle>
      <DialogContent sx={{ display: 'flex', flexDirection: 'column', gap: 2, pt: 1 }}>
        <TextField
          label="Número"
          type="number"
          helperText="Tiene que coincidir con el número habilitado en ARCA"
          value={valores.numero}
          onChange={handleChange('numero')}
          required
          fullWidth
          disabled={Boolean(puntoVenta)}
        />
        <TextField label="Descripción" value={valores.descripcion} onChange={handleChange('descripcion')} fullWidth />
        <FormControlLabel
          control={
            <Switch
              checked={valores.habilitado}
              onChange={(e) => setValores((prev) => ({ ...prev, habilitado: e.target.checked }))}
            />
          }
          label="Habilitado"
        />
        {error && <Alert severity="error">{error}</Alert>}
      </DialogContent>
      <DialogActions sx={{ px: 3, pb: 3 }}>
        <Button onClick={onClose} disabled={saving}>
          Cancelar
        </Button>
        <Button variant="contained" disabled={saving} onClick={() => onSave(valores)}>
          {saving ? 'Guardando…' : 'Guardar'}
        </Button>
      </DialogActions>
    </Dialog>
  );
}
