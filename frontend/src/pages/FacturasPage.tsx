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
  TablePagination,
  TableRow,
  TextField,
  Typography,
} from '@mui/material';
import { useCallback, useState } from 'react';
import { FacturaDetalleModal } from '../components/FacturaDetalleModal';
import { PageHeader } from '../components/PageHeader';
import { TableSkeletonRows } from '../components/TableSkeletonRows';
import { ESTADO_COLOR, ESTADO_LABEL } from '../constants/estadosFactura';
import { TIPOS_COMPROBANTE } from '../constants/facturacion';
import { useTablaRemota } from '../hooks/useTablaRemota';
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
  const [seleccionada, setSeleccionada] = useState<string | null>(null);

  const [tipoFiltro, setTipoFiltro] = useState('');
  const [estadoFiltro, setEstadoFiltro] = useState('');
  const [desde, setDesde] = useState('');
  const [hasta, setHasta] = useState('');

  const fetchPage = useCallback(
    async ({ busqueda, pagina, filasPorPagina }: { busqueda: string; pagina: number; filasPorPagina: number }) => {
      let query = supabase
        .from('facturas')
        .select(
          'id, numero_comprobante, cae, importe_total, estado, cliente:clientes!inner(razon_social), lote:lotes!inner(tipo_comprobante, fecha_emision, total_clientes)',
          { count: 'exact' },
        );

      if (busqueda) query = query.ilike('cliente.razon_social', `%${busqueda}%`);
      if (tipoFiltro) query = query.eq('lote.tipo_comprobante', tipoFiltro);
      if (estadoFiltro) query = query.eq('estado', estadoFiltro);
      if (desde) query = query.gte('lote.fecha_emision', desde);
      if (hasta) query = query.lte('lote.fecha_emision', hasta);

      const { data, count } = await query
        .order('creado_en', { ascending: false })
        .range(pagina * filasPorPagina, pagina * filasPorPagina + filasPorPagina - 1);

      return { data: (data as unknown as FilaFactura[]) ?? [], count: count ?? 0 };
    },
    [tipoFiltro, estadoFiltro, desde, hasta],
  );

  const { busqueda, setBusqueda, pagina, setPagina, filasPorPagina, setFilasPorPagina, filas, total, loading } =
    useTablaRemota(fetchPage);

  return (
    <>
      <PageHeader title="Facturas" />

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
            {loading && <TableSkeletonRows columns={7} />}
            {!loading && filas.length === 0 && (
              <TableRow>
                <TableCell colSpan={7}>
                  <Typography color="text.secondary" sx={{ py: 3, textAlign: 'center' }}>
                    {total === 0 && !busqueda && !tipoFiltro && !estadoFiltro && !desde && !hasta
                      ? 'Todavía no cargaste ninguna factura.'
                      : 'No hay facturas que coincidan con el filtro.'}
                  </Typography>
                </TableCell>
              </TableRow>
            )}
            {filas.map((factura) => (
              <TableRow key={factura.id} hover onClick={() => setSeleccionada(factura.id)} sx={{ cursor: 'pointer' }}>
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
        <TablePagination
          component="div"
          count={total}
          page={pagina}
          onPageChange={(_e, nuevaPagina) => setPagina(nuevaPagina)}
          rowsPerPage={filasPorPagina}
          onRowsPerPageChange={(e) => setFilasPorPagina(Number(e.target.value))}
          rowsPerPageOptions={[10, 25, 50]}
          labelRowsPerPage="Filas por página"
          labelDisplayedRows={({ from, to, count }) => `${from}–${to} de ${count}`}
        />
      </Paper>

      <FacturaDetalleModal facturaId={seleccionada} onClose={() => setSeleccionada(null)} />
    </>
  );
}
