import type { NextFunction, Request, Response } from 'express';
import { supabase } from '../supabaseClient';

declare global {
  // eslint-disable-next-line @typescript-eslint/no-namespace
  namespace Express {
    interface Request {
      adminId?: string;
    }
  }
}

// Valida el token igual que requireAuth, pero además exige que el
// usuario esté en "administradores" — es decir, que sea el dueño
// del producto, no un emisor cualquiera.
export async function requireAdmin(req: Request, res: Response, next: NextFunction) {
  const authHeader = req.headers.authorization;
  const token = authHeader?.startsWith('Bearer ') ? authHeader.slice(7) : undefined;

  if (!token) {
    res.status(401).json({ error: 'Falta el token de autenticación' });
    return;
  }

  const { data: userData, error: userError } = await supabase.auth.getUser(token);
  if (userError || !userData.user) {
    res.status(401).json({ error: 'Token inválido o vencido' });
    return;
  }

  const { data: admin, error: adminError } = await supabase
    .from('administradores')
    .select('id')
    .eq('id', userData.user.id)
    .maybeSingle();

  if (adminError) {
    res.status(500).json({ error: adminError.message });
    return;
  }

  if (!admin) {
    res.status(403).json({ error: 'No tenés permisos de administrador' });
    return;
  }

  req.adminId = userData.user.id;
  next();
}
