import type {
  Activity, ActivityLog, AttendanceRecord, BankAccount, BusinessDocument, Candidate, ChatGroup, Contract,
  Conversation, CredentialAuditEvent, Customer, Device, Employee, EmployeeContract, EmploymentCompensation, Expense, Goal, Invoice,
  FileFolder, Installment, JobOpening, Lead, LeadActivity, LeadContractVersion, LeadProposalVersion, LeaveRequest, Meeting,
  Message, Mission, MonitoringAlert, MonitoringAuditEvent, MonitoringGrant, MonitoringSession, NotificationItem,
  Payment, PayrollRecord, PerformancePointEvent, PerformancePeriod, PerformancePointReason, PersonnelEvent,
  Product, Project, ProjectAccess, ProjectActivity, ProjectEvent, ProjectMember, ProjectNote, ProjectPhase,
  ProjectRole, ProjectRoleTemplate, ProjectSale, Proposal, ScreenshotPreview, Supplier, Task, TaskLabel, Ticket,
  TimesheetEntry, User,
} from '../types/index.ts';
import { ApiRepository } from './apiRepository.ts';
import * as data from './runtimeData.ts';
import { normalizeBusinessDocument } from '../utils/document.ts';

const apiEntity = <T extends { id: string }>(value: Record<string, unknown>, previous?: T): T => ({
  ...(previous ?? {}),
  ...value,
  id: String(value.id ?? previous?.id ?? ''),
} as T);

const api = <T extends { id: string }>(resource: string, cache: T[]) => new ApiRepository<T>({
  resource,
  cache,
  fromApi: (value, previous) => apiEntity<T>(value, previous),
});

const legacyApi = <T extends { id: string }>(resource: string, cache: T[]) => api<T>(`data/${resource}`, cache);

