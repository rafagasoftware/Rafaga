import AddIcon from '@mui/icons-material/Add';
import EditOutlinedIcon from '@mui/icons-material/EditOutlined';
import {
  Alert,
  Box,
  Button,
  Chip,
  IconButton,
  InputAdornment,
  List,
  ListItemButton,
  ListItemText,
  Paper,
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableRow,
  TextField,
  Typography,
} from '@mui/material';
import SearchIcon from '@mui/icons-material/Search';
import { useEffect, useMemo, useState } from 'react';
import { TableSkeletonRows } from '../components/TableSkeletonRows';
import { ClienteFormDialog, type ClienteFormValues } from './clientes/ClienteFormDialog';
import { supabase } from '../lib/supabaseClient';
import type { Cliente, Grupo } from '../types/domain';

export function ClientesPage() {
  const [clientes, setClientes] = useState<Cliente[]>([]);
  const [grupos, setGrupos] = useState<Grupo[]>([]);
  const [clienteGrupos, setClienteGrupos] = useState<Record<string, string[]>>({});
  const [loading, setLoading] = useState(true);
  const [loadError, setLoadError] = useState<string | null>(null);

  const [busqueda, setBusqueda] = useState('');
  const [grupoSeleccionado, setGrupoSeleccionado] = useState<string | null>(null);

  const [dialogAbierto, setDialogAbierto] = useState(false);
  const [clienteEditando, setClienteEditando] = useState<Cliente | null>(null);
  const [guardando, setGuardando] = useState(false);
  const [errorGuardado, setErrorGuardado] = useState<string | null>(null);

  const [nuevoGrupo, setNuevoGrupo] = useState('');

  async function cargarTodo() {
    setLoading(true);
    setLoadError(null);

    const [clientesRes, gruposRes, relacionesRes] = await Promise.all([
      supabase.from('clientes').select('*').order('razon_social'),
      supabase.from('grupos').select('*').order('nombre'),
      supabase.from('clientes_grupos').select('cliente_id, grupo_id'),
    ]);

    if (clientesRes.error || gruposRes.error || relacionesRes.error) {
      setLoadError('No se pudo cargar la libreta de clientes.');
      setLoading(false);
      return;
    }

    const mapa: Record<string, string[]> = {};
    for (const relacion of relacionesRes.data ?? []) {
      mapa[relacion.cliente_id] = [...(mapa[relacion.cliente_id] ?? []), relacion.grupo_id];
    }

    setClientes(clientesRes.data ?? []);
    setGrupos(gruposRes.data ?? []);
    setClienteGrupos(mapa);
    setLoading(false);
  }

  useEffect(() => {
    cargarTodo();
  }, []);

  const clientesFiltrados = useMemo(() => {
    const texto = busqueda.trim().toLowerCase();

    return clientes.filter((cliente) => {
      const coincideTexto =
        !texto ||
        cliente.razon_social.toLowerCase().includes(texto) ||
        cliente.numero_documento.toLowerCase().includes(texto);

      const coincideGrupo = !grupoSeleccionado || (clienteGrupos[cliente.id] ?? []).includes(grupoSeleccionado);

      return coincideTexto && coincideGrupo;
    });
  }, [clientes, busqueda, grupoSeleccionado, clienteGrupos]);

  function abrirNuevo() {
    setClienteEditando(null);
    setErrorGuardado(null);
    setDialogAbierto(true);
  }

  function abrirEdicion(cliente: Cliente) {
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
      await supabase
        .from('clientes_grupos')
        .insert(grupoIds.map((grupo_id) => ({ cliente_id: clienteId, grupo_id })));
    }

    setGuardando(false);
    setDialogAbierto(false);
    cargarTodo();
  }

  async function handleAgregarGrupo() {
    const nombre = nuevoGrupo.trim();
    if (!nombre) return;

    const { error } = await supabase.from('grupos').insert({ nombre });
    if (!error) {
      setNuevoGrupo('');
      cargarTodo();
    }
  }

  return (
    <>
      <Box sx={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', mb: 3 }}>
        <Box>
          <Typography variant="h3" sx={{ mb: 1 }}>
            Libreta de clientes
          </Typography>
          <Typography color="text.secondary">Los grupos que armes acá son los que después elegís para facturar a varios clientes juntos.</Typography>
        </Box>
        <Button variant="contained" startIcon={<AddIcon />} onClick={abrirNuevo} size="large">
          Nuevo cliente
        </Button>
      </Box>

      {loadError && <Alert severity="error" sx={{ mb: 2 }}>{loadError}</Alert>}

      <Box sx={{ display: 'flex', gap: 3 }}>
        <Paper variant="outlined" sx={{ width: 220, flexShrink: 0, p: 2 }}>
          <Typography variant="body2" sx={{ mb: 1, fontWeight: 600 }}>
            Grupos
          </Typography>
          <List dense disablePadding>
            <ListItemButton
              selected={grupoSeleccionado === null}
              onClick={() => setGrupoSeleccionado(null)}
              sx={{ borderRadius: 1 }}
            >
              <ListItemText primary="Todos" />
            </ListItemButton>
            {grupos.map((grupo) => (
              <ListItemButton
                key={grupo.id}
                selected={grupoSeleccionado === grupo.id}
                onClick={() => setGrupoSeleccionado(grupo.id)}
                sx={{ borderRadius: 1 }}
              >
                <ListItemText primary={grupo.nombre} />
              </ListItemButton>
            ))}
          </List>

          <Box sx={{ display: 'flex', gap: 1, mt: 2 }}>
            <TextField
              size="small"
              placeholder="Grupo nuevo"
              value={nuevoGrupo}
              onChange={(e) => setNuevoGrupo(e.target.value)}
              onKeyDown={(e) => e.key === 'Enter' && handleAgregarGrupo()}
              fullWidth
            />
            <IconButton onClick={handleAgregarGrupo} aria-label="Agregar grupo" color="primary">
              <AddIcon />
            </IconButton>
          </Box>
        </Paper>

        <Box sx={{ flexGrow: 1 }}>
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
                {!loading && clientesFiltrados.length === 0 && (
                  <TableRow>
                    <TableCell colSpan={6}>
                      <Typography color="text.secondary" sx={{ py: 3, textAlign: 'center' }}>
                        {clientes.length === 0 ? 'Todavía no cargaste ningún cliente.' : 'No hay clientes que coincidan con la búsqueda.'}
                      </Typography>
                    </TableCell>
                  </TableRow>
                )}
                {clientesFiltrados.map((cliente) => (
                  <TableRow key={cliente.id} hover>
                    <TableCell>{cliente.razon_social}</TableCell>
                    <TableCell sx={{ fontVariantNumeric: 'tabular-nums' }}>
                      {cliente.tipo_documento} {cliente.numero_documento}
                    </TableCell>
                    <TableCell>{cliente.condicion_iva}</TableCell>
                    <TableCell>{cliente.email || '—'}</TableCell>
                    <TableCell>
                      <Box sx={{ display: 'flex', flexWrap: 'wrap', gap: 0.5 }}>
                        {(clienteGrupos[cliente.id] ?? []).map((grupoId) => {
                          const grupo = grupos.find((g) => g.id === grupoId);
                          return grupo ? <Chip key={grupoId} label={grupo.nombre} size="small" /> : null;
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
          </Paper>
        </Box>
      </Box>

      <ClienteFormDialog
        open={dialogAbierto}
        cliente={clienteEditando}
        grupos={grupos}
        grupoIdsIniciales={clienteEditando ? clienteGrupos[clienteEditando.id] ?? [] : []}
        saving={guardando}
        error={errorGuardado}
        onClose={() => setDialogAbierto(false)}
        onSave={handleGuardar}
      />
    </>
  );
}
