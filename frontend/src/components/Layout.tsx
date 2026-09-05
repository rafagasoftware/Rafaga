import BusinessOutlinedIcon from '@mui/icons-material/BusinessOutlined';
import HomeOutlinedIcon from '@mui/icons-material/HomeOutlined';
import Inventory2OutlinedIcon from '@mui/icons-material/Inventory2Outlined';
import LabelOutlinedIcon from '@mui/icons-material/LabelOutlined';
import LogoutOutlinedIcon from '@mui/icons-material/LogoutOutlined';
import PeopleAltOutlinedIcon from '@mui/icons-material/PeopleAltOutlined';
import PersonAddAltOutlinedIcon from '@mui/icons-material/PersonAddAltOutlined';
import ReceiptLongOutlinedIcon from '@mui/icons-material/ReceiptLongOutlined';
import StorefrontOutlinedIcon from '@mui/icons-material/StorefrontOutlined';
import {
  Box,
  Container,
  Divider,
  Drawer,
  List,
  ListItemButton,
  ListItemIcon,
  ListItemText,
  Typography,
} from '@mui/material';
import { alpha } from '@mui/material/styles';
import type { ReactNode } from 'react';
import { Link as RouterLink, Outlet, useLocation } from 'react-router-dom';
import { useAuth } from '../auth/AuthContext';
import { supabase } from '../lib/supabaseClient';

const DRAWER_WIDTH = 260;

interface NavItem {
  label: string;
  to: string;
  icon: ReactNode;
}

const NAV_PRINCIPAL: NavItem[] = [
  { label: 'Inicio', to: '/', icon: <HomeOutlinedIcon fontSize="small" /> },
  { label: 'Clientes', to: '/clientes', icon: <PeopleAltOutlinedIcon fontSize="small" /> },
  { label: 'Grupos', to: '/grupos', icon: <LabelOutlinedIcon fontSize="small" /> },
  { label: 'Facturas', to: '/facturas', icon: <ReceiptLongOutlinedIcon fontSize="small" /> },
];

const NAV_CONFIGURACION: NavItem[] = [
  { label: 'Catálogo', to: '/catalogo', icon: <Inventory2OutlinedIcon fontSize="small" /> },
  { label: 'Puntos de venta', to: '/puntos-venta', icon: <StorefrontOutlinedIcon fontSize="small" /> },
  { label: 'Datos del emisor', to: '/datos-emisor', icon: <BusinessOutlinedIcon fontSize="small" /> },
];

function NavList({ items, activePath }: { items: NavItem[]; activePath: string }) {
  return (
    <List disablePadding>
      {items.map((item) => {
        const activo = item.to === '/' ? activePath === '/' : activePath.startsWith(item.to);
        return (
          <ListItemButton
            key={item.to}
            component={RouterLink}
            to={item.to}
            selected={activo}
            sx={{
              borderLeft: '3px solid',
              borderLeftColor: activo ? 'primary.main' : 'transparent',
              px: 2,
              '&.Mui-selected': {
                bgcolor: (theme) => alpha(theme.palette.primary.main, 0.08),
              },
              '&.Mui-selected:hover': {
                bgcolor: (theme) => alpha(theme.palette.primary.main, 0.12),
              },
            }}
          >
            <ListItemIcon sx={{ minWidth: 36, color: activo ? 'primary.main' : 'text.secondary' }}>{item.icon}</ListItemIcon>
            <ListItemText
              primary={item.label}
              slotProps={{
                primary: { sx: { fontWeight: activo ? 600 : 400, color: activo ? 'primary.main' : 'text.primary' } },
              }}
            />
          </ListItemButton>
        );
      })}
    </List>
  );
}

export function Layout() {
  const { isAdmin } = useAuth();
  const location = useLocation();

  return (
    <Box sx={{ display: 'flex', minHeight: '100vh' }}>
      <Drawer
        variant="permanent"
        sx={{
          width: DRAWER_WIDTH,
          flexShrink: 0,
          '& .MuiDrawer-paper': {
            width: DRAWER_WIDTH,
            boxSizing: 'border-box',
            borderRight: '1px solid',
            borderColor: 'divider',
            display: 'flex',
            flexDirection: 'column',
          },
        }}
      >
        <Typography
          variant="h5"
          component={RouterLink}
          to="/"
          sx={{ color: 'text.primary', textDecoration: 'none', px: 3, py: 2.5 }}
        >
          Rafaga
        </Typography>
        <Divider />

        <Box sx={{ py: 1 }}>
          <NavList items={NAV_PRINCIPAL} activePath={location.pathname} />
        </Box>

        <Divider />

        <Box sx={{ py: 1 }}>
          <Typography variant="caption" color="text.secondary" sx={{ px: 2, letterSpacing: '.05em' }}>
            CONFIGURACIÓN
          </Typography>
          <NavList items={NAV_CONFIGURACION} activePath={location.pathname} />
        </Box>

        <Box sx={{ flexGrow: 1 }} />

        <Divider />
        <List disablePadding sx={{ py: 1 }}>
          {isAdmin && (
            <ListItemButton component={RouterLink} to="/admin/invitar" sx={{ px: 2 }}>
              <ListItemIcon sx={{ minWidth: 36 }}>
                <PersonAddAltOutlinedIcon fontSize="small" />
              </ListItemIcon>
              <ListItemText primary="Invitar cliente" />
            </ListItemButton>
          )}
          <ListItemButton onClick={() => supabase.auth.signOut()} sx={{ px: 2 }}>
            <ListItemIcon sx={{ minWidth: 36 }}>
              <LogoutOutlinedIcon fontSize="small" />
            </ListItemIcon>
            <ListItemText primary="Cerrar sesión" />
          </ListItemButton>
        </List>
      </Drawer>

      <Box component="main" sx={{ flexGrow: 1, bgcolor: 'background.default', minWidth: 0 }}>
        <Container maxWidth="lg" sx={{ py: 5 }}>
          <Outlet />
        </Container>
      </Box>
    </Box>
  );
}
