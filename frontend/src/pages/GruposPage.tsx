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
import type { Cliente, Grupo } from '../types/domain';
import { GrupoFormDialog } from './grupos/GrupoFormDialog';

interface GrupoFila extends Grupo {
  clientes_grupos: { count: number }[];
}

export function GruposPage() {
  const [dialogAbierto, setDialogAbierto] = useState(false);
  const [grupoEditando, setGrupoEditando] = useState<Grupo | null>(null);
  const [clientesDelGrupoEditando, setClientesDelGrupoEditando] = useState<Cliente[]>([]);
  const [guardando, setGuardando] = useState(false);
  const [errorGuardado, setErrorGuardado] = useState<string | null>(null);

  const fetchPage = useCallback(
    async ({ busqueda, pagina, filasPorPagina }: { busqueda: string; pagina: number; filasPorPagina: number }) => {
      let query = supabase.from('grupos').select('*, clientes_grupos(count)', { count: 'exact' });
      if (busqueda) query = query.ilike('nombre', `%${busqueda}%`);

      const { data, count } = await query
        .order('nombre')
        .range(pagina * filasPorPagina, pagina * filasPorPagina + filasPorPagina - 1);

      return { data: (data ?? []) as GrupoFila[], count: count ?? 0 };
    },
    [],
  );

  const { busqueda, setBusqueda, pagina, setPagina, filasPorPagina, setFilasPorPagina, filas, total, loading, recargar } =
    useTablaRemota(fetchPage);

  function abrirNuevo() {
    setGrupoEditando(null);
    setClientesDelGrupoEditando([]);
    setErrorGuardado(null);
    setDialogAbierto(true);
  }

  async function abrirEdicion(grupo: Grupo) {
    setGrupoEditando(grupo);
    setErrorGuardado(null);
    const { data } = await supabase.from('clientes_grupos').select('cliente:clientes(*)').eq('grupo_id', grupo.id);
    setClientesDelGrupoEditando(((data ?? []) as unknown as { cliente: Cliente }[]).map((r) => r.cliente).filter(Boolean));
    setDialogAbierto(true);
  }

  async function handleGuardar(nombre: string, clienteIds: string[]) {
    setGuardando(true);
    setErrorGuardado(null);

    let grupoId = grupoEditando?.id;

    if (grupoEditando) {
      const { error } = await supabase.from('grupos').update({ nombre }).eq('id', grupoEditando.id);
      if (error) {
        setErrorGuardado('No se pudo guardar el grupo.');
        setGuardando(false);
        return;
      }
    } else {
      const { data, error } = await supabase.from('grupos').insert({ nombre }).select('id').single();
      if (error || !data) {
        setErrorGuardado('No se pudo crear el grupo. Revisá que el nombre no esté repetido.');
        setGuardando(false);
        return;
      }
      grupoId = data.id;
    }

    // Reconciliar clientes del grupo: se borran todos y se insertan los elegidos.
    await supabase.from('clientes_grupos').delete().eq('grupo_id', grupoId);
    if (clienteIds.length > 0) {
      await supabase.from('clientes_grupos').insert(clienteIds.map((cliente_id) => ({ cliente_id, grupo_id: grupoId })));
    }

    setGuardando(false);
    setDialogAbierto(false);
    recargar();
  }

  return (
    <>
      <PageHeader
        title="Grupos"
        description="Organizá tus clientes en grupos para facturarles a todos juntos desde facturación múltiple."
        action={
          <Button variant="contained" startIcon={<AddIcon />} onClick={abrirNuevo} size="large">
            Nuevo grupo
          </Button>
        }
      />

      {errorGuardado && !dialogAbierto && <Alert severity="error" sx={{ mb: 2 }}>{errorGuardado}</Alert>}

      <TextField
        placeholder="Buscar por nombre"
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
              <TableCell>Nombre</TableCell>
              <TableCell>Clientes</TableCell>
              <TableCell align="right" />
            </TableRow>
          </TableHead>
          <TableBody>
            {loading && <TableSkeletonRows columns={3} />}
            {!loading && filas.length === 0 && (
              <TableRow>
                <TableCell colSpan={3}>
                  <Typography color="text.secondary" sx={{ py: 3, textAlign: 'center' }}>
                    {total === 0 && !busqueda ? 'Todavía no creaste ningún grupo.' : 'No hay grupos que coincidan con la búsqueda.'}
                  </Typography>
                </TableCell>
              </TableRow>
            )}
            {filas.map((grupo) => (
              <TableRow key={grupo.id} hover>
                <TableCell>{grupo.nombre}</TableCell>
                <TableCell sx={{ fontVariantNumeric: 'tabular-nums' }}>{grupo.clientes_grupos[0]?.count ?? 0}</TableCell>
                <TableCell align="right">
                  <IconButton aria-label="Editar grupo" onClick={() => abrirEdicion(grupo)}>
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

      <GrupoFormDialog
        open={dialogAbierto}
        grupo={grupoEditando}
        clientesIniciales={clientesDelGrupoEditando}
        saving={guardando}
        error={errorGuardado}
        onClose={() => setDialogAbierto(false)}
        onSave={handleGuardar}
      />
    </>
  );
}
