import { Router } from 'express';
import { requireAdmin } from '../middleware/requireAdmin';
import { supabase } from '../supabaseClient';

export const adminEmisoresRouter = Router();

const frontendUrl = process.env.FRONTEND_URL ?? 'http://localhost:5173';

// Alta de un cliente nuevo: invita el email por Supabase Auth y crea
// su fila en "emisores". Es la única forma de crear una cuenta —
// no hay registro público.
adminEmisoresRouter.post('/', requireAdmin, async (req, res) => {
  const { email, cuit, razon_social, condicion_iva, domicilio, ingresos_brutos, inicio_actividades } =
    req.body ?? {};

  if (!email || !cuit || !razon_social || !condicion_iva) {
    res.status(400).json({
      error: 'Faltan datos obligatorios: email, cuit, razon_social y condicion_iva.',
    });
    return;
  }

  const { data: invited, error: inviteError } = await supabase.auth.admin.inviteUserByEmail(email, {
    redirectTo: `${frontendUrl}/aceptar-invitacion`,
  });

  if (inviteError || !invited.user) {
    res.status(400).json({ error: inviteError?.message ?? 'No se pudo invitar al usuario.' });
    return;
  }

  const { data: emisor, error: emisorError } = await supabase
    .from('emisores')
    .insert({
      id: invited.user.id,
      cuit,
      razon_social,
      condicion_iva,
      domicilio: domicilio ?? null,
      ingresos_brutos: ingresos_brutos ?? null,
      inicio_actividades: inicio_actividades ?? null,
    })
    .select()
    .single();

  if (emisorError) {
    // Si falló crear el emisor (ej. CUIT duplicado), no dejamos un
    // usuario de Auth invitado sin cuenta asociada.
    await supabase.auth.admin.deleteUser(invited.user.id);
    res.status(500).json({ error: emisorError.message });
    return;
  }

  res.status(201).json(emisor);
});

// Listado simple para el panel de admin.
adminEmisoresRouter.get('/', requireAdmin, async (_req, res) => {
  const { data, error } = await supabase
    .from('emisores')
    .select('*')
    .order('creado_en', { ascending: false });

  if (error) {
    res.status(500).json({ error: error.message });
    return;
  }

  res.json(data);
});
