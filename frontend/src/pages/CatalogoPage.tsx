import AddIcon from '@mui/icons-material/Add';
import EditOutlinedIcon from '@mui/icons-material/EditOutlined';
import SearchIcon from '@mui/icons-material/Search';
import {
  Alert,
  Button,
  IconButton,
  InputAdornment,
  Paper,
  Table,
  TableBody,
  TableCell,
  TableHead,
  TablePagination,
  TableRow,
  TextField,
  Typography,
} from '@mui/material';
import { useCallback, useState } from 'react';
import { PageHeader } from '../components/PageHeader';
import { TableSkeletonRows } from '../components/TableSkeletonRows';
import { useTablaRemota } from '../hooks/useTablaRemota';
import { supabase } from '../lib/supabaseClient';
import type { CatalogoItem } from '../types/domain';
import { CatalogoItemFormDialog, type CatalogoItemFormValues } from './catalogo/CatalogoItemFormDialog';

export function CatalogoPage() {
  const [loadError, setLoadError] = useState<string | null>(null);

  const [dialogAbierto, setDialogAbierto] = useState(false);
  const [itemEditando, setItemEditando] = useState<CatalogoItem | null>(null);
  const [guardando, setGuardando] = useState(false);
  const [errorGuardado, setErrorGuardado] = useState<string | null>(null);

  const fetchPage = useCallback(
    async ({ busqueda, pagina, filasPorPagina }: { busqueda: string; pagina: number; filasPorPagina: number }) => {
      let query = supabase.from('catalogo_items').select('*', { count: 'exact' });

      if (busqueda) {
        const esNumerico = /^\d+$/.test(busqueda);
        query = esNumerico
          ? query.or(`descripcion.ilike.%${busqueda}%,codigo.eq.${Number(busqueda)}`)
          : query.ilike('descripcion', `%${busqueda}%`);
      }

      const { data, count, error } = await query
        .order('codigo')
        .range(pagina * filasPorPagina, pagina * filasPorPagina + filasPorPagina - 1);

      if (error) {
        setLoadError('No se pudo cargar el catálogo.');
        return { data: [], count: 0 };
      }
      setLoadError(null);
      return { data: (data ?? []) as CatalogoItem[], count: count ?? 0 };
    },
    [],
  );

  const { busqueda, setBusqueda, pagina, setPagina, filasPorPagina, setFilasPorPagina, filas, total, loading, recargar } =
    useTablaRemota(fetchPage);

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
    recargar();
  }

  return (
    <>
      <PageHeader
        title="Catálogo de ítems"
        description="Productos y servicios reutilizables. El precio se carga cada vez al armar una factura."
        action={
          <Button variant="contained" startIcon={<AddIcon />} onClick={abrirNuevo} size="large">
            Nuevo ítem
          </Button>
        }
      />

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
            {!loading && filas.length === 0 && (
              <TableRow>
                <TableCell colSpan={4}>
                  <Typography color="text.secondary" sx={{ py: 3, textAlign: 'center' }}>
                    {total === 0 && !busqueda ? 'Todavía no cargaste ningún ítem.' : 'No hay ítems que coincidan con la búsqueda.'}
                  </Typography>
                </TableCell>
              </TableRow>
            )}
            {filas.map((item) => (
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
        <TablePagination
          component="div"
          count={total}
          page={pagina}
          onPageChange={(_e, nuevaPagina) => setPagina(nuevaPagina)}
          rowsPerPage={filasPorPagina}
          onRowsPerPageChange={(e) => setFilasPorPagina(Number(e.target.value))}
          rowsPerPageOptions={[10, 25, 50]}
          labelRowsPerPage="Filas por página"
          labelDisplayedRows={({ from, to, count }) => `${from}–${to} de ${count}`}
        />
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
