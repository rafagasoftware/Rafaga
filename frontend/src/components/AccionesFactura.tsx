import FileDownloadOutlinedIcon from '@mui/icons-material/FileDownloadOutlined';
import ReceiptLongOutlinedIcon from '@mui/icons-material/ReceiptLongOutlined';
import ReplayOutlinedIcon from '@mui/icons-material/ReplayOutlined';
import VisibilityOutlinedIcon from '@mui/icons-material/VisibilityOutlined';
import { Box, Button, Dialog, DialogActions, DialogContent, DialogContentText, DialogTitle, IconButton, Tooltip } from '@mui/material';
import { useState } from 'react';
import { useAuth } from '../auth/AuthContext';
import { descargarPdfFactura, emitirNotaCredito, reintentarFactura } from '../lib/facturasApi';
import { formatearMoneda } from '../pages/facturar/calculos';

export interface MensajeAccion {
  severidad: 'success' | 'error' | 'warning';
  texto: string;
}

interface Props {
  factura: {
    id: string;
    estado: string;
    importe_total: number | null;
    cliente_razon_social: string | null;
  };
  tipoComprobante: string | null;
  tieneNotaCredito: boolean;
  onVerDetalle: () => void;
  onCambio: () => void;
  onMensaje: (mensaje: MensajeAccion) => void;
}

// Botones de acción de una fila de facturas: ver el detalle, descargar el
// PDF, emitir la nota de crédito y, si quedó con error, reintentar.
export function AccionesFactura({ factura, tipoComprobante, tieneNotaCredito, onVerDetalle, onCambio, onMensaje }: Props) {
  const { session } = useAuth();
  const [enCurso, setEnCurso] = useState<'pdf' | 'notaCredito' | 'reintento' | null>(null);
  const [confirmandoNotaCredito, setConfirmandoNotaCredito] = useState(false);

  const emitida = factura.estado === 'emitida';
  const esNotaCredito = tipoComprobante?.startsWith('nc_') ?? false;
  const puedeEmitirNotaCredito = emitida && !esNotaCredito && !tieneNotaCredito;

  const motivoSinNotaCredito = !emitida
    ? 'Solo disponible para facturas ya emitidas, con CAE'
    : esNotaCredito
      ? 'Una nota de crédito no se puede anular con otra'
      : 'Ya se emitió una nota de crédito para esta factura';

  async function handleDescargar() {
    if (!session) return;
    setEnCurso('pdf');
    const error = await descargarPdfFactura(session.access_token, factura.id);
    setEnCurso(null);
    if (error) onMensaje({ severidad: 'error', texto: error });
  }

  async function handleEmitirNotaCredito() {
    if (!session) return;
    setEnCurso('notaCredito');
    const resultado = await emitirNotaCredito(session.access_token, factura.id);
    setEnCurso(null);
    setConfirmandoNotaCredito(false);

    if ('error' in resultado) {
      onMensaje({ severidad: 'error', texto: resultado.error });
      return;
    }
    onMensaje({
      severidad: 'success',
      texto: `Nota de crédito emitida: comprobante ${resultado.numeroComprobante ?? '—'}, CAE ${resultado.cae ?? '—'}.`,
    });
    onCambio();
  }

  async function handleReintentar() {
    if (!session) return;
    setEnCurso('reintento');
    const resultado = await reintentarFactura(session.access_token, factura.id);
    setEnCurso(null);

    if ('error' in resultado) {
      onMensaje({ severidad: 'error', texto: resultado.error });
    } else if (resultado.aprobado) {
      onMensaje({ severidad: 'success', texto: 'El comprobante se emitió correctamente.' });
    } else {
      onMensaje({ severidad: 'warning', texto: 'ARCA volvió a rechazar el comprobante. El motivo está en el detalle.' });
    }
    onCambio();
  }

  // El contenedor frena los clics: la fila entera abre el detalle, y los
  // eventos del diálogo (que es un portal) también burbujean por acá.
  return (
    <Box sx={{ display: 'flex', justifyContent: 'flex-end', gap: 0.5 }} onClick={(e) => e.stopPropagation()}>
      <Tooltip title="Ver detalle">
        <IconButton size="small" aria-label="Ver detalle" onClick={onVerDetalle}>
          <VisibilityOutlinedIcon fontSize="small" />
        </IconButton>
      </Tooltip>

      <Tooltip title={emitida ? 'Descargar PDF' : 'Solo disponible para facturas ya emitidas, con CAE'}>
        <span>
          <IconButton size="small" aria-label="Descargar PDF" disabled={!emitida || enCurso !== null} onClick={handleDescargar}>
            <FileDownloadOutlinedIcon fontSize="small" />
          </IconButton>
        </span>
      </Tooltip>

      <Tooltip title={puedeEmitirNotaCredito ? 'Emitir nota de crédito' : motivoSinNotaCredito}>
        <span>
          <IconButton
            size="small"
            aria-label="Emitir nota de crédito"
            disabled={!puedeEmitirNotaCredito || enCurso !== null}
            onClick={() => setConfirmandoNotaCredito(true)}
          >
            <ReceiptLongOutlinedIcon fontSize="small" />
          </IconButton>
        </span>
      </Tooltip>

      {factura.estado === 'con_error' && (
        <Tooltip title="Reintentar la emisión">
          <span>
            <IconButton size="small" aria-label="Reintentar" disabled={enCurso !== null} onClick={handleReintentar}>
              <ReplayOutlinedIcon fontSize="small" />
            </IconButton>
          </span>
        </Tooltip>
      )}

      <Dialog open={confirmandoNotaCredito} onClose={() => !enCurso && setConfirmandoNotaCredito(false)}>
        <DialogTitle>¿Emitir nota de crédito?</DialogTitle>
        <DialogContent>
          <DialogContentText>
            Se va a emitir una nota de crédito por el total de esta factura ({formatearMoneda(factura.importe_total ?? 0)}), a nombre de{' '}
            {factura.cliente_razon_social ?? 'el cliente'}. Esta acción no se puede deshacer.
          </DialogContentText>
        </DialogContent>
        <DialogActions>
          <Button onClick={() => setConfirmandoNotaCredito(false)} disabled={enCurso === 'notaCredito'}>
            Cancelar
          </Button>
          <Button variant="contained" onClick={handleEmitirNotaCredito} disabled={enCurso === 'notaCredito'}>
            {enCurso === 'notaCredito' ? 'Emitiendo…' : 'Confirmar'}
          </Button>
        </DialogActions>
      </Dialog>
    </Box>
  );
}
