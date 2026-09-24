import { supabase } from './supabaseClient';

const backendUrl = import.meta.env.VITE_BACKEND_URL;

export interface ErrorApi {
  error: string;
}

const SIN_CONEXION: ErrorApi = { error: 'No se pudo conectar con el servidor.' };

function nombreDeContentDisposition(header: string | null, alternativo: string): string {
  return header?.match(/filename="([^"]+)"/)?.[1] ?? alternativo;
}

// Los archivos salen de endpoints que exigen el token en el header, así que
// no sirve un <a href>: se piden con fetch y se guardan desde un blob.
// Devuelve el mensaje de error, o null si se descargó bien.
async function descargar(token: string, ruta: string, nombreAlternativo: string): Promise<string | null> {
  try {
    const response = await fetch(`${backendUrl}${ruta}`, { headers: { Authorization: `Bearer ${token}` } });

    if (!response.ok) {
      const data = await response.json().catch(() => null);
      return data?.error ?? 'No se pudo descargar el archivo.';
    }

    const blob = await response.blob();
    const url = URL.createObjectURL(blob);
    const enlace = document.createElement('a');
    enlace.href = url;
    enlace.download = nombreDeContentDisposition(response.headers.get('Content-Disposition'), nombreAlternativo);
    document.body.appendChild(enlace);
    enlace.click();
    enlace.remove();
    URL.revokeObjectURL(url);
    return null;
  } catch {
    return SIN_CONEXION.error;
  }
}

export function descargarPdfFactura(token: string, facturaId: string) {
  return descargar(token, `/facturas/${facturaId}/pdf`, 'factura.pdf');
}

export function descargarZipLote(token: string, loteId: string) {
  return descargar(token, `/lotes/${loteId}/zip`, 'facturas.zip');
}

export async function reintentarFactura(token: string, facturaId: string): Promise<ErrorApi | { aprobado: boolean }> {
  try {
    const response = await fetch(`${backendUrl}/facturas/${facturaId}/reintentar`, {
      method: 'POST',
      headers: { Authorization: `Bearer ${token}` },
    });
    const data = await response.json();

    if (!response.ok) return { error: data.error ?? 'No se pudo reintentar la emisión.' };
    return { aprobado: Boolean(data.aprobado) };
  } catch {
    return SIN_CONEXION;
  }
}

export async function emitirNotaCredito(
  token: string,
  facturaId: string,
): Promise<ErrorApi | { numeroComprobante: string | null; cae: string | null }> {
  try {
    const response = await fetch(`${backendUrl}/facturas/${facturaId}/nota-credito`, {
      method: 'POST',
      headers: { Authorization: `Bearer ${token}` },
    });
    const data = await response.json();

    if (!response.ok) return { error: data.error ?? 'No se pudo emitir la nota de crédito.' };
    if (!data.aprobado) return { error: data.factura?.motivo_error ?? 'ARCA rechazó la nota de crédito.' };
    return { numeroComprobante: data.factura.numero_comprobante, cae: data.factura.cae };
  } catch {
    return SIN_CONEXION;
  }
}

export interface ResultadoNotasCreditoLote {
  total: number;
  emitidas: number;
  conError: number;
  omitidas: number;
  errores: { factura: string; motivo: string }[];
}

export async function emitirNotasCreditoDeLote(token: string, loteId: string): Promise<ErrorApi | ResultadoNotasCreditoLote> {
  try {
    const response = await fetch(`${backendUrl}/lotes/${loteId}/notas-credito`, {
      method: 'POST',
      headers: { Authorization: `Bearer ${token}` },
    });
    const data = await response.json();

    if (!response.ok) return { error: data.error ?? 'No se pudieron emitir las notas de crédito.' };
    return data as ResultadoNotasCreditoLote;
  } catch {
    return SIN_CONEXION;
  }
}

// De estas facturas, cuáles ya tienen una nota de crédito emitida.
export async function idsConNotaCredito(facturaIds: string[]): Promise<Set<string>> {
  if (facturaIds.length === 0) return new Set();

  const { data } = await supabase
    .from('facturas')
    .select('factura_original_id')
    .in('factura_original_id', facturaIds)
    .eq('estado', 'emitida');

  return new Set((data ?? []).map((fila) => fila.factura_original_id as string));
}
