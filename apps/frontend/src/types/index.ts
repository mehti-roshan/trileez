export type UserRole = 'admin' | 'manager' | 'member' | 'customer';
export type UserStatus = 'online' | 'away' | 'offline';
export type PermissionKey =
  | 'project:view' | 'project:create' | 'project:update'
  | 'task:view' | 'task:create' | 'task:update'
  | 'finance:view' | 'finance:pay'
  | 'hr:view' | 'hr:manage-users' | 'hr:manage-performance' | 'hr:reopen-performance'
  | 'reports:view' | 'document:view';
export interface PermissionOverrides { additions: PermissionKey[]; removals: PermissionKey[] }
export type TaskStatus = 'todo' | 'in_progress' | 'review' | 'done';
export type Priority = 'low' | 'medium' | 'high' | 'urgent';
export type ProjectStatus = 'active' | 'on_hold' | 'completed' | 'archived';
export type CustomerStatus = 'active' | 'inactive' | 'lead';
export type CustomerEntityType = 'company' | 'person';
export type TicketStatus = 'open' | 'in_progress' | 'waiting' | 'closed';
export type DeviceStatus = 'online' | 'offline' | 'busy';
export type SessionStatus = 'pending' | 'active' | 'ended' | 'rejected';
export type TicketCategory = 'bug' | 'feature' | 'support' | 'other';

