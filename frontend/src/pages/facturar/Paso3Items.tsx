import AddIcon from '@mui/icons-material/Add';
import DeleteOutlineIcon from '@mui/icons-material/DeleteOutlined';
import {
  Alert,
  Autocomplete,
  Box,
  Button,
  IconButton,
  MenuItem,
  Paper,
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableRow,
  TextField,
  Typography,
} from '@mui/material';
import { useRef } from 'react';
import { ALICUOTAS_IVA, esComprobanteSinIva } from '../../constants/facturacion';
import { UNIDADES_MEDIDA } from '../../constants/catalogo';
import type { AlumnoConResponsable, CatalogoItem } from '../../types/domain';
import { descripcionParaAlumno, MARCADOR_ALUMNO, MARCADOR_CURSO, usaMarcadorCurso } from './alumnos';
import { calcularSubtotalItem, calcularTotales, formatearMoneda } from './calculos';
import { crearItemVacio, type ItemFactura } from './types';

interface Props {
  items: ItemFactura[];
  onChange: (items: ItemFactura[]) => void;
  observaciones: string;
  onChangeObservaciones: (valor: string) => void;
  catalogoItems: CatalogoItem[];
  modo: 'simple' | 'multiple';
  tipoComprobante: string;
  porAlumno: boolean;
  ejemploAlumno: AlumnoConResponsable | null;
  alumnosSinCurso: number;
}

