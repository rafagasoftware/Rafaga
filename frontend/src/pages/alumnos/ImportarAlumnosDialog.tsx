import CheckCircleOutlinedIcon from '@mui/icons-material/CheckCircleOutlined';
import ErrorOutlineOutlinedIcon from '@mui/icons-material/ErrorOutlineOutlined';
import UploadFileOutlinedIcon from '@mui/icons-material/UploadFileOutlined';
import {
  Alert,
  Box,
  Button,
  Chip,
  CircularProgress,
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
import { descargarPlantillaAlumnos, ErrorDePlantilla, parsearArchivoAlumnos } from '../../lib/alumnosImport';
import { importarFilas, revisarContraBase, type ResultadoImportacion, type RevisionArchivo } from './importarAlumnos';

interface Props {
  open: boolean;
  onClose: () => void;
  onImportado: () => void;
}

type Paso = 'seleccionar' | 'revisar' | 'resultado';

export function ImportarAlumnosDialog({ open, onClose, onImportado }: Props) {
  const [paso, setPaso] = useState<Paso>('seleccionar');
  const [revision, setRevision] = useState<RevisionArchivo | null>(null);
  const [leyendo, setLeyendo] = useState(false);
  const [errorArchivo, setErrorArchivo] = useState<string | null>(null);
  const [importando, setImportando] = useState(false);
  const [resultado, setResultado] = useState<ResultadoImportacion | null>(null);

  function reiniciar() {
    setPaso('seleccionar');
    setRevision(null);
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
    setLeyendo(true);
    try {
      const filas = await parsearArchivoAlumnos(archivo);
      if (filas.length === 0) {
        setErrorArchivo('El archivo no tiene filas para importar.');
        return;
      }
      setRevision(await revisarContraBase(filas));
      setPaso('revisar');
    } catch (error) {
      setErrorArchivo(error instanceof ErrorDePlantilla ? error.message : 'No se pudo leer el archivo. Verificá que sea un Excel (.xlsx) válido.');
    } finally {
      setLeyendo(false);
    }
  }

  async function confirmarImportacion() {
    if (!revision) return;

    setImportando(true);
    const resultadoImportacion = await importarFilas(revision);
    setImportando(false);
    setResultado(resultadoImportacion);
    setPaso('resultado');
    onImportado();
  }

  const filas = revision?.filas ?? [];
  const listas = filas.filter((f) => f.errores.length === 0 && !f.yaCargado);
  const omitidas = filas.filter((f) => f.errores.length === 0 && f.yaCargado);
  const conError = filas.filter((f) => f.errores.length > 0);
  const responsablesNuevos = new Set(listas.filter((f) => f.responsableNuevo).map((f) => f.clave)).size;

  return (
    <Dialog open={open} onClose={handleClose} fullWidth maxWidth="md">
      <DialogTitle>Importar alumnos desde Excel</DialogTitle>
      <DialogContent sx={{ display: 'flex', flexDirection: 'column', gap: 2, pt: 1 }}>
        {paso === 'seleccionar' && (
          <>
            <Typography color="text.secondary">
              Descargá la planilla de ejemplo, completala con una fila por alumno y subila acá. Las columnas "Alumno" y "Número de documento del
              responsable" son obligatorias.
            </Typography>
            <Typography color="text.secondary">
              Si el responsable ya está cargado, se usa el que tenés (se reconoce por su documento). Si no, se crea con los datos de la fila: ahí
              hace falta su nombre. Cuando un responsable tiene varios hijos, alcanza con repetir su documento en cada fila. Si dejás vacío el tipo
              de documento se toma DNI (o CUIT si tiene 11 dígitos), y si dejás vacía la condición frente al IVA, Consumidor Final.
            </Typography>
            <Typography color="text.secondary">
              Podés volver a subir la lista actualizada: los alumnos que ya están cargados con el mismo responsable se omiten, no se duplican.
            </Typography>
            <Box>
              <Button variant="outlined" onClick={descargarPlantillaAlumnos}>
                Descargar planilla de ejemplo
              </Button>
            </Box>
            <Box>
              <Button variant="contained" component="label" size="large" startIcon={<UploadFileOutlinedIcon />} disabled={leyendo}>
                {leyendo ? 'Revisando el archivo…' : 'Elegir archivo'}
                <input type="file" hidden accept=".xlsx,.xls" onChange={handleArchivoElegido} />
              </Button>
              {leyendo && <CircularProgress size={20} sx={{ ml: 2, verticalAlign: 'middle' }} />}
            </Box>
            {errorArchivo && <Alert severity="error">{errorArchivo}</Alert>}
          </>
        )}

        {paso === 'revisar' && (
          <>
            <Typography>
              {listas.length} {listas.length === 1 ? 'alumno listo' : 'alumnos listos'} para importar
              {responsablesNuevos > 0 && ` (${responsablesNuevos} ${responsablesNuevos === 1 ? 'responsable nuevo' : 'responsables nuevos'})`}.
              {omitidas.length > 0 && ` ${omitidas.length} ya ${omitidas.length === 1 ? 'está cargado y se omite' : 'están cargados y se omiten'}.`}
              {conError.length > 0 && ` ${conError.length} con error (no se ${conError.length === 1 ? 'importa' : 'importan'}).`}
            </Typography>

            <Box sx={{ maxHeight: 360, overflowY: 'auto', border: '1px solid', borderColor: 'divider' }}>
              <Table size="small" stickyHeader>
                <TableHead>
                  <TableRow>
                    <TableCell>Fila</TableCell>
                    <TableCell>Alumno</TableCell>
                    <TableCell>Curso</TableCell>
                    <TableCell>Responsable de pago</TableCell>
                    <TableCell>Estado</TableCell>
                  </TableRow>
                </TableHead>
                <TableBody>
                  {filas.map((fila) => {
                    const nombreResponsable =
                      fila.responsable?.razon_social ?? revision?.responsablesNuevos.get(fila.clave)?.razon_social ?? (fila.razon_social || '—');

                    return (
                      <TableRow key={fila.fila}>
                        <TableCell sx={{ fontVariantNumeric: 'tabular-nums' }}>{fila.fila}</TableCell>
                        <TableCell>{fila.alumno || '—'}</TableCell>
                        <TableCell>{fila.curso || '—'}</TableCell>
                        <TableCell>
                          {nombreResponsable}
                          <Typography component="span" variant="body2" color="text.secondary" sx={{ ml: 1, fontVariantNumeric: 'tabular-nums' }}>
                            {fila.tipo_documento} {fila.numero_documento}
                          </Typography>
                        </TableCell>
                        <TableCell>
                          {fila.errores.length > 0 ? (
                            <Box sx={{ display: 'flex', alignItems: 'flex-start', gap: 0.5 }}>
                              <ErrorOutlineOutlinedIcon color="error" fontSize="small" />
                              <Typography variant="caption" color="error">
                                {fila.errores.join(' · ')}
                              </Typography>
                            </Box>
                          ) : fila.yaCargado ? (
                            <Chip label="Ya cargado: se omite" size="small" variant="outlined" />
                          ) : (
                            <Box sx={{ display: 'flex', alignItems: 'center', gap: 0.75 }}>
                              <CheckCircleOutlinedIcon color="success" fontSize="small" />
                              {fila.responsableNuevo && <Chip label="Responsable nuevo" size="small" variant="outlined" />}
                            </Box>
                          )}
                        </TableCell>
                      </TableRow>
                    );
                  })}
                </TableBody>
              </Table>
            </Box>
          </>
        )}

        {paso === 'resultado' && resultado && (
          <>
            <Alert severity={resultado.fallidos.length === 0 ? 'success' : 'warning'}>
              Se importaron {resultado.alumnosCreados} de {listas.length} alumnos
              {resultado.responsablesCreados > 0 &&
                ` y se crearon ${resultado.responsablesCreados} ${resultado.responsablesCreados === 1 ? 'responsable' : 'responsables'}`}
              .{resultado.omitidos > 0 && ` ${resultado.omitidos} ya estaban cargados y se omitieron.`}
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
                        <TableCell>{f.alumno || '—'}</TableCell>
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
            <Button variant="contained" onClick={confirmarImportacion} disabled={importando || listas.length === 0}>
              {importando ? 'Importando…' : `Confirmar importación (${listas.length})`}
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
