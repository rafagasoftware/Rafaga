import { Alert, Box, Button, MenuItem, Paper, TextField } from '@mui/material';
import { useState, type ChangeEvent, type FormEvent } from 'react';
import { useAuth } from '../auth/AuthContext';
import { PageHeader } from '../components/PageHeader';
import { CONDICIONES_IVA } from '../constants/fiscal';
import { backendUrl } from '../lib/backendUrl';

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

  const [emailReenvio, setEmailReenvio] = useState('');
  const [errorReenvio, setErrorReenvio] = useState<string | null>(null);
  const [successReenvio, setSuccessReenvio] = useState<string | null>(null);
  const [loadingReenvio, setLoadingReenvio] = useState(false);

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

  async function handleReenviar(event: FormEvent) {
    event.preventDefault();
    setErrorReenvio(null);
    setSuccessReenvio(null);
    setLoadingReenvio(true);

    try {
      const response = await fetch(`${backendUrl}/admin/emisores/reenviar-invitacion`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${session?.access_token}`,
        },
        body: JSON.stringify({ email: emailReenvio }),
      });

      const data = await response.json();

      if (!response.ok) {
        setErrorReenvio(data.error ?? 'No se pudo reenviar la invitación.');
        return;
      }

      setSuccessReenvio(`Se reenvió la invitación a ${emailReenvio}.`);
      setEmailReenvio('');
    } catch {
      setErrorReenvio('No se pudo conectar con el servidor.');
    } finally {
      setLoadingReenvio(false);
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

      <Paper variant="outlined" sx={{ p: 4, maxWidth: 480, mt: 3 }}>
        <Box component="form" onSubmit={handleReenviar} sx={{ display: 'flex', flexDirection: 'column', gap: 2 }}>
          <Box sx={{ typography: 'h6' }}>Reenviar invitación</Box>
          <Box sx={{ typography: 'body2', color: 'text.secondary' }}>
            Para un cliente que ya invitaste pero todavía no creó su contraseña (por ejemplo, si el primer link no le funcionó).
          </Box>
          <TextField
            label="Correo electrónico"
            type="email"
            value={emailReenvio}
            onChange={(e) => setEmailReenvio(e.target.value)}
            required
            fullWidth
          />
          {errorReenvio && <Alert severity="error">{errorReenvio}</Alert>}
          {successReenvio && <Alert severity="success">{successReenvio}</Alert>}
          <Button type="submit" variant="outlined" disabled={loadingReenvio}>
            {loadingReenvio ? 'Reenviando…' : 'Reenviar invitación'}
          </Button>
        </Box>
      </Paper>
    </>
  );
}
