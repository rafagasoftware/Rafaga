import { Router } from 'express';
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
