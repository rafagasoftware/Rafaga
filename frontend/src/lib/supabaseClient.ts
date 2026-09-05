import { createClient } from '@supabase/supabase-js';

const supabaseUrl = import.meta.env.VITE_SUPABASE_URL;
const supabaseAnonKey = import.meta.env.VITE_SUPABASE_ANON_KEY;

if (!supabaseUrl || !supabaseAnonKey) {
  console.warn(
    'Faltan VITE_SUPABASE_URL / VITE_SUPABASE_ANON_KEY en el .env del frontend — el login no va a funcionar hasta que los completes.',
  );
}

// Clave pública (anon): respeta las políticas RLS, es seguro que viaje
// en el bundle del navegador. Nunca usar acá la service role key.
export const supabase = createClient(
  supabaseUrl || 'https://sin-configurar.supabase.co',
  supabaseAnonKey || 'sin-configurar',
);
