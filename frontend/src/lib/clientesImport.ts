import * as XLSX from 'xlsx';
import { CONDICIONES_IVA, TIPOS_DOCUMENTO } from '../constants/fiscal';

export interface FilaImportada {
  fila: number;
  tipo_documento: string;
  numero_documento: string;
  razon_social: string;
  domicilio: string;
  condicion_iva: string;
  email: string;
  grupos: string[];
  errores: string[];
}

const ENCABEZADOS = {
  tipo_documento: 'Tipo de documento',
  numero_documento: 'Número de documento',
  razon_social: 'Razón social',
  domicilio: 'Domicilio',
  condicion_iva: 'Condición frente al IVA',
  email: 'Correo electrónico',
  grupos: 'Grupos',
};

export function descargarPlantilla() {
  const filaEjemplo = {
    [ENCABEZADOS.tipo_documento]: 'CUIT',
    [ENCABEZADOS.numero_documento]: '20345678901',
    [ENCABEZADOS.razon_social]: 'Juan Pérez',
    [ENCABEZADOS.domicilio]: 'Av. Siempre Viva 123',
    [ENCABEZADOS.condicion_iva]: 'Monotributista',
    [ENCABEZADOS.email]: 'juan@ejemplo.com',
    [ENCABEZADOS.grupos]: 'Alumnos 2026',
  };

  const hoja = XLSX.utils.json_to_sheet([filaEjemplo]);
  hoja['!cols'] = Object.keys(filaEjemplo).map(() => ({ wch: 24 }));
  const libro = XLSX.utils.book_new();
  XLSX.utils.book_append_sheet(libro, hoja, 'Clientes');
  XLSX.writeFile(libro, 'plantilla-clientes-rafaga.xlsx');
}

function comoTexto(valor: unknown): string {
  return String(valor ?? '').trim();
}

function normalizarCondicionIva(valor: string): string | null {
  return CONDICIONES_IVA.find((c) => c.toLowerCase() === valor.toLowerCase()) ?? null;
}

function validarFila(fila: Record<string, unknown>, numeroFila: number): FilaImportada {
  const tipoIngresado = comoTexto(fila[ENCABEZADOS.tipo_documento]).toUpperCase();
  const numero_documento = comoTexto(fila[ENCABEZADOS.numero_documento]);
  const razon_social = comoTexto(fila[ENCABEZADOS.razon_social]);
  const domicilio = comoTexto(fila[ENCABEZADOS.domicilio]);
  const condicionIngresada = comoTexto(fila[ENCABEZADOS.condicion_iva]);
  const email = comoTexto(fila[ENCABEZADOS.email]);
  const grupos = comoTexto(fila[ENCABEZADOS.grupos])
    .split(',')
    .map((g) => g.trim())
    .filter(Boolean);

  const errores: string[] = [];

  if (!razon_social) {
    errores.push('Falta la razón social');
  }
  if (!numero_documento) {
    errores.push('Falta el número de documento');
  }
  if (!(TIPOS_DOCUMENTO as readonly string[]).includes(tipoIngresado)) {
    errores.push(`Tipo de documento inválido (tiene que ser: ${TIPOS_DOCUMENTO.join(', ')})`);
  }

  const condicionNormalizada = normalizarCondicionIva(condicionIngresada);
  if (!condicionNormalizada) {
    errores.push(`Condición frente al IVA inválida (tiene que ser: ${CONDICIONES_IVA.join(', ')})`);
  }

  return {
    fila: numeroFila,
    tipo_documento: tipoIngresado,
    numero_documento,
    razon_social,
    domicilio,
    condicion_iva: condicionNormalizada ?? condicionIngresada,
    email,
    grupos,
    errores,
  };
}

export async function parsearArchivoClientes(archivo: File): Promise<FilaImportada[]> {
  const buffer = await archivo.arrayBuffer();
  const libro = XLSX.read(buffer);
  const hoja = libro.Sheets[libro.SheetNames[0]];
  const filas = XLSX.utils.sheet_to_json<Record<string, unknown>>(hoja, { defval: '' });

  // La fila 1 del archivo es el encabezado; los datos arrancan en la 2.
  return filas.map((fila, indice) => validarFila(fila, indice + 2));
}
