import { claveDocumento, normalizarTexto, type FilaAlumnoImportada } from '../../lib/alumnosImport';
import { supabase } from '../../lib/supabaseClient';

// PostgREST corta cada respuesta en 1000 filas: sin pedir por páginas, un
// colegio con más alumnos o clientes que eso vería "faltantes" que sí existen
// (y los volvería a cargar duplicados).
const TAMANO_PAGINA = 1000;

async function cargarTodas<T>(pedirPagina: (desde: number, hasta: number) => PromiseLike<{ data: T[] | null }>): Promise<T[]> {
  const todas: T[] = [];
  for (let desde = 0; ; desde += TAMANO_PAGINA) {
    const { data } = await pedirPagina(desde, desde + TAMANO_PAGINA - 1);
    todas.push(...(data ?? []));
    if (!data || data.length < TAMANO_PAGINA) break;
  }
  return todas;
}

function enTandas<T>(items: T[], tamano: number): T[][] {
  const tandas: T[][] = [];
  for (let i = 0; i < items.length; i += tamano) tandas.push(items.slice(i, i + tamano));
  return tandas;
}

export interface DatosResponsable {
  tipo_documento: string;
  numero_documento: string;
  razon_social: string;
  condicion_iva: string;
  domicilio: string;
  email: string;
}

export interface FilaRevisada extends FilaAlumnoImportada {
  clave: string;
  // El responsable ya está cargado (mismo tipo y número de documento).
  responsable: { id: string; razon_social: string } | null;
  // No está cargado: se crea con los datos de la planilla.
  responsableNuevo: boolean;
  // Se omite: ese alumno ya está cargado con ese responsable, o viene repetido en el archivo.
  yaCargado: boolean;
}

export interface RevisionArchivo {
  filas: FilaRevisada[];
  responsablesNuevos: Map<string, DatosResponsable>;
}

function claveAlumno(nombre: string, clienteOClave: string): string {
  return `${normalizarTexto(nombre)}|${clienteOClave}`;
}

// Cruza lo que dice el Excel con lo que ya hay cargado: de cada fila averigua
// si su responsable existe (se reutiliza) o hay que crearlo, y si el alumno ya
// está cargado (se omite, para poder volver a subir la lista actualizada sin
// duplicar a nadie).
export async function revisarContraBase(filas: FilaAlumnoImportada[]): Promise<RevisionArchivo> {
  const [clientes, alumnos] = await Promise.all([
    cargarTodas<{ id: string; tipo_documento: string; numero_documento: string; razon_social: string }>((desde, hasta) =>
      supabase.from('clientes').select('id, tipo_documento, numero_documento, razon_social').order('id').range(desde, hasta),
    ),
    cargarTodas<{ nombre: string; cliente_id: string }>((desde, hasta) =>
      supabase.from('alumnos').select('id, nombre, cliente_id').order('id').range(desde, hasta),
    ),
  ]);

  const clientePorClave = new Map<string, { id: string; razon_social: string }>();
  for (const cliente of clientes) {
    const clave = claveDocumento(cliente.tipo_documento, cliente.numero_documento);
    if (!clientePorClave.has(clave)) clientePorClave.set(clave, { id: cliente.id, razon_social: cliente.razon_social });
  }

  const yaCargados = new Set(alumnos.map((a) => claveAlumno(a.nombre, a.cliente_id)));

  // Un responsable nuevo con varios hijos aparece en varias filas pero se
  // crea una sola vez, con los datos de la primera fila que trae su nombre
  // (a los hermanos les alcanza con repetir el documento).
  const responsablesNuevos = new Map<string, DatosResponsable>();
  for (const fila of filas) {
    if (fila.errores.length > 0 || !fila.razon_social) continue;
    const clave = claveDocumento(fila.tipo_documento, fila.numero_documento);
    if (clientePorClave.has(clave) || responsablesNuevos.has(clave)) continue;
    responsablesNuevos.set(clave, {
      tipo_documento: fila.tipo_documento,
      numero_documento: fila.numero_documento,
      razon_social: fila.razon_social,
      condicion_iva: fila.condicion_iva,
      domicilio: fila.domicilio,
      email: fila.email,
    });
  }

  const vistosEnArchivo = new Set<string>();

  const revisadas = filas.map((fila): FilaRevisada => {
    const errores = [...fila.errores];
    const clave = claveDocumento(fila.tipo_documento, fila.numero_documento);
    const responsable = fila.numero_documento ? (clientePorClave.get(clave) ?? null) : null;
    const responsableNuevo = Boolean(fila.numero_documento) && !responsable;

    if (responsableNuevo && !responsablesNuevos.has(clave) && fila.errores.length === 0) {
      errores.push('El responsable todavía no está cargado y falta su nombre');
    }

    let yaCargado = false;
    if (errores.length === 0) {
      const claveDeEstaFila = claveAlumno(fila.alumno, responsable ? responsable.id : `nuevo:${clave}`);
      yaCargado = (responsable !== null && yaCargados.has(claveDeEstaFila)) || vistosEnArchivo.has(claveDeEstaFila);
      vistosEnArchivo.add(claveDeEstaFila);
    }

    return { ...fila, errores, clave, responsable, responsableNuevo, yaCargado };
  });

  return { filas: revisadas, responsablesNuevos };
}

