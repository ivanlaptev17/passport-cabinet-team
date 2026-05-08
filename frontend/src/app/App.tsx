import { BrowserRouter, Routes, Route, Navigate } from "react-router-dom";
import { AuthProvider, useAuth } from "../contexts/AuthContext";
import AuthPage from "../pages/AuthPage";
import DashboardPage from "../pages/DashboardPage";
import EmployeesPage from "../pages/EmployeesPage";
import OrganizationsPage from "../pages/OrganizationsPage";
import BuildingsPage from "../pages/BuildingsPage";

function AuthGuard({ element }: { element: React.ReactElement }) {
  const { user, loading } = useAuth();

  if (loading) {
    return (
      <div className="min-vh-100 d-flex align-items-center justify-content-center">
        <div className="spinner-border text-secondary" />
      </div>
    );
  }

  return user ? element : <Navigate to="/" replace />;
}

function AppRoutes() {
  const { user, loading } = useAuth();

  if (loading) {
    return (
      <div className="min-vh-100 d-flex align-items-center justify-content-center">
        <div className="spinner-border text-secondary" />
      </div>
    );
  }

  return (
    <Routes>
      {/* Если уже авторизован — сразу на дашборд */}
      <Route
        path="/"
        element={user ? <Navigate to="/dashboard" replace /> : <AuthPage />}
      />
      <Route path="/dashboard" element={<AuthGuard element={<DashboardPage />} />} />
      <Route path="/employees" element={<AuthGuard element={<EmployeesPage />} />} />
      <Route path="/organizations" element={<AuthGuard element={<OrganizationsPage />} />} />
      <Route path="/buildings" element={<AuthGuard element={<BuildingsPage />} />} />
      <Route path="*" element={<Navigate to="/dashboard" replace />} />
    </Routes>
  );
}

export default function App() {
  return (
    <BrowserRouter>
      <AuthProvider>
        <AppRoutes />
      </AuthProvider>
    </BrowserRouter>
  );
}
