import { AppBar, Box, Button, Container, Toolbar, Typography } from '@mui/material';
import { Link as RouterLink, Outlet } from 'react-router-dom';
import { useAuth } from '../auth/AuthContext';
import { supabase } from '../lib/supabaseClient';

export function Layout() {
  const { isAdmin } = useAuth();

  return (
    <Box sx={{ minHeight: '100vh', bgcolor: 'background.default' }}>
      <AppBar position="static">
        <Toolbar sx={{ gap: 3 }}>
          <Typography variant="h5" component={RouterLink} to="/" sx={{ color: 'text.primary', textDecoration: 'none' }}>
            Rafaga
          </Typography>
          <Button component={RouterLink} to="/clientes" color="inherit">
            Clientes
          </Button>
          <Button component={RouterLink} to="/catalogo" color="inherit">
            Catálogo
          </Button>
          <Button component={RouterLink} to="/puntos-venta" color="inherit">
            Puntos de venta
          </Button>
          <Button component={RouterLink} to="/datos-emisor" color="inherit">
            Datos del emisor
          </Button>
          <Box sx={{ flexGrow: 1 }} />
          {isAdmin && (
            <Button component={RouterLink} to="/admin/invitar" color="inherit">
              Invitar cliente
            </Button>
          )}
          <Button color="inherit" onClick={() => supabase.auth.signOut()}>
            Cerrar sesión
          </Button>
        </Toolbar>
      </AppBar>
      <Container maxWidth="lg" sx={{ py: 5 }}>
        <Outlet />
      </Container>
    </Box>
  );
}
