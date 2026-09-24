import { Router } from 'express';
import { consultarCondicionIva } from '../arca/padron';
import type { Ambiente } from '../arca/wsaa';
import { obtenerCredencialesWSAA } from '../arca/wsaa';
import { consultarActividades, consultarPuntosVenta } from '../arca/wsfe';
import { requireAuth } from '../middleware/auth';
import { supabase } from '../supabaseClient';

export const certificadoArcaRouter = Router();

certificadoArcaRouter.get('/', requireAuth, async (req, res) => {
  const { data, error } = await supabase
    .from('certificados_arca')
    .select('alias, ambiente, estado_conexion, vencimiento, ultima_verificacion')
    .eq('emisor_id', req.emisorId)
    .maybeSingle();

  if (error) {
    res.status(500).json({ error: error.message });
    return;
  }

  res.json(data);
});

certificadoArcaRouter.post('/', requireAuth, async (req, res) => {
  const { alias, certificadoPem, clavePrivadaPem, ambiente } = req.body ?? {};

  if (!alias || !certificadoPem || !clavePrivadaPem) {
    res.status(400).json({ error: 'Faltan datos: alias, certificado y clave privada son obligatorios.' });
    return;
  }
  if (!certificadoPem.includes('BEGIN CERTIFICATE')) {
    res.status(400).json({ error: 'El certificado no parece un archivo .pem válido (debería empezar con -----BEGIN CERTIFICATE-----).' });
    return;
  }
  if (!clavePrivadaPem.includes('PRIVATE KEY')) {
    res.status(400).json({ error: 'La clave privada no parece válida (debería empezar con -----BEGIN PRIVATE KEY----- o similar).' });
    return;
  }
  if (ambiente !== 'homologacion' && ambiente !== 'produccion') {
    res.status(400).json({ error: 'El ambiente tiene que ser "homologacion" o "produccion".' });
    return;
  }

  const { error } = await supabase.rpc('guardar_certificado_arca', {
    p_emisor_id: req.emisorId,
    p_alias: alias,
    p_certificado_pem: certificadoPem,
    p_clave_privada_pem: clavePrivadaPem,
    p_ambiente: ambiente,
  });

  if (error) {
    res.status(500).json({ error: error.message });
    return;
  }

  res.status(201).json({ ok: true });
});

// Pide un Ticket de Acceso a WSAA con el certificado guardado. No emite
// nada — solo confirma que ARCA acepta la firma, y deja constancia del
// resultado en certificados_arca para mostrarlo en pantalla.
interface CertificadoLeido {
  alias: string;
  certificado_pem: string;
  clave_privada_pem: string;
  ambiente: Ambiente;
}

