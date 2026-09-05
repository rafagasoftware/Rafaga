import { Alert, Box, Button, MenuItem, Paper, TextField } from '@mui/material';
import { useState, type ChangeEvent, type FormEvent } from 'react';
import { useAuth } from '../auth/AuthContext';
import { PageHeader } from '../components/PageHeader';
import { CONDICIONES_IVA } from '../constants/fiscal';

const backendUrl = import.meta.env.VITE_BACKEND_URL;

export function AdminInvitarClientePage() {
  const { session } = useAuth();
  const [form, setForm] = useState({
    email: '',
    cuit: '',
    razon_social: '',
    condicion_iva: '',
    domicilio: '',
  });
  const [error, setError] = useState<string | null>(null);
  const [success, setSuccess] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);

  function handleChange(field: keyof typeof form) {
    return (event: ChangeEvent<HTMLInputElement>) => {
      setForm((prev) => ({ ...prev, [field]: event.target.value }));
    };
  }

  async function handleSubmit(event: FormEvent) {
    event.preventDefault();
    setError(null);
    setSuccess(null);
    setLoading(true);

    try {
      const response = await fetch(`${backendUrl}/admin/emisores`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${session?.access_token}`,
        },
        body: JSON.stringify(form),
      });

      const data = await response.json();

      if (!response.ok) {
        setError(data.error ?? 'No se pudo invitar al cliente.');
        return;
      }

      setSuccess(`Se invitó a ${form.email}. Le va a llegar un correo para crear su contraseña.`);
      setForm({ email: '', cuit: '', razon_social: '', condicion_iva: '', domicilio: '' });
    } catch {
      setError('No se pudo conectar con el servidor.');
    } finally {
      setLoading(false);
    }
  }

  return (
    <>
      <PageHeader title="Invitar un cliente nuevo" description="Le va a llegar un correo para que cree su contraseña y empiece a usar Rafaga." />

      <Paper variant="outlined" sx={{ p: 4, maxWidth: 480 }}>
        <Box component="form" onSubmit={handleSubmit} sx={{ display: 'flex', flexDirection: 'column', gap: 2 }}>
          <TextField label="Correo electrónico" type="email" value={form.email} onChange={handleChange('email')} required fullWidth />
          <TextField label="CUIT" value={form.cuit} onChange={handleChange('cuit')} required fullWidth />
          <TextField label="Razón social" value={form.razon_social} onChange={handleChange('razon_social')} required fullWidth />
          <TextField
            select
            label="Condición frente al IVA"
            value={form.condicion_iva}
            onChange={handleChange('condicion_iva')}
            required
            fullWidth
          >
            {CONDICIONES_IVA.map((opcion) => (
              <MenuItem key={opcion} value={opcion}>
                {opcion}
              </MenuItem>
            ))}
          </TextField>
          <TextField label="Domicilio" value={form.domicilio} onChange={handleChange('domicilio')} fullWidth />
          {error && <Alert severity="error">{error}</Alert>}
          {success && <Alert severity="success">{success}</Alert>}
          <Button type="submit" variant="contained" size="large" disabled={loading}>
            {loading ? 'Invitando…' : 'Invitar cliente'}
          </Button>
        </Box>
      </Paper>
    </>
  );
}
