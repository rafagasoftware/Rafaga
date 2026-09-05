import AddIcon from '@mui/icons-material/Add';
import EditOutlinedIcon from '@mui/icons-material/EditOutlined';
import SearchIcon from '@mui/icons-material/Search';
import UploadFileOutlinedIcon from '@mui/icons-material/UploadFileOutlined';
import {
  Alert,
  Box,
  Button,
  Chip,
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
import { useCallback, useEffect, useState } from 'react';
import { PageHeader } from '../components/PageHeader';
import { TableSkeletonRows } from '../components/TableSkeletonRows';
import { useTablaRemota } from '../hooks/useTablaRemota';
import { supabase } from '../lib/supabaseClient';
import type { Cliente, Grupo } from '../types/domain';
import { ClienteFormDialog, type ClienteFormValues } from './clientes/ClienteFormDialog';
import { ImportarClientesDialog } from './clientes/ImportarClientesDialog';

interface ClienteFila extends Cliente {
  clientes_grupos: { grupo_id: string }[];
}

export function ClientesPage() {
  const [grupos, setGrupos] = useState<Grupo[]>([]);
  const [grupoSeleccionado, setGrupoSeleccionado] = useState<string | null>(null);
  const [loadError, setLoadError] = useState<string | null>(null);

  const [dialogAbierto, setDialogAbierto] = useState(false);
  const [clienteEditando, setClienteEditando] = useState<ClienteFila | null>(null);
  const [guardando, setGuardando] = useState(false);
  const [errorGuardado, setErrorGuardado] = useState<string | null>(null);

  const [importarAbierto, setImportarAbierto] = useState(false);

  useEffect(() => {
    supabase
      .from('grupos')
      .select('*')
      .order('nombre')
      .then(({ data }) => setGrupos(data ?? []));
  }, []);

  const fetchPage = useCallback(
    async ({ busqueda, pagina, filasPorPagina }: { busqueda: string; pagina: number; filasPorPagina: number }) => {
      let idsPermitidos: string[] | null = null;

      if (grupoSeleccionado) {
        const { data } = await supabase.from('clientes_grupos').select('cliente_id').eq('grupo_id', grupoSeleccionado);
        idsPermitidos = (data ?? []).map((r) => r.cliente_id);
        if (idsPermitidos.length === 0) return { data: [], count: 0 };
      }

      let query = supabase.from('clientes').select('*, clientes_grupos(grupo_id)', { count: 'exact' });

      if (busqueda) {
        query = query.or(`razon_social.ilike.%${busqueda}%,numero_documento.ilike.%${busqueda}%`);
      }
      if (idsPermitidos) {
        query = query.in('id', idsPermitidos);
      }

      const { data, count, error } = await query
        .order('razon_social')
        .range(pagina * filasPorPagina, pagina * filasPorPagina + filasPorPagina - 1);

      if (error) {
        setLoadError('No se pudo cargar la libreta de clientes.');
        return { data: [], count: 0 };
      }
      setLoadError(null);
      return { data: (data ?? []) as ClienteFila[], count: count ?? 0 };
    },
    [grupoSeleccionado],
  );

  const { busqueda, setBusqueda, pagina, setPagina, filasPorPagina, setFilasPorPagina, filas, total, loading, recargar } =
    useTablaRemota(fetchPage);

  function abrirNuevo() {
    setClienteEditando(null);
    setErrorGuardado(null);
    setDialogAbierto(true);
  }

  function abrirEdicion(cliente: ClienteFila) {
    setClienteEditando(cliente);
    setErrorGuardado(null);
    setDialogAbierto(true);
  }

  async function handleGuardar(valores: ClienteFormValues, grupoIds: string[]) {
    setGuardando(true);
    setErrorGuardado(null);

    const datos = {
      tipo_documento: valores.tipo_documento,
      numero_documento: valores.numero_documento,
      razon_social: valores.razon_social,
      domicilio: valores.domicilio || null,
      condicion_iva: valores.condicion_iva,
      email: valores.email || null,
    };

    let clienteId = clienteEditando?.id;

    if (clienteEditando) {
      const { error } = await supabase.from('clientes').update(datos).eq('id', clienteEditando.id);
      if (error) {
        setErrorGuardado('No se pudo guardar el cliente.');
        setGuardando(false);
        return;
      }
    } else {
      const { data, error } = await supabase.from('clientes').insert(datos).select('id').single();
      if (error || !data) {
        setErrorGuardado('No se pudo crear el cliente. Revisá que el documento no esté repetido.');
        setGuardando(false);
        return;
      }
      clienteId = data.id;
    }

    // Reconciliar grupos: se borran todos y se insertan los elegidos.
    // El volumen por cliente es chico, no hace falta un diff más fino.
    await supabase.from('clientes_grupos').delete().eq('cliente_id', clienteId);
    if (grupoIds.length > 0) {
      await supabase.from('clientes_grupos').insert(grupoIds.map((grupo_id) => ({ cliente_id: clienteId, grupo_id })));
    }

    setGuardando(false);
    setDialogAbierto(false);
    recargar();
  }

  return (
    <>
      <PageHeader
        title="Libreta de clientes"
        description="Filtrá por grupo para encontrarlos más rápido"
        action={
          <Box sx={{ display: 'flex', gap: 2 }}>
            <Button variant="outlined" startIcon={<UploadFileOutlinedIcon />} onClick={() => setImportarAbierto(true)} size="large">
              Importar desde Excel
            </Button>
            <Button variant="contained" startIcon={<AddIcon />} onClick={abrirNuevo} size="large">
              Nuevo cliente
            </Button>
          </Box>
        }
      />

      {loadError && <Alert severity="error" sx={{ mb: 2 }}>{loadError}</Alert>}

      <TextField
        placeholder="Buscar por nombre o documento"
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

      <Box sx={{ display: 'flex', flexWrap: 'wrap', alignItems: 'center', gap: 1, mb: 3 }}>
        <Chip
          label="Todos"
          clickable
          color={grupoSeleccionado === null ? 'primary' : 'default'}
          variant={grupoSeleccionado === null ? 'filled' : 'outlined'}
          onClick={() => setGrupoSeleccionado(null)}
        />
        {grupos.map((grupo) => (
          <Chip
            key={grupo.id}
            label={grupo.nombre}
            clickable
            color={grupoSeleccionado === grupo.id ? 'primary' : 'default'}
            variant={grupoSeleccionado === grupo.id ? 'filled' : 'outlined'}
            onClick={() => setGrupoSeleccionado(grupo.id)}
          />
        ))}
      </Box>

      <Paper variant="outlined">
        <Table>
          <TableHead>
            <TableRow>
              <TableCell>Razón social</TableCell>
              <TableCell>Documento</TableCell>
              <TableCell>Condición IVA</TableCell>
              <TableCell>Correo</TableCell>
              <TableCell>Grupos</TableCell>
              <TableCell align="right" />
            </TableRow>
          </TableHead>
          <TableBody>
            {loading && <TableSkeletonRows columns={6} />}
            {!loading && filas.length === 0 && (
              <TableRow>
                <TableCell colSpan={6}>
                  <Typography color="text.secondary" sx={{ py: 3, textAlign: 'center' }}>
                    {total === 0 && !busqueda && !grupoSeleccionado
                      ? 'Todavía no cargaste ningún cliente.'
                      : 'No hay clientes que coincidan con la búsqueda.'}
                  </Typography>
                </TableCell>
              </TableRow>
            )}
            {filas.map((cliente) => (
              <TableRow key={cliente.id} hover>
                <TableCell>{cliente.razon_social}</TableCell>
                <TableCell sx={{ fontVariantNumeric: 'tabular-nums' }}>
                  {cliente.tipo_documento} {cliente.numero_documento}
                </TableCell>
                <TableCell>{cliente.condicion_iva}</TableCell>
                <TableCell>{cliente.email || '—'}</TableCell>
                <TableCell>
                  <Box sx={{ display: 'flex', flexWrap: 'wrap', gap: 0.5 }}>
                    {cliente.clientes_grupos.map(({ grupo_id }) => {
                      const grupo = grupos.find((g) => g.id === grupo_id);
                      return grupo ? <Chip key={grupo_id} label={grupo.nombre} size="small" /> : null;
                    })}
                  </Box>
                </TableCell>
                <TableCell align="right">
                  <IconButton aria-label="Editar cliente" onClick={() => abrirEdicion(cliente)}>
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

      <ClienteFormDialog
        open={dialogAbierto}
        cliente={clienteEditando}
        grupos={grupos}
        grupoIdsIniciales={clienteEditando ? clienteEditando.clientes_grupos.map((cg) => cg.grupo_id) : []}
        saving={guardando}
        error={errorGuardado}
        onClose={() => setDialogAbierto(false)}
        onSave={handleGuardar}
      />

      <ImportarClientesDialog
        open={importarAbierto}
        gruposExistentes={grupos}
        onClose={() => setImportarAbierto(false)}
        onImportado={recargar}
      />
    </>
  );
}
