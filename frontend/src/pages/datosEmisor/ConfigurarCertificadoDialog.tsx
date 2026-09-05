import { Alert, Box, Button, Dialog, DialogActions, DialogContent, DialogTitle, MenuItem, TextField, Typography } from '@mui/material';
import { useState, type ChangeEvent } from 'react';
import { useAuth } from '../../auth/AuthContext';

const backendUrl = import.meta.env.VITE_BACKEND_URL;

interface Props {
  open: boolean;
  onClose: () => void;
  onGuardado: () => void;
}

function leerArchivoComoTexto(file: File): Promise<string> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => resolve(String(reader.result ?? ''));
    reader.onerror = () => reject(reader.error);
    reader.readAsText(file);
  });
}

export function ConfigurarCertificadoDialog({ open, onClose, onGuardado }: Props) {
  const { session } = useAuth();
  const [alias, setAlias] = useState('');
  const [ambiente, setAmbiente] = useState<'homologacion' | 'produccion'>('homologacion');
  const [certificadoPem, setCertificadoPem] = useState('');
  const [clavePrivadaPem, setClavePrivadaPem] = useState('');
  const [guardando, setGuardando] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function handleArchivo(setter: (valor: string) => void, event: ChangeEvent<HTMLInputElement>) {
    const archivo = event.target.files?.[0];
    event.target.value = '';
    if (!archivo) return;
    setter(await leerArchivoComoTexto(archivo));
  }

  async function handleGuardar() {
    setGuardando(true);
    setError(null);

    try {
      const response = await fetch(`${backendUrl}/me/certificado`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${session?.access_token}`,
        },
        body: JSON.stringify({ alias, ambiente, certificadoPem, clavePrivadaPem }),
      });

      const data = await response.json();

      if (!response.ok) {
        setError(data.error ?? 'No se pudo guardar el certificado.');
        return;
      }

      setAlias('');
      setCertificadoPem('');
      setClavePrivadaPem('');
      onGuardado();
      onClose();
    } catch {
      setError('No se pudo conectar con el servidor.');
    } finally {
      setGuardando(false);
    }
  }

  return (
    <Dialog open={open} onClose={onClose} fullWidth maxWidth="sm">
      <DialogTitle>Configurar certificado de ARCA</DialogTitle>
      <DialogContent sx={{ display: 'flex', flexDirection: 'column', gap: 2, pt: 1 }}>
        <Typography color="text.secondary">
          El certificado y la clave privada quedan guardados cifrados. Una vez cargados no se vuelven a mostrar.
        </Typography>

        <TextField
          label="Alias"
          value={alias}
          onChange={(e) => setAlias(e.target.value)}
          required
          fullWidth
          helperText="El mismo alias que le pusiste al certificado en ARCA"
        />

        <TextField
          select
          label="Ambiente"
          value={ambiente}
          onChange={(e) => setAmbiente(e.target.value as 'homologacion' | 'produccion')}
          fullWidth
          helperText="Homologación es el ambiente de pruebas de ARCA; producción emite facturas reales"
        >
          <MenuItem value="homologacion">Homologación (pruebas)</MenuItem>
          <MenuItem value="produccion">Producción</MenuItem>
        </TextField>

        <Box>
          <Button variant="outlined" component="label" size="small" sx={{ mb: 1 }}>
            Elegir archivo del certificado
            <input type="file" hidden accept=".pem,.crt,.cer" onChange={(e) => handleArchivo(setCertificadoPem, e)} />
          </Button>
          <TextField
            label="Certificado"
            value={certificadoPem}
            onChange={(e) => setCertificadoPem(e.target.value)}
            multiline
            minRows={3}
            fullWidth
            placeholder="-----BEGIN CERTIFICATE-----"
          />
        </Box>

        <Box>
          <Button variant="outlined" component="label" size="small" sx={{ mb: 1 }}>
            Elegir archivo de la clave privada
            <input type="file" hidden accept=".pem,.key" onChange={(e) => handleArchivo(setClavePrivadaPem, e)} />
          </Button>
          <TextField
            label="Clave privada"
            value={clavePrivadaPem}
            onChange={(e) => setClavePrivadaPem(e.target.value)}
            multiline
            minRows={3}
            fullWidth
            placeholder="-----BEGIN PRIVATE KEY-----"
          />
        </Box>

        {error && <Alert severity="error">{error}</Alert>}
      </DialogContent>
      <DialogActions sx={{ px: 3, pb: 3 }}>
        <Button onClick={onClose} disabled={guardando}>
          Cancelar
        </Button>
        <Button variant="contained" onClick={handleGuardar} disabled={guardando || !alias || !certificadoPem || !clavePrivadaPem}>
          {guardando ? 'Guardando…' : 'Guardar'}
        </Button>
      </DialogActions>
    </Dialog>
  );
}
