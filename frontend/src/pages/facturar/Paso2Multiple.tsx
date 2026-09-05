import SearchIcon from '@mui/icons-material/Search';
import {
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
  TableRow,
  TextField,
  Typography,
} from '@mui/material';
import { useMemo, useState } from 'react';
import { TIPOS_COMPROBANTE } from '../../constants/facturacion';
import type { Cliente, Grupo } from '../../types/domain';
import type { Paso1Valores } from './types';

interface Props {
  clientes: Cliente[];
  grupos: Grupo[];
  clienteGrupos: Record<string, string[]>;
  seleccionados: string[];
  onChange: (clienteIds: string[]) => void;
  paso1: Paso1Valores;
}

export function Paso2Multiple({ clientes, grupos, clienteGrupos, seleccionados, onChange, paso1 }: Props) {
  const [busqueda, setBusqueda] = useState('');
  const [grupoFiltro, setGrupoFiltro] = useState<string | null>(null);

  const clientesFiltrados = useMemo(() => {
    const texto = busqueda.trim().toLowerCase();
    return clientes.filter((cliente) => {
      const coincideTexto =
        !texto || cliente.razon_social.toLowerCase().includes(texto) || cliente.numero_documento.toLowerCase().includes(texto);
      const coincideGrupo = !grupoFiltro || (clienteGrupos[cliente.id] ?? []).includes(grupoFiltro);
      return coincideTexto && coincideGrupo;
    });
  }, [clientes, busqueda, grupoFiltro, clienteGrupos]);

  function toggleCliente(id: string) {
    onChange(seleccionados.includes(id) ? seleccionados.filter((s) => s !== id) : [...seleccionados, id]);
  }

  function seleccionarTodosVisibles() {
    const idsVisibles = clientesFiltrados.map((c) => c.id);
    const yaEstan = idsVisibles.every((id) => seleccionados.includes(id));
    onChange(yaEstan ? seleccionados.filter((id) => !idsVisibles.includes(id)) : [...new Set([...seleccionados, ...idsVisibles])]);
  }

  const tipoLabel = TIPOS_COMPROBANTE.find((t) => t.value === paso1.tipoComprobante)?.label ?? '';
  const todosVisiblesSeleccionados =
    clientesFiltrados.length > 0 && clientesFiltrados.every((c) => seleccionados.includes(c.id));

  return (
    <Box sx={{ display: 'flex', gap: 3 }}>
      <Box sx={{ flexGrow: 1 }}>
        <Box sx={{ display: 'flex', gap: 2, mb: 2 }}>
          <TextField
            placeholder="Buscar por nombre o documento"
            value={busqueda}
            onChange={(e) => setBusqueda(e.target.value)}
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
                    indeterminate={!todosVisiblesSeleccionados && clientesFiltrados.some((c) => seleccionados.includes(c.id))}
                    onChange={seleccionarTodosVisibles}
                  />
                </TableCell>
                <TableCell>Razón social</TableCell>
                <TableCell>Documento</TableCell>
                <TableCell>Grupos</TableCell>
              </TableRow>
            </TableHead>
            <TableBody>
              {clientesFiltrados.length === 0 && (
                <TableRow>
                  <TableCell colSpan={4}>
                    <Typography color="text.secondary" sx={{ py: 3, textAlign: 'center' }}>
                      No hay clientes que coincidan.
                    </Typography>
                  </TableCell>
                </TableRow>
              )}
              {clientesFiltrados.map((cliente) => (
                <TableRow key={cliente.id} hover onClick={() => toggleCliente(cliente.id)} sx={{ cursor: 'pointer' }}>
                  <TableCell padding="checkbox">
                    <Checkbox checked={seleccionados.includes(cliente.id)} onClick={(e) => e.stopPropagation()} onChange={() => toggleCliente(cliente.id)} />
                  </TableCell>
                  <TableCell>{cliente.razon_social}</TableCell>
                  <TableCell sx={{ fontVariantNumeric: 'tabular-nums' }}>
                    {cliente.tipo_documento} {cliente.numero_documento}
                  </TableCell>
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
