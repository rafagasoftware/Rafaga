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

// Reenvía a un cliente la forma de entrar a Rafaga, para dos casos:
// 1) Todavía no confirmó la cuenta (ej. porque el primer link apuntaba a
//    localhost): reenvía la invitación original.
// 2) Ya confirmó la cuenta (ej. porque llegó a clickear ese link roto)
//    pero nunca llegó a elegir contraseña: inviteUserByEmail rechaza
//    reinvitar a un usuario confirmado, así que en ese caso mandamos un
//    link de recuperación de contraseña — apunta a la misma pantalla
//    "aceptar-invitacion", que no le importa si la sesión vino de una
//    invitación o de una recuperación, solo deja elegir contraseña.
// A propósito NO reutiliza el POST de alta de arriba: ese hace un insert
// en "emisores" con el mismo id de Auth, que ya existe, así que el insert
// duplicado dispara el catch que borra el usuario — y por el "on delete
// cascade" eso se llevaría puesta la fila del emisor ya creada.
adminEmisoresRouter.post('/reenviar-invitacion', requireAdmin, async (req, res) => {
  const { email } = req.body ?? {};

  if (!email) {
    res.status(400).json({ error: 'Falta el email.' });
    return;
  }

  const redirectTo = `${frontendUrl}/aceptar-invitacion`;

  const { error: inviteError } = await supabase.auth.admin.inviteUserByEmail(email, { redirectTo });

  if (inviteError) {
    const { error: recoveryError } = await supabase.auth.resetPasswordForEmail(email, { redirectTo });
    if (recoveryError) {
      res.status(400).json({ error: recoveryError.message });
      return;
    }
  }

  res.status(200).json({ ok: true });
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
