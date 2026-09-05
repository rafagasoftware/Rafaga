import SearchIcon from '@mui/icons-material/Search';
import {
  Box,
  Chip,
  InputAdornment,
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
import { useEffect, useMemo, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { ESTADO_COLOR, ESTADO_LABEL } from '../constants/estadosFactura';
import { TIPOS_COMPROBANTE } from '../constants/facturacion';
import { supabase } from '../lib/supabaseClient';
import { formatearMoneda } from './facturar/calculos';

interface FilaFactura {
  id: string;
  numero_comprobante: string | null;
  cae: string | null;
  importe_total: number | null;
  estado: string;
  cliente: { razon_social: string } | null;
  lote: { tipo_comprobante: string; fecha_emision: string; total_clientes: number } | null;
}

export function FacturasPage() {
  const navigate = useNavigate();
  const [facturas, setFacturas] = useState<FilaFactura[]>([]);
  const [loading, setLoading] = useState(true);

  const [busqueda, setBusqueda] = useState('');
  const [tipoFiltro, setTipoFiltro] = useState('');
  const [estadoFiltro, setEstadoFiltro] = useState('');
  const [desde, setDesde] = useState('');
  const [hasta, setHasta] = useState('');

  useEffect(() => {
    supabase
      .from('facturas')
      .select('id, numero_comprobante, cae, importe_total, estado, cliente:clientes(razon_social), lote:lotes(tipo_comprobante, fecha_emision, total_clientes)')
      .order('creado_en', { ascending: false })
      .then(({ data }) => {
        setFacturas((data as unknown as FilaFactura[]) ?? []);
        setLoading(false);
      });
  }, []);

  const filtradas = useMemo(() => {
    const texto = busqueda.trim().toLowerCase();
    return facturas.filter((factura) => {
      const coincideTexto = !texto || (factura.cliente?.razon_social ?? '').toLowerCase().includes(texto);
      const coincideTipo = !tipoFiltro || factura.lote?.tipo_comprobante === tipoFiltro;
      const coincideEstado = !estadoFiltro || factura.estado === estadoFiltro;
      const fecha = factura.lote?.fecha_emision ?? '';
      const coincideDesde = !desde || fecha >= desde;
      const coincideHasta = !hasta || fecha <= hasta;
      return coincideTexto && coincideTipo && coincideEstado && coincideDesde && coincideHasta;
    });
  }, [facturas, busqueda, tipoFiltro, estadoFiltro, desde, hasta]);

  return (
    <>
      <Typography variant="h3" sx={{ mb: 3 }}>
        Facturas
      </Typography>

      <Box sx={{ display: 'flex', gap: 2, mb: 3, flexWrap: 'wrap' }}>
        <TextField
          placeholder="Buscar por cliente"
          value={busqueda}
          onChange={(e) => setBusqueda(e.target.value)}
          sx={{ minWidth: 220 }}
          slotProps={{
            input: {
              startAdornment: (
                <InputAdornment position="start">
                  <SearchIcon fontSize="small" />
                </InputAdornment>
              ),
            },
          }}
        />
        <TextField select label="Tipo" value={tipoFiltro} onChange={(e) => setTipoFiltro(e.target.value)} sx={{ minWidth: 160 }}>
          <MenuItem value="">Todos</MenuItem>
          {TIPOS_COMPROBANTE.map((tipo) => (
            <MenuItem key={tipo.value} value={tipo.value}>
              {tipo.label}
            </MenuItem>
          ))}
        </TextField>
        <TextField select label="Estado" value={estadoFiltro} onChange={(e) => setEstadoFiltro(e.target.value)} sx={{ minWidth: 160 }}>
          <MenuItem value="">Todos</MenuItem>
          {Object.entries(ESTADO_LABEL).map(([valor, label]) => (
            <MenuItem key={valor} value={valor}>
              {label}
            </MenuItem>
          ))}
        </TextField>
        <TextField
          label="Desde"
          type="date"
          value={desde}
          onChange={(e) => setDesde(e.target.value)}
          slotProps={{ inputLabel: { shrink: true } }}
        />
        <TextField
          label="Hasta"
          type="date"
          value={hasta}
          onChange={(e) => setHasta(e.target.value)}
          slotProps={{ inputLabel: { shrink: true } }}
        />
      </Box>

      <Paper variant="outlined">
        <Table>
          <TableHead>
            <TableRow>
              <TableCell>Fecha</TableCell>
              <TableCell>Tipo</TableCell>
              <TableCell>Número</TableCell>
              <TableCell>Cliente</TableCell>
              <TableCell>CAE</TableCell>
              <TableCell align="right">Importe</TableCell>
              <TableCell>Estado</TableCell>
            </TableRow>
          </TableHead>
          <TableBody>
            {!loading && filtradas.length === 0 && (
              <TableRow>
                <TableCell colSpan={7}>
                  <Typography color="text.secondary" sx={{ py: 3, textAlign: 'center' }}>
                    {facturas.length === 0 ? 'Todavía no cargaste ninguna factura.' : 'No hay facturas que coincidan con el filtro.'}
                  </Typography>
                </TableCell>
              </TableRow>
            )}
            {filtradas.map((factura) => (
              <TableRow key={factura.id} hover onClick={() => navigate(`/facturas/${factura.id}`)} sx={{ cursor: 'pointer' }}>
                <TableCell>{factura.lote ? new Date(factura.lote.fecha_emision).toLocaleDateString('es-AR') : '—'}</TableCell>
                <TableCell>
                  {TIPOS_COMPROBANTE.find((t) => t.value === factura.lote?.tipo_comprobante)?.label ?? '—'}
                  {factura.lote && factura.lote.total_clientes > 1 && (
                    <Chip label="Lote" size="small" variant="outlined" sx={{ ml: 1 }} />
                  )}
                </TableCell>
                <TableCell sx={{ fontVariantNumeric: 'tabular-nums' }}>{factura.numero_comprobante ?? 'Pendiente'}</TableCell>
                <TableCell>{factura.cliente?.razon_social ?? '—'}</TableCell>
                <TableCell sx={{ fontVariantNumeric: 'tabular-nums' }}>{factura.cae ?? '—'}</TableCell>
                <TableCell align="right" sx={{ fontVariantNumeric: 'tabular-nums' }}>
                  {factura.importe_total != null ? formatearMoneda(factura.importe_total) : '—'}
                </TableCell>
                <TableCell>
                  <Chip label={ESTADO_LABEL[factura.estado] ?? factura.estado} color={ESTADO_COLOR[factura.estado] ?? 'default'} size="small" variant="outlined" />
                </TableCell>
              </TableRow>
            ))}
          </TableBody>
        </Table>
      </Paper>
    </>
  );
}
