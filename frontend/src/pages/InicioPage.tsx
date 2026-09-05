import { Typography } from '@mui/material';
import { useAuth } from '../auth/AuthContext';

export function InicioPage() {
  const { session } = useAuth();

  return (
    <>
      <Typography variant="h3" sx={{ mb: 2 }}>
        Bienvenido
      </Typography>
      <Typography color="text.secondary">{session?.user.email}</Typography>
    </>
  );
}
