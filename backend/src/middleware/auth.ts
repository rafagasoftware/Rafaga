import type { NextFunction, Request, Response } from 'express';
import { supabase } from '../supabaseClient';

declare global {
  // eslint-disable-next-line @typescript-eslint/no-namespace
  namespace Express {
    interface Request {
      emisorId?: string;
    }
  }
}

// Verifica el token de Supabase Auth que manda el frontend y adjunta
// el id del emisor autenticado a la request. No reemplaza RLS: es
// lo que le dice a este backend, que usa la service role, de quién
// son los datos que está por leer o escribir.
export async function requireAuth(req: Request, res: Response, next: NextFunction) {
  const authHeader = req.headers.authorization;
  const token = authHeader?.startsWith('Bearer ') ? authHeader.slice(7) : undefined;

  if (!token) {
    res.status(401).json({ error: 'Falta el token de autenticación' });
    return;
  }

  const { data, error } = await supabase.auth.getUser(token);

  if (error || !data.user) {
    res.status(401).json({ error: 'Token inválido o vencido' });
    return;
  }

  req.emisorId = data.user.id;
  next();
}
