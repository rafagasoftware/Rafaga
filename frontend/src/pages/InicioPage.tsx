import { Box, Chip, Paper, Table, TableBody, TableCell, TableHead, TableRow, Typography } from '@mui/material';
import { useEffect, useState } from 'react';
import { Link as RouterLink, useNavigate } from 'react-router-dom';
import { ESTADO_COLOR, ESTADO_LABEL } from '../constants/estadosFactura';
import { supabase } from '../lib/supabaseClient';
import { formatearMoneda } from './facturar/calculos';

interface EmisionReciente {
  id: string;
  estado: string;
  importe_total: number | null;
  creado_en: string;
  cliente: { razon_social: string } | null;
}

export function InicioPage() {
  const navigate = useNavigate();
  const [ultimas, setUltimas] = useState<EmisionReciente[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    supabase
      .from('facturas')
      .select('id, estado, importe_total, creado_en, cliente:clientes(razon_social)')
      .order('creado_en', { ascending: false })
      .limit(5)
      .then(({ data }) => {
        setUltimas((data as unknown as EmisionReciente[]) ?? []);
        setLoading(false);
      });
  }, []);

  return (
    <>
      <Typography variant="h3" sx={{ mb: 3 }}>
        ¿Qué querés hacer?
      </Typography>

      <Box sx={{ display: 'flex', gap: 3, mb: 5, flexWrap: 'wrap', justifyContent: 'center' }}>
        <Paper
          component={RouterLink}
          to="/facturar/simple"
          variant="outlined"
          sx={{
            p: 3,
            width: 280,
            textDecoration: 'none',
            color: 'text.primary',
            display: 'block',
            transition: 'border-color .15s',
            '&:hover': { borderColor: 'primary.main' },
          }}
        >
          <Typography variant="h5" sx={{ mb: 1 }}>
            Factura simple
          </Typography>
          <Typography color="text.secondary">Una factura para un solo cliente.</Typography>
        </Paper>

        <Paper
          component={RouterLink}
          to="/facturar/multiple"
          variant="outlined"
          sx={{
            p: 3,
            width: 280,
            textDecoration: 'none',
            color: 'text.primary',
            display: 'block',
            transition: 'border-color .15s',
            '&:hover': { borderColor: 'primary.main' },
          }}
        >
          <Typography variant="h5" sx={{ mb: 1 }}>
            Facturación múltiple
          </Typography>
          <Typography color="text.secondary">
            Cargás los ítems una sola vez y salen varias facturas, una por cliente. Para cuotas, expensas o abonos.
          </Typography>
        </Paper>
      </Box>

      <Box sx={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', mb: 2 }}>
        <Typography variant="h5">Últimas emisiones</Typography>
        <Typography component={RouterLink} to="/facturas" variant="body2" sx={{ color: 'primary.main' }}>
          Ver todas
        </Typography>
      </Box>

      {!loading && ultimas.length === 0 ? (
        <Typography color="text.secondary">Todavía no cargaste ninguna factura.</Typography>
      ) : (
        <Paper variant="outlined">
          <Table>
            <TableHead>
              <TableRow>
                <TableCell>Cliente</TableCell>
                <TableCell>Fecha</TableCell>
                <TableCell align="right">Importe</TableCell>
                <TableCell>Estado</TableCell>
              </TableRow>
            </TableHead>
            <TableBody>
              {ultimas.map((factura) => (
                <TableRow key={factura.id} hover onClick={() => navigate(`/facturas/${factura.id}`)} sx={{ cursor: 'pointer' }}>
                  <TableCell>{factura.cliente?.razon_social ?? '—'}</TableCell>
                  <TableCell>{new Date(factura.creado_en).toLocaleDateString('es-AR')}</TableCell>
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
      )}
    </>
  );
}
