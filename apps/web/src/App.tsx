import { Navigate, Route, Routes } from 'react-router-dom';
import AppLayout from './components/layout/AppLayout.tsx';
import DashboardPage from './pages/DashboardPage.tsx';
import ProjectsPage from './pages/ProjectsPage.tsx';
import ProjectDetailPage from './pages/ProjectDetailPage.tsx';
import TasksPage from './pages/TasksPage.tsx';
import TaskDetailPage from './pages/TaskDetailPage.tsx';
import CustomersPage from './pages/CustomersPage.tsx';
import CustomerDetailPage from './pages/CustomerDetailPage.tsx';
import TicketsPage from './pages/TicketsPage.tsx';
import TicketDetailPage from './pages/TicketDetailPage.tsx';
import MonitoringPage from './pages/MonitoringPage.tsx';
import DevicesPage from './pages/DevicesPage.tsx';
import CalendarPage from './pages/CalendarPage.tsx';
import ReportsPage from './pages/ReportsPage.tsx';
import SettingsPage from './pages/SettingsPage.tsx';
import { ContractsPage, InvoiceDetailPage, InvoicesPage, InstallmentsPage, LeadsPage, PaymentsPage, ProductsPage, SalesOverviewPage } from './pages/BusinessPages.tsx';
import { ActivitiesPage, GoalsPage, TimesheetsPage } from './pages/SupplementalPages.tsx';
import { AnnouncementsPage, ExportsPage, KnowledgePage, NotificationPage, RemindersPage } from './pages/UtilityPages.tsx';
import { AttendancePage, EmployeeDetailPage, EmployeesPage, HRDashboardPage, LeavesPage, MissionsPage, PayrollPage, RecruitmentPage } from './pages/HRPages.tsx';
import { AccountingIntegrationPage, ExpensesPage, FinanceDashboardPage, FinanceReportsPage, ReceivablesPage, SuppliersPage } from './pages/FinancePages.tsx';
import { ChatPage, ProjectEventsPage, TaskLabelsPage } from './pages/AdvancedPages.tsx';
import { PerformanceDetailPage, PerformancePage } from './pages/PerformanceManagementPage.tsx';
import FileManagerPage from './pages/FileManagerPage.tsx';
import LeadDetailPage from './pages/LeadDetailPage.tsx';
import DocumentsPage from './pages/DocumentsPage.tsx';
import RecruitmentDetailPage from './pages/RecruitmentDetailPage.tsx';
import { MeetingDetailPage, MeetingsPage } from './pages/MeetingsPage.tsx';
import PayrollFinancePage from './pages/PayrollFinancePage.tsx';

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
        <Route path="/hr/payroll" element={<PayrollPage />} />
        <Route path="/hr/performance" element={<PerformancePage />} />
        <Route path="/hr/points" element={<Navigate to="/hr/performance" replace />} />
        <Route path="/hr/performance/:id" element={<PerformanceDetailPage />} />
        <Route path="/hr/documents" element={<Navigate to="/documents?section=hr" replace />} />
        <Route path="/hr/recruitment" element={<RecruitmentPage />} />
        <Route path="/hr/recruitment/:id" element={<RecruitmentDetailPage />} />
        <Route path="/projects" element={<ProjectsPage />} />
        <Route path="/projects/:id" element={<ProjectDetailPage />} />
        <Route path="/projects/:id/events" element={<ProjectEventsPage />} />
        <Route path="/project-events" element={<ProjectEventsPage />} />
        <Route path="/meetings" element={<MeetingsPage />} />
        <Route path="/meetings/:id" element={<MeetingDetailPage />} />
        <Route path="/tasks" element={<TasksPage />} />
        <Route path="/tasks/:id" element={<TaskDetailPage />} />
        <Route path="/tasks/labels" element={<TaskLabelsPage />} />
        <Route path="/customers" element={<CustomersPage />} />
        <Route path="/customers/:id" element={<CustomerDetailPage />} />
        <Route path="/leads" element={<LeadsPage />} />
        <Route path="/leads/:id" element={<LeadDetailPage />} />
        <Route path="/sales" element={<SalesOverviewPage />} />
        <Route path="/finance" element={<FinanceDashboardPage />} />
        <Route path="/finance/expenses" element={<ExpensesPage />} />
        <Route path="/finance/receivables" element={<ReceivablesPage />} />
        <Route path="/finance/bank-accounts" element={<Navigate to="/finance" replace />} />
        <Route path="/finance/suppliers" element={<SuppliersPage />} />
        <Route path="/finance/reports" element={<FinanceReportsPage />} />
        <Route path="/finance/payroll" element={<PayrollFinancePage />} />
        <Route path="/finance/accounting" element={<AccountingIntegrationPage />} />
        <Route path="/finance/hesabfa" element={<Navigate to="/finance/accounting" replace />} />
        <Route path="/invoices" element={<InvoicesPage />} />
        <Route path="/invoices/:id" element={<InvoiceDetailPage />} />
        <Route path="/payments" element={<PaymentsPage />} />
        <Route path="/products" element={<ProductsPage />} />
        <Route path="/contracts" element={<ContractsPage />} />
        <Route path="/installments" element={<InstallmentsPage />} />
        <Route path="/tickets" element={<TicketsPage />} />
        <Route path="/tickets/:id" element={<TicketDetailPage />} />
        <Route path="/calendar" element={<CalendarPage />} />
        <Route path="/goals" element={<GoalsPage />} />
        <Route path="/timesheets" element={<TimesheetsPage />} />
        <Route path="/knowledge" element={<KnowledgePage />} />
        <Route path="/documents" element={<DocumentsPage />} />
        <Route path="/chat" element={<ChatPage />} />
        <Route path="/reports" element={<ReportsPage />} />
        <Route path="/monitoring" element={<MonitoringPage />} />
        <Route path="/activities" element={<ActivitiesPage />} />
        <Route path="/media" element={<FileManagerPage />} />
        <Route path="/exports" element={<ExportsPage />} />
        <Route path="/announcements" element={<AnnouncementsPage />} />
        <Route path="/notifications" element={<NotificationPage />} />
        <Route path="/users" element={<Navigate to="/hr/employees" replace />} />
        <Route path="/devices" element={<DevicesPage />} />
        <Route path="/settings" element={<SettingsPage />} />
      </Route>
      <Route path="*" element={<Navigate to="/" replace />} />
    </Routes>
  );
}
