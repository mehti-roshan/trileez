import { businessDocuments, candidates, contracts, customerUsers, customers, employees, individualCustomers, invoices, jobOpenings, notifications, payments, performanceEvents, projects, tasks, tickets, timesheets, leads, leadActivities, leadProposalVersions, leadContractVersions, proposals, products, installments, expenses, suppliers, projectEvents, projectMembers, projectRoles, projectRoleTemplates, projectActivities, projectAccesses, taskLabels, goals, performancePeriods, personnelEvents, employeeContracts, projectPhases, projectNotes, projectSales, payroll, users, wageRecords } from '../mock/data.ts';
import type { BusinessDocument, Candidate, Contract, Customer, Employee, Invoice, JobOpening, NotificationItem, Payment, PerformancePointEvent, Project, Task, Ticket, TimesheetEntry, Lead, LeadActivity, LeadProposalVersion, LeadContractVersion, Proposal, Product, Installment, Expense, Supplier, ProjectEvent, ProjectMember, ProjectRole, ProjectRoleTemplate, ProjectActivity, ProjectAccess, TaskLabel, Goal, PerformancePeriod, PersonnelEvent, EmployeeContract, ProjectPhase, ProjectNote, ProjectSale, PayrollRecord, User, WageRecord } from '../types/index.ts';
import { createMockRepository } from './mockRepository.ts';
import { normalizeCandidateWorkflow } from '../utils/recruitment.ts';

