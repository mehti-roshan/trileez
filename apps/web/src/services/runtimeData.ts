import type {
  Activity, ActivityLog, AttendanceRecord, BankAccount, BusinessDocument, Candidate, ChatGroup, Contract,
  Conversation, CredentialAuditEvent, Customer, Device, Employee, EmployeeContract, EmploymentCompensation, Expense, Goal, Invoice,
  FileFolder, Installment, JobOpening, Lead, LeadActivity, LeadContractVersion, LeadProposalVersion, LeaveRequest, Meeting,
  Message, Mission, MonitoringAlert, MonitoringAuditEvent, MonitoringGrant, MonitoringSession, NotificationItem,
  Payment, PayrollRecord, PerformancePeriod, PerformancePointEvent, PerformancePointReason, PersonnelEvent,
  Product, Project, ProjectAccess, ProjectActivity, ProjectEvent, ProjectMember, ProjectNote, ProjectPhase,
  ProjectRole, ProjectRoleTemplate, ProjectSale, Proposal, ScreenshotPreview, Supplier, Task, TaskLabel, Ticket,
  TimesheetEntry, User,
} from '../types/index.ts';

/**
 * Transitional read-through caches populated exclusively from API responses.
 * They intentionally start empty and must never be seeded from browser mock data.
 * Legacy pages can keep array-based lookups while MongoDB remains authoritative.
 */
export const activities: Activity[] = [];
export const activityLogs: ActivityLog[] = [];
export const attendance: AttendanceRecord[] = [];
export const bankAccounts: BankAccount[] = [];
export const businessDocuments: BusinessDocument[] = [];
export const candidates: Candidate[] = [];
export const chatGroups: ChatGroup[] = [];
export const contracts: Contract[] = [];
export const conversations: Conversation[] = [];
export const credentialAuditEvents: CredentialAuditEvent[] = [];
export const customers: Customer[] = [];
export const devices: Device[] = [];
export const employees: Employee[] = [];
export const employeeContracts: EmployeeContract[] = [];
export const employmentCompensations: EmploymentCompensation[] = [];
export const expenses: Expense[] = [];
export const fileFolders: FileFolder[] = [];
export const goals: Goal[] = [];
export const installments: Installment[] = [];
export const invoices: Invoice[] = [];
export const jobOpenings: JobOpening[] = [];
export const leadActivities: LeadActivity[] = [];
export const leadContractVersions: LeadContractVersion[] = [];
export const leadProposalVersions: LeadProposalVersion[] = [];
export const leads: Lead[] = [];
export const leaveRequests: LeaveRequest[] = [];
export const meetings: Meeting[] = [];
export const messages: Message[] = [];
export const missions: Mission[] = [];
export const monitoringAlerts: MonitoringAlert[] = [];
export const monitoringAudit: MonitoringAuditEvent[] = [];
export const monitoringGrants: MonitoringGrant[] = [];
export const notifications: NotificationItem[] = [];
export const payments: Payment[] = [];
export const payroll: PayrollRecord[] = [];
export const performanceEvents: PerformancePointEvent[] = [];
export const performancePeriods: PerformancePeriod[] = [];
export const performanceReasons: PerformancePointReason[] = [];
export const personnelEvents: PersonnelEvent[] = [];
export const products: Product[] = [];
export const projectAccesses: ProjectAccess[] = [];
export const projectActivities: ProjectActivity[] = [];
export const projectEvents: ProjectEvent[] = [];
export const projectMembers: ProjectMember[] = [];
export const projectNotes: ProjectNote[] = [];
export const projectPhases: ProjectPhase[] = [];
export const projectRoles: ProjectRole[] = [];
export const projectRoleTemplates: ProjectRoleTemplate[] = [];
export const projects: Project[] = [];
export const projectSales: ProjectSale[] = [];
export const proposals: Proposal[] = [];
export const screenshots: ScreenshotPreview[] = [];
export const sessions: MonitoringSession[] = [];
export const suppliers: Supplier[] = [];
export const taskLabels: TaskLabel[] = [];
export const tasks: Task[] = [];
export const tickets: Ticket[] = [];
export const timesheets: TimesheetEntry[] = [];
export const users: User[] = [];
