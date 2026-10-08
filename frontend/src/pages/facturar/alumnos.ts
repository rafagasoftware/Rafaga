import type { AlumnoConResponsable, Cliente } from '../../types/domain';
import type { ItemFactura } from './types';

export const MARCADOR_ALUMNO = '[alumno]';
export const MARCADOR_CURSO = '[curso]';

export function usaMarcadorCurso(descripcion: string): boolean {
  return /\[curso\]/i.test(descripcion);
}

// Reemplaza los marcadores del concepto por los datos del alumno. Si el
// concepto no nombra al alumno, se agrega al final: así el nombre aparece
// siempre y dos hermanos no terminan en dos renglones idénticos.
export function descripcionParaAlumno(descripcion: string, alumno: Pick<AlumnoConResponsable, 'nombre' | 'curso'>): string {
  if (!descripcion.trim()) return descripcion;

  const nombraAlAlumno = /\[alumno\]/i.test(descripcion);
  const texto = descripcion
    .replace(/\[alumno\]/gi, () => alumno.nombre)
    .replace(/\[curso\]/gi, () => alumno.curso ?? '')
    .replace(/[ \t]{2,}/g, ' ')
    .trim();

  return nombraAlAlumno ? texto : `${texto} — ${alumno.nombre}`;
}

export interface FamiliaAFacturar {
  cliente: Cliente;
  alumnos: AlumnoConResponsable[];
}

// Una factura por responsable de pago: los alumnos que comparten responsable
// van juntos, en el orden en que se eligieron.
export function agruparPorResponsable(alumnos: AlumnoConResponsable[]): FamiliaAFacturar[] {
  const porCliente = new Map<string, FamiliaAFacturar>();

  for (const alumno of alumnos) {
    if (!alumno.cliente) continue;

    const familia = porCliente.get(alumno.cliente_id);
    if (familia) {
      familia.alumnos.push(alumno);
    } else {
      porCliente.set(alumno.cliente_id, { cliente: alumno.cliente, alumnos: [alumno] });
    }
  }

  return [...porCliente.values()];
}

export interface ItemDeAlumno extends ItemFactura {
  alumnoId: string;
}

// Los renglones de la factura de una familia: los ítems cargados una sola vez
// se repiten por cada alumno, cada uno con su texto.
export function itemsParaFamilia(items: ItemFactura[], alumnos: AlumnoConResponsable[]): ItemDeAlumno[] {
  return alumnos.flatMap((alumno) =>
    items.map((item) => ({ ...item, descripcion: descripcionParaAlumno(item.descripcion, alumno), alumnoId: alumno.id })),
  );
}
