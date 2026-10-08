import * as XLSX from 'xlsx';
import { CONDICIONES_IVA, TIPOS_DOCUMENTO } from '../constants/fiscal';

export interface FilaAlumnoImportada {
  fila: number;
  alumno: string;
  curso: string;
  tipo_documento: string;
  numero_documento: string;
  razon_social: string;
  condicion_iva: string;
  domicilio: string;
  email: string;
  errores: string[];
}

const ENCABEZADOS = {
  alumno: 'Alumno',
  curso: 'Curso',
  tipo_documento: 'Tipo de documento del responsable',
  numero_documento: 'Número de documento del responsable',
  razon_social: 'Nombre del responsable',
  condicion_iva: 'Condición frente al IVA del responsable',
  domicilio: 'Domicilio del responsable',
  email: 'Correo del responsable',
};

// Sin estas dos columnas no hay forma de saber qué alumno es ni de quién.
const ENCABEZADOS_OBLIGATORIOS = [ENCABEZADOS.alumno, ENCABEZADOS.numero_documento];

export class ErrorDePlantilla extends Error {}

export function descargarPlantillaAlumnos() {
  const filas = [
    {
      [ENCABEZADOS.alumno]: 'Juan Cruz Gonzalez',
      [ENCABEZADOS.curso]: 'Sala de 5 años',
      [ENCABEZADOS.tipo_documento]: 'DNI',
      [ENCABEZADOS.numero_documento]: '32456789',
      [ENCABEZADOS.razon_social]: 'Carlos Gonzalez',
      [ENCABEZADOS.condicion_iva]: 'Consumidor Final',
      [ENCABEZADOS.domicilio]: 'Belgrano 789',
      [ENCABEZADOS.email]: 'carlos@ejemplo.com',
    },
    // Un hermano: alcanza con repetir el documento del responsable.
    {
      [ENCABEZADOS.alumno]: 'Ana Gonzalez',
      [ENCABEZADOS.curso]: 'Sala de 3 años',
      [ENCABEZADOS.tipo_documento]: 'DNI',
      [ENCABEZADOS.numero_documento]: '32456789',
      [ENCABEZADOS.razon_social]: '',
      [ENCABEZADOS.condicion_iva]: '',
      [ENCABEZADOS.domicilio]: '',
      [ENCABEZADOS.email]: '',
    },
  ];

  const hoja = XLSX.utils.json_to_sheet(filas);
  hoja['!cols'] = Object.keys(filas[0]).map(() => ({ wch: 28 }));
  const libro = XLSX.utils.book_new();
  XLSX.utils.book_append_sheet(libro, hoja, 'Alumnos');
  XLSX.writeFile(libro, 'plantilla-alumnos-rafaga.xlsx');
}

function comoTexto(valor: unknown): string {
  return String(valor ?? '').trim();
}

// Los encabezados se comparan sin mayúsculas, tildes ni espacios de más, para
// que una planilla tipeada a mano no falle por detalles de escritura.
export function normalizarTexto(texto: string): string {
  return texto
    .normalize('NFD')
    .replace(/\p{M}/gu, '')
    .toLowerCase()
    .replace(/\s+/g, ' ')
    .trim();
}

function normalizarCondicionIva(valor: string): string | null {
  return CONDICIONES_IVA.find((c) => normalizarTexto(c) === normalizarTexto(valor)) ?? null;
}

// El mismo responsable puede venir escrito "20-34567890-1" en una fila y
// "20345678901" en otra: se compara solo por los dígitos.
export function claveDocumento(tipoDocumento: string, numeroDocumento: string): string {
  return `${tipoDocumento}|${numeroDocumento.replace(/\D/g, '')}`;
}

function validarFila(fila: Map<string, unknown>, numeroFila: number): FilaAlumnoImportada {
  const leer = (encabezado: string) => comoTexto(fila.get(normalizarTexto(encabezado)));

  const alumno = leer(ENCABEZADOS.alumno);
  const numero_documento = leer(ENCABEZADOS.numero_documento);
  const tipoIngresado = leer(ENCABEZADOS.tipo_documento).toUpperCase();
  const condicionIngresada = leer(ENCABEZADOS.condicion_iva);

  const errores: string[] = [];

  if (!alumno) {
    errores.push('Falta el nombre del alumno');
  }
  if (!numero_documento) {
    errores.push('Falta el documento del responsable');
  }

  // Si no lo aclaran: 11 dígitos es un CUIT; si no, un DNI (lo común en padres).
  const digitos = numero_documento.replace(/\D/g, '');
  const tipo_documento = tipoIngresado || (digitos.length === 11 ? 'CUIT' : 'DNI');
  if (!(TIPOS_DOCUMENTO as readonly string[]).includes(tipo_documento)) {
    errores.push(`Tipo de documento inválido (tiene que ser: ${TIPOS_DOCUMENTO.join(', ')})`);
  }

  // Solo se usa si el responsable todavía no está cargado. Los padres de un
  // colegio son casi siempre Consumidor Final, así que ese es el valor por defecto.
  let condicion_iva = 'Consumidor Final';
  if (condicionIngresada) {
    const normalizada = normalizarCondicionIva(condicionIngresada);
    if (normalizada) {
      condicion_iva = normalizada;
    } else {
      errores.push(`Condición frente al IVA inválida (tiene que ser: ${CONDICIONES_IVA.join(', ')})`);
    }
  }

  return {
    fila: numeroFila,
    alumno,
    curso: leer(ENCABEZADOS.curso),
    tipo_documento,
    numero_documento,
    razon_social: leer(ENCABEZADOS.razon_social),
    condicion_iva,
    domicilio: leer(ENCABEZADOS.domicilio),
    email: leer(ENCABEZADOS.email),
    errores,
  };
}

export async function parsearArchivoAlumnos(archivo: File): Promise<FilaAlumnoImportada[]> {
  const buffer = await archivo.arrayBuffer();
  const libro = XLSX.read(buffer);
  const hoja = libro.Sheets[libro.SheetNames[0]];
  const filas = XLSX.utils.sheet_to_json<Record<string, unknown>>(hoja, { defval: '' });

  const filasNormalizadas = filas.map((fila) => new Map(Object.entries(fila).map(([clave, valor]) => [normalizarTexto(clave), valor])));

  if (filasNormalizadas.length > 0) {
    const faltantes = ENCABEZADOS_OBLIGATORIOS.filter((encabezado) => !filasNormalizadas[0].has(normalizarTexto(encabezado)));
    if (faltantes.length > 0) {
      throw new ErrorDePlantilla(
        `No encontré ${faltantes.length === 1 ? 'la columna' : 'las columnas'} ${faltantes.map((f) => `"${f}"`).join(' y ')}. Descargá la planilla de ejemplo y usá esos títulos.`,
      );
    }
  }

  // La fila 1 del archivo es el encabezado; los datos arrancan en la 2.
  return filasNormalizadas.map((fila, indice) => validarFila(fila, indice + 2));
}
