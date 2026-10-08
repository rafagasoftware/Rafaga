import SearchIcon from '@mui/icons-material/Search';
import {
  Alert,
  Box,
  Button,
  Checkbox,
  Chip,
  InputAdornment,
  Link,
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
import { Link as RouterLink } from 'react-router-dom';
import { TIPOS_COMPROBANTE } from '../../constants/facturacion';
import { escaparParaFiltro } from '../../lib/filtroPostgrest';
import { supabase } from '../../lib/supabaseClient';
import type { AlumnoConResponsable } from '../../types/domain';
import { agruparPorResponsable } from './alumnos';
import type { Paso1Valores } from './types';
import { esClienteValidoParaComprobante } from './validacionComprobante';

interface Props {
  seleccionados: string[];
  onChange: (alumnoIds: string[]) => void;
  onAlumnosVistos: (alumnos: AlumnoConResponsable[]) => void;
  alumnosCache: Record<string, AlumnoConResponsable>;
  paso1: Paso1Valores;
}

export function Paso2AlumnoMultiple({ seleccionados, onChange, onAlumnosVistos, alumnosCache, paso1 }: Props) {
  const [busquedaInput, setBusquedaInput] = useState('');
  const [busqueda, setBusqueda] = useState('');
  const [cursos, setCursos] = useState<string[]>([]);
  const [cursoFiltro, setCursoFiltro] = useState<string | null>(null);
  const [pagina, setPagina] = useState(0);
  const [tamanioPagina, setTamanioPagina] = useState(20);
  const [filas, setFilas] = useState<AlumnoConResponsable[]>([]);
  const [total, setTotal] = useState(0);
  const [cargando, setCargando] = useState(true);
  const [haCargado, setHaCargado] = useState(false);
  const [seleccionandoCurso, setSeleccionandoCurso] = useState(false);

  useEffect(() => {
    const timeout = setTimeout(() => setBusqueda(busquedaInput.trim()), 300);
    return () => clearTimeout(timeout);
  }, [busquedaInput]);

  useEffect(() => {
    supabase
      .from('alumnos')
      .select('curso')
      .not('curso', 'is', null)
      .then(({ data }) => {
        const unicos = new Set((data ?? []).map((fila) => fila.curso as string).filter(Boolean));
        setCursos([...unicos].sort((a, b) => a.localeCompare(b, 'es', { numeric: true })));
      });
  }, []);

  // Un cambio de filtro vuelve a la primera página (mismo patrón que Paso2Multiple).
  const [filtroAnterior, setFiltroAnterior] = useState([busqueda, cursoFiltro]);
  if (filtroAnterior[0] !== busqueda || filtroAnterior[1] !== cursoFiltro) {
    setFiltroAnterior([busqueda, cursoFiltro]);
    setPagina(0);
  }

  useEffect(() => {
    let cancelado = false;

    async function cargar() {
      setCargando(true);

      let query = supabase.from('alumnos').select('*, cliente:clientes(*)', { count: 'exact' }).order('nombre');
      if (busqueda) {
        const escapada = escaparParaFiltro(busqueda);
        query = query.or(`nombre.ilike.%${escapada}%,curso.ilike.%${escapada}%`);
      }
      if (cursoFiltro) {
        query = query.eq('curso', cursoFiltro);
      }
      query = query.range(pagina * tamanioPagina, pagina * tamanioPagina + tamanioPagina - 1);

      const { data, count } = await query;
      if (cancelado) return;

      const alumnos = (data ?? []) as unknown as AlumnoConResponsable[];
      setFilas(alumnos);
      setTotal(count ?? 0);
      onAlumnosVistos(alumnos);
      setCargando(false);
      setHaCargado(true);
    }

    cargar();
    return () => {
      cancelado = true;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [busqueda, cursoFiltro, pagina, tamanioPagina]);

  const sirve = (alumno: AlumnoConResponsable) => alumno.cliente !== null && esClienteValidoParaComprobante(alumno.cliente, paso1.tipoComprobante);

  const filasValidas = useMemo(() => filas.filter(sirve), [filas, paso1.tipoComprobante]); // eslint-disable-line react-hooks/exhaustive-deps
  const ocultosEnPagina = filas.length - filasValidas.length;

  function toggleAlumno(id: string) {
    onChange(seleccionados.includes(id) ? seleccionados.filter((s) => s !== id) : [...seleccionados, id]);
  }

  function seleccionarTodosVisibles() {
    const idsVisibles = filasValidas.map((a) => a.id);
    const yaEstan = idsVisibles.every((id) => seleccionados.includes(id));
    onChange(yaEstan ? seleccionados.filter((id) => !idsVisibles.includes(id)) : [...new Set([...seleccionados, ...idsVisibles])]);
  }

  // Todo el curso de una, aunque ocupe varias páginas de la tabla.
  async function seleccionarTodoElCurso() {
    if (!cursoFiltro) return;

    setSeleccionandoCurso(true);
    const { data } = await supabase.from('alumnos').select('*, cliente:clientes(*)').eq('curso', cursoFiltro).order('nombre').limit(1000);
    const alumnos = (data ?? []) as unknown as AlumnoConResponsable[];
    onAlumnosVistos(alumnos);
    onChange([...new Set([...seleccionados, ...alumnos.filter(sirve).map((a) => a.id)])]);
    setSeleccionandoCurso(false);
  }

  const tipoLabel = TIPOS_COMPROBANTE.find((t) => t.value === paso1.tipoComprobante)?.label ?? '';
  const todosVisiblesSeleccionados = filasValidas.length > 0 && filasValidas.every((a) => seleccionados.includes(a.id));
  const sinAlumnos = haCargado && total === 0 && !busqueda && !cursoFiltro;

  const alumnosElegidos = seleccionados.map((id) => alumnosCache[id]).filter((a): a is AlumnoConResponsable => Boolean(a));
  const familias = agruparPorResponsable(alumnosElegidos);
  const familiasConVariosHijos = familias.filter((f) => f.alumnos.length > 1).length;

  return (
    <Box sx={{ display: 'flex', gap: 3 }}>
      <Box sx={{ flexGrow: 1, minWidth: 0 }}>
        {ocultosEnPagina > 0 && (
          <Alert severity="info" sx={{ mb: 2 }}>
            Se ocultan {ocultosEnPagina} alumno(s) cuyo responsable de pago no corresponde a {tipoLabel || 'este comprobante'} por su
            condición de IVA o tipo de documento.
          </Alert>
        )}

        <TextField
          placeholder="Buscar por nombre o curso"
          value={busquedaInput}
          onChange={(e) => setBusquedaInput(e.target.value)}
          fullWidth
          sx={{ mb: 2 }}
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

        {cursos.length > 0 && (
          <Box sx={{ display: 'flex', flexWrap: 'wrap', alignItems: 'center', gap: 1, mb: 2 }}>
            <Chip
              label="Todos"
              clickable
              color={cursoFiltro === null ? 'primary' : 'default'}
              variant={cursoFiltro === null ? 'filled' : 'outlined'}
              onClick={() => setCursoFiltro(null)}
            />
            {cursos.map((curso) => (
              <Chip
                key={curso}
                label={curso}
                clickable
                color={cursoFiltro === curso ? 'primary' : 'default'}
                variant={cursoFiltro === curso ? 'filled' : 'outlined'}
                onClick={() => setCursoFiltro(curso)}
              />
            ))}
          </Box>
        )}

        {cursoFiltro && (
          <Button size="small" onClick={seleccionarTodoElCurso} disabled={seleccionandoCurso} sx={{ mb: 2 }}>
            {seleccionandoCurso ? 'Seleccionando…' : `Seleccionar todo ${cursoFiltro}`}
          </Button>
        )}

        <Paper variant="outlined">
          <Table>
            <TableHead>
              <TableRow>
                <TableCell padding="checkbox">
                  <Checkbox
                    checked={todosVisiblesSeleccionados}
                    indeterminate={!todosVisiblesSeleccionados && filasValidas.some((a) => seleccionados.includes(a.id))}
                    onChange={seleccionarTodosVisibles}
                  />
                </TableCell>
                <TableCell>Alumno</TableCell>
                <TableCell>Curso</TableCell>
                <TableCell>Factura a nombre de</TableCell>
              </TableRow>
            </TableHead>
            <TableBody>
              {!cargando && filasValidas.length === 0 && (
                <TableRow>
                  <TableCell colSpan={4}>
                    <Typography color="text.secondary" sx={{ py: 3, textAlign: 'center' }}>
                      {sinAlumnos ? (
                        <>
                          Todavía no cargaste alumnos. Cargalos desde{' '}
                          <Link component={RouterLink} to="/alumnos">
                            la sección Alumnos
                          </Link>
                          .
                        </>
                      ) : (
                        'No hay alumnos que coincidan.'
                      )}
                    </Typography>
                  </TableCell>
                </TableRow>
              )}
              {filasValidas.map((alumno) => (
                <TableRow key={alumno.id} hover onClick={() => toggleAlumno(alumno.id)} sx={{ cursor: 'pointer' }}>
                  <TableCell padding="checkbox">
                    <Checkbox checked={seleccionados.includes(alumno.id)} onClick={(e) => e.stopPropagation()} onChange={() => toggleAlumno(alumno.id)} />
                  </TableCell>
                  <TableCell>{alumno.nombre}</TableCell>
                  <TableCell>{alumno.curso || '—'}</TableCell>
                  <TableCell>
                    {alumno.cliente?.razon_social}
                    <Typography component="span" variant="body2" color="text.secondary" sx={{ ml: 1, fontVariantNumeric: 'tabular-nums' }}>
                      {alumno.cliente?.tipo_documento} {alumno.cliente?.numero_documento}
                    </Typography>
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
          {familias.length}
        </Typography>
        <Typography color="text.secondary" sx={{ mb: 0.5 }}>
          {familias.length === 1 ? 'factura a emitir' : 'facturas a emitir'}
        </Typography>
        <Typography variant="body2" sx={{ mb: 2 }}>
          {alumnosElegidos.length === 1 ? '1 alumno elegido' : `${alumnosElegidos.length} alumnos elegidos`}
        </Typography>
        {familiasConVariosHijos > 0 && (
          <Typography variant="body2" sx={{ mb: 2 }}>
            {familiasConVariosHijos === 1
              ? '1 responsable tiene más de un hijo elegido'
              : `${familiasConVariosHijos} responsables tienen más de un hijo elegido`}
            : su factura lleva un renglón por cada hijo.
          </Typography>
        )}
        <Typography variant="body2" sx={{ mb: 0.5 }}>
          {tipoLabel || 'Sin tipo de comprobante'}
        </Typography>
        {(paso1.periodoDesde || paso1.periodoHasta) && (
          <Typography variant="body2" color="text.secondary">
            Período: {paso1.periodoDesde || '—'} al {paso1.periodoHasta || '—'}
          </Typography>
        )}
        <Typography variant="body2" color="text.secondary" sx={{ mt: 2 }}>
          Los ítems y los importes se cargan una sola vez en el próximo paso, y se cobran por cada alumno.
        </Typography>
      </Paper>
    </Box>
  );
}