export function Paso3Items({
  items,
  onChange,
  observaciones,
  onChangeObservaciones,
  catalogoItems,
  modo,
  tipoComprobante,
  porAlumno,
  ejemploAlumno,
  alumnosSinCurso,
}: Props) {
  const sinIva = esComprobanteSinIva(tipoComprobante);
  // Dónde estaba el cursor la última vez que se salió de una descripción:
  // al tocar "Insertar nombre del alumno" el campo ya perdió el foco.
  const ultimoCursor = useRef<{ id: string; inicio: number; fin: number } | null>(null);

  function actualizarItem(id: string, cambios: Partial<ItemFactura>) {
    onChange(items.map((item) => (item.id === id ? { ...item, ...cambios } : item)));
  }

  function registrarCursor(id: string, campo: HTMLInputElement | HTMLTextAreaElement) {
    ultimoCursor.current = { id, inicio: campo.selectionStart ?? campo.value.length, fin: campo.selectionEnd ?? campo.value.length };
  }

  function insertarMarcador(marcador: string) {
    const cursor = ultimoCursor.current;
    const item = (cursor && items.find((i) => i.id === cursor.id)) || items[0];
    if (!item) return;

    const texto = item.descripcion;
    const inicio = cursor && cursor.id === item.id ? Math.min(cursor.inicio, texto.length) : texto.length;
    const fin = cursor && cursor.id === item.id ? Math.min(cursor.fin, texto.length) : texto.length;

    actualizarItem(item.id, { descripcion: texto.slice(0, inicio) + marcador + texto.slice(fin), catalogoItemId: null });
    ultimoCursor.current = { id: item.id, inicio: inicio + marcador.length, fin: inicio + marcador.length };
  }

  function agregarFila() {
    onChange([...items, crearItemVacio()]);
  }

  function quitarFila(id: string) {
    onChange(items.filter((item) => item.id !== id));
  }

  function elegirDelCatalogo(id: string, catalogoItem: CatalogoItem | null) {
    if (!catalogoItem) return;
    actualizarItem(id, {
      catalogoItemId: catalogoItem.id,
      codigo: String(catalogoItem.codigo).padStart(4, '0'),
      descripcion: catalogoItem.descripcion,
      unidadMedida: catalogoItem.unidad_medida ?? '',
    });
  }

  const totales = calcularTotales(items, sinIva);

  const faltaCurso = porAlumno && alumnosSinCurso > 0 && items.some((item) => usaMarcadorCurso(item.descripcion));
  const descripcionesConTexto = items.filter((item) => item.descripcion.trim());

  return (
    <Box>
      {porAlumno && (
        <Paper variant="outlined" sx={{ p: 2, mb: 2 }}>
          <Typography variant="body2" sx={{ mb: 1.5 }}>
            Cargá el concepto una sola vez: se repite por cada alumno. Para que el sistema escriba los datos de cada chico, insertalos en el
            texto donde correspondan.
          </Typography>
          <Box sx={{ display: 'flex', gap: 1, flexWrap: 'wrap' }}>
            <Button size="small" variant="outlined" onClick={() => insertarMarcador(MARCADOR_ALUMNO)}>
              Insertar nombre del alumno
            </Button>
            <Button size="small" variant="outlined" onClick={() => insertarMarcador(MARCADOR_CURSO)}>
              Insertar curso
            </Button>
          </Box>
          <Typography variant="caption" color="text.secondary" sx={{ display: 'block', mt: 1 }}>
            Se escriben {MARCADOR_ALUMNO} y {MARCADOR_CURSO}. Si no ponés el nombre, el sistema lo agrega al final de cada renglón.
          </Typography>
        </Paper>
      )}

      {faltaCurso && (
        <Alert severity="warning" sx={{ mb: 2 }}>
          {alumnosSinCurso === 1
            ? '1 de los alumnos elegidos no tiene curso cargado'
            : `${alumnosSinCurso} de los alumnos elegidos no tienen curso cargado`}
          , y el texto usa {MARCADOR_CURSO}. Cargalo desde la sección Alumnos antes de seguir.
        </Alert>
      )}

      <Paper variant="outlined" sx={{ mb: 3, overflowX: 'auto' }}>
        <Table size="small" sx={{ minWidth: 900 }}>
          <TableHead>
            <TableRow>
              <TableCell sx={{ width: 90 }}>Código</TableCell>
              <TableCell sx={{ minWidth: porAlumno ? 340 : 220 }}>Producto o servicio</TableCell>
              <TableCell sx={{ width: 90 }}>Cantidad</TableCell>
              <TableCell sx={{ width: 130 }}>Unidad</TableCell>
              <TableCell sx={{ width: 130 }}>Precio unitario</TableCell>
              <TableCell sx={{ width: 90 }}>Bonif. %</TableCell>
              {!sinIva && <TableCell sx={{ width: 110 }}>IVA</TableCell>}
              <TableCell sx={{ width: 120 }} align="right">
                Subtotal
              </TableCell>
              <TableCell sx={{ width: 40 }} />
            </TableRow>
          </TableHead>
          <TableBody>
            {items.map((item) => (
              <TableRow key={item.id}>
                <TableCell sx={{ fontVariantNumeric: 'tabular-nums' }}>{item.codigo || '—'}</TableCell>
                <TableCell>
                  <Autocomplete
                    freeSolo
                    options={catalogoItems}
                    value={item.descripcion}
                    onChange={(_e, valor) => {
                      if (valor && typeof valor !== 'string') elegirDelCatalogo(item.id, valor);
                    }}
                    onInputChange={(_e, valor) => actualizarItem(item.id, { descripcion: valor, catalogoItemId: null })}
                    getOptionLabel={(opcion) => (typeof opcion === 'string' ? opcion : opcion.descripcion)}
                    renderInput={(params) => (
                      <TextField
                        {...params}
                        placeholder="Elegí del catálogo o escribí"
                        variant="standard"
                        multiline
                        onBlur={(e) => registrarCursor(item.id, e.target as HTMLInputElement | HTMLTextAreaElement)}
                      />
                    )}
                    size="small"
                  />
                </TableCell>
                <TableCell>
                  <TextField
                    type="number"
                    variant="standard"
                    value={item.cantidad}
                    onChange={(e) => actualizarItem(item.id, { cantidad: e.target.value })}
                    slotProps={{ htmlInput: { min: 0, style: { textAlign: 'right' } } }}
                  />
                </TableCell>
                <TableCell>
                  <TextField
                    select
                    variant="standard"
                    value={item.unidadMedida}
                    onChange={(e) => actualizarItem(item.id, { unidadMedida: e.target.value })}
                    fullWidth
                  >
                    {UNIDADES_MEDIDA.map((unidad) => (
                      <MenuItem key={unidad} value={unidad}>
                        {unidad}
                      </MenuItem>
                    ))}
                  </TextField>
                </TableCell>
                <TableCell>
                  <TextField
                    type="number"
                    variant="standard"
                    value={item.precioUnitario}
                    onChange={(e) => actualizarItem(item.id, { precioUnitario: e.target.value })}
                    slotProps={{ htmlInput: { min: 0, style: { textAlign: 'right' } } }}
                  />
                </TableCell>
                <TableCell>
                  <TextField
                    type="number"
                    variant="standard"
                    value={item.bonificacionPct}
                    onChange={(e) => actualizarItem(item.id, { bonificacionPct: e.target.value })}
                    slotProps={{ htmlInput: { min: 0, max: 100, style: { textAlign: 'right' } } }}
                  />
                </TableCell>
                {!sinIva && (
                  <TableCell>
                    <TextField
                      select
                      variant="standard"
                      value={item.alicuotaIva}
                      onChange={(e) => actualizarItem(item.id, { alicuotaIva: e.target.value as ItemFactura['alicuotaIva'] })}
                      fullWidth
                    >
                      {ALICUOTAS_IVA.map((alicuota) => (
                        <MenuItem key={alicuota.value} value={alicuota.value}>
                          {alicuota.label}
                        </MenuItem>
                      ))}
                    </TextField>
                  </TableCell>
                )}
                <TableCell align="right" sx={{ fontVariantNumeric: 'tabular-nums' }}>
                  {formatearMoneda(calcularSubtotalItem(item))}
                </TableCell>
                <TableCell>
                  <IconButton size="small" aria-label="Quitar ítem" onClick={() => quitarFila(item.id)} disabled={items.length === 1}>
                    <DeleteOutlineIcon fontSize="small" />
                  </IconButton>
                </TableCell>
              </TableRow>
            ))}
          </TableBody>
        </Table>
        <Box sx={{ p: 1.5 }}>
          <Button startIcon={<AddIcon />} onClick={agregarFila} size="small">
            Agregar ítem
          </Button>
        </Box>
      </Paper>

      {porAlumno && ejemploAlumno && descripcionesConTexto.length > 0 && (
        <Paper variant="outlined" sx={{ p: 2, mb: 3 }}>
          <Typography variant="body2" color="text.secondary" sx={{ mb: 1 }}>
            Así va a salir para {ejemploAlumno.nombre}
          </Typography>
          {descripcionesConTexto.map((item) => (
            <Typography key={item.id} variant="body2" sx={{ whiteSpace: 'pre-wrap' }}>
              {descripcionParaAlumno(item.descripcion, ejemploAlumno)}
            </Typography>
          ))}
        </Paper>
      )}

      <Box sx={{ display: 'flex', gap: 3, flexWrap: 'wrap' }}>
        <TextField
          label="Observaciones"
          value={observaciones}
          onChange={(e) => onChangeObservaciones(e.target.value)}
          multiline
          minRows={3}
          helperText="Se imprime en todas las facturas del lote"
          sx={{ flexGrow: 1, minWidth: 280 }}
        />

        <Paper variant="outlined" sx={{ p: 2.5, width: 280, flexShrink: 0 }}>
          {porAlumno ? (
            <Typography variant="body2" color="text.secondary" sx={{ mb: 1.5 }}>
              Estos importes son por cada alumno. Si un responsable tiene más de un hijo, su factura suma un renglón por cada uno.
            </Typography>
          ) : (
            modo === 'multiple' && (
              <Typography variant="body2" color="text.secondary" sx={{ mb: 1.5 }}>
                Estos importes son por cada factura.
              </Typography>
            )
          )}
          {!sinIva && (
            <>
              <Box sx={{ display: 'flex', justifyContent: 'space-between', mb: 0.5 }}>
                <Typography variant="body2">Neto gravado</Typography>
                <Typography variant="body2" sx={{ fontVariantNumeric: 'tabular-nums' }}>
                  {formatearMoneda(totales.neto)}
                </Typography>
              </Box>
              {Object.entries(totales.ivaPorAlicuota).map(([alicuota, monto]) => (
                <Box key={alicuota} sx={{ display: 'flex', justifyContent: 'space-between', mb: 0.5 }}>
                  <Typography variant="body2">IVA {alicuota === '10.5' ? '10,5' : alicuota}%</Typography>
                  <Typography variant="body2" sx={{ fontVariantNumeric: 'tabular-nums' }}>
                    {formatearMoneda(monto)}
                  </Typography>
                </Box>
              ))}
              {totales.exento > 0 && (
                <Box sx={{ display: 'flex', justifyContent: 'space-between', mb: 0.5 }}>
                  <Typography variant="body2">Exento</Typography>
                  <Typography variant="body2" sx={{ fontVariantNumeric: 'tabular-nums' }}>
                    {formatearMoneda(totales.exento)}
                  </Typography>
                </Box>
              )}
            </>
          )}
          <Box sx={{ display: 'flex', justifyContent: 'space-between', mb: 0.5 }}>
            <Typography variant="body2">Otros tributos</Typography>
            <Typography variant="body2" sx={{ fontVariantNumeric: 'tabular-nums' }}>
              {formatearMoneda(0)}
            </Typography>
          </Box>
          <Box sx={{ display: 'flex', justifyContent: 'space-between', mt: 1.5, pt: 1.5, borderTop: '1px solid', borderColor: 'divider' }}>
            <Typography variant="subtitle1">Total</Typography>
            <Typography variant="subtitle1" sx={{ fontVariantNumeric: 'tabular-nums' }}>
              {formatearMoneda(totales.total)}
            </Typography>
          </Box>
        </Paper>
      </Box>
    </Box>
  );
}