certificadoArcaRouter.post('/probar', requireAuth, async (req, res) => {
  const { data, error } = await supabase
    .rpc('leer_certificado_arca', { p_emisor_id: req.emisorId })
    .maybeSingle<CertificadoLeido>();

  if (error || !data || !data.certificado_pem || !data.clave_privada_pem) {
    res.status(400).json({ error: 'Todavía no cargaste un certificado para esta cuenta.' });
    return;
  }

  const { data: emisor } = await supabase.from('emisores').select('cuit, condicion_iva').eq('id', req.emisorId).single();
  if (!emisor) {
    res.status(404).json({ error: 'No se encontró el emisor.' });
    return;
  }

  let credenciales;
  try {
    credenciales = await obtenerCredencialesWSAA(req.emisorId as string, data.certificado_pem, data.clave_privada_pem, data.ambiente);
  } catch (wsaaError) {
    const motivo = wsaaError instanceof Error ? wsaaError.message : 'Error desconocido al conectar con ARCA.';
    await supabase
      .from('certificados_arca')
      .update({ estado_conexion: 'error', ultima_verificacion: new Date().toISOString() })
      .eq('emisor_id', req.emisorId);
    res.status(502).json({ error: motivo });
    return;
  }

  // A partir de acá WSAA ya funcionó. WSFE (puntos de venta) y el padrón
  // (condición de IVA) son dos consultas independientes — cada una en su
  // propio try, para que un rechazo de una (ej. "Sin Resultados" en
  // puntos de venta) no tape el resultado de la otra.
  let puntosVenta: Awaited<ReturnType<typeof consultarPuntosVenta>> = [];
  let errorPuntosVenta: string | null = null;
  try {
    puntosVenta = await consultarPuntosVenta(credenciales, emisor.cuit, data.ambiente);
  } catch (wsfeError) {
    errorPuntosVenta = wsfeError instanceof Error ? wsfeError.message : 'Error desconocido al conectar con ARCA.';
  }

  // Actividades económicas registradas del emisor — se cachean en
  // emisores.actividades para que el paso 1 del asistente arme el
  // selector sin ir a buscarlas a ARCA en cada factura. Un rechazo acá no
  // debería pasar casi nunca (mismo servicio que puntosVenta), pero si
  // pasa no tapa el resto de "Probar conexión": simplemente no se
  // actualiza la lista.
  try {
    const actividades = await consultarActividades(credenciales, emisor.cuit, data.ambiente);
    const { error: errorActividades } = await supabase.from('emisores').update({ actividades }).eq('id', req.emisorId);
    if (errorActividades) console.error('No se pudo guardar emisores.actividades:', errorActividades.message);
  } catch (actividadesError) {
    console.error('No se pudieron consultar las actividades de ARCA:', actividadesError);
  }

  // El padrón es un servicio de ARCA aparte de WSFE — necesita su propia
  // autorización, que el emisor puede no haber dado todavía. Si falla, no
  // arruina el resto de "Probar conexión": simplemente no se puede
  // verificar la condición de IVA por ahora.
  let condicionIvaArca: string | null = null;
  let condicionIvaCoincide: boolean | null = null;
  // TODO temporal: sacar padronDebug de la respuesta, y todo este bloque
  // de prueba, una vez confirmado que la consulta al padrón funciona.
  //
  // El padrón de homologación no tiene datos del CUIT real del emisor
  // (30714705365) — solo reconoce un puñado de CUITs de ejemplo que da
  // ARCA para testing. Por eso acá se pide el de un CUIT de prueba
  // (idPersona), no el del emisor, y justo por eso NO se compara contra
  // condicion_iva ni se guarda en emisores: sería comparar el dato del
  // emisor contra el de otra persona. Cuando se pase a producción, volver
  // a `consultarCondicionIva(credencialesPadron, emisor.cuit, data.ambiente)`
  // sin el idPersona de prueba, y descomentar el guardado/comparación.
  let padronDebug: string | null = null;
  const CUIT_PRUEBA_PADRON = '30202020204';
  try {
    const credencialesPadron = await obtenerCredencialesWSAA(
      req.emisorId as string,
      data.certificado_pem,
      data.clave_privada_pem,
      data.ambiente,
      'ws_sr_constancia_inscripcion',
    );
    const padron = await consultarCondicionIva(credencialesPadron, emisor.cuit, data.ambiente, CUIT_PRUEBA_PADRON);
    padronDebug = `OK (CUIT de PRUEBA ${CUIT_PRUEBA_PADRON}, no el del emisor) — condición derivada: ${padron.condicionIva}\n\n${padron.crudo}`;
  } catch (padronError) {
    padronDebug = padronError instanceof Error ? padronError.message : 'Error desconocido al consultar el padrón.';
  }

  await supabase
    .from('certificados_arca')
    .update({ estado_conexion: errorPuntosVenta ? 'error' : 'ok', ultima_verificacion: new Date().toISOString() })
    .eq('emisor_id', req.emisorId);

  if (errorPuntosVenta) {
    res.status(502).json({ error: errorPuntosVenta, condicionIvaArca, condicionIvaCoincide, padronDebug });
    return;
  }

  res.json({ ok: true, puntosVenta, condicionIvaArca, condicionIvaCoincide, padronDebug });
});
