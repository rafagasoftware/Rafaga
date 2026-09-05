import { Alert, Box, Button, Paper, TextField, Typography } from '@mui/material';
import { useState, type FormEvent } from 'react';
import { useNavigate } from 'react-router-dom';
import { useAuth } from '../auth/AuthContext';
import { supabase } from '../lib/supabaseClient';

// A esta pantalla llega el usuario invitado desde el link del correo.
// El cliente de Supabase ya detecta la sesión temporal que trae ese
// link (detectSessionInUrl); acá solo falta que defina su contraseña.
export function AceptarInvitacionPage() {
  const { session, loading: sessionLoading } = useAuth();
  const [password, setPassword] = useState('');
  const [confirmPassword, setConfirmPassword] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);
  const navigate = useNavigate();

  async function handleSubmit(event: FormEvent) {
    event.preventDefault();
    setError(null);

    if (password.length < 8) {
      setError('La contraseña tiene que tener al menos 8 caracteres.');
      return;
    }
    if (password !== confirmPassword) {
      setError('Las dos contraseñas no coinciden.');
      return;
    }

    setLoading(true);
    const { error: updateError } = await supabase.auth.updateUser({ password });
    setLoading(false);

    if (updateError) {
      setError('No se pudo guardar la contraseña. Probá pedir una invitación nueva.');
      return;
    }

    navigate('/', { replace: true });
  }

  return (
    <Box sx={{ minHeight: '100vh', display: 'flex', alignItems: 'center', justifyContent: 'center', bgcolor: 'background.default' }}>
      <Paper variant="outlined" sx={{ p: 4, width: 360 }}>
        <Typography variant="h4" sx={{ mb: 1 }}>
          Bienvenido a Rafaga
        </Typography>
        <Typography variant="body2" color="text.secondary" sx={{ mb: 3 }}>
          Elegí una contraseña para tu cuenta.
        </Typography>

        {sessionLoading ? (
          <Typography variant="body2" color="text.secondary">
            Verificando la invitación…
          </Typography>
        ) : !session ? (
          <Alert severity="error">
            Este link de invitación no es válido o ya venció. Pedile al administrador que te invite de nuevo.
          </Alert>
        ) : (
          <Box component="form" onSubmit={handleSubmit} sx={{ display: 'flex', flexDirection: 'column', gap: 2 }}>
            <TextField
              label="Contraseña"
              type="password"
              helperText="Mínimo 8 caracteres"
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              required
              fullWidth
            />
            <TextField
              label="Repetir contraseña"
              type="password"
              value={confirmPassword}
              onChange={(e) => setConfirmPassword(e.target.value)}
              required
              fullWidth
            />
            {error && <Alert severity="error">{error}</Alert>}
            <Button type="submit" variant="contained" size="large" disabled={loading}>
              {loading ? 'Guardando…' : 'Crear mi contraseña'}
            </Button>
          </Box>
        )}
      </Paper>
    </Box>
  );
}
