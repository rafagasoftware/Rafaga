import { Alert, Box, Button, CircularProgress, Dialog, DialogActions, DialogContent, DialogContentText, DialogTitle, Typography } from '@mui/material';
import { useEffect, useState } from 'react';
import { supabase } from '../../lib/supabaseClient';
import type { Cliente } from '../../types/domain';

interface Uso {
  facturas: number;
  alumnos: number;
  nombresAlumnos: string[];
}

interface Props {
  cliente: Cliente | null;
  onClose: () => void;
  onEliminado: () => void;
}

// El contenido vive dentro del Dialog y se monta recién al abrirlo: así cada
// vez que se elige un cliente se vuelve a consultar su uso, sin arrastrar el
// resultado del anterior.
export function EliminarClienteDialog({ cliente, onClose, onEliminado }: Props) {
  return (
    <Dialog open={cliente !== null} onClose={onClose} fullWidth maxWidth="xs">
      {cliente && <Contenido cliente={cliente} onClose={onClose} onEliminado={onEliminado} />}
    </Dialog>
  );
}

function Contenido({ cliente, onClose, onEliminado }: { cliente: Cliente; onClose: () => void; onEliminado: () => void }) {
  const [uso, setUso] = useState<Uso | null>(null);
  const [errorVerificacion, setErrorVerificacion] = useState(false);
  const [eliminando, setEliminando] = useState(false);
  const [errorEliminar, setErrorEliminar] = useState<string | null>(null);

  useEffect(() => {
    let cancelado = false;

    Promise.all([
      supabase.from('facturas').select('id', { count: 'exact', head: true }).eq('cliente_id', cliente.id),
      supabase.from('alumnos').select('nombre', { count: 'exact' }).eq('cliente_id', cliente.id).order('nombre').limit(5),
    ]).then(([facturas, alumnos]) => {
      if (cancelado) return;
      if (facturas.error || alumnos.error) {
        setErrorVerificacion(true);
        return;
      }
      setUso({
        facturas: facturas.count ?? 0,
        alumnos: alumnos.count ?? 0,
        nombresAlumnos: (alumnos.data ?? []).map((alumno) => alumno.nombre as string),
      });
    });

    return () => {
      cancelado = true;
    };
  }, [cliente.id]);

  async function handleEliminar() {
    setEliminando(true);
    setErrorEliminar(null);

    // .select() devuelve las filas borradas: si no borró ninguna (ej. un permiso
    // que lo impide) no hay error, y sin esto parecería que salió bien.
    const { data, error } = await supabase.from('clientes').delete().eq('id', cliente.id).select('id');

    setEliminando(false);

    if (error || !data || data.length === 0) {
      // 23503: la base rechazó el borrado porque en el medio apareció una factura o un alumno.
      setErrorEliminar(
        error?.code === '23503'
          ? 'Ahora mismo tiene facturas o alumnos asociados, así que no se puede eliminar.'
          : 'No se pudo eliminar el cliente.',
      );
      return;
    }

    onEliminado();
    onClose();
  }

  const bloqueado = uso !== null && (uso.facturas > 0 || uso.alumnos > 0);

  return (
    <>
      <DialogTitle>{bloqueado ? 'No se puede eliminar el cliente' : 'Eliminar cliente'}</DialogTitle>
      <DialogContent>
        {errorVerificacion && <Alert severity="error">No se pudo verificar si el cliente se puede eliminar. Probá de nuevo en un rato.</Alert>}

        {!errorVerificacion && uso === null && (
          <Box sx={{ display: 'flex', alignItems: 'center', gap: 1.5 }}>
            <CircularProgress size={20} />
            <Typography color="text.secondary">Verificando si se puede eliminar…</Typography>
          </Box>
        )}

        {bloqueado && uso && (
          <Box sx={{ display: 'flex', flexDirection: 'column', gap: 1.5 }}>
            <DialogContentText>
              <strong>{cliente.razon_social}</strong> no se puede eliminar porque:
            </DialogContentText>
            {uso.facturas > 0 && (
              <Typography variant="body2">
                • Está en {uso.facturas === 1 ? '1 factura' : `${uso.facturas} facturas`}. Las facturas no se borran, y el cliente tiene que
                quedar para que sigan mostrándose.
              </Typography>
            )}
            {uso.alumnos > 0 && (
              <Typography variant="body2">
                • Es el responsable de pago de {uso.alumnos === 1 ? '1 alumno' : `${uso.alumnos} alumnos`}: {uso.nombresAlumnos.join(', ')}
                {uso.alumnos > uso.nombresAlumnos.length && ' y otros'}. Para eliminarlo, primero cambiá o eliminá esos alumnos.
              </Typography>
            )}
          </Box>
        )}

        {uso !== null && !bloqueado && (
          <DialogContentText>
            ¿Querés eliminar a <strong>{cliente.razon_social}</strong>? No tiene facturas ni alumnos asociados. También se lo quita de los grupos en
            los que esté, y esta acción no se puede deshacer.
          </DialogContentText>
        )}

        {errorEliminar && (
          <Alert severity="error" sx={{ mt: 2 }}>
            {errorEliminar}
          </Alert>
        )}
      </DialogContent>
      <DialogActions sx={{ px: 3, pb: 3 }}>
        {uso !== null && !bloqueado ? (
          <>
            <Button onClick={onClose} disabled={eliminando}>
              Cancelar
            </Button>
            <Button variant="contained" color="error" onClick={handleEliminar} disabled={eliminando}>
              {eliminando ? 'Eliminando…' : 'Eliminar'}
            </Button>
          </>
        ) : (
          <Button onClick={onClose}>{bloqueado ? 'Entendido' : 'Cerrar'}</Button>
        )}
      </DialogActions>
    </>
  );
}
