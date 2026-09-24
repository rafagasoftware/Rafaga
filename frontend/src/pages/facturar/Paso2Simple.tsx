import { Alert, Autocomplete, CircularProgress, Paper, Stack, TextField, Typography } from '@mui/material';
import { useEffect, useState } from 'react';
import { supabase } from '../../lib/supabaseClient';
import { TIPOS_COMPROBANTE } from '../../constants/facturacion';
import type { Cliente } from '../../types/domain';
import { esClienteValidoParaComprobante } from './validacionComprobante';

const MIN_CARACTERES = 2;
const LIMITE_RESULTADOS = 25;

// ",", ".", ":", "(" y ")" son sintaxis reservada dentro de un filtro
// .or(...) de PostgREST — sin escapar, una razón social con coma o
// paréntesis (`Pérez, Gómez SRL`) rompe el filtro en vez de buscarla.
function escaparParaFiltro(texto: string): string {
  return texto.replace(/[\\,.:()]/g, '\\$&');
}

interface Props {
  clienteId: string | null;
  onChange: (clienteId: string | null) => void;
  onClientesVistos: (clientes: Cliente[]) => void;
  tipoComprobante: string;
}

export function Paso2Simple({ clienteId, onChange, onClientesVistos, tipoComprobante }: Props) {
  const [inputValue, setInputValue] = useState('');
  const [resultadosCrudos, setResultadosCrudos] = useState<Cliente[]>([]);
  const [seleccionado, setSeleccionado] = useState<Cliente | null>(null);
  const [buscando, setBuscando] = useState(false);
  const [totalClientes, setTotalClientes] = useState<number | null>(null);

  // Cuenta rápida (sin traer filas) para saber si la libreta está vacía,
  // sin tener que precargar todos los clientes.
  useEffect(() => {
    supabase
      .from('clientes')
      .select('*', { count: 'exact', head: true })
      .then(({ count }) => setTotalClientes(count ?? 0));
  }, []);

  // Si ya hay un cliente elegido (ej. se volvió de un paso siguiente) pero
  // todavía no lo tenemos en memoria, lo trae por id para mostrar su label.
  // clienteMostrado (abajo) tapa el desfasaje mientras esto está en vuelo.
  useEffect(() => {
    if (!clienteId || seleccionado?.id === clienteId) return;

    let cancelado = false;
    supabase
      .from('clientes')
      .select('*')
      .eq('id', clienteId)
      .single()
      .then(({ data }) => {
        if (cancelado || !data) return;
        setSeleccionado(data);
        onClientesVistos([data]);
      });
    return () => {
      cancelado = true;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [clienteId]);

  // Búsqueda contra Supabase, recién a partir de MIN_CARACTERES y con un
  // pequeño debounce — no trae la libreta entera de una.
  const demasiadoCorto = inputValue.trim().length < MIN_CARACTERES;

  useEffect(() => {
    const texto = inputValue.trim();
    if (texto.length < MIN_CARACTERES) return;

    let cancelado = false;
    const timeout = setTimeout(async () => {
      setBuscando(true);
      const textoEscapado = escaparParaFiltro(texto);
      const { data } = await supabase
        .from('clientes')
        .select('*')
        .or(`razon_social.ilike.%${textoEscapado}%,numero_documento.ilike.%${textoEscapado}%`)
        .order('razon_social')
        .limit(LIMITE_RESULTADOS);
      if (cancelado) return;
      setResultadosCrudos(data ?? []);
      onClientesVistos(data ?? []);
      setBuscando(false);
    }, 300);

    return () => {
      cancelado = true;
      clearTimeout(timeout);
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [inputValue]);

  const clienteMostrado = seleccionado?.id === clienteId ? seleccionado : null;
  const opciones = demasiadoCorto ? [] : resultadosCrudos.filter((c) => esClienteValidoParaComprobante(c, tipoComprobante));
  const ocultos = demasiadoCorto ? 0 : resultadosCrudos.length - opciones.length;
  const tipoLabel = TIPOS_COMPROBANTE.find((t) => t.value === tipoComprobante)?.label ?? 'este comprobante';

  function noOptionsText() {
    if (demasiadoCorto) return 'Escribí al menos 2 letras para buscar';
    if (buscando) return 'Buscando…';
    return 'No hay clientes que coincidan';
  }

  return (
    <Stack spacing={3} sx={{ maxWidth: 480 }}>
      {ocultos > 0 && (
        <Alert severity="info">
          Se ocultan {ocultos} cliente(s) que no corresponden a {tipoLabel} por su condición de IVA o tipo de documento.
        </Alert>
      )}

      <Autocomplete
        options={opciones}
        value={clienteMostrado}
        inputValue={inputValue}
        onInputChange={(_e, valor) => setInputValue(valor)}
        onChange={(_e, valor) => {
          setSeleccionado(valor);
          onChange(valor?.id ?? null);
          if (valor) onClientesVistos([valor]);
        }}
        filterOptions={(x) => x}
        loading={buscando}
        getOptionLabel={(cliente) => `${cliente.razon_social} — ${cliente.tipo_documento} ${cliente.numero_documento}`}
        isOptionEqualToValue={(a, b) => a.id === b.id}
        noOptionsText={noOptionsText()}
        renderInput={(params) => (
          <TextField
            {...params}
            label="Buscar cliente por nombre o documento"
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

      {clienteMostrado && (
        <Paper variant="outlined" sx={{ p: 2.5 }}>
          <Typography variant="body2" color="text.secondary" sx={{ mb: 1.5 }}>
            Datos del cliente
          </Typography>
          <Stack spacing={1}>
            <Typography>
              <strong>{clienteMostrado.razon_social}</strong>
            </Typography>
            <Typography variant="body2" color="text.secondary">
              {clienteMostrado.tipo_documento} {clienteMostrado.numero_documento} · {clienteMostrado.condicion_iva}
            </Typography>
            {clienteMostrado.domicilio && (
              <Typography variant="body2" color="text.secondary">
                {clienteMostrado.domicilio}
              </Typography>
            )}
            {clienteMostrado.email && (
              <Typography variant="body2" color="text.secondary">
                {clienteMostrado.email}
              </Typography>
            )}
          </Stack>
        </Paper>
      )}

      {totalClientes === 0 && <Typography color="text.secondary">Todavía no tenés clientes cargados en la libreta.</Typography>}
    </Stack>
  );
}
