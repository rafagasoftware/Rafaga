import { Alert, Autocomplete, Box, Button, Dialog, DialogActions, DialogContent, DialogTitle, TextField } from '@mui/material';
import { useEffect, useMemo, useState } from 'react';
import { useDebouncedValue } from '../../hooks/useDebouncedValue';
import { escaparParaFiltro } from '../../lib/filtroPostgrest';
import { supabase } from '../../lib/supabaseClient';
import type { AlumnoConResponsable, Cliente, Grupo } from '../../types/domain';
import { ClienteFormDialog, type ClienteFormValues } from '../clientes/ClienteFormDialog';

export interface AlumnoFormValues {
  nombre: string;
  curso: string;
  clienteId: string;
}

// Referencias fijas: ClienteFormDialog reinicia su formulario cada vez que
// cambia la identidad de estos props, así que no pueden ser literales
// nuevos en cada render.
const SIN_GRUPOS: Grupo[] = [];
const SIN_GRUPO_IDS: string[] = [];

function etiquetaCliente(cliente: Cliente): string {
  return `${cliente.razon_social} — ${cliente.tipo_documento} ${cliente.numero_documento}`;
}

interface Props {
  open: boolean;
  alumno: AlumnoConResponsable | null;
  saving: boolean;
  error: string | null;
  onClose: () => void;
  onSave: (valores: AlumnoFormValues) => void;
}

// El formulario vive en un componente aparte, dentro del Dialog: MUI lo
// desmonta al cerrarse, así que cada vez que se abre arranca con el estado
// inicial que le llega por props (sin tener que resetearlo a mano).
export function AlumnoFormDialog({ open, alumno, saving, error, onClose, onSave }: Props) {
  return (
    <Dialog open={open} onClose={onClose} fullWidth maxWidth="xs">
      <FormularioAlumno alumno={alumno} saving={saving} error={error} onClose={onClose} onSave={onSave} />
    </Dialog>
  );
}

type PropsFormulario = Omit<Props, 'open'>;

function FormularioAlumno({ alumno, saving, error, onClose, onSave }: PropsFormulario) {
  const [nombre, setNombre] = useState(alumno?.nombre ?? '');
  const [curso, setCurso] = useState(alumno?.curso ?? '');
  const [responsable, setResponsable] = useState<Cliente | null>(alumno?.cliente ?? null);
  const [inputBusqueda, setInputBusqueda] = useState(alumno?.cliente ? etiquetaCliente(alumno.cliente) : '');
  const busquedaConDemora = useDebouncedValue(inputBusqueda);
  const [resultado, setResultado] = useState<{ texto: string; opciones: Cliente[] } | null>(null);

  const [crearAbierto, setCrearAbierto] = useState(false);
  const [creando, setCreando] = useState(false);
  const [errorCrear, setErrorCrear] = useState<string | null>(null);

  // Al elegir un responsable, MUI deja su etiqueta en el campo de texto: esa
  // etiqueta no matchea con nada al buscarla, así que en ese caso se vuelve
  // a mostrar la lista inicial en vez de un desplegable vacío.
  const textoBusqueda = responsable && busquedaConDemora === etiquetaCliente(responsable) ? '' : busquedaConDemora.trim();

  useEffect(() => {
    let cancelado = false;

    let consulta = supabase.from('clientes').select('*').order('razon_social').limit(20);
    if (textoBusqueda) {
      const escapado = escaparParaFiltro(textoBusqueda);
      consulta = consulta.or(`razon_social.ilike.%${escapado}%,numero_documento.ilike.%${escapado}%`);
    }

    consulta.then(({ data }) => {
      if (cancelado) return;
      setResultado({ texto: textoBusqueda, opciones: data ?? [] });
    });

    return () => {
      cancelado = true;
    };
  }, [textoBusqueda]);

  const buscando = resultado === null || resultado.texto !== textoBusqueda;

  // Para no perder el responsable ya elegido cuando no aparece entre los
  // resultados de la búsqueda actual.
  const opcionesCombinadas = useMemo(() => {
    const opciones = resultado?.opciones ?? [];
    if (!responsable || opciones.some((o) => o.id === responsable.id)) return opciones;
    return [responsable, ...opciones];
  }, [resultado, responsable]);

  async function handleCrearResponsable(valores: ClienteFormValues) {
    setCreando(true);
    setErrorCrear(null);

    const { data, error: errorInsert } = await supabase
      .from('clientes')
      .insert({
        tipo_documento: valores.tipo_documento,
        numero_documento: valores.numero_documento,
        razon_social: valores.razon_social,
        domicilio: valores.domicilio || null,
        condicion_iva: valores.condicion_iva,
        email: valores.email || null,
      })
      .select('*')
      .single();

    setCreando(false);

    if (errorInsert || !data) {
      setErrorCrear('No se pudo crear el responsable. Revisá que el documento no esté repetido.');
      return;
    }

    setResponsable(data);
    setInputBusqueda(etiquetaCliente(data));
    setCrearAbierto(false);
  }

  return (
    <>
      <DialogTitle>{alumno ? 'Editar alumno' : 'Nuevo alumno'}</DialogTitle>
      <DialogContent sx={{ display: 'flex', flexDirection: 'column', gap: 2, pt: 1 }}>
        <TextField label="Nombre y apellido" value={nombre} onChange={(e) => setNombre(e.target.value)} required fullWidth autoFocus />
        <TextField
          label="Curso"
          value={curso}
          onChange={(e) => setCurso(e.target.value)}
          helperText="Escribilo como debe leerse en la factura. Ej.: Sala de 5 años"
          fullWidth
        />

        <Box>
          <Autocomplete
            options={opcionesCombinadas}
            value={responsable}
            onChange={(_e, valor) => setResponsable(valor)}
            inputValue={inputBusqueda}
            onInputChange={(_e, valor) => setInputBusqueda(valor)}
            getOptionLabel={etiquetaCliente}
            isOptionEqualToValue={(a, b) => a.id === b.id}
            filterOptions={(todas) => todas}
            loading={buscando}
            loadingText="Buscando…"
            noOptionsText={textoBusqueda ? 'No hay clientes que coincidan' : 'No tenés clientes cargados todavía'}
            renderInput={(params) => <TextField {...params} label="Responsable de pago" required helperText="La factura sale a su nombre." />}
          />
          <Button
            size="small"
            onClick={() => {
              setErrorCrear(null);
              setCrearAbierto(true);
            }}
            sx={{ mt: 0.5 }}
          >
            Crear un responsable nuevo
          </Button>
        </Box>

        {error && <Alert severity="error">{error}</Alert>}
      </DialogContent>
      <DialogActions sx={{ px: 3, pb: 3 }}>
        <Button onClick={onClose} disabled={saving}>
          Cancelar
        </Button>
        <Button
          variant="contained"
          disabled={saving || !nombre.trim() || !responsable}
          onClick={() => responsable && onSave({ nombre: nombre.trim(), curso: curso.trim(), clienteId: responsable.id })}
        >
          {saving ? 'Guardando…' : 'Guardar'}
        </Button>
      </DialogActions>

      <ClienteFormDialog
        open={crearAbierto}
        cliente={null}
        grupos={SIN_GRUPOS}
        grupoIdsIniciales={SIN_GRUPO_IDS}
        saving={creando}
        error={errorCrear}
        onClose={() => setCrearAbierto(false)}
        onSave={handleCrearResponsable}
      />
    </>
  );
}
