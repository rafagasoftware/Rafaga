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
          <Typography variant="h5" component={RouterLink} to="/" sx={{ color: 'text.primary', textDecoration: 'none', flexGrow: 1 }}>
            Rafaga
          </Typography>
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
      <Container maxWidth="md" sx={{ py: 5 }}>
        <Outlet />
      </Container>
    </Box>
  );
}
