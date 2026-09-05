import { Alert, Button, Dialog, DialogActions, DialogContent, DialogTitle, MenuItem, TextField } from '@mui/material';
import { useEffect, useState, type ChangeEvent } from 'react';
import { UNIDADES_MEDIDA } from '../../constants/catalogo';
import type { CatalogoItem } from '../../types/domain';

export interface CatalogoItemFormValues {
  descripcion: string;
  unidad_medida: string;
}

const VALORES_VACIOS: CatalogoItemFormValues = {
  descripcion: '',
  unidad_medida: '',
};

interface Props {
  open: boolean;
  item: CatalogoItem | null;
  saving: boolean;
  error: string | null;
  onClose: () => void;
  onSave: (valores: CatalogoItemFormValues) => void;
}

export function CatalogoItemFormDialog({ open, item, saving, error, onClose, onSave }: Props) {
  const [valores, setValores] = useState<CatalogoItemFormValues>(VALORES_VACIOS);

  useEffect(() => {
    if (!open) return;

    setValores(
      item ? { descripcion: item.descripcion, unidad_medida: item.unidad_medida ?? '' } : VALORES_VACIOS,
    );
  }, [open, item]);

  function handleChange(field: keyof CatalogoItemFormValues) {
    return (event: ChangeEvent<HTMLInputElement>) => {
      setValores((prev) => ({ ...prev, [field]: event.target.value }));
    };
  }

  return (
    <Dialog open={open} onClose={onClose} fullWidth maxWidth="xs">
      <DialogTitle>
        {item ? `Editar ítem ${String(item.codigo).padStart(4, '0')}` : 'Nuevo ítem'}
      </DialogTitle>
      <DialogContent sx={{ display: 'flex', flexDirection: 'column', gap: 2, pt: 1 }}>
        {!item && (
          <Alert severity="info" variant="outlined">
            El código se asigna solo, en orden.
          </Alert>
        )}
        <TextField
          label="Producto o servicio"
          value={valores.descripcion}
          onChange={handleChange('descripcion')}
          required
          fullWidth
        />
        <TextField
          select
          label="Unidad de medida"
          value={valores.unidad_medida}
          onChange={handleChange('unidad_medida')}
          required
          fullWidth
        >
          {UNIDADES_MEDIDA.map((unidad) => (
            <MenuItem key={unidad} value={unidad}>
              {unidad}
            </MenuItem>
          ))}
        </TextField>
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
