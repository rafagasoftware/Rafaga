import { Navigate, Route, Routes } from 'react-router-dom';
import { AdminRoute, ProtectedRoute } from './auth/ProtectedRoute';
import { Layout } from './components/Layout';
import { AceptarInvitacionPage } from './pages/AceptarInvitacionPage';
import { AdminInvitarClientePage } from './pages/AdminInvitarClientePage';
import { ClientesPage } from './pages/ClientesPage';
import { InicioPage } from './pages/InicioPage';
import { LoginPage } from './pages/LoginPage';

function App() {
  return (
    <Routes>
      <Route path="/login" element={<LoginPage />} />
      <Route path="/aceptar-invitacion" element={<AceptarInvitacionPage />} />

      <Route element={<ProtectedRoute />}>
        <Route element={<Layout />}>
          <Route path="/" element={<InicioPage />} />
          <Route path="/clientes" element={<ClientesPage />} />

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