export const customerRepository = legacyApi<Customer>('customers', data.customers);
export const projectRepository = api<Project>('projects', data.projects);
export const taskRepository = api<Task>('tasks', data.tasks);
export const timesheetRepository = legacyApi<TimesheetEntry>('timesheets', data.timesheets);
export const notificationRepository = legacyApi<NotificationItem>('notifications', data.notifications);
export const ticketRepository = legacyApi<Ticket>('tickets', data.tickets);
export const invoiceRepository = legacyApi<Invoice>('invoices', data.invoices);
export const paymentRepository = legacyApi<Payment>('payments', data.payments);
export const contractRepository = legacyApi<Contract>('contracts', data.contracts);
export const employeeRepository = api<Employee>('employees', data.employees);
export const jobOpeningRepository = legacyApi<JobOpening>('job-openings', data.jobOpenings);
export const candidateRepository = legacyApi<Candidate>('recruitment-candidates-v2', data.candidates);
export const payrollRepository = legacyApi<PayrollRecord>('payroll', data.payroll);
export const userRepository = api<User>('users', data.users);
export const credentialAuditRepository = legacyApi<CredentialAuditEvent>('credential-audit-events', data.credentialAuditEvents);
export const performanceEventRepository = api<PerformancePointEvent>('performance/events', data.performanceEvents);
export const meetingRepository = api<Meeting>('meetings', data.meetings);
export const documentRepository = new ApiRepository<BusinessDocument>({
  resource: 'data/documents-v2',
  cache: data.businessDocuments,
  fromApi: normalizeBusinessDocument,
});
export const leadRepository = legacyApi<Lead>('leads', data.leads);
export const leadActivityRepository = legacyApi<LeadActivity>('lead-activities', data.leadActivities);
export const leadProposalVersionRepository = legacyApi<LeadProposalVersion>('lead-proposal-versions', data.leadProposalVersions);
export const leadContractVersionRepository = legacyApi<LeadContractVersion>('lead-contract-versions', data.leadContractVersions);
export const proposalRepository = legacyApi<Proposal>('proposals', data.proposals);
export const productRepository = legacyApi<Product>('products', data.products);
export const installmentRepository = legacyApi<Installment>('installments', data.installments);
export const expenseRepository = legacyApi<Expense>('expenses', data.expenses);
export const fileFolderRepository = legacyApi<FileFolder>('file-folders', data.fileFolders);
export const supplierRepository = legacyApi<Supplier>('suppliers', data.suppliers);
export const projectEventRepository = api<ProjectEvent>('project-events', data.projectEvents);
export const projectMemberRepository = legacyApi<ProjectMember>('project-members', data.projectMembers);
export const projectRoleTemplateRepository = legacyApi<ProjectRoleTemplate>('project-role-templates', data.projectRoleTemplates);
export const projectRoleRepository = legacyApi<ProjectRole>('project-roles', data.projectRoles);
export const projectActivityRepository = legacyApi<ProjectActivity>('project-activities', data.projectActivities);
export const projectAccessRepository = legacyApi<ProjectAccess>('project-accesses', data.projectAccesses);
export const taskLabelRepository = legacyApi<TaskLabel>('task-labels', data.taskLabels);
export const goalRepository = legacyApi<Goal>('goals', data.goals);
export const performancePeriodRepository = api<PerformancePeriod>('performance/periods', data.performancePeriods);
export const personnelEventRepository = legacyApi<PersonnelEvent>('personnel-events', data.personnelEvents);
export const employeeContractRepository = legacyApi<EmployeeContract>('employee-contracts', data.employeeContracts);
export const compensationRepository = legacyApi<EmploymentCompensation>('compensations', data.employmentCompensations);
export const projectPhaseRepository = legacyApi<ProjectPhase>('project-phases', data.projectPhases);
export const projectNoteRepository = legacyApi<ProjectNote>('project-notes', data.projectNotes);
export const projectSaleRepository = legacyApi<ProjectSale>('project-sales', data.projectSales);
export const deviceRepository = legacyApi<Device>('devices', data.devices);
export const monitoringSessionRepository = legacyApi<MonitoringSession>('monitoring-sessions', data.sessions);
export const screenshotRepository = legacyApi<ScreenshotPreview>('screenshots', data.screenshots);
export const monitoringGrantRepository = legacyApi<MonitoringGrant>('monitoring-grants', data.monitoringGrants);
export const monitoringAlertRepository = legacyApi<MonitoringAlert>('monitoring-alerts', data.monitoringAlerts);
export const monitoringAuditRepository = legacyApi<MonitoringAuditEvent>('monitoring-audit', data.monitoringAudit);
export const activityRepository = legacyApi<Activity>('activities', data.activities);
export const activityLogRepository = legacyApi<ActivityLog>('activity-logs', data.activityLogs);
export const bankAccountRepository = legacyApi<BankAccount>('bank-accounts', data.bankAccounts);
export const attendanceRepository = new ApiRepository<AttendanceRecord>({
  resource: 'data/attendance', cache: data.attendance,
  fromApi: (value, previous) => {
    const workedMinutes = Number(value.workedMinutes ?? previous?.workedMinutes ?? 0);
    const clockLabel = (clock: unknown) => typeof clock === 'string' && clock
      ? new Date(clock).toLocaleTimeString('fa-IR', { hour: '2-digit', minute: '2-digit' })
      : undefined;
    return apiEntity<AttendanceRecord>({
      ...value, hours: workedMinutes / 60, checkIn: clockLabel(value.clockIn), checkOut: clockLabel(value.clockOut),
    }, previous);
  },
});
export const leaveRequestRepository = legacyApi<LeaveRequest>('leave-requests', data.leaveRequests);
export const missionRepository = legacyApi<Mission>('missions', data.missions);
export const performanceReasonRepository = legacyApi<PerformancePointReason>('performance-reasons', data.performanceReasons);
export const conversationRepository = legacyApi<Conversation>('conversations', data.conversations);
export const chatGroupRepository = legacyApi<ChatGroup>('chat-groups', data.chatGroups);
export const messageRepository = legacyApi<Message>('messages', data.messages);

export * from './runtimeData.ts';
