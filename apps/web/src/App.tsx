import { Navigate, Route, Routes } from 'react-router-dom';
import AppLayout from './components/layout/AppLayout.tsx';
import DashboardPage from './pages/DashboardPage.tsx';
import ProjectsPage from './pages/ProjectsPage.tsx';
import ProjectDetailPage from './pages/ProjectDetailPage.tsx';
import TasksPage from './pages/TasksPage.tsx';
import CustomersPage from './pages/CustomersPage.tsx';
import TicketsPage from './pages/TicketsPage.tsx';
import MonitoringPage from './pages/MonitoringPage.tsx';
import DevicesPage from './pages/DevicesPage.tsx';
import UsersPage from './pages/UsersPage.tsx';
import CalendarPage from './pages/CalendarPage.tsx';
import ReportsPage from './pages/ReportsPage.tsx';
import SettingsPage from './pages/SettingsPage.tsx';
import { ContractsPage, InvoicesPage, InstallmentsPage, LeadsPage, PaymentsPage, ProductsPage, ProposalsPage, SalesOverviewPage } from './pages/BusinessPages.tsx';

export default function App() {
  return (
    <Routes>
      <Route element={<AppLayout />}>
        <Route path="/" element={<DashboardPage />} />
        <Route path="/projects" element={<ProjectsPage />} />
        <Route path="/projects/:id" element={<ProjectDetailPage />} />
        <Route path="/tasks" element={<TasksPage />} />
        <Route path="/customers" element={<CustomersPage />} />
        <Route path="/leads" element={<LeadsPage />} />
        <Route path="/sales" element={<SalesOverviewPage />} />
        <Route path="/proposals" element={<ProposalsPage />} />
        <Route path="/invoices" element={<InvoicesPage />} />
        <Route path="/payments" element={<PaymentsPage />} />
        <Route path="/products" element={<ProductsPage />} />
        <Route path="/contracts" element={<ContractsPage />} />
        <Route path="/installments" element={<InstallmentsPage />} />
        <Route path="/tickets" element={<TicketsPage />} />
        <Route path="/calendar" element={<CalendarPage />} />
        <Route path="/reports" element={<ReportsPage />} />
        <Route path="/monitoring" element={<MonitoringPage />} />
        <Route path="/users" element={<UsersPage />} />
        <Route path="/devices" element={<DevicesPage />} />
        <Route path="/settings" element={<SettingsPage />} />
      </Route>
      <Route path="*" element={<Navigate to="/" replace />} />
    </Routes>
  );
}
