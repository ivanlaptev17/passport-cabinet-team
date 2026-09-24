import { BrowserRouter, Routes, Route, Navigate } from "react-router-dom";
import { AuthProvider, useAuth } from "../contexts/AuthContext";
import AuthPage from "../pages/AuthPage";
import DashboardPage from "../pages/DashboardPage";
import EmployeesPage from "../pages/EmployeesPage";
import OrganizationsPage from "../pages/OrganizationsPage";
import BuildingsPage from "../pages/BuildingsPage";
import StaffInfoPage from "../pages/StaffInfoPage";
import FinancePage from "../pages/FinancePage";
import ContingentPage from "../pages/ContingentPage";
import EducationPage from "../pages/EducationPage";
import CalendarPage from "../pages/CalendarPage";
import TasksPage from "../pages/TasksPage/index";
import TaskPage from "../pages/TaskPage/index";
import OrgAdminPage from "../pages/OrgAdminPage/index";
import DocumentsPage from "../pages/DocumentsPage/index";
import DocumentTemplatesPage from "../pages/DocumentTemplatesPage/index";
import ProfilePage from "../pages/ProfilePage/index";
import SettingsPage from "../pages/SettingsPage";

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
      <Route path="/" element={user ? <Navigate to="/dashboard" replace /> : <AuthPage />} />
      <Route path="/dashboard"    element={<AuthGuard element={<DashboardPage />} />} />
      <Route path="/employees"    element={<AuthGuard element={<EmployeesPage />} />} />
      <Route path="/organizations" element={<AuthGuard element={<OrganizationsPage />} />} />
      <Route path="/buildings"    element={<AuthGuard element={<BuildingsPage />} />} />
      <Route path="/staff-info"   element={<AuthGuard element={<StaffInfoPage />} />} />
      <Route path="/finance"      element={<AuthGuard element={<FinancePage />} />} />
      <Route path="/contingent"   element={<AuthGuard element={<ContingentPage />} />} />
      <Route path="/education"    element={<AuthGuard element={<EducationPage />} />} />
      <Route path="/calendar"     element={<AuthGuard element={<CalendarPage />} />} />
      <Route path="/tasks"        element={<AuthGuard element={<TasksPage />} />} />
      <Route path="/tasks/:taskId" element={<AuthGuard element={<TaskPage />} />} />
      <Route path="/org-admin"    element={<AuthGuard element={<OrgAdminPage />} />} />
      {/* Инциденты переехали в задачи — старые ссылки не роняем */}
      <Route path="/incidents"    element={<Navigate to="/tasks" replace />} />
      <Route path="/documents"    element={<AuthGuard element={<DocumentsPage />} />} />
      <Route path="/document-templates" element={<AuthGuard element={<DocumentTemplatesPage />} />} />
      <Route path="/profile"      element={<AuthGuard element={<ProfilePage />} />} />
      <Route path="/settings"     element={<AuthGuard element={<SettingsPage />} />} />
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
