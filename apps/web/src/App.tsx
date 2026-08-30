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
import { ContractsPage, InvoiceDetailPage, InvoicesPage, InstallmentsPage, LeadsPage, PaymentsPage, ProductsPage, ProposalDetailPage, ProposalsPage, SalesOverviewPage } from './pages/BusinessPages.tsx';
import { ActivitiesPage, GoalsPage, ResalesPage, TimesheetsPage } from './pages/SupplementalPages.tsx';
import { AnnouncementsPage, ExportsPage, KnowledgePage, MediaPage, NotificationPage, RemindersPage } from './pages/UtilityPages.tsx';
import { AttendancePage, DocumentsPage, EmployeeDetailPage, EmployeesPage, HRDashboardPage, LeavesPage, MissionsPage, PayrollPage, PerformanceDetailPage, PerformancePage, RecruitmentPage } from './pages/HRPages.tsx';
import { BankAccountsPage, ExpensesPage, FinanceDashboardPage, FinanceReportsPage, HesabfaPage, ReceivablesPage, SuppliersPage } from './pages/FinancePages.tsx';
import { ChatPage, DocumentsRepositoryPage, PerformancePointsPage, ProjectEventsPage, TaskLabelsPage } from './pages/AdvancedPages.tsx';

export default function App() {
  return (
    <Routes>
      <Route element={<AppLayout />}>
        <Route path="/" element={<DashboardPage />} />
        <Route path="/reminders" element={<RemindersPage />} />
        <Route path="/hr" element={<HRDashboardPage />} />
        <Route path="/hr/employees" element={<EmployeesPage />} />
        <Route path="/hr/employees/:id" element={<EmployeeDetailPage />} />
        <Route path="/hr/attendance" element={<AttendancePage />} />
        <Route path="/hr/leaves" element={<LeavesPage />} />
        <Route path="/hr/missions" element={<MissionsPage />} />
        <Route path="/hr/performance" element={<PerformancePage />} />
        <Route path="/hr/points" element={<PerformancePointsPage />} />
        <Route path="/hr/performance/:id" element={<PerformanceDetailPage />} />
        <Route path="/hr/documents" element={<DocumentsPage />} />
        <Route path="/hr/payroll" element={<PayrollPage />} />
        <Route path="/hr/recruitment" element={<RecruitmentPage />} />
        <Route path="/projects" element={<ProjectsPage />} />
        <Route path="/projects/:id" element={<ProjectDetailPage />} />
        <Route path="/projects/:id/events" element={<ProjectEventsPage />} />
        <Route path="/project-events" element={<ProjectEventsPage />} />
        <Route path="/tasks" element={<TasksPage />} />
        <Route path="/tasks/labels" element={<TaskLabelsPage />} />
        <Route path="/customers" element={<CustomersPage />} />
        <Route path="/leads" element={<LeadsPage />} />
        <Route path="/resales" element={<ResalesPage />} />
        <Route path="/sales" element={<SalesOverviewPage />} />
        <Route path="/finance" element={<FinanceDashboardPage />} />
        <Route path="/finance/expenses" element={<ExpensesPage />} />
        <Route path="/finance/receivables" element={<ReceivablesPage />} />
        <Route path="/finance/bank-accounts" element={<BankAccountsPage />} />
        <Route path="/finance/suppliers" element={<SuppliersPage />} />
        <Route path="/finance/reports" element={<FinanceReportsPage />} />
        <Route path="/finance/hesabfa" element={<HesabfaPage />} />
        <Route path="/proposals" element={<ProposalsPage />} />
        <Route path="/proposals/:id" element={<ProposalDetailPage />} />
        <Route path="/invoices" element={<InvoicesPage />} />
        <Route path="/invoices/:id" element={<InvoiceDetailPage />} />
        <Route path="/payments" element={<PaymentsPage />} />
        <Route path="/products" element={<ProductsPage />} />
        <Route path="/contracts" element={<ContractsPage />} />
        <Route path="/installments" element={<InstallmentsPage />} />
        <Route path="/tickets" element={<TicketsPage />} />
        <Route path="/calendar" element={<CalendarPage />} />
        <Route path="/goals" element={<GoalsPage />} />
        <Route path="/timesheets" element={<TimesheetsPage />} />
        <Route path="/knowledge" element={<KnowledgePage />} />
        <Route path="/documents" element={<DocumentsRepositoryPage />} />
        <Route path="/chat" element={<ChatPage />} />
        <Route path="/reports" element={<ReportsPage />} />
        <Route path="/monitoring" element={<MonitoringPage />} />
        <Route path="/activities" element={<ActivitiesPage />} />
        <Route path="/media" element={<MediaPage />} />
        <Route path="/exports" element={<ExportsPage />} />
        <Route path="/announcements" element={<AnnouncementsPage />} />
        <Route path="/notifications" element={<NotificationPage />} />
        <Route path="/users" element={<UsersPage />} />
        <Route path="/devices" element={<DevicesPage />} />
        <Route path="/settings" element={<SettingsPage />} />
      </Route>
      <Route path="*" element={<Navigate to="/" replace />} />
    </Routes>
  );
}
