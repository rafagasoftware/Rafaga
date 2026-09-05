import AddIcon from '@mui/icons-material/Add';
import EditOutlinedIcon from '@mui/icons-material/EditOutlined';
import SearchIcon from '@mui/icons-material/Search';
import {
  Alert,
  Box,
  Button,
  IconButton,
  InputAdornment,
  Paper,
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableRow,
  TextField,
  Typography,
} from '@mui/material';
import { useEffect, useMemo, useState } from 'react';
import { TableSkeletonRows } from '../components/TableSkeletonRows';
import { CatalogoItemFormDialog, type CatalogoItemFormValues } from './catalogo/CatalogoItemFormDialog';
import { supabase } from '../lib/supabaseClient';
import type { CatalogoItem } from '../types/domain';

export function CatalogoPage() {
  const [items, setItems] = useState<CatalogoItem[]>([]);
  const [loading, setLoading] = useState(true);
  const [loadError, setLoadError] = useState<string | null>(null);
  const [busqueda, setBusqueda] = useState('');

  const [dialogAbierto, setDialogAbierto] = useState(false);
  const [itemEditando, setItemEditando] = useState<CatalogoItem | null>(null);
  const [guardando, setGuardando] = useState(false);
  const [errorGuardado, setErrorGuardado] = useState<string | null>(null);

  async function cargar() {
    setLoading(true);
    setLoadError(null);

    const { data, error } = await supabase.from('catalogo_items').select('*').order('codigo');
    if (error) {
      setLoadError('No se pudo cargar el catálogo.');
    } else {
      setItems(data ?? []);
    }
    setLoading(false);
  }

  useEffect(() => {
    cargar();
  }, []);

  const itemsFiltrados = useMemo(() => {
    const texto = busqueda.trim().toLowerCase();
    if (!texto) return items;
    return items.filter(
      (item) => String(item.codigo).includes(texto) || item.descripcion.toLowerCase().includes(texto),
    );
  }, [items, busqueda]);

  function abrirNuevo() {
    setItemEditando(null);
    setErrorGuardado(null);
    setDialogAbierto(true);
  }

  function abrirEdicion(item: CatalogoItem) {
    setItemEditando(item);
    setErrorGuardado(null);
    setDialogAbierto(true);
  }

  async function handleGuardar(valores: CatalogoItemFormValues) {
    setGuardando(true);
    setErrorGuardado(null);

    const { error } = itemEditando
      ? await supabase
          .from('catalogo_items')
          .update({ descripcion: valores.descripcion, unidad_medida: valores.unidad_medida || null })
          .eq('id', itemEditando.id)
      : await supabase
          .from('catalogo_items')
          .insert({ descripcion: valores.descripcion, unidad_medida: valores.unidad_medida || null });

    if (error) {
      setErrorGuardado('No se pudo guardar el ítem.');
      setGuardando(false);
      return;
    }

    setGuardando(false);
    setDialogAbierto(false);
    cargar();
  }

  return (
    <>
      <Box sx={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', mb: 3 }}>
        <Box>
          <Typography variant="h3" sx={{ mb: 1 }}>
            Catálogo de ítems
          </Typography>
          <Typography color="text.secondary">
            Productos y servicios reutilizables. El precio se carga cada vez al armar una factura.
          </Typography>
        </Box>
        <Button variant="contained" startIcon={<AddIcon />} onClick={abrirNuevo} size="large">
          Nuevo ítem
        </Button>
      </Box>

      {loadError && <Alert severity="error" sx={{ mb: 2 }}>{loadError}</Alert>}

      <TextField
        placeholder="Buscar por código o descripción"
        value={busqueda}
        onChange={(e) => setBusqueda(e.target.value)}
        fullWidth
        sx={{ mb: 2 }}
        slotProps={{
          input: {
            startAdornment: (
              <InputAdornment position="start">
                <SearchIcon fontSize="small" />
              </InputAdornment>
            ),
          },
        }}
      />

      <Paper variant="outlined">
        <Table>
          <TableHead>
            <TableRow>
              <TableCell>Código</TableCell>
              <TableCell>Producto o servicio</TableCell>
              <TableCell>Unidad de medida</TableCell>
              <TableCell align="right" />
            </TableRow>
          </TableHead>
          <TableBody>
            {loading && <TableSkeletonRows columns={4} />}
            {!loading && itemsFiltrados.length === 0 && (
              <TableRow>
                <TableCell colSpan={4}>
                  <Typography color="text.secondary" sx={{ py: 3, textAlign: 'center' }}>
                    {items.length === 0 ? 'Todavía no cargaste ningún ítem.' : 'No hay ítems que coincidan con la búsqueda.'}
                  </Typography>
                </TableCell>
              </TableRow>
            )}
            {itemsFiltrados.map((item) => (
              <TableRow key={item.id} hover>
                <TableCell sx={{ fontVariantNumeric: 'tabular-nums' }}>{String(item.codigo).padStart(4, '0')}</TableCell>
                <TableCell>{item.descripcion}</TableCell>
                <TableCell>{item.unidad_medida || '—'}</TableCell>
                <TableCell align="right">
                  <IconButton aria-label="Editar ítem" onClick={() => abrirEdicion(item)}>
                    <EditOutlinedIcon fontSize="small" />
                  </IconButton>
                </TableCell>
              </TableRow>
            ))}
          </TableBody>
        </Table>
      </Paper>

      <CatalogoItemFormDialog
        open={dialogAbierto}
        item={itemEditando}
        saving={guardando}
        error={errorGuardado}
        onClose={() => setDialogAbierto(false)}
        onSave={handleGuardar}
      />
    </>
  );
}
