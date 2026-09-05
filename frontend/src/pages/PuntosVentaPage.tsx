import AddIcon from '@mui/icons-material/Add';
import EditOutlinedIcon from '@mui/icons-material/EditOutlined';
import { Alert, Box, Button, Chip, IconButton, Paper, Table, TableBody, TableCell, TableHead, TableRow, Typography } from '@mui/material';
import { useEffect, useState } from 'react';
import { TableSkeletonRows } from '../components/TableSkeletonRows';
import { PuntoVentaFormDialog, type PuntoVentaFormValues } from './puntosVenta/PuntoVentaFormDialog';
import { supabase } from '../lib/supabaseClient';
import type { PuntoVenta } from '../types/domain';

export function PuntosVentaPage() {
  const [puntos, setPuntos] = useState<PuntoVenta[]>([]);
  const [loading, setLoading] = useState(true);
  const [loadError, setLoadError] = useState<string | null>(null);

  const [dialogAbierto, setDialogAbierto] = useState(false);
  const [puntoEditando, setPuntoEditando] = useState<PuntoVenta | null>(null);
  const [guardando, setGuardando] = useState(false);
  const [errorGuardado, setErrorGuardado] = useState<string | null>(null);

  async function cargar() {
    setLoading(true);
    setLoadError(null);

    const { data, error } = await supabase.from('puntos_venta').select('*').order('numero');
    if (error) {
      setLoadError('No se pudieron cargar los puntos de venta.');
    } else {
      setPuntos(data ?? []);
    }
    setLoading(false);
  }

  useEffect(() => {
    cargar();
  }, []);

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
    cargar();
  }

  return (
    <>
      <Box sx={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', mb: 3 }}>
        <Box>
          <Typography variant="h3" sx={{ mb: 1 }}>
            Puntos de venta
          </Typography>
          <Typography color="text.secondary">Tienen que ser los mismos números habilitados en ARCA para tu CUIT.</Typography>
        </Box>
        <Button variant="contained" startIcon={<AddIcon />} onClick={abrirNuevo} size="large">
          Nuevo punto de venta
        </Button>
      </Box>

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
            {!loading && puntos.length === 0 && (
              <TableRow>
                <TableCell colSpan={4}>
                  <Typography color="text.secondary" sx={{ py: 3, textAlign: 'center' }}>
                    Todavía no cargaste ningún punto de venta.
                  </Typography>
                </TableCell>
              </TableRow>
            )}
            {puntos.map((punto) => (
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