export const customerRepository = createMockRepository<Customer>('customers', customers);
if (typeof window !== 'undefined') {
  const migrationKey = 'trileez-individual-customer-seed-v1';
  try {
    if (!window.localStorage.getItem(migrationKey)) {
      individualCustomers.forEach((mockCustomer) => {
        if (!customerRepository.get(mockCustomer.id)) customerRepository.create(mockCustomer);
      });
      window.localStorage.setItem(migrationKey, 'done');
    }
  } catch {
    // Local storage is optional in the mock frontend.
  }
}
export const projectRepository = createMockRepository<Project>('projects', projects);
export const taskRepository = createMockRepository<Task>('tasks', tasks);
export const timesheetRepository = createMockRepository<TimesheetEntry>('timesheets', timesheets);
export const notificationRepository = createMockRepository<NotificationItem>('notifications', notifications);
export const ticketRepository = createMockRepository<Ticket>('tickets', tickets);
export const invoiceRepository = createMockRepository<Invoice>('invoices', invoices);
export const paymentRepository = createMockRepository<Payment>('payments', payments);
export const contractRepository = createMockRepository<Contract>('contracts', contracts);
export const employeeRepository = createMockRepository<Employee>('employees', employees);
export const jobOpeningRepository = createMockRepository<JobOpening>('job-openings', jobOpenings);
export const candidateRepository = createMockRepository<Candidate>('recruitment-candidates-v2', candidates);
if (typeof window !== 'undefined') {
  const workflowMigrationKey = 'trileez-recruitment-workflow-consistency-v1';
  try {
    if (!window.localStorage.getItem(workflowMigrationKey)) {
      candidateRepository.list().forEach((candidate) => {
        const workflow = normalizeCandidateWorkflow(candidate.stage, candidate.status);
        if (workflow.stage !== candidate.stage || workflow.status !== candidate.status) candidateRepository.update(candidate.id, workflow);
      });
      window.localStorage.setItem(workflowMigrationKey, 'done');
    }
  } catch {
    // Local storage is optional in the mock frontend.
  }
  const resumeMigrationKey = 'trileez-recruitment-resume-files-v1';
  try {
    if (!window.localStorage.getItem(resumeMigrationKey)) {
      candidateRepository.list().forEach((candidate) => {
        if (!candidate.resume || candidate.resume.url) return;
        const numericId = Number(candidate.id.match(/(\d+)$/)?.[1] ?? 1);
        candidateRepository.update(candidate.id, { resume: { ...candidate.resume, url: `/mock/resumes/resume-sample-${(numericId - 1) % 7 + 1}.pdf` } });
      });
      window.localStorage.setItem(resumeMigrationKey, 'done');
    }
  } catch {
    // Local storage is optional in the mock frontend.
  }
  const migrationKey = 'trileez-recruitment-meeting-reminders-v1';
  const reminderMeetings: Array<{ candidateId: string; id: string; date: string; result: Candidate['meetings'][number]['result'] }> = [
    { candidateId: 'candidate-1', id: 'candidate-reminder-today-1', date: '2026-09-13', result: 'pending_decision' },
    { candidateId: 'candidate-2', id: 'candidate-reminder-today-2', date: '2026-09-13', result: 'next_meeting_needed' },
    { candidateId: 'candidate-3', id: 'candidate-reminder-future-1', date: '2026-09-15', result: 'more_review_needed' },
    { candidateId: 'candidate-5', id: 'candidate-reminder-future-2', date: '2026-09-18', result: 'pending_decision' },
    { candidateId: 'candidate-7', id: 'candidate-reminder-future-3', date: '2026-09-22', result: 'next_meeting_needed' },
  ];
  try {
    if (!window.localStorage.getItem(migrationKey)) {
      reminderMeetings.forEach((seed) => {
        const candidate = candidateRepository.get(seed.candidateId);
        if (candidate && !candidate.meetings.some((meeting) => meeting.id === seed.id)) candidateRepository.update(candidate.id, { meetings: [...candidate.meetings, { id: seed.id, date: seed.date, result: seed.result }] });
      });
      window.localStorage.setItem(migrationKey, 'done');
    }
  } catch {
    // Local storage is optional in the mock frontend.
  }
}
export const payrollRepository = createMockRepository<PayrollRecord>('payroll', payroll);
export const userRepository = createMockRepository<User>('users', users);
if (typeof window !== 'undefined') {
  const migrationKey = 'trileez-customer-user-seed-v1';
  try {
    if (!window.localStorage.getItem(migrationKey)) {
      customerUsers.forEach((mockUser) => {
        const alreadyExists = userRepository.get(mockUser.id) || userRepository.list().some((user) => user.email.toLocaleLowerCase() === mockUser.email.toLocaleLowerCase());
        if (!alreadyExists) userRepository.create(mockUser);
      });
      window.localStorage.setItem(migrationKey, 'done');
    }
  } catch {
    // Local storage is optional in the mock frontend.
  }
}
export const wageRepository = createMockRepository<WageRecord>('wages', wageRecords);
export const performanceEventRepository = createMockRepository<PerformancePointEvent>('performance-events', performanceEvents);
// The v2 key intentionally isolates the canonical six-type document model from
// obsolete locally persisted secretary records with an incompatible shape.
export const documentRepository = createMockRepository<BusinessDocument>('documents-v2', businessDocuments);
// Proposal documents are customer-level records. Migrate any records persisted
// before this rule was introduced without discarding their other metadata.
documentRepository.list().filter((document) => document.documentType === 'proposal' && document.projectId).forEach((document) => {
  documentRepository.update(document.id, { projectId: undefined });
});
export const leadRepository = createMockRepository<Lead>('leads', leads);
export const leadActivityRepository = createMockRepository<LeadActivity>('lead-activities', leadActivities);
export const leadProposalVersionRepository = createMockRepository<LeadProposalVersion>('lead-proposal-versions', leadProposalVersions);
export const leadContractVersionRepository = createMockRepository<LeadContractVersion>('lead-contract-versions', leadContractVersions);
export const proposalRepository = createMockRepository<Proposal>('proposals', proposals);
export const productRepository = createMockRepository<Product>('products', products);
export const installmentRepository = createMockRepository<Installment>('installments', installments);
export const expenseRepository = createMockRepository<Expense>('expenses', expenses);
export const supplierRepository = createMockRepository<Supplier>('suppliers', suppliers);
export const projectEventRepository = createMockRepository<ProjectEvent>('project-events', projectEvents);
export const projectMemberRepository = createMockRepository<ProjectMember>('project-members', projectMembers);
export const projectRoleTemplateRepository = createMockRepository<ProjectRoleTemplate>('project-role-templates', projectRoleTemplates);
export const projectRoleRepository = createMockRepository<ProjectRole>('project-roles', projectRoles);
export const projectActivityRepository = createMockRepository<ProjectActivity>('project-activities', projectActivities);
export const projectAccessRepository = createMockRepository<ProjectAccess>('project-accesses', projectAccesses);
if (typeof window !== 'undefined') {
  const accessMigrationKey = 'trileez-project-access-free-text-v1';
  try {
    if (!window.localStorage.getItem(accessMigrationKey)) {
      projectAccessRepository.list().forEach((access) => {
        if (access.content?.trim()) return;
        const parts = [access.system, access.resource, access.username ? `username: ${access.username}` : '', access.secret ? `password: ${access.secret}` : '', access.permission].filter(Boolean);
        projectAccessRepository.update(access.id, { content: parts.join('، ') });
      });
      window.localStorage.setItem(accessMigrationKey, 'done');
    }
  } catch {
    // Local storage is optional in the mock frontend.
  }
  const migrationKey = 'trileez-project-execution-hierarchy-v1';
  try {
    if (!window.localStorage.getItem(migrationKey)) {
      projectMemberRepository.list().forEach((member) => {
        if (member.roleIds?.length) return;
        const matchingRole = projectRoleRepository.list().find((role) => role.projectId === member.projectId && role.name === member.role)
          ?? projectRoleRepository.list().find((role) => role.projectId === member.projectId);
        projectMemberRepository.update(member.id, { roleIds: matchingRole ? [matchingRole.id] : [] });
      });
      taskRepository.list().forEach((task) => {
        const assigneeIds = task.assigneeIds?.length ? task.assigneeIds : [task.assigneeId];
        assigneeIds.forEach((personId) => {
          if (projectMemberRepository.list().some((member) => member.projectId === task.projectId && member.personId === personId)) return;
          const role = projectRoleRepository.list().find((item) => item.projectId === task.projectId);
          projectMemberRepository.create({ id: `pm-${task.projectId}-${personId}`, projectId: task.projectId, personId, role: role?.name ?? 'عضو پروژه', roleIds: role ? [role.id] : [], status: 'active', joinedAt: task.createdAt, responsibilities: 'اجرای وظایف محول‌شده پروژه' });
        });
      });
      taskRepository.list().forEach((task) => {
        const assigneeIds = task.assigneeIds?.length ? task.assigneeIds : [task.assigneeId];
        const memberIds = projectMemberRepository.list().filter((member) => member.projectId === task.projectId && assigneeIds.includes(member.personId)).map((member) => member.id);
        const memberRoleIds = projectMemberRepository.list().filter((member) => memberIds.includes(member.id)).flatMap((member) => member.roleIds ?? []);
        const activity = projectActivityRepository.list().find((item) => item.projectId === task.projectId && memberRoleIds.includes(item.roleId));
        taskRepository.update(task.id, { assigneeMemberIds: memberIds, activityId: task.activityId ?? activity?.id });
      });
      window.localStorage.setItem(migrationKey, 'done');
    }
  } catch {
    // Local storage is optional in the mock frontend.
  }
}
export const taskLabelRepository = createMockRepository<TaskLabel>('task-labels', taskLabels);
export const goalRepository = createMockRepository<Goal>('goals', goals);
export const performancePeriodRepository = createMockRepository<PerformancePeriod>('performance-periods', performancePeriods);
export const personnelEventRepository = createMockRepository<PersonnelEvent>('personnel-events', personnelEvents);
export const employeeContractRepository = createMockRepository<EmployeeContract>('employee-contracts', employeeContracts);
export const projectPhaseRepository = createMockRepository<ProjectPhase>('project-phases', projectPhases);
export const projectNoteRepository = createMockRepository<ProjectNote>('project-notes', projectNotes);
export const projectSaleRepository = createMockRepository<ProjectSale>('project-sales', projectSales);