export interface User { id: string; organizationId?: string; organizationName?: string; name: string; firstName?: string; lastName?: string; email: string; phone?: string; role: UserRole; status: UserStatus; isActive: boolean; title: string; customerId?: string; avatar?: string; permissionOverrides?: PermissionOverrides; credentialHash?: string }
export interface RoleDefinition { id: UserRole; label: string; permissions: PermissionKey[] }
export interface Organization { id: string; name: string; slug: string }
export interface FileFolder { id: string; name: string; parentId?: string; createdAt: string; deletedAt?: string }
export interface Project { id: string; code?: string; name: string; description: string; customerId: string; managerId: string; budget: number; grade: number; tags: string[]; status: ProjectStatus; progress: number; startDate: string; endDate: string; members: string[]; tasksCount: number; completedTasksCount: number; color: string; website?: string; instagram?: string; telegram?: string; about?: string; goals?: string; advantages?: string; competitors?: string; contactPhone?: string; officeAddress?: string; factoryAddress?: string; defaultChatGroupId?: string }
export interface ProjectRoleTemplate { id: string; name: string; description: string; responsibilities: string[]; objectives: string[]; requiredSkills: string[]; expectedHours: number; customerVisible: boolean }
export interface ProjectRole { id: string; projectId: string; templateId?: string; name: string; description: string; responsibilities: string[]; objectives: string[]; requiredSkills: string[]; expectedHours: number; customerVisible: boolean }
export interface ProjectActivity { id: string; projectId: string; roleId: string; title: string; description: string; objective?: string; expectedHours: number; customerVisible: boolean }
export interface ProjectMember { id: string; projectId: string; personId: string; role: string; roleIds: string[]; status: 'active' | 'inactive'; joinedAt: string; leftAt?: string; hourlyCost?: number; responsibilities: string }
export type ProjectAccessScope = 'project' | 'role' | 'person';
export type ProjectAccessStatus = 'granted' | 'revoked';
export type ProjectAccessKind = 'telegram' | 'credentials' | 'link' | 'other';
export interface ProjectAccess { id: string; projectId: string; content: string; kind?: ProjectAccessKind; system?: string; resource?: string; permission?: string; username?: string; secret?: string; scope: ProjectAccessScope; status: ProjectAccessStatus; roleId?: string; projectMemberId?: string; startDate?: string; expiryDate?: string; documentId?: string; notes: string; grantedBy: string; createdAt: string }
export interface TaskLabel { id: string; name: string; color: string; icon?: string }
export interface Task { id: string; title: string; description?: string; status: TaskStatus; priority: Priority; assigneeId: string; assigneeIds?: string[]; assigneeMemberIds?: string[]; followerIds?: string[]; projectId: string; phaseId?: string; activityId?: string; creatorId?: string; startDate?: string; dueDate: string; repeatEvery?: number; estimatedHours?: number; loggedHours?: number; hourlyRate?: number; customerVisible?: boolean; attachments?: string[]; createdAt: string; updatedAt: string; tags: string[]; labelIds?: string[] }
export interface Customer { id: string; code?: string; entityType: CustomerEntityType; name: string; company: string; email: string; phone: string; additionalPhones?: string[]; fax?: string; nationalCode?: string; vatRegistrationNumber?: string; groups: string[]; currency: string; country?: string; province?: string; city?: string; postalCode?: string; address?: string; website?: string; status: CustomerStatus; value: number; lastContact: string; assignedTo: string }
export interface TicketReply { id: string; ticketId: string; authorId: string; body: string; createdAt: string; customerVisible: boolean; attachments?: Attachment[] }
export interface TicketActivity { id: string; ticketId: string; type: string; description: string; actorId: string; createdAt: string }
export interface Ticket { id: string; title: string; description: string; status: TicketStatus; priority: Priority; category: TicketCategory; assigneeId: string; reporterId: string; projectId?: string; customerId?: string; contactName?: string; contactEmail?: string; contactPhone?: string; department?: string; service?: string; dueDate?: string; customerVisible?: boolean; createdAt: string; updatedAt: string; tags: string[]; replies?: TicketReply[]; activities?: TicketActivity[]; attachments?: Attachment[] }
export interface Device { id: string; name: string; userId: string; userName: string; os: string; osVersion: string; agentVersion: string; status: DeviceStatus; lastSeen: string; ipAddress: string; location: string; health: number }
export interface MonitoringSession { id: string; deviceId: string; operatorId: string; operatorName: string; subjectId?: string; status: SessionStatus; capabilities: string[]; consentMode: 'attended' | 'unattended'; startedAt?: string; endedAt?: string; duration?: number; reason?: string; projectId?: string; ticketId?: string; ip?: string; customerVisible?: boolean }
export interface ScreenshotPreview { id: string; deviceId: string; deviceName: string; employeeId?: string; projectId?: string; capturedAt: string; label: string; tone: string; application?: string; imageUrl?: string; customerVisible?: boolean; retentionDays?: number }
export type MonitoringGrantStatus = 'pending' | 'active' | 'expired' | 'revoked' | 'denied';
export interface MonitoringGrant { id: string; operatorId: string; subjectId: string; deviceId?: string; capabilities: string[]; consentMode: 'attended' | 'unattended' | 'denied'; startAt: string; expiresAt: string; status: MonitoringGrantStatus; reason: string; ticketId?: string; projectId?: string; customerVisible?: boolean; createdBy: string }
export interface MonitoringAlert { id: string; title: string; description: string; severity: 'low' | 'medium' | 'high' | 'critical'; status: 'open' | 'acknowledged' | 'resolved'; createdAt: string; deviceId?: string; employeeId?: string }
export interface MonitoringAuditEvent { id: string; event: string; actorId: string; actorName: string; target: string; timestamp: string; severity: 'info' | 'warning' | 'critical'; sessionId?: string; projectId?: string; ip?: string }
export interface Activity { id: string; type: string; userId: string; userName: string; entityType: string; entityId: string; entityName: string; description: string; createdAt: string }
export interface NotificationItem { id: string; title: string; body: string; createdAt: string; read: boolean; recipientId?: string; actorId?: string; type?: 'task_assigned' | 'performance' | 'system' | 'ticket' | 'chat' | 'project' | 'document' | 'finance'; entityType?: string; entityId?: string; taskId?: string; projectId?: string; ticketId?: string; conversationId?: string; documentId?: string; priority?: 'normal' | 'high' | 'urgent'; channel?: 'in_app' | 'sms' | 'email' | 'push'; smsStatus?: 'queued' | 'mock_sent' }
export type LeadStatus = 'active' | 'inactive' | 'new' | 'contacted' | 'qualified' | 'lost' | 'converted' | 'rejected';
export type LeadStage = 'new' | 'contact_attempt' | 'contacted' | 'initial_review' | 'qualified';
export type LeadActivityType = 'call' | 'meeting' | 'note' | 'email' | 'stage_changed' | 'status_changed' | 'follow_up';
export interface LeadActivity { id: string; leadId: string; type: LeadActivityType; title: string; description: string; occurredAt: string; actorId: string; metadata?: { from?: string; to?: string } }
export type LeadCommercialStatus = 'draft' | 'sent' | 'feedback' | 'finalized';
export interface LeadProposalVersion { id: string; leadId: string; version: number; title: string; status: LeadCommercialStatus; amount?: number; fileName?: string; fileType?: string; fileRecordId?: string; sentAt?: string; sentVia?: string; feedback?: string; createdAt: string; createdBy: string; finalizedAt?: string }
export interface LeadContractVersion { id: string; leadId: string; version: number; title: string; status: LeadCommercialStatus; amount?: number; fileName?: string; fileType?: string; fileRecordId?: string; sentAt?: string; sentVia?: string; feedback?: string; createdAt: string; createdBy: string; finalizedAt?: string }
export type DocumentStatus = 'draft' | 'sent' | 'viewed' | 'approved' | 'rejected' | 'expired' | 'issued' | 'partial' | 'paid' | 'overdue' | 'cancelled';
export interface LineItem { productId: string; quantity: number; unitPrice: number; discount: number; tax: number }
export interface Lead { id: string; name: string; company: string; email: string; phone: string; estimatedValue: number; tags: string[]; assignedTo: string; status: LeadStatus; source: string; referralContact?: string; referralDescription?: string; lastContactAt: string; nextFollowUpAt: string; notes: string; createdAt: string; firstName?: string; lastName?: string; phones?: { type: string; number: string }[]; emails?: { type: string; address: string }[]; address?: string; city?: string; province?: string; country?: string; postalCode?: string; companyId?: string; website?: string; stage?: LeadStage }
export interface Product { id: string; name: string; sku: string; category: string; type: 'نرم‌افزار' | 'خدمات' | 'پشتیبانی' | 'تجهیزات' | 'اشتراک' | 'سایر'; unit: string; price: number; taxRate: number; stock: number; active: boolean; updatedAt: string }
export interface SyncMeta { externalSystem?: string; externalId?: string; syncStatus?: 'synced' | 'pending' | 'changed' | 'error'; lastSyncedAt?: string }
export interface Proposal extends SyncMeta { id: string; number: string; customerId: string; projectId?: string; title: string; amount: number; status: DocumentStatus; issuedAt: string; validUntil: string; ownerId: string; updatedAt: string; items: LineItem[]; relatedLeadId?: string }
export interface Invoice extends SyncMeta { id: string; number: string; customerId: string; projectId?: string; contractId?: string; proposalId?: string; amount: number; paidAmount: number; status: DocumentStatus; issuedAt: string; dueDate: string; items: LineItem[] }
export type PaymentMethod = 'انتقال بانکی' | 'کارت' | 'چک' | 'نقدی' | 'درگاه اینترنتی' | 'سایر';
export type PaymentStatus = 'ثبت شده' | 'در انتظار تایید' | 'تایید شده' | 'برگشت خورده';
export interface Payment extends SyncMeta { id: string; receiptNumber: string; customerId: string; invoiceId: string; projectId?: string; bankAccountId?: string; amount: number; method: PaymentMethod; paidAt: string; reference: string; status: PaymentStatus }
export interface Contract extends SyncMeta { id: string; number: string; customerId: string; projectId?: string; title: string; amount: number; startDate: string; endDate: string; status: 'draft' | 'pending' | 'active' | 'expiring' | 'expired' | 'terminated'; renewal: boolean; ownerId: string; paymentTerms: string; /** Safe default is internal; API authorization must enforce this boundary. */ customerVisible?: boolean }
export interface Installment { id: string; contractId: string; invoiceId: string; customerId: string; projectId?: string; number: number; dueDate: string; amount: number; paidAmount: number; status: 'future' | 'due' | 'partial' | 'paid' | 'overdue' }
export interface Supplier { id: string; name: string; contactName: string; phone: string; email: string; balance: number; type: 'supplier' | 'both' }
export interface BankAccount { id: string; bankName: string; label: string; maskedNumber: string; accountType: string; balance: number; status: 'active' | 'inactive' }
export interface Expense extends SyncMeta { id: string; title: string; category: string; projectId?: string; supplierId?: string; amount: number; date: string; status: 'paid' | 'pending' | 'approved'; paymentMethod: string; bankAccountId?: string; description: string }
export type GoalStatus = 'in_progress' | 'completed' | 'overdue' | 'cancelled';
export interface Goal { id: string; title: string; ownerId: string; department: string; period: string; target: number; current: number; progress: number; status: GoalStatus; dueDate: string; description: string; createdAt: string }
export type TimesheetStatus = 'approved' | 'pending_review' | 'review_again' | 'suspended' | 'rejected';
export type TimesheetBillingStatus = 'paid' | 'purchase_invoice_registered' | 'purchase_invoice_queued' | 'payment_queued' | 'suspended';
export interface TimesheetEntry { id: string; employeeId: string; projectId: string; taskId: string; date: string; hours: number; startTime?: string; endTime?: string; hourlyRate?: number; calculatedCost?: number; billable: boolean; billingStatus?: TimesheetBillingStatus; customerVisible?: boolean; description: string; status: TimesheetStatus; reviewedBy?: string; reviewedAt?: string; reviewReason?: string; createdAt: string }
export interface ActivityLog { id: string; action: string; description: string; userId: string; timestamp: string; entityType: string; entityId: string; ip?: string; metadata?: string }
export type CredentialAuditAction = 'created' | 'generated' | 'reset';
export interface CredentialAuditEvent { id: string; userId: string; actorId: string; action: CredentialAuditAction; createdAt: string; deliveryMethod: 'one_time_admin_display'; }
export type EmploymentStatus = 'active' | 'leave' | 'suspended' | 'terminated';
export type EmploymentType = 'full_time' | 'part_time' | 'project' | 'intern';
export interface HourlyRateRecord { id: string; employeeId: string; hourlyRate: number; effectiveFrom: string; effectiveTo?: string; source?: string }
export type CompensationPaymentMethod = 'hourly_task' | 'full_time_attendance';
export interface Employee { id: string; userId?: string; personnelCode: string; fullName: string; phone: string; email: string; nationalId: string; jobTitle: string; department: string; managerId?: string; employmentType: EmploymentType; compensationType: CompensationPaymentMethod; contractType: string; employmentStatus: EmploymentStatus; hireDate: string; workLocation: string; workMode: 'حضوری' | 'دورکاری' | 'ترکیبی'; salary: number; hourlyRate?: number; hourlyRateHistory?: HourlyRateRecord[]; leaveBalance: number; hasGuarantee?: boolean; guaranteeAmount?: number }
export interface WorkScheduleDay { weekday: number; expectedMinutes: number }
export interface EmploymentCompensation { id: string; employeeId: string; paymentMethod: CompensationPaymentMethod; effectiveFrom: string; effectiveTo?: string; currency: string; payPeriod: 'monthly'; hourlyRate?: number; monthlySalary?: number; expectedSchedule: { timezone: string; days: WorkScheduleDay[]; weeklyExpectedMinutes: number }; overtimeEnabled: boolean; overtimeRateMultiplier: number; status: 'active' | 'inactive'; notes?: string }
export type AttendanceStatus = 'present' | 'absent' | 'late' | 'leave' | 'mission' | 'remote';
export interface AttendanceRecord { id: string; employeeId: string; compensationId?: string; date: string; clockIn?: string; clockOut?: string; checkIn?: string; checkOut?: string; hours: number; status: AttendanceStatus; approvalStatus?: 'pending' | 'approved' | 'rejected'; expectedMinutes?: number; workedMinutes?: number; regularMinutes?: number; overtimeMinutes?: number; absenceMinutes?: number; approvedLeaveMinutes?: number; leaveRequestId?: string; source?: 'manual' | 'clock'; notes?: string; approvedBy?: string; approvedAt?: string; rejectionReason?: string }
export type LeaveType = 'annual' | 'sick' | 'unpaid' | 'hourly' | 'other';
export type LeaveStatus = 'pending' | 'approved' | 'rejected' | 'cancelled';
export interface LeaveRequest { id: string; employeeId: string; leaveType: LeaveType; startDate: string; endDate: string; days: number; reason: string; status: LeaveStatus; approverId: string; createdAt: string }
export type MissionStatus = 'pending' | 'approved' | 'in_progress' | 'completed' | 'rejected' | 'cancelled';
export interface Mission { id: string; employeeId: string; destination: string; purpose: string; startDate: string; endDate: string; days: number; estimatedCost: number; actualCost: number; status: MissionStatus; approverId: string; description: string }
export type PayrollStatus = 'draft' | 'calculated' | 'reviewed' | 'approved' | 'paid';
export type PayrollSettlementMethod = 'bank_transfer' | 'cash' | 'cheque' | 'other';
export type AccountingSubmissionStatus = 'not_submitted' | 'queued' | 'submitted' | 'synced' | 'error';
export type PayrollAdjustmentType = 'adjustment_credit' | 'adjustment_debit' | 'bonus' | 'deduction';
export interface PayrollAdjustment { id: string; payrollId: string; employeeId: string; type: PayrollAdjustmentType; amount: number; reason: string; adjustmentDate: string; createdBy: string; createdAt?: string }
export interface PayrollTaskLine { timeEntryId: string; projectId: string; taskId: string; date: string; minutes: number; hourlyRate: number; amount: number }
export interface PayrollAttendanceLine { attendanceRecordId: string; date: string; status: string; clockIn?: string; clockOut?: string; expectedMinutes: number; workedMinutes: number; regularMinutes: number; overtimeMinutes: number; absenceMinutes: number; approvedLeaveMinutes: number }
export interface PayrollAdjustmentSnapshot { adjustmentId: string; type: PayrollAdjustmentType; amount: number; reason: string; adjustmentDate: string; createdBy: string }
export interface PayrollCompensationSnapshot { compensationId: string; paymentMethod: CompensationPaymentMethod; currency: string; payPeriod: string; hourlyRate?: number; monthlySalary?: number; overtimeEnabled: boolean; overtimeRateMultiplier: number; expectedSchedule?: { timezone?: string; weeklyExpectedMinutes?: number; days?: Array<{ weekday: number; expectedMinutes: number }> } }
export interface PayrollRecord { id: string; employeeId: string; compensationId?: string; paymentMethod?: CompensationPaymentMethod; month: string; periodStart?: string; periodEnd?: string; taskTimeMinutes?: number; attendanceMinutes?: number; payrollMinutes?: number; expectedMinutes?: number; regularMinutes?: number; overtimeMinutes?: number; absenceMinutes?: number; approvedLeaveMinutes?: number; baseSalary: number; workedHours?: number; hourlyRate?: number; overtime: number; overtimeHours?: number; benefits: number; adjustments?: number; deductions: number; tax: number; netSalary: number; grossBaseAmount?: number; overtimeAmount?: number; bonusAmount?: number; adjustmentCreditAmount?: number; adjustmentDebitAmount?: number; deductionAmount?: number; grossAmount?: number; finalPayableAmount?: number; compensationSnapshot?: PayrollCompensationSnapshot; taskLines?: PayrollTaskLine[]; attendanceLines?: PayrollAttendanceLine[]; adjustmentSnapshots?: PayrollAdjustmentSnapshot[]; calculationVersion?: number; status: PayrollStatus; calculatedAt?: string; calculatedBy?: string; reviewedAt?: string; reviewedBy?: string; approvedAt?: string; approvedBy?: string; paidAt?: string; paidBy?: string; paymentNote?: string; paymentRecordId?: string; paymentDocumentId?: string; paymentReference?: string; paymentDocumentNumber?: string; accountingSubmissionStatus?: AccountingSubmissionStatus }
export interface JobOpening { id: string; title: string; department: string; employmentType: EmploymentType; openings: number; applicants: number; status: 'open' | 'paused' | 'filled' | 'closed'; postedAt: string }
export type CandidateStage = 'resume_sent' | 'form_filling' | 'unavailable' | 'rejected_by_us' | 'rejected_by_candidate' | 'initial_meeting' | 'project_manager_intro' | 'secondary_meeting' | 'follow_up_call' | 'candidate_message' | 'project_mismatch' | 'no_response' | 'follow_up_again';
export type CandidateStatus = 'open' | 'closed' | 'lost' | 'pending' | 'selected' | 'terminated' | 'mismatch' | 'terminating';
export type CandidateSource = 'divar' | 'jobinja' | 'ponisha' | 'other';
export type CandidateLossReason = 'long_process' | 'other_reasons' | 'financial_mismatch' | 'work_conditions_mismatch' | 'poor_communication' | 'employed_elsewhere' | 'no_response';
export type CandidateMeetingResult = 'successful' | 'next_meeting_needed' | 'more_review_needed' | 'rejected' | 'no_show' | 'cancelled' | 'pending_decision' | 'selected';
export interface CandidateMeeting { id: string; date: string; result: CandidateMeetingResult }
export interface Candidate { id: string; fullName: string; jobId: string; email: string; phone: string; stage: CandidateStage; status: CandidateStatus; source: CandidateSource; otherSource?: string; lossReason?: CandidateLossReason; grade: number; ownerId: string; description: string; resume?: Attachment; meetings: CandidateMeeting[]; appliedAt: string; updatedAt: string }
export interface PerformancePeriod { id: string; employeeId: string; periodKey?: string; title: string; score: number; baselineScore?: number; adjustmentTotal?: number; eventIds?: string[]; grade: 'A+' | 'A' | 'B' | 'C' | 'D' | 'F'; trend: 'up' | 'down' | 'flat'; status?: 'open' | 'finalized'; evaluatedBy?: string; notes?: string; startedAt: string; endedAt: string; finalizedAt?: string | null; reopenedAt?: string; reopenedBy?: string; reopenReason?: string; version?: number }
export interface PerformancePointReason { id: string; title: string; defaultPoints: number; direction: 'positive' | 'negative'; category: string }
/** Append-only score adjustment. Employee score is derived from events and monthly snapshots. */
export interface PerformancePointEvent { id: string; employeeId: string; reason: string; category?: string; /** Legacy seed compatibility; new records use the free-text reason field. */ reasonId?: string; points: number; date: string; description: string; projectId?: string; taskId?: string; createdBy: string; createdAt?: string; attachmentId?: string }
export interface PersonnelEvent { id: string; employeeId: string; type: string; title: string; date: string; description: string; projectId?: string; createdBy: string; attachmentId?: string }
export interface EmployeeContract { id: string; employeeId: string; type: 'استخدام' | 'فریلنسری' | 'کارآموزی' | 'پیمانکاری' | 'پاره‌وقت' | 'تمام‌وقت'; startDate: string; endDate?: string; status: 'draft' | 'active' | 'expired' | 'terminated'; hourlyRate?: number; description: string; fileId?: string; signed: boolean }
export type BusinessDocumentType = 'proposal' | 'project_contract' | 'change_request' | 'employment_contract' | 'acceptance' | 'other';
export type BusinessDocumentStatus = 'draft' | 'sent' | 'submitted' | 'under_review' | 'approved' | 'active' | 'implemented' | 'accepted' | 'completed' | 'expired' | 'terminated' | 'rejected' | 'cancelled' | 'archived';
export type DocumentSection = 'projects' | 'customers' | 'finance' | 'hr' | 'general';
export interface BusinessDocument {
  id: string;
  documentType: BusinessDocumentType;
  title: string;
  documentNumber: string;
  summary: string;
  status: BusinessDocumentStatus;
  customerId?: string;
  projectId?: string;
  employeeId?: string;
  requestedById?: string;
  value?: number;
  validityDate?: string;
  startDate?: string;
  endDate?: string;
  requestDate?: string;
  requestedDate?: string;
  acceptedDate?: string;
  impactDescription?: string;
  position?: string;
  compensation?: number;
  deliverable?: string;
  notes?: string;
  attachments: string[];
  fileRecordIds?: string[];
  createdBy: string;
  createdAt: string;
  updatedAt: string;
  /** Safe default is internal; API authorization must enforce this boundary. */
  customerVisible?: boolean;
}
export interface Attachment { id: string; name: string; type: string; size: string; url?: string; uploadedBy?: string; uploadedAt?: string; source?: string; sourceId?: string; projectId?: string; customerId?: string; messageId?: string; /** Safe default is internal; API authorization must enforce this boundary. */ customerVisible?: boolean }
export interface ChatContact { id: string; name: string; title?: string; status?: UserStatus; employeeId?: string; personnelCode?: string; jobTitle?: string; department?: string }
export interface Conversation { id: string; participantIds: string[]; participantDetails?: ChatContact[]; title?: string; unreadCount: number; updatedAt: string; groupId?: string; projectId?: string }
export interface ChatGroup { id: string; name: string; projectId?: string; memberIds: string[]; isDefault?: boolean; createdAt: string }
export interface Message { id: string; conversationId: string; senderId: string; body: string; sentAt: string; read: boolean; readBy?: string[]; attachments?: Attachment[] }
export type MeetingStatus = 'scheduled' | 'completed' | 'cancelled';
export interface MeetingDocument { name: string; type: string; size: number; lastModified?: number; fileId?: string; objectKey?: string }
export interface Meeting { id: string; title: string; startAt: string; durationMinutes: number; status: MeetingStatus; organizerId: string; participantIds: string[]; projectId?: string; employeeIds?: string[]; /** Multiple departments may be represented in one meeting. */ departments?: string[]; /** Legacy single-department field retained for old records. */ department?: string; customerId?: string; location?: string; meetingLink?: string; agenda?: string; description?: string; discussionSummary?: string; notes?: string; decisions?: string; outcome?: string; actionItems?: string; followUpActions?: string; nextMeetingAt?: string; taskIds?: string[]; attachments?: string[]; meetingDocument?: MeetingDocument; createdBy: string; createdAt: string }
/** Significant, auditable lifecycle event for a project. */
export interface ProjectEvent { id: string; projectId?: string; personId?: string; taskId?: string; phaseId?: string; eventType: string; title?: string; stage: 'ثبت شد' | 'در حال پیگیری' | 'انجام شد'; priority: 'عادی' | 'بالا' | 'بسیار بالا'; status: 'open' | 'completed'; date: string; registeredBy: string; createdAt?: string; description: string; result?: string; attachments?: string[]; customerVisible?: boolean }
export interface ProjectPhase { id: string; projectId: string; title: string; status: 'planned' | 'in_progress' | 'completed' | 'on_hold'; startDate: string; endDate: string; progress: number; managerId: string; description: string; customerVisible?: boolean }
export interface ProjectNote { id: string; projectId: string; taskId?: string; title: string; body: string; authorId: string; category: string; customerVisible: boolean; createdAt: string }
export interface ProjectSale { id: string; projectId: string; customerId: string; title: string; amount: number; type: string; status: string; date: string; documentNumber: string }
