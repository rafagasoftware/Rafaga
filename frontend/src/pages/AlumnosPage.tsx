import AddIcon from '@mui/icons-material/Add';
import DeleteOutlinedIcon from '@mui/icons-material/DeleteOutlined';
import EditOutlinedIcon from '@mui/icons-material/EditOutlined';
import SearchIcon from '@mui/icons-material/Search';
import UploadFileOutlinedIcon from '@mui/icons-material/UploadFileOutlined';
import {
  Alert,
  Box,
  Button,
  Dialog,
  DialogActions,
  DialogContent,
  DialogContentText,
  DialogTitle,
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
import { escaparParaFiltro } from '../lib/filtroPostgrest';
import { supabase } from '../lib/supabaseClient';
import type { AlumnoConResponsable } from '../types/domain';
import { AlumnoFormDialog, type AlumnoFormValues } from './alumnos/AlumnoFormDialog';
import { ImportarAlumnosDialog } from './alumnos/ImportarAlumnosDialog';

export function AlumnosPage() {
  const [loadError, setLoadError] = useState<string | null>(null);
  const [importarAbierto, setImportarAbierto] = useState(false);

  const [dialogAbierto, setDialogAbierto] = useState(false);
  const [alumnoEditando, setAlumnoEditando] = useState<AlumnoConResponsable | null>(null);
  const [guardando, setGuardando] = useState(false);
  const [errorGuardado, setErrorGuardado] = useState<string | null>(null);

  const [alumnoAEliminar, setAlumnoAEliminar] = useState<AlumnoConResponsable | null>(null);
  const [eliminando, setEliminando] = useState(false);
  const [errorEliminar, setErrorEliminar] = useState<string | null>(null);

  const fetchPage = useCallback(
    async ({ busqueda, pagina, filasPorPagina }: { busqueda: string; pagina: number; filasPorPagina: number }) => {
      let query = supabase.from('alumnos').select('*, cliente:clientes(*)', { count: 'exact' });

      if (busqueda) {
        const escapada = escaparParaFiltro(busqueda);
        query = query.or(`nombre.ilike.%${escapada}%,curso.ilike.%${escapada}%`);
      }

      const { data, count, error } = await query
        .order('nombre')
        .range(pagina * filasPorPagina, pagina * filasPorPagina + filasPorPagina - 1);

      if (error) {
        setLoadError('No se pudo cargar la lista de alumnos.');
        return { data: [], count: 0 };
      }
      setLoadError(null);
      return { data: (data ?? []) as unknown as AlumnoConResponsable[], count: count ?? 0 };
    },
    [],
  );

  const { busqueda, setBusqueda, pagina, setPagina, filasPorPagina, setFilasPorPagina, filas, total, loading, recargar } =
    useTablaRemota(fetchPage);

  function abrirNuevo() {
    setAlumnoEditando(null);
    setErrorGuardado(null);
    setDialogAbierto(true);
  }

  function abrirEdicion(alumno: AlumnoConResponsable) {
    setAlumnoEditando(alumno);
    setErrorGuardado(null);
    setDialogAbierto(true);
  }

  async function handleGuardar(valores: AlumnoFormValues) {
    setGuardando(true);
    setErrorGuardado(null);

    const datos = {
      nombre: valores.nombre,
      curso: valores.curso || null,
      cliente_id: valores.clienteId,
    };

    const { error } = alumnoEditando
      ? await supabase.from('alumnos').update(datos).eq('id', alumnoEditando.id)
      : await supabase.from('alumnos').insert(datos);

    setGuardando(false);

    if (error) {
      setErrorGuardado('No se pudo guardar el alumno.');
      return;
    }

    setDialogAbierto(false);
    recargar();
  }

  async function handleEliminar() {
    if (!alumnoAEliminar) return;

    setEliminando(true);
    setErrorEliminar(null);

    const { error } = await supabase.from('alumnos').delete().eq('id', alumnoAEliminar.id);

    setEliminando(false);

    if (error) {
      setErrorEliminar('No se pudo eliminar el alumno.');
      return;
    }

    setAlumnoAEliminar(null);
    recargar();
  }

  return (
    <>
      <PageHeader
        title="Alumnos"
        description="Cada alumno tiene un responsable de pago: al facturar elegís al alumno y la factura sale a nombre de su responsable."
        action={
          <Box sx={{ display: 'flex', gap: 2 }}>
            <Button variant="outlined" startIcon={<UploadFileOutlinedIcon />} onClick={() => setImportarAbierto(true)} size="large">
              Importar desde Excel
            </Button>
            <Button variant="contained" startIcon={<AddIcon />} onClick={abrirNuevo} size="large">
              Nuevo alumno
            </Button>
          </Box>
        }
      />

      {loadError && <Alert severity="error" sx={{ mb: 2 }}>{loadError}</Alert>}

      <TextField
        placeholder="Buscar por nombre o curso"
        value={busqueda}
        onChange={(e) => setBusqueda(e.target.value)}
        fullWidth
        sx={{ mb: 3 }}
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
              <TableCell>Alumno</TableCell>
              <TableCell>Curso</TableCell>
              <TableCell>Responsable de pago</TableCell>
              <TableCell align="right" />
            </TableRow>
          </TableHead>
          <TableBody>
            {loading && <TableSkeletonRows columns={4} />}
            {!loading && filas.length === 0 && (
              <TableRow>
                <TableCell colSpan={4}>
                  <Typography color="text.secondary" sx={{ py: 3, textAlign: 'center' }}>
                    {total === 0 && !busqueda ? 'Todavía no cargaste ningún alumno.' : 'No hay alumnos que coincidan con la búsqueda.'}
                  </Typography>
                </TableCell>
              </TableRow>
            )}
            {!loading && filas.map((alumno) => (
              <TableRow key={alumno.id} hover>
                <TableCell>{alumno.nombre}</TableCell>
                <TableCell>{alumno.curso || '—'}</TableCell>
                <TableCell>
                  {alumno.cliente ? (
                    <>
                      {alumno.cliente.razon_social}
                      <Typography component="span" variant="body2" color="text.secondary" sx={{ ml: 1, fontVariantNumeric: 'tabular-nums' }}>
                        {alumno.cliente.tipo_documento} {alumno.cliente.numero_documento}
                      </Typography>
                    </>
                  ) : (
                    '—'
                  )}
                </TableCell>
                <TableCell align="right">
                  <IconButton aria-label="Editar alumno" onClick={() => abrirEdicion(alumno)}>
                    <EditOutlinedIcon fontSize="small" />
                  </IconButton>
                  <IconButton
                    aria-label="Eliminar alumno"
                    onClick={() => {
                      setErrorEliminar(null);
                      setAlumnoAEliminar(alumno);
                    }}
                  >
                    <DeleteOutlinedIcon fontSize="small" />
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

      <AlumnoFormDialog
        open={dialogAbierto}
        alumno={alumnoEditando}
        saving={guardando}
        error={errorGuardado}
        onClose={() => setDialogAbierto(false)}
        onSave={handleGuardar}
      />

      <ImportarAlumnosDialog open={importarAbierto} onClose={() => setImportarAbierto(false)} onImportado={recargar} />

      <Dialog open={alumnoAEliminar !== null} onClose={() => setAlumnoAEliminar(null)} fullWidth maxWidth="xs">
        <DialogTitle>Eliminar alumno</DialogTitle>
        <DialogContent>
          <DialogContentText>
            ¿Querés eliminar a {alumnoAEliminar?.nombre}? Las facturas que ya emitiste no se modifican.
          </DialogContentText>
          {errorEliminar && <Alert severity="error" sx={{ mt: 2 }}>{errorEliminar}</Alert>}
        </DialogContent>
        <DialogActions sx={{ px: 3, pb: 3 }}>
          <Button onClick={() => setAlumnoAEliminar(null)} disabled={eliminando}>
            Cancelar
          </Button>
          <Button variant="contained" color="error" onClick={handleEliminar} disabled={eliminando}>
            {eliminando ? 'Eliminando…' : 'Eliminar'}
          </Button>
        </DialogActions>
      </Dialog>
    </>
  );
}
