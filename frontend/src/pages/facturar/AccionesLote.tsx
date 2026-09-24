import FolderZipOutlinedIcon from '@mui/icons-material/FolderZipOutlined';
import ReceiptLongOutlinedIcon from '@mui/icons-material/ReceiptLongOutlined';
import { Alert, Box, Button, Dialog, DialogActions, DialogContent, DialogContentText, DialogTitle, LinearProgress } from '@mui/material';
import { useState } from 'react';
import { useAuth } from '../../auth/AuthContext';
import type { MensajeAccion } from '../../components/AccionesFactura';
import { descargarZipLote, emitirNotasCreditoDeLote } from '../../lib/facturasApi';
import type { ResultadoNotasCreditoLote } from '../../lib/facturasApi';
import { formatearMoneda } from './calculos';

const MAX_ERRORES_VISIBLES = 10;

interface Props {
  loteId: string;
  facturas: Array<{ estado: string; importe_total: number | null; tiene_nota_credito: boolean }>;
  onCambio: () => void;
  onMensaje: (mensaje: MensajeAccion) => void;
}

function notas(cantidad: number): string {
  return cantidad === 1 ? '1 nota de crédito' : `${cantidad} notas de crédito`;
}

// Acciones sobre todas las facturas de un lote recién emitido: bajarlas
// juntas en un ZIP y emitir la nota de crédito de todas de una vez.
export function AccionesLote({ loteId, facturas, onCambio, onMensaje }: Props) {
  const { session } = useAuth();
  const [descargandoZip, setDescargandoZip] = useState(false);
  const [confirmando, setConfirmando] = useState(false);
  const [emitiendo, setEmitiendo] = useState(false);
  const [resultado, setResultado] = useState<ResultadoNotasCreditoLote | null>(null);
  const [errorNotas, setErrorNotas] = useState<string | null>(null);

  const emitidas = facturas.filter((f) => f.estado === 'emitida');
  const acreditables = emitidas.filter((f) => !f.tiene_nota_credito);
  const totalAcreditable = acreditables.reduce((acumulado, f) => acumulado + (f.importe_total ?? 0), 0);

  async function handleDescargarZip() {
    if (!session) return;
    setDescargandoZip(true);
    const error = await descargarZipLote(session.access_token, loteId);
    setDescargandoZip(false);
    if (error) onMensaje({ severidad: 'error', texto: error });
  }

  async function handleEmitirNotas() {
    if (!session) return;
    setEmitiendo(true);
    setResultado(null);
    setErrorNotas(null);

    const respuesta = await emitirNotasCreditoDeLote(session.access_token, loteId);

    setEmitiendo(false);
    setConfirmando(false);

    if ('error' in respuesta) {
      setErrorNotas(respuesta.error);
    } else {
      setResultado(respuesta);
    }
    onCambio();
  }

  return (
    <Box sx={{ mb: 2 }}>
      <Box sx={{ display: 'flex', gap: 1.5, flexWrap: 'wrap', mb: 2 }}>
        <Button variant="outlined" startIcon={<FolderZipOutlinedIcon />} onClick={handleDescargarZip} disabled={emitidas.length === 0 || descargandoZip}>
          {descargandoZip ? 'Preparando ZIP…' : 'Descargar todas (ZIP)'}
        </Button>
        <Button
          variant="outlined"
          color="warning"
          startIcon={<ReceiptLongOutlinedIcon />}
          onClick={() => setConfirmando(true)}
          disabled={acreditables.length === 0 || emitiendo}
        >
          Emitir todas las notas de crédito
        </Button>
      </Box>

      {errorNotas && (
        <Alert severity="error" sx={{ mb: 2 }} onClose={() => setErrorNotas(null)}>
          {errorNotas}
        </Alert>
      )}

      {resultado && (
        <Alert severity={resultado.conError === 0 ? 'success' : 'warning'} sx={{ mb: 2 }} onClose={() => setResultado(null)}>
          {resultado.conError === 0
            ? `Se emitieron ${notas(resultado.emitidas)}.`
            : `Se emitieron ${resultado.emitidas} de ${resultado.emitidas + resultado.conError} notas de crédito. No se pudieron emitir:`}
          {resultado.omitidas > 0 && ` ${resultado.omitidas === 1 ? '1 factura ya tenía' : `${resultado.omitidas} facturas ya tenían`} la suya.`}
          {resultado.errores.length > 0 && (
            <Box component="ul" sx={{ m: 0, mt: 0.5, pl: 2.5 }}>
              {resultado.errores.slice(0, MAX_ERRORES_VISIBLES).map((error) => (
                <li key={error.factura}>
                  {error.factura}: {error.motivo}
                </li>
              ))}
              {resultado.errores.length > MAX_ERRORES_VISIBLES && <li>…y {resultado.errores.length - MAX_ERRORES_VISIBLES} más.</li>}
            </Box>
          )}
        </Alert>
      )}

      <Dialog open={confirmando} onClose={() => !emitiendo && setConfirmando(false)}>
        <DialogTitle>¿Emitir las notas de crédito del lote?</DialogTitle>
        <DialogContent>
          <DialogContentText>
            Se van a emitir {notas(acreditables.length)}, una por cada factura emitida de este lote que todavía no tenga la suya, por un total de{' '}
            {formatearMoneda(totalAcreditable)}. Cada una anula su factura completa y esta acción no se puede deshacer.
          </DialogContentText>
          {emitiendo && (
            <Box sx={{ mt: 2 }}>
              <LinearProgress />
              <DialogContentText sx={{ mt: 1 }}>Emitiendo con ARCA, puede demorar un rato. No cierres esta pantalla.</DialogContentText>
            </Box>
          )}
        </DialogContent>
        <DialogActions>
          <Button onClick={() => setConfirmando(false)} disabled={emitiendo}>
            Cancelar
          </Button>
          <Button variant="contained" color="warning" onClick={handleEmitirNotas} disabled={emitiendo}>
            {emitiendo ? 'Emitiendo…' : 'Confirmar'}
          </Button>
        </DialogActions>
      </Dialog>
    </Box>
  );
}
