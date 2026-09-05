import AddIcon from '@mui/icons-material/Add';
import EditOutlinedIcon from '@mui/icons-material/EditOutlined';
import { Alert, Box, Button, IconButton, Paper, Table, TableBody, TableCell, TableHead, TableRow, Typography } from '@mui/material';
import { useEffect, useState } from 'react';
import { TableSkeletonRows } from '../components/TableSkeletonRows';
import { supabase } from '../lib/supabaseClient';
import type { Cliente, Grupo } from '../types/domain';
import { GrupoFormDialog } from './grupos/GrupoFormDialog';

export function GruposPage() {
  const [grupos, setGrupos] = useState<Grupo[]>([]);
  const [clientes, setClientes] = useState<Cliente[]>([]);
  const [clienteGrupos, setClienteGrupos] = useState<Record<string, string[]>>({});
  const [loading, setLoading] = useState(true);
  const [loadError, setLoadError] = useState<string | null>(null);

  const [dialogAbierto, setDialogAbierto] = useState(false);
  const [grupoEditando, setGrupoEditando] = useState<Grupo | null>(null);
  const [guardando, setGuardando] = useState(false);
  const [errorGuardado, setErrorGuardado] = useState<string | null>(null);

  async function cargarTodo() {
    setLoading(true);
    setLoadError(null);

    const [gruposRes, clientesRes, relacionesRes] = await Promise.all([
      supabase.from('grupos').select('*').order('nombre'),
      supabase.from('clientes').select('*').order('razon_social'),
      supabase.from('clientes_grupos').select('cliente_id, grupo_id'),
    ]);

    if (gruposRes.error || clientesRes.error || relacionesRes.error) {
      setLoadError('No se pudieron cargar los grupos.');
      setLoading(false);
      return;
    }

    const mapa: Record<string, string[]> = {};
    for (const relacion of relacionesRes.data ?? []) {
      mapa[relacion.cliente_id] = [...(mapa[relacion.cliente_id] ?? []), relacion.grupo_id];
    }

    setGrupos(gruposRes.data ?? []);
    setClientes(clientesRes.data ?? []);
    setClienteGrupos(mapa);
    setLoading(false);
  }

  useEffect(() => {
    cargarTodo();
  }, []);

  function clientesDelGrupo(grupoId: string): string[] {
    return Object.entries(clienteGrupos)
      .filter(([, grupoIds]) => grupoIds.includes(grupoId))
      .map(([clienteId]) => clienteId);
  }

  function abrirNuevo() {
    setGrupoEditando(null);
    setErrorGuardado(null);
    setDialogAbierto(true);
  }

  function abrirEdicion(grupo: Grupo) {
    setGrupoEditando(grupo);
    setErrorGuardado(null);
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
    cargarTodo();
  }

  return (
    <>
      <Box sx={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', mb: 3 }}>
        <Box>
          <Typography variant="h3" sx={{ mb: 1 }}>
            Grupos
          </Typography>
          <Typography color="text.secondary">
            Organizá tus clientes en grupos para facturarles a todos juntos desde facturación múltiple.
          </Typography>
        </Box>
        <Button variant="contained" startIcon={<AddIcon />} onClick={abrirNuevo} size="large">
          Nuevo grupo
        </Button>
      </Box>

      {loadError && <Alert severity="error" sx={{ mb: 2 }}>{loadError}</Alert>}

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
            {!loading && grupos.length === 0 && (
              <TableRow>
                <TableCell colSpan={3}>
                  <Typography color="text.secondary" sx={{ py: 3, textAlign: 'center' }}>
                    Todavía no creaste ningún grupo.
                  </Typography>
                </TableCell>
              </TableRow>
            )}
            {grupos.map((grupo) => (
              <TableRow key={grupo.id} hover>
                <TableCell>{grupo.nombre}</TableCell>
                <TableCell sx={{ fontVariantNumeric: 'tabular-nums' }}>{clientesDelGrupo(grupo.id).length}</TableCell>
                <TableCell align="right">
                  <IconButton aria-label="Editar grupo" onClick={() => abrirEdicion(grupo)}>
                    <EditOutlinedIcon fontSize="small" />
                  </IconButton>
                </TableCell>
              </TableRow>
            ))}
          </TableBody>
        </Table>
      </Paper>

      <GrupoFormDialog
        open={dialogAbierto}
        grupo={grupoEditando}
        clientes={clientes}
        clienteIdsIniciales={grupoEditando ? clientesDelGrupo(grupoEditando.id) : []}
        saving={guardando}
        error={errorGuardado}
        onClose={() => setDialogAbierto(false)}
        onSave={handleGuardar}
      />
    </>
  );
}