export interface ResultadoImportacion {
  alumnosCreados: number;
  responsablesCreados: number;
  omitidos: number;
  fallidos: Array<{ fila: number; alumno: string; motivo: string }>;
}

function filaDeResponsable(datos: DatosResponsable) {
  return {
    tipo_documento: datos.tipo_documento,
    numero_documento: datos.numero_documento,
    razon_social: datos.razon_social,
    domicilio: datos.domicilio || null,
    condicion_iva: datos.condicion_iva,
    email: datos.email || null,
  };
}

// Primero los responsables nuevos, después los alumnos. Va por tandas (una
// consulta por varias filas, no una por fila) y, si una tanda falla, la
// repite de a una para saber exactamente cuáles son las filas con problema.
export async function importarFilas(revision: RevisionArchivo): Promise<ResultadoImportacion> {
  const aImportar = revision.filas.filter((f) => f.errores.length === 0 && !f.yaCargado);
  const omitidos = revision.filas.filter((f) => f.errores.length === 0 && f.yaCargado).length;

  const idPorClave = new Map<string, string>();
  const falloPorClave = new Set<string>();

  const clavesNuevas = [...new Set(aImportar.filter((f) => f.responsableNuevo).map((f) => f.clave))];

  for (const tanda of enTandas(clavesNuevas, 100)) {
    const datos = tanda.map((clave) => revision.responsablesNuevos.get(clave)!);
    const { data, error } = await supabase.from('clientes').insert(datos.map(filaDeResponsable)).select('id, tipo_documento, numero_documento');

    if (!error && data) {
      for (const cliente of data) idPorClave.set(claveDocumento(cliente.tipo_documento, cliente.numero_documento), cliente.id);
      continue;
    }

    for (const responsable of datos) {
      const clave = claveDocumento(responsable.tipo_documento, responsable.numero_documento);
      const { data: uno, error: errorUno } = await supabase.from('clientes').insert(filaDeResponsable(responsable)).select('id').single();
      if (errorUno || !uno) falloPorClave.add(clave);
      else idPorClave.set(clave, uno.id);
    }
  }

  const fallidos: ResultadoImportacion['fallidos'] = [];
  const conResponsable: Array<{ fila: FilaRevisada; clienteId: string }> = [];

  for (const fila of aImportar) {
    const clienteId = fila.responsable?.id ?? idPorClave.get(fila.clave);
    if (clienteId) conResponsable.push({ fila, clienteId });
    else fallidos.push({ fila: fila.fila, alumno: fila.alumno, motivo: falloPorClave.has(fila.clave) ? 'No se pudo crear al responsable (revisá su documento).' : 'No se encontró al responsable.' });
  }

  let alumnosCreados = 0;

  for (const tanda of enTandas(conResponsable, 200)) {
    const filasAlumno = tanda.map(({ fila, clienteId }) => ({ nombre: fila.alumno, curso: fila.curso || null, cliente_id: clienteId }));
    const { error } = await supabase.from('alumnos').insert(filasAlumno);

    if (!error) {
      alumnosCreados += tanda.length;
      continue;
    }

    for (const { fila, clienteId } of tanda) {
      const { error: errorUno } = await supabase.from('alumnos').insert({ nombre: fila.alumno, curso: fila.curso || null, cliente_id: clienteId });
      if (errorUno) fallidos.push({ fila: fila.fila, alumno: fila.alumno, motivo: 'No se pudo guardar el alumno.' });
      else alumnosCreados += 1;
    }
  }

  return { alumnosCreados, responsablesCreados: idPorClave.size, omitidos, fallidos };
}
