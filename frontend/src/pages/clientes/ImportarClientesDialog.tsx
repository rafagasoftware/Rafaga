import CheckCircleOutlinedIcon from '@mui/icons-material/CheckCircleOutlined';
import ErrorOutlineOutlinedIcon from '@mui/icons-material/ErrorOutlineOutlined';
import UploadFileOutlinedIcon from '@mui/icons-material/UploadFileOutlined';
import {
  Alert,
  Box,
  Button,
  Chip,
  Dialog,
  DialogActions,
  DialogContent,
  DialogTitle,
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableRow,
  Typography,
} from '@mui/material';
import { useState, type ChangeEvent } from 'react';
import { descargarPlantilla, parsearArchivoClientes, type FilaImportada } from '../../lib/clientesImport';
import { supabase } from '../../lib/supabaseClient';
import type { Grupo } from '../../types/domain';

interface Fallido {
  fila: number;
  razon_social: string;
  motivo: string;
}

interface Props {
  open: boolean;
  gruposExistentes: Grupo[];
  onClose: () => void;
  onImportado: () => void;
}

type Paso = 'seleccionar' | 'revisar' | 'resultado';

export function ImportarClientesDialog({ open, gruposExistentes, onClose, onImportado }: Props) {
  const [paso, setPaso] = useState<Paso>('seleccionar');
  const [filas, setFilas] = useState<FilaImportada[]>([]);
  const [errorArchivo, setErrorArchivo] = useState<string | null>(null);
  const [importando, setImportando] = useState(false);
  const [resultado, setResultado] = useState<{ exitosos: number; fallidos: Fallido[] } | null>(null);

  function reiniciar() {
    setPaso('seleccionar');
    setFilas([]);
    setErrorArchivo(null);
    setResultado(null);
  }

  function handleClose() {
    reiniciar();
    onClose();
  }

  async function handleArchivoElegido(event: ChangeEvent<HTMLInputElement>) {
    const archivo = event.target.files?.[0];
    event.target.value = '';
    if (!archivo) return;

    setErrorArchivo(null);
    try {
      const filasParseadas = await parsearArchivoClientes(archivo);
      if (filasParseadas.length === 0) {
        setErrorArchivo('El archivo no tiene filas para importar.');
        return;
      }
      setFilas(filasParseadas);
      setPaso('revisar');
    } catch {
      setErrorArchivo('No se pudo leer el archivo. Verificá que sea un Excel (.xlsx) válido.');
    }
  }

  async function confirmarImportacion() {
    setImportando(true);

    const filasValidas = filas.filter((f) => f.errores.length === 0);
    const fallidos: Fallido[] = [];
    let exitosos = 0;
    const gruposCache = new Map(gruposExistentes.map((g) => [g.nombre.toLowerCase(), g.id]));

    for (const fila of filasValidas) {
      const { data: cliente, error } = await supabase
        .from('clientes')
        .insert({
          tipo_documento: fila.tipo_documento,
          numero_documento: fila.numero_documento,
          razon_social: fila.razon_social,
          domicilio: fila.domicilio || null,
          condicion_iva: fila.condicion_iva,
          email: fila.email || null,
        })
        .select('id')
        .single();

      if (error || !cliente) {
        fallidos.push({
          fila: fila.fila,
          razon_social: fila.razon_social,
          motivo: 'No se pudo crear (revisá que el documento no esté repetido).',
        });
        continue;
      }

      for (const nombreGrupo of fila.grupos) {
        const clave = nombreGrupo.toLowerCase();
        let grupoId = gruposCache.get(clave);

        if (!grupoId) {
          const { data: nuevoGrupo, error: errorGrupo } = await supabase
            .from('grupos')
            .insert({ nombre: nombreGrupo })
            .select('id')
            .single();
          if (!errorGrupo && nuevoGrupo) {
            grupoId = nuevoGrupo.id as string;
            gruposCache.set(clave, grupoId);
          }
        }

        if (grupoId) {
          await supabase.from('clientes_grupos').insert({ cliente_id: cliente.id, grupo_id: grupoId });
        }
      }

      exitosos += 1;
    }

    setImportando(false);
    setResultado({ exitosos, fallidos });
    setPaso('resultado');
    onImportado();
  }

  const filasValidas = filas.filter((f) => f.errores.length === 0);
  const filasConError = filas.filter((f) => f.errores.length > 0);

  return (
    <Dialog open={open} onClose={handleClose} fullWidth maxWidth="sm">
      <DialogTitle>Importar clientes desde Excel</DialogTitle>
      <DialogContent sx={{ display: 'flex', flexDirection: 'column', gap: 2, pt: 1 }}>
        {paso === 'seleccionar' && (
          <>
            <Typography color="text.secondary">
              Descargá la planilla de ejemplo, completala con tus clientes y subila acá. Las columnas "Tipo de documento",
              "Número de documento", "Razón social" y "Condición frente al IVA" son obligatorias.
            </Typography>
            <Box>
              <Button variant="outlined" onClick={descargarPlantilla}>
                Descargar planilla de ejemplo
              </Button>
            </Box>
            <Box>
              <Button variant="contained" component="label" size="large" startIcon={<UploadFileOutlinedIcon />}>
                Elegir archivo
                <input type="file" hidden accept=".xlsx,.xls" onChange={handleArchivoElegido} />
              </Button>
            </Box>
            {errorArchivo && <Alert severity="error">{errorArchivo}</Alert>}
          </>
        )}

        {paso === 'revisar' && (
          <>
            <Typography>
              {filasValidas.length} {filasValidas.length === 1 ? 'fila lista' : 'filas listas'} para importar.
              {filasConError.length > 0 && ` ${filasConError.length} con error (no se van a importar).`}
            </Typography>

            <Box sx={{ maxHeight: 320, overflowY: 'auto', border: '1px solid', borderColor: 'divider' }}>
              <Table size="small" stickyHeader>
                <TableHead>
                  <TableRow>
                    <TableCell>Fila</TableCell>
                    <TableCell>Razón social</TableCell>
                    <TableCell>Documento</TableCell>
                    <TableCell>Grupos</TableCell>
                    <TableCell>Estado</TableCell>
                  </TableRow>
                </TableHead>
                <TableBody>
                  {filas.map((fila) => (
                    <TableRow key={fila.fila}>
                      <TableCell sx={{ fontVariantNumeric: 'tabular-nums' }}>{fila.fila}</TableCell>
                      <TableCell>{fila.razon_social || '—'}</TableCell>
                      <TableCell sx={{ fontVariantNumeric: 'tabular-nums' }}>
                        {fila.tipo_documento} {fila.numero_documento}
                      </TableCell>
                      <TableCell>
                        {fila.grupos.map((g) => (
                          <Chip key={g} label={g} size="small" sx={{ mr: 0.5 }} />
                        ))}
                      </TableCell>
                      <TableCell>
                        {fila.errores.length === 0 ? (
                          <CheckCircleOutlinedIcon color="success" fontSize="small" />
                        ) : (
                          <Box sx={{ display: 'flex', alignItems: 'flex-start', gap: 0.5 }}>
                            <ErrorOutlineOutlinedIcon color="error" fontSize="small" />
                            <Typography variant="caption" color="error">
                              {fila.errores.join(' · ')}
                            </Typography>
                          </Box>
                        )}
                      </TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            </Box>
          </>
        )}

        {paso === 'resultado' && resultado && (
          <>
            <Alert severity={resultado.fallidos.length === 0 ? 'success' : 'warning'}>
              Se importaron {resultado.exitosos} de {filasValidas.length} clientes.
            </Alert>
            {resultado.fallidos.length > 0 && (
              <Box>
                <Typography variant="body2" sx={{ mb: 1 }}>
                  No se pudieron importar:
                </Typography>
                <Table size="small">
                  <TableBody>
                    {resultado.fallidos.map((f) => (
                      <TableRow key={f.fila}>
                        <TableCell sx={{ fontVariantNumeric: 'tabular-nums' }}>Fila {f.fila}</TableCell>
                        <TableCell>{f.razon_social || '—'}</TableCell>
                        <TableCell>{f.motivo}</TableCell>
                      </TableRow>
                    ))}
                  </TableBody>
                </Table>
              </Box>
            )}
          </>
        )}
      </DialogContent>
      <DialogActions sx={{ px: 3, pb: 3 }}>
        {paso === 'revisar' && (
          <>
            <Button onClick={handleClose} disabled={importando}>
              Cancelar
            </Button>
            <Button variant="contained" onClick={confirmarImportacion} disabled={importando || filasValidas.length === 0}>
              {importando ? 'Importando…' : `Confirmar importación (${filasValidas.length})`}
            </Button>
          </>
        )}
        {paso === 'seleccionar' && <Button onClick={handleClose}>Cerrar</Button>}
        {paso === 'resultado' && (
          <Button variant="contained" onClick={handleClose}>
            Listo
          </Button>
        )}
      </DialogActions>
    </Dialog>
  );
}
