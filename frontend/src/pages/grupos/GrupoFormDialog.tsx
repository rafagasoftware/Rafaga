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
import { useEffect, useMemo, useState } from 'react';
import { useDebouncedValue } from '../../hooks/useDebouncedValue';
import { supabase } from '../../lib/supabaseClient';
import type { Cliente, Grupo } from '../../types/domain';

interface Props {
  open: boolean;
  grupo: Grupo | null;
  clientesIniciales: Cliente[];
  saving: boolean;
  error: string | null;
  onClose: () => void;
  onSave: (nombre: string, clienteIds: string[]) => void;
}

export function GrupoFormDialog({ open, grupo, clientesIniciales, saving, error, onClose, onSave }: Props) {
  const [nombre, setNombre] = useState('');
  const [seleccionados, setSeleccionados] = useState<Cliente[]>([]);
  const [inputBusqueda, setInputBusqueda] = useState('');
  const busquedaConDemora = useDebouncedValue(inputBusqueda);
  const [opciones, setOpciones] = useState<Cliente[]>([]);
  const [buscando, setBuscando] = useState(false);

  useEffect(() => {
    if (!open) return;
    setNombre(grupo?.nombre ?? '');
    setSeleccionados(clientesIniciales);
    setInputBusqueda('');
  }, [open, grupo, clientesIniciales]);

  // Busca en el backend a medida que se escribe (con debounce). Al abrir
  // el campo sin nada escrito, muestra los primeros clientes como punto
  // de partida en vez de un desplegable vacío.
  useEffect(() => {
    if (!open) return;
    let cancelado = false;
    setBuscando(true);

    let consulta = supabase.from('clientes').select('*').order('razon_social').limit(20);
    if (busquedaConDemora) {
      consulta = supabase
        .from('clientes')
        .select('*')
        .or(`razon_social.ilike.%${busquedaConDemora}%,numero_documento.ilike.%${busquedaConDemora}%`)
        .order('razon_social')
        .limit(20);
    }

    consulta.then(({ data }) => {
      if (cancelado) return;
      setOpciones(data ?? []);
      setBuscando(false);
    });

    return () => {
      cancelado = true;
    };
  }, [open, busquedaConDemora]);

  // Para no perder de la lista a los ya elegidos cuando no aparecen
  // entre los resultados de búsqueda actuales.
  const opcionesCombinadas = useMemo(() => {
    const idsEnOpciones = new Set(opciones.map((o) => o.id));
    return [...opciones, ...seleccionados.filter((s) => !idsEnOpciones.has(s.id))];
  }, [opciones, seleccionados]);

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
            options={opcionesCombinadas}
            value={seleccionados}
            onChange={(_e, valor) => setSeleccionados(valor)}
            inputValue={inputBusqueda}
            onInputChange={(_e, valor) => setInputBusqueda(valor)}
            getOptionLabel={(cliente) => `${cliente.razon_social} — ${cliente.tipo_documento} ${cliente.numero_documento}`}
            isOptionEqualToValue={(a, b) => a.id === b.id}
            filterOptions={(opciones) => opciones}
            loading={buscando}
            loadingText="Buscando…"
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
            renderInput={(params) => <TextField {...params} placeholder="Escribí para buscar un cliente" />}
            noOptionsText={inputBusqueda.trim() ? 'No hay clientes que coincidan' : 'No tenés clientes cargados todavía'}
          />
        </Box>

        {error && <Alert severity="error">{error}</Alert>}
      </DialogContent>
      <DialogActions sx={{ px: 3, pb: 3 }}>
        <Button onClick={onClose} disabled={saving}>
          Cancelar
        </Button>
        <Button
          variant="contained"
          disabled={saving || !nombre.trim()}
          onClick={() => onSave(nombre.trim(), seleccionados.map((c) => c.id))}
        >
          {saving ? 'Guardando…' : 'Guardar'}
        </Button>
      </DialogActions>
    </Dialog>
  );
}
