import { Alert, Autocomplete, CircularProgress, Paper, Stack, TextField, Typography } from '@mui/material';
import { useEffect, useState } from 'react';
import { TIPOS_COMPROBANTE } from '../../constants/facturacion';
import { escaparParaFiltro } from '../../lib/filtroPostgrest';
import { supabase } from '../../lib/supabaseClient';
import type { AlumnoConResponsable } from '../../types/domain';
import { esClienteValidoParaComprobante } from './validacionComprobante';

const MIN_CARACTERES = 2;
const LIMITE_RESULTADOS = 25;

function etiquetaAlumno(alumno: AlumnoConResponsable): string {
  return alumno.curso ? `${alumno.nombre} — ${alumno.curso}` : alumno.nombre;
}

interface Props {
  alumnoId: string | null;
  onChange: (alumnoId: string | null) => void;
  onAlumnosVistos: (alumnos: AlumnoConResponsable[]) => void;
  tipoComprobante: string;
}

export function Paso2AlumnoSimple({ alumnoId, onChange, onAlumnosVistos, tipoComprobante }: Props) {
  const [inputValue, setInputValue] = useState('');
  const [resultadosCrudos, setResultadosCrudos] = useState<AlumnoConResponsable[]>([]);
  const [seleccionado, setSeleccionado] = useState<AlumnoConResponsable | null>(null);
  const [buscando, setBuscando] = useState(false);
  const [totalAlumnos, setTotalAlumnos] = useState<number | null>(null);

  useEffect(() => {
    supabase
      .from('alumnos')
      .select('*', { count: 'exact', head: true })
      .then(({ count }) => setTotalAlumnos(count ?? 0));
  }, []);

  // Si ya hay un alumno elegido (ej. se volvió de un paso siguiente) pero
  // todavía no lo tenemos en memoria, lo trae por id para mostrar su label.
  useEffect(() => {
    if (!alumnoId || seleccionado?.id === alumnoId) return;

    let cancelado = false;
    supabase
      .from('alumnos')
      .select('*, cliente:clientes(*)')
      .eq('id', alumnoId)
      .single()
      .then(({ data }) => {
        if (cancelado || !data) return;
        const alumno = data as unknown as AlumnoConResponsable;
        setSeleccionado(alumno);
        onAlumnosVistos([alumno]);
      });
    return () => {
      cancelado = true;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [alumnoId]);

  const demasiadoCorto = inputValue.trim().length < MIN_CARACTERES;

  useEffect(() => {
    const texto = inputValue.trim();
    if (texto.length < MIN_CARACTERES) return;

    let cancelado = false;
    const timeout = setTimeout(async () => {
      setBuscando(true);
      const textoEscapado = escaparParaFiltro(texto);
      const { data } = await supabase
        .from('alumnos')
        .select('*, cliente:clientes(*)')
        .or(`nombre.ilike.%${textoEscapado}%,curso.ilike.%${textoEscapado}%`)
        .order('nombre')
        .limit(LIMITE_RESULTADOS);
      if (cancelado) return;
      const alumnos = (data ?? []) as unknown as AlumnoConResponsable[];
      setResultadosCrudos(alumnos);
      onAlumnosVistos(alumnos);
      setBuscando(false);
    }, 300);

    return () => {
      cancelado = true;
      clearTimeout(timeout);
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [inputValue]);

  const alumnoMostrado = seleccionado?.id === alumnoId ? seleccionado : null;
  const sirve = (alumno: AlumnoConResponsable) => alumno.cliente !== null && esClienteValidoParaComprobante(alumno.cliente, tipoComprobante);
  const opciones = demasiadoCorto ? [] : resultadosCrudos.filter(sirve);
  const ocultos = demasiadoCorto ? 0 : resultadosCrudos.length - opciones.length;
  const tipoLabel = TIPOS_COMPROBANTE.find((t) => t.value === tipoComprobante)?.label ?? 'este comprobante';

  function noOptionsText() {
    if (demasiadoCorto) return 'Escribí al menos 2 letras para buscar';
    if (buscando) return 'Buscando…';
    return 'No hay alumnos que coincidan';
  }

  return (
    <Stack spacing={3} sx={{ maxWidth: 480 }}>
      {ocultos > 0 && (
        <Alert severity="info">
          Se ocultan {ocultos} alumno(s) cuyo responsable de pago no corresponde a {tipoLabel} por su condición de IVA o tipo de documento.
        </Alert>
      )}

      <Autocomplete
        options={opciones}
        value={alumnoMostrado}
        inputValue={inputValue}
        onInputChange={(_e, valor) => setInputValue(valor)}
        onChange={(_e, valor) => {
          setSeleccionado(valor);
          onChange(valor?.id ?? null);
          if (valor) onAlumnosVistos([valor]);
        }}
        filterOptions={(x) => x}
        loading={buscando}
        getOptionLabel={etiquetaAlumno}
        isOptionEqualToValue={(a, b) => a.id === b.id}
        noOptionsText={noOptionsText()}
        renderInput={(params) => (
          <TextField
            {...params}
            label="Buscar alumno por nombre o curso"
            required
            slotProps={{
              ...params.slotProps,
              input: {
                ...params.slotProps.input,
                endAdornment: (
                  <>
                    {buscando && <CircularProgress color="inherit" size={18} />}
                    {params.slotProps.input.endAdornment}
                  </>
                ),
              },
            }}
          />
        )}
      />

      {alumnoMostrado && alumnoMostrado.cliente && (
        <Paper variant="outlined" sx={{ p: 2.5 }}>
          <Typography variant="body2" color="text.secondary" sx={{ mb: 1.5 }}>
            La factura sale a nombre de
          </Typography>
          <Stack spacing={1}>
            <Typography>
              <strong>{alumnoMostrado.cliente.razon_social}</strong>
            </Typography>
            <Typography variant="body2" color="text.secondary">
              {alumnoMostrado.cliente.tipo_documento} {alumnoMostrado.cliente.numero_documento} · {alumnoMostrado.cliente.condicion_iva}
            </Typography>
            {alumnoMostrado.cliente.domicilio && (
              <Typography variant="body2" color="text.secondary">
                {alumnoMostrado.cliente.domicilio}
              </Typography>
            )}
            <Typography variant="body2" color="text.secondary">
              Alumno: {etiquetaAlumno(alumnoMostrado)}
            </Typography>
          </Stack>
        </Paper>
      )}

      {totalAlumnos === 0 && (
        <Typography color="text.secondary">Todavía no cargaste alumnos. Podés hacerlo desde la sección Alumnos del menú.</Typography>
      )}
    </Stack>
  );
}
