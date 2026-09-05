import AddIcon from '@mui/icons-material/Add';
import EditOutlinedIcon from '@mui/icons-material/EditOutlined';
import {
  Alert,
  Button,
  Chip,
  IconButton,
  Paper,
  Table,
  TableBody,
  TableCell,
  TableHead,
  TablePagination,
  TableRow,
  Typography,
} from '@mui/material';
import { useCallback, useState } from 'react';
import { PageHeader } from '../components/PageHeader';
import { TableSkeletonRows } from '../components/TableSkeletonRows';
import { useTablaRemota } from '../hooks/useTablaRemota';
import { supabase } from '../lib/supabaseClient';
import type { PuntoVenta } from '../types/domain';
import { PuntoVentaFormDialog, type PuntoVentaFormValues } from './puntosVenta/PuntoVentaFormDialog';

export function PuntosVentaPage() {
  const [loadError, setLoadError] = useState<string | null>(null);

  const [dialogAbierto, setDialogAbierto] = useState(false);
  const [puntoEditando, setPuntoEditando] = useState<PuntoVenta | null>(null);
  const [guardando, setGuardando] = useState(false);
  const [errorGuardado, setErrorGuardado] = useState<string | null>(null);

  const fetchPage = useCallback(async ({ pagina, filasPorPagina }: { pagina: number; filasPorPagina: number }) => {
    const { data, count, error } = await supabase
      .from('puntos_venta')
      .select('*', { count: 'exact' })
      .order('numero')
      .range(pagina * filasPorPagina, pagina * filasPorPagina + filasPorPagina - 1);

    if (error) {
      setLoadError('No se pudieron cargar los puntos de venta.');
      return { data: [], count: 0 };
    }
    setLoadError(null);
    return { data: (data ?? []) as PuntoVenta[], count: count ?? 0 };
  }, []);

  const { pagina, setPagina, filasPorPagina, setFilasPorPagina, filas, total, loading, recargar } = useTablaRemota(fetchPage);

  function abrirNuevo() {
    setPuntoEditando(null);
    setErrorGuardado(null);
    setDialogAbierto(true);
  }

  function abrirEdicion(punto: PuntoVenta) {
    setPuntoEditando(punto);
    setErrorGuardado(null);
    setDialogAbierto(true);
  }

  async function handleGuardar(valores: PuntoVentaFormValues) {
    setGuardando(true);
    setErrorGuardado(null);

    if (puntoEditando) {
      const { error } = await supabase
        .from('puntos_venta')
        .update({ descripcion: valores.descripcion || null, habilitado: valores.habilitado })
        .eq('id', puntoEditando.id);

      if (error) {
        setErrorGuardado('No se pudo guardar el punto de venta.');
        setGuardando(false);
        return;
      }
    } else {
      const { error } = await supabase.from('puntos_venta').insert({
        numero: Number(valores.numero),
        descripcion: valores.descripcion || null,
        habilitado: valores.habilitado,
      });

      if (error) {
        setErrorGuardado('No se pudo crear el punto de venta. Revisá que el número no esté repetido.');
        setGuardando(false);
        return;
      }
    }

    setGuardando(false);
    setDialogAbierto(false);
    recargar();
  }

  return (
    <>
      <PageHeader
        title="Puntos de venta"
        description="Tienen que ser los mismos números habilitados en ARCA para tu CUIT."
        action={
          <Button variant="contained" startIcon={<AddIcon />} onClick={abrirNuevo} size="large">
            Nuevo punto de venta
          </Button>
        }
      />

      {loadError && <Alert severity="error" sx={{ mb: 2 }}>{loadError}</Alert>}

      <Paper variant="outlined">
        <Table>
          <TableHead>
            <TableRow>
              <TableCell>Número</TableCell>
              <TableCell>Descripción</TableCell>
              <TableCell>Estado</TableCell>
              <TableCell align="right" />
            </TableRow>
          </TableHead>
          <TableBody>
            {loading && <TableSkeletonRows columns={4} />}
            {!loading && filas.length === 0 && (
              <TableRow>
                <TableCell colSpan={4}>
                  <Typography color="text.secondary" sx={{ py: 3, textAlign: 'center' }}>
                    Todavía no cargaste ningún punto de venta.
                  </Typography>
                </TableCell>
              </TableRow>
            )}
            {filas.map((punto) => (
              <TableRow key={punto.id} hover>
                <TableCell sx={{ fontVariantNumeric: 'tabular-nums' }}>{String(punto.numero).padStart(4, '0')}</TableCell>
                <TableCell>{punto.descripcion || '—'}</TableCell>
                <TableCell>
                  <Chip
                    label={punto.habilitado ? 'Habilitado' : 'Deshabilitado'}
                    color={punto.habilitado ? 'success' : 'default'}
                    size="small"
                    variant="outlined"
                  />
                </TableCell>
                <TableCell align="right">
                  <IconButton aria-label="Editar punto de venta" onClick={() => abrirEdicion(punto)}>
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

      <PuntoVentaFormDialog
        open={dialogAbierto}
        puntoVenta={puntoEditando}
        saving={guardando}
        error={errorGuardado}
        onClose={() => setDialogAbierto(false)}
        onSave={handleGuardar}
      />
    </>
  );
}
