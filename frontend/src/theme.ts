import { createTheme } from '@mui/material/styles';

// Paleta y tipografía definidas en proyecto.md: fondo claro, texto casi
// negro, un único acento (azul acero), esquinas rectas, sin sombras
// pesadas, tipografía condensada en títulos.
export const theme = createTheme({
  palette: {
    mode: 'light',
    background: { default: '#F4F6F7', paper: '#FFFFFF' },
    text: { primary: '#1B1F23', secondary: '#5B6670' },
    primary: { main: '#2F5F7C' },
    divider: '#D7DCE0',
    error: { main: '#A6403A' },
    success: { main: '#3A7D5C' },
    warning: { main: '#9C6B22' },
  },
  shape: { borderRadius: 2 },
  typography: {
    fontFamily: "'Outfit', system-ui, sans-serif",
    h1: { fontFamily: "'Barlow Condensed', sans-serif", fontWeight: 600 },
    h2: { fontFamily: "'Barlow Condensed', sans-serif", fontWeight: 600 },
    h3: { fontFamily: "'Barlow Condensed', sans-serif", fontWeight: 600 },
    h4: { fontFamily: "'Barlow Condensed', sans-serif", fontWeight: 600 },
    h5: { fontFamily: "'Barlow Condensed', sans-serif", fontWeight: 600 },
    h6: { fontFamily: "'Barlow Condensed', sans-serif", fontWeight: 600 },
    button: { textTransform: 'none', fontWeight: 600 },
  },
  components: {
    MuiButton: {
      defaultProps: { disableElevation: true },
      styleOverrides: {
        root: { minHeight: 44 },
      },
    },
    MuiPaper: {
      defaultProps: { elevation: 0 },
      styleOverrides: {
        root: { backgroundImage: 'none' },
      },
    },
    MuiAppBar: {
      defaultProps: { elevation: 0, color: 'default' },
      styleOverrides: {
        root: { borderBottom: '1px solid #D7DCE0' },
      },
    },
  },
});
