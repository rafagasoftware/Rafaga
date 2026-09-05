import { createClient } from '@supabase/supabase-js';

const supabaseUrl = process.env.SUPABASE_URL;
const supabaseServiceRoleKey = process.env.SUPABASE_SERVICE_ROLE_KEY;

if (!supabaseUrl || !supabaseServiceRoleKey) {
  console.warn(
    'Faltan SUPABASE_URL / SUPABASE_SERVICE_ROLE_KEY en el .env — las rutas que usan la base van a fallar hasta que los completes.',
  );
}

// Cliente con la service role: pensado solo para este backend de confianza.
// Ignora las políticas RLS a propósito, así que cada ruta es responsable
// de filtrar por el emisor autenticado (ver middleware/auth.ts).
//
// Si falta la configuración, se usa una URL de relleno (createClient exige
// una URL válida para construirse) para que el servidor pueda levantar
// igual; las rutas que de verdad toquen la base van a fallar recién ahí.
export const supabase = createClient(
  supabaseUrl ?? 'https://sin-configurar.supabase.co',
  supabaseServiceRoleKey ?? 'sin-configurar',
);
