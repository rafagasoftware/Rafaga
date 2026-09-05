import 'dotenv/config';
import cors from 'cors';
import express from 'express';
import { requireAuth } from './middleware/auth';
import { adminEmisoresRouter } from './routes/adminEmisores';
import { supabase } from './supabaseClient';

const app = express();
// Mismo valor que ya usábamos para el link de invitación: en local es
// localhost, en producción va a ser la URL real del frontend en Vercel.
app.use(cors({ origin: process.env.FRONTEND_URL ?? 'http://localhost:5173' }));
app.use(express.json());

app.get('/health', (_req, res) => {
  res.json({ ok: true });
});

app.use('/admin/emisores', adminEmisoresRouter);

// Ruta de prueba: confirma que el token del frontend viaja bien y que
// este backend puede leer la base con la service role.
app.get('/me', requireAuth, async (req, res) => {
  const { data, error } = await supabase
    .from('emisores')
    .select('*')
    .eq('id', req.emisorId)
    .single();

  if (error) {
    res.status(500).json({ error: error.message });
    return;
  }

  res.json(data);
});

const port = process.env.PORT ? Number(process.env.PORT) : 3001;
app.listen(port, () => {
  console.log(`Rafaga backend escuchando en http://localhost:${port}`);
});
