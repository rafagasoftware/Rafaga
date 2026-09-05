import AddIcon from '@mui/icons-material/Add';
import DeleteOutlineIcon from '@mui/icons-material/DeleteOutlined';
import {
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
import { ALICUOTAS_IVA } from '../../constants/facturacion';
import { UNIDADES_MEDIDA } from '../../constants/catalogo';
import type { CatalogoItem } from '../../types/domain';
import { calcularSubtotalItem, calcularTotales, formatearMoneda } from './calculos';
import { crearItemVacio, type ItemFactura } from './types';

interface Props {
  items: ItemFactura[];
  onChange: (items: ItemFactura[]) => void;
  observaciones: string;
  onChangeObservaciones: (valor: string) => void;
  catalogoItems: CatalogoItem[];
  modo: 'simple' | 'multiple';
}

export function Paso3Items({ items, onChange, observaciones, onChangeObservaciones, catalogoItems, modo }: Props) {
  function actualizarItem(id: string, cambios: Partial<ItemFactura>) {
    onChange(items.map((item) => (item.id === id ? { ...item, ...cambios } : item)));
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

  const totales = calcularTotales(items);

  return (
    <Box>
      <Paper variant="outlined" sx={{ mb: 3, overflowX: 'auto' }}>
        <Table size="small" sx={{ minWidth: 900 }}>
          <TableHead>
            <TableRow>
              <TableCell sx={{ width: 90 }}>Código</TableCell>
              <TableCell sx={{ minWidth: 220 }}>Producto o servicio</TableCell>
              <TableCell sx={{ width: 90 }}>Cantidad</TableCell>
              <TableCell sx={{ width: 130 }}>Unidad</TableCell>
              <TableCell sx={{ width: 130 }}>Precio unitario</TableCell>
              <TableCell sx={{ width: 90 }}>Bonif. %</TableCell>
              <TableCell sx={{ width: 110 }}>IVA</TableCell>
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
                    renderInput={(params) => <TextField {...params} placeholder="Elegí del catálogo o escribí" variant="standard" />}
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
          {modo === 'multiple' && (
            <Typography variant="body2" color="text.secondary" sx={{ mb: 1.5 }}>
              Estos importes son por cada factura.
            </Typography>
          )}
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
