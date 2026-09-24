import SearchIcon from '@mui/icons-material/Search';
import {
  Alert,
  Box,
  Checkbox,
  Chip,
  InputAdornment,
  List,
  ListItemButton,
  ListItemText,
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
import { useEffect, useMemo, useState } from 'react';
import { supabase } from '../../lib/supabaseClient';
import { TIPOS_COMPROBANTE } from '../../constants/facturacion';
import type { Cliente, Grupo } from '../../types/domain';
import type { Paso1Valores } from './types';
import { esClienteValidoParaComprobante } from './validacionComprobante';

// ",", ".", ":", "(" y ")" son sintaxis reservada dentro de un filtro
// .or(...) de PostgREST — sin escapar, una razón social con coma o
// paréntesis (`Pérez, Gómez SRL`) rompe el filtro en vez de buscarla.
function escaparParaFiltro(texto: string): string {
  return texto.replace(/[\\,.:()]/g, '\\$&');
}

interface Props {
  grupos: Grupo[];
  clienteGrupos: Record<string, string[]>;
  seleccionados: string[];
  onChange: (clienteIds: string[]) => void;
  onClientesVistos: (clientes: Cliente[]) => void;
  paso1: Paso1Valores;
}

export function Paso2Multiple({ grupos, clienteGrupos, seleccionados, onChange, onClientesVistos, paso1 }: Props) {
  const [busquedaInput, setBusquedaInput] = useState('');
  const [busqueda, setBusqueda] = useState('');
  const [grupoFiltro, setGrupoFiltro] = useState<string | null>(null);
  const [pagina, setPagina] = useState(0);
  const [tamanioPagina, setTamanioPagina] = useState(20);
  const [filas, setFilas] = useState<Cliente[]>([]);
  const [total, setTotal] = useState(0);
  const [cargando, setCargando] = useState(true);
  const [haCargado, setHaCargado] = useState(false);

  // Debounce: recién dispara la búsqueda contra Supabase 300ms después de
  // que el usuario deja de tipear.
  useEffect(() => {
    const timeout = setTimeout(() => setBusqueda(busquedaInput.trim()), 300);
    return () => clearTimeout(timeout);
  }, [busquedaInput]);

  // Un cambio de filtro vuelve a la primera página. Ajustado durante el
  // render (no en un efecto aparte) siguiendo el patrón de React para
  // "resetear estado cuando cambia otra cosa", sin un re-render extra.
  const [filtroAnterior, setFiltroAnterior] = useState([busqueda, grupoFiltro]);
  if (filtroAnterior[0] !== busqueda || filtroAnterior[1] !== grupoFiltro) {
    setFiltroAnterior([busqueda, grupoFiltro]);
    setPagina(0);
  }

  useEffect(() => {
    let cancelado = false;

    async function cargar() {
      setCargando(true);

      let idsDelGrupo: string[] | null = null;
      if (grupoFiltro) {
        idsDelGrupo = Object.entries(clienteGrupos)
          .filter(([, gids]) => gids.includes(grupoFiltro))
          .map(([id]) => id);
        if (idsDelGrupo.length === 0) {
          if (!cancelado) {
            setFilas([]);
            setTotal(0);
            setCargando(false);
            setHaCargado(true);
          }
          return;
        }
      }

      let query = supabase.from('clientes').select('*', { count: 'exact' }).order('razon_social');
      if (busqueda) {
        const busquedaEscapada = escaparParaFiltro(busqueda);
        query = query.or(`razon_social.ilike.%${busquedaEscapada}%,numero_documento.ilike.%${busquedaEscapada}%`);
      }
      if (idsDelGrupo) {
        query = query.in('id', idsDelGrupo);
      }
      query = query.range(pagina * tamanioPagina, pagina * tamanioPagina + tamanioPagina - 1);

      const { data, count } = await query;
      if (cancelado) return;

      setFilas(data ?? []);
      setTotal(count ?? 0);
      onClientesVistos(data ?? []);
      setCargando(false);
      setHaCargado(true);
    }

    cargar();
    return () => {
      cancelado = true;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [busqueda, grupoFiltro, pagina, tamanioPagina, clienteGrupos]);

  const filasValidas = useMemo(
    () => filas.filter((c) => esClienteValidoParaComprobante(c, paso1.tipoComprobante)),
    [filas, paso1.tipoComprobante],
  );
  const ocultosEnPagina = filas.length - filasValidas.length;

  function toggleCliente(id: string) {
    onChange(seleccionados.includes(id) ? seleccionados.filter((s) => s !== id) : [...seleccionados, id]);
  }

  function seleccionarTodosVisibles() {
    const idsVisibles = filasValidas.map((c) => c.id);
    const yaEstan = idsVisibles.every((id) => seleccionados.includes(id));
    onChange(yaEstan ? seleccionados.filter((id) => !idsVisibles.includes(id)) : [...new Set([...seleccionados, ...idsVisibles])]);
  }

  const tipoLabel = TIPOS_COMPROBANTE.find((t) => t.value === paso1.tipoComprobante)?.label ?? '';
  const todosVisiblesSeleccionados = filasValidas.length > 0 && filasValidas.every((c) => seleccionados.includes(c.id));
  const sinClientesEnLibreta = haCargado && total === 0 && !busqueda && !grupoFiltro;

  return (
    <Box sx={{ display: 'flex', gap: 3 }}>
      <Box sx={{ flexGrow: 1 }}>
        {ocultosEnPagina > 0 && (
          <Alert severity="info" sx={{ mb: 2 }}>
            Se ocultan {ocultosEnPagina} cliente(s) que no corresponden a {tipoLabel || 'este comprobante'} por su condición de IVA o tipo de
            documento.
          </Alert>
        )}

        <Box sx={{ display: 'flex', gap: 2, mb: 2 }}>
          <TextField
            placeholder="Buscar por nombre o documento"
            value={busquedaInput}
            onChange={(e) => setBusquedaInput(e.target.value)}
            fullWidth
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
        </Box>

        {grupos.length > 0 && (
          <List dense disablePadding sx={{ display: 'flex', flexWrap: 'wrap', gap: 1, mb: 2, flexDirection: 'row' }}>
            <ListItemButton
              selected={grupoFiltro === null}
              onClick={() => setGrupoFiltro(null)}
              sx={{ borderRadius: 1, width: 'auto' }}
            >
              <ListItemText primary="Todos" />
            </ListItemButton>
            {grupos.map((grupo) => (
              <ListItemButton
                key={grupo.id}
                selected={grupoFiltro === grupo.id}
                onClick={() => setGrupoFiltro(grupo.id)}
                sx={{ borderRadius: 1, width: 'auto' }}
              >
                <ListItemText primary={grupo.nombre} />
              </ListItemButton>
            ))}
          </List>
        )}

        <Paper variant="outlined">
          <Table>
            <TableHead>
              <TableRow>
                <TableCell padding="checkbox">
                  <Checkbox
                    checked={todosVisiblesSeleccionados}
                    indeterminate={!todosVisiblesSeleccionados && filasValidas.some((c) => seleccionados.includes(c.id))}
                    onChange={seleccionarTodosVisibles}
                  />
                </TableCell>
                <TableCell>Razón social</TableCell>
                <TableCell>Documento</TableCell>
                <TableCell>Condición Iva</TableCell>
                <TableCell>Grupos</TableCell>
              </TableRow>
            </TableHead>
            <TableBody>
              {!cargando && filasValidas.length === 0 && (
                <TableRow>
                  <TableCell colSpan={5}>
                    <Typography color="text.secondary" sx={{ py: 3, textAlign: 'center' }}>
                      {sinClientesEnLibreta ? 'Todavía no tenés clientes cargados en la libreta.' : 'No hay clientes que coincidan.'}
                    </Typography>
                  </TableCell>
                </TableRow>
              )}
              {filasValidas.map((cliente) => (
                <TableRow key={cliente.id} hover onClick={() => toggleCliente(cliente.id)} sx={{ cursor: 'pointer' }}>
                  <TableCell padding="checkbox">
                    <Checkbox checked={seleccionados.includes(cliente.id)} onClick={(e) => e.stopPropagation()} onChange={() => toggleCliente(cliente.id)} />
                  </TableCell>
                  <TableCell>{cliente.razon_social}</TableCell>
                  <TableCell sx={{ fontVariantNumeric: 'tabular-nums' }}>
                    {cliente.tipo_documento} {cliente.numero_documento}
                  </TableCell>
                  <TableCell>{cliente.condicion_iva || '—'}</TableCell>
                  <TableCell>
                    <Box sx={{ display: 'flex', flexWrap: 'wrap', gap: 0.5 }}>
                      {(clienteGrupos[cliente.id] ?? []).map((grupoId) => {
                        const grupo = grupos.find((g) => g.id === grupoId);
                        return grupo ? <Chip key={grupoId} label={grupo.nombre} size="small" /> : null;
                      })}
                    </Box>
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
            rowsPerPage={tamanioPagina}
            onRowsPerPageChange={(e) => {
              setTamanioPagina(Number(e.target.value));
              setPagina(0);
            }}
            rowsPerPageOptions={[10, 20, 50]}
            labelRowsPerPage="Por página"
            labelDisplayedRows={({ from, to, count }) => `${from}–${to} de ${count}`}
          />
        </Paper>
      </Box>

      <Paper variant="outlined" sx={{ width: 260, flexShrink: 0, p: 2.5, alignSelf: 'flex-start', position: 'sticky', top: 16 }}>
        <Typography variant="h2" sx={{ fontSize: 40, lineHeight: 1, mb: 0.5 }}>
          {seleccionados.length}
        </Typography>
        <Typography color="text.secondary" sx={{ mb: 2 }}>
          {seleccionados.length === 1 ? 'factura a emitir' : 'facturas a emitir'}
        </Typography>
        <Typography variant="body2" sx={{ mb: 0.5 }}>
          {tipoLabel || 'Sin tipo de comprobante'}
        </Typography>
        {(paso1.periodoDesde || paso1.periodoHasta) && (
          <Typography variant="body2" color="text.secondary">
            Período: {paso1.periodoDesde || '—'} al {paso1.periodoHasta || '—'}
          </Typography>
        )}
        <Typography variant="body2" color="text.secondary" sx={{ mt: 2 }}>
          Los ítems y los importes se cargan una sola vez en el próximo paso, y se repiten en cada factura.
        </Typography>
      </Paper>
    </Box>
  );
}
