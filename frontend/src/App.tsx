import { Navigate, Route, Routes } from 'react-router-dom';
import { AdminRoute, ProtectedRoute } from './auth/ProtectedRoute';
import { Layout } from './components/Layout';
import { AceptarInvitacionPage } from './pages/AceptarInvitacionPage';
import { AdminInvitarClientePage } from './pages/AdminInvitarClientePage';
import { CatalogoPage } from './pages/CatalogoPage';
import { ClientesPage } from './pages/ClientesPage';
import { DatosEmisorPage } from './pages/DatosEmisorPage';
import { FacturarWizardPage } from './pages/facturar/FacturarWizardPage';
import { FacturasPage } from './pages/FacturasPage';
import { InicioPage } from './pages/InicioPage';
import { LoginPage } from './pages/LoginPage';
import { PuntosVentaPage } from './pages/PuntosVentaPage';

function App() {
  return (
    <Routes>
      <Route path="/login" element={<LoginPage />} />
      <Route path="/aceptar-invitacion" element={<AceptarInvitacionPage />} />

      <Route element={<ProtectedRoute />}>
        <Route element={<Layout />}>
          <Route path="/" element={<InicioPage />} />
          <Route path="/clientes" element={<ClientesPage />} />
          <Route path="/catalogo" element={<CatalogoPage />} />
          <Route path="/puntos-venta" element={<PuntosVentaPage />} />
          <Route path="/datos-emisor" element={<DatosEmisorPage />} />
          <Route path="/facturar/:modo" element={<FacturarWizardPage />} />
          <Route path="/facturas" element={<FacturasPage />} />

          <Route element={<AdminRoute />}>
            <Route path="/admin/invitar" element={<AdminInvitarClientePage />} />
          </Route>
        </Route>
      </Route>

      <Route path="*" element={<Navigate to="/" replace />} />
    </Routes>
  );
}

export default App;
