import { Router } from 'express';
import type { Ambiente } from '../arca/wsaa';
import { obtenerCredencialesWSAA } from '../arca/wsaa';
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

  try {
    await obtenerCredencialesWSAA(req.emisorId as string, data.certificado_pem, data.clave_privada_pem, data.ambiente);

    await supabase
      .from('certificados_arca')
      .update({ estado_conexion: 'ok', ultima_verificacion: new Date().toISOString() })
      .eq('emisor_id', req.emisorId);

    res.json({ ok: true });
  } catch (wsaaError) {
    const motivo = wsaaError instanceof Error ? wsaaError.message : 'Error desconocido al conectar con ARCA.';

    await supabase
      .from('certificados_arca')
      .update({ estado_conexion: 'error', ultima_verificacion: new Date().toISOString() })
      .eq('emisor_id', req.emisorId);

    res.status(502).json({ error: motivo });
  }
});
