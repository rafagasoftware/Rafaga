import ExpandMoreIcon from '@mui/icons-material/ExpandMore';
import { AppBar, Box, Button, Container, Menu, MenuItem, Toolbar, Typography } from '@mui/material';
import { useState } from 'react';
import { Link as RouterLink, Outlet } from 'react-router-dom';
import { useAuth } from '../auth/AuthContext';
import { supabase } from '../lib/supabaseClient';

export function Layout() {
  const { isAdmin } = useAuth();
  const [menuAnchor, setMenuAnchor] = useState<HTMLElement | null>(null);

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
          <Button component={RouterLink} to="/facturas" color="inherit">
            Facturas
          </Button>
          <Button color="inherit" endIcon={<ExpandMoreIcon />} onClick={(e) => setMenuAnchor(e.currentTarget)}>
            Configuración
          </Button>
          <Menu anchorEl={menuAnchor} open={Boolean(menuAnchor)} onClose={() => setMenuAnchor(null)}>
            <MenuItem component={RouterLink} to="/catalogo" onClick={() => setMenuAnchor(null)}>
              Catálogo
            </MenuItem>
            <MenuItem component={RouterLink} to="/puntos-venta" onClick={() => setMenuAnchor(null)}>
              Puntos de venta
            </MenuItem>
            <MenuItem component={RouterLink} to="/datos-emisor" onClick={() => setMenuAnchor(null)}>
              Datos del emisor
            </MenuItem>
          </Menu>
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
