import CloseIcon from '@mui/icons-material/Close';
import { Dialog, DialogContent, IconButton } from '@mui/material';
import { useEffect, useState } from 'react';
import { FacturaDetalleContenido } from './FacturaDetalleContenido';

interface Props {
  facturaId: string | null;
  onClose: (huboCambios: boolean) => void;
}

export function FacturaDetalleModal({ facturaId, onClose }: Props) {
  const [huboCambios, setHuboCambios] = useState(false);

  useEffect(() => {
    setHuboCambios(false);
  }, [facturaId]);

  const cerrar = () => onClose(huboCambios);

  return (
    <Dialog open={Boolean(facturaId)} onClose={cerrar} maxWidth="md" fullWidth>
      <IconButton onClick={cerrar} className="no-imprimir" sx={{ position: 'absolute', right: 8, top: 8 }} aria-label="Cerrar">
        <CloseIcon />
      </IconButton>

      <DialogContent className="rafaga-imprimible" sx={{ pt: 5 }}>
        {facturaId && <FacturaDetalleContenido facturaId={facturaId} onHuboCambios={() => setHuboCambios(true)} />}
      </DialogContent>
    </Dialog>
  );
}
