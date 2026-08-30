export type UserRole = 'admin' | 'manager' | 'member';
export type UserStatus = 'online' | 'away' | 'offline';
export type TaskStatus = 'todo' | 'in_progress' | 'review' | 'done';
export type Priority = 'low' | 'medium' | 'high' | 'urgent';
export type ProjectStatus = 'active' | 'on_hold' | 'completed' | 'archived';
export type CustomerStatus = 'active' | 'inactive' | 'lead';
export type TicketStatus = 'open' | 'in_progress' | 'waiting' | 'closed';
export type DeviceStatus = 'online' | 'offline' | 'busy';
export type SessionStatus = 'pending' | 'active' | 'ended' | 'rejected';
export type TicketCategory = 'bug' | 'feature' | 'support' | 'other';

export interface User { id: string; name: string; email: string; role: UserRole; status: UserStatus; title: string; avatar?: string }
export interface Organization { id: string; name: string; slug: string }
export interface Project { id: string; code?: string; name: string; description: string; customerId: string; managerId: string; budget: number; status: ProjectStatus; progress: number; startDate: string; endDate: string; members: string[]; tasksCount: number; completedTasksCount: number; color: string; website?: string; instagram?: string; telegram?: string; about?: string; goals?: string; advantages?: string; competitors?: string; contactPhone?: string; officeAddress?: string; factoryAddress?: string; defaultChatGroupId?: string }
export interface ProjectMember { id: string; projectId: string; personId: string; role: string; status: 'active' | 'inactive'; joinedAt: string; leftAt?: string; hourlyCost?: number; responsibilities: string }
export interface TaskLabel { id: string; name: string; color: string; icon?: string }
export interface Task { id: string; title: string; description?: string; status: TaskStatus; priority: Priority; assigneeId: string; assigneeIds?: string[]; followerIds?: string[]; projectId: string; startDate?: string; dueDate: string; repeatEvery?: number; hourlyRate?: number; createdAt: string; updatedAt: string; tags: string[]; labelIds?: string[] }
export interface Customer { id: string; code?: string; name: string; company: string; email: string; phone: string; additionalPhones?: string[]; fax?: string; nationalCode?: string; country?: string; province?: string; city?: string; postalCode?: string; address?: string; website?: string; status: CustomerStatus; value: number; lastContact: string; assignedTo: string }
export interface Ticket { id: string; title: string; description: string; status: TicketStatus; priority: Priority; category: TicketCategory; assigneeId: string; reporterId: string; createdAt: string; updatedAt: string; tags: string[] }
export interface Device { id: string; name: string; userId: string; userName: string; os: string; osVersion: string; agentVersion: string; status: DeviceStatus; lastSeen: string; ipAddress: string; location: string; health: number }
export interface MonitoringSession { id: string; deviceId: string; operatorId: string; operatorName: string; status: SessionStatus; capabilities: string[]; consentMode: 'attended' | 'unattended'; startedAt?: string; endedAt?: string; duration?: number }
export interface ScreenshotPreview { id: string; deviceId: string; deviceName: string; capturedAt: string; label: string; tone: string }
export interface Activity { id: string; type: string; userId: string; userName: string; entityType: string; entityId: string; entityName: string; description: string; createdAt: string }
export interface NotificationItem { id: string; title: string; body: string; createdAt: string; read: boolean }
export type LeadStatus = 'new' | 'contacted' | 'qualified' | 'lost' | 'converted';
export type DocumentStatus = 'draft' | 'sent' | 'viewed' | 'approved' | 'rejected' | 'expired' | 'issued' | 'partial' | 'paid' | 'overdue' | 'cancelled';
export interface LineItem { productId: string; quantity: number; unitPrice: number; discount: number; tax: number }
export interface Lead { id: string; name: string; company: string; email: string; phone: string; estimatedValue: number; tags: string[]; assignedTo: string; status: LeadStatus; source: string; lastContactAt: string; nextFollowUpAt: string; notes: string; createdAt: string }
export interface Product { id: string; name: string; sku: string; category: string; type: 'نرم‌افزار' | 'خدمات' | 'پشتیبانی' | 'تجهیزات' | 'اشتراک' | 'سایر'; unit: string; price: number; taxRate: number; stock: number; active: boolean; updatedAt: string }
export interface SyncMeta { externalSystem?: 'hesabfa'; externalId?: string; syncStatus?: 'synced' | 'pending' | 'changed' | 'error'; lastSyncedAt?: string }
export interface Proposal extends SyncMeta { id: string; number: string; customerId: string; projectId?: string; title: string; amount: number; status: DocumentStatus; issuedAt: string; validUntil: string; ownerId: string; updatedAt: string; items: LineItem[]; relatedLeadId?: string }
export interface Invoice extends SyncMeta { id: string; number: string; customerId: string; projectId?: string; contractId?: string; proposalId?: string; amount: number; paidAmount: number; status: DocumentStatus; issuedAt: string; dueDate: string; items: LineItem[] }
export type PaymentMethod = 'انتقال بانکی' | 'کارت' | 'چک' | 'نقدی' | 'درگاه اینترنتی' | 'سایر';
export type PaymentStatus = 'ثبت شده' | 'در انتظار تایید' | 'تایید شده' | 'برگشت خورده';
export interface Payment extends SyncMeta { id: string; receiptNumber: string; customerId: string; invoiceId: string; projectId?: string; bankAccountId?: string; amount: number; method: PaymentMethod; paidAt: string; reference: string; status: PaymentStatus }
export interface Contract extends SyncMeta { id: string; number: string; customerId: string; projectId?: string; title: string; amount: number; startDate: string; endDate: string; status: 'draft' | 'pending' | 'active' | 'expiring' | 'expired' | 'terminated'; renewal: boolean; ownerId: string; paymentTerms: string }
export interface Installment { id: string; contractId: string; invoiceId: string; customerId: string; projectId?: string; number: number; dueDate: string; amount: number; paidAmount: number; status: 'future' | 'due' | 'partial' | 'paid' | 'overdue' }
export interface Supplier { id: string; name: string; contactName: string; phone: string; email: string; balance: number; type: 'supplier' | 'both' }
export interface BankAccount { id: string; bankName: string; label: string; maskedNumber: string; accountType: string; balance: number; status: 'active' | 'inactive' }
export interface Expense extends SyncMeta { id: string; title: string; category: string; projectId?: string; supplierId?: string; amount: number; date: string; status: 'paid' | 'pending' | 'approved'; paymentMethod: string; bankAccountId?: string; description: string }
export type ResaleStatus = 'identified' | 'following' | 'proposal' | 'negotiating' | 'won' | 'lost';
export interface ResaleOpportunity { id: string; customerId: string; productId: string; previousPurchase: string; opportunityTitle: string; estimatedValue: number; probability: number; assignedTo: string; status: ResaleStatus; nextFollowUp: string; notes: string; createdAt: string }
export type GoalStatus = 'in_progress' | 'completed' | 'overdue' | 'cancelled';
export interface Goal { id: string; title: string; ownerId: string; department: string; period: string; target: number; current: number; progress: number; status: GoalStatus; dueDate: string; description: string; createdAt: string }
export type TimesheetStatus = 'draft' | 'submitted' | 'approved' | 'rejected';
export interface TimesheetEntry { id: string; employeeId: string; projectId: string; taskId: string; date: string; hours: number; startTime?: string; endTime?: string; hourlyRate?: number; calculatedCost?: number; billable: boolean; description: string; status: TimesheetStatus; createdAt: string }
export interface ActivityLog { id: string; action: string; description: string; userId: string; timestamp: string; entityType: string; entityId: string; ip?: string; metadata?: string }
export type EmploymentStatus = 'active' | 'leave' | 'suspended' | 'terminated';
export type EmploymentType = 'full_time' | 'part_time' | 'project' | 'intern';
export interface Employee { id: string; personnelCode: string; fullName: string; phone: string; email: string; nationalId: string; jobTitle: string; department: string; managerId?: string; employmentType: EmploymentType; contractType: string; employmentStatus: EmploymentStatus; hireDate: string; workLocation: string; workMode: 'حضوری' | 'دورکاری' | 'ترکیبی'; salary: number; hourlyRate?: number; leaveBalance: number }
export type AttendanceStatus = 'present' | 'absent' | 'late' | 'leave' | 'mission' | 'remote';
export interface AttendanceRecord { id: string; employeeId: string; date: string; checkIn?: string; checkOut?: string; hours: number; status: AttendanceStatus }
export type LeaveType = 'annual' | 'sick' | 'unpaid' | 'hourly' | 'other';
export type LeaveStatus = 'pending' | 'approved' | 'rejected' | 'cancelled';
export interface LeaveRequest { id: string; employeeId: string; leaveType: LeaveType; startDate: string; endDate: string; days: number; reason: string; status: LeaveStatus; approverId: string; createdAt: string }
export type MissionStatus = 'pending' | 'approved' | 'in_progress' | 'completed' | 'rejected' | 'cancelled';
export interface Mission { id: string; employeeId: string; destination: string; purpose: string; startDate: string; endDate: string; days: number; estimatedCost: number; actualCost: number; status: MissionStatus; approverId: string; description: string }
export type ReviewStatus = 'pending' | 'in_progress' | 'completed';
export interface PerformanceReview { id: string; employeeId: string; reviewerId: string; period: string; overallScore: number; goalIds: string[]; strengths: string; improvements: string; managerComment: string; status: ReviewStatus; createdAt: string }
export interface EmployeeDocument { id: string; employeeId: string; name: string; type: string; uploadedAt: string; expiresAt?: string; status: 'valid' | 'expiring' | 'expired' | 'no_expiry'; fileSize: string }
export interface PayrollRecord { id: string; employeeId: string; month: string; baseSalary: number; overtime: number; benefits: number; deductions: number; tax: number; netSalary: number; status: 'draft' | 'approved' | 'paid'; paidAt?: string }
export interface JobOpening { id: string; title: string; department: string; employmentType: EmploymentType; openings: number; applicants: number; status: 'open' | 'paused' | 'filled' | 'closed'; postedAt: string }
export type CandidateStage = 'resume' | 'screening' | 'interview' | 'final' | 'offer' | 'hired' | 'rejected';
export interface Candidate { id: string; fullName: string; jobId: string; email: string; phone: string; stage: CandidateStage; score: number; ownerId: string; appliedAt: string }
export interface PerformancePeriod { id: string; employeeId: string; title: string; score: number; grade: 'A+' | 'A' | 'B' | 'C' | 'D' | 'E'; trend: 'up' | 'down' | 'flat'; startedAt: string; endedAt: string }
export interface PerformancePointReason { id: string; title: string; defaultPoints: number; direction: 'positive' | 'negative'; category: string }
export interface PerformancePointEvent { id: string; employeeId: string; reasonId: string; points: number; date: string; description: string; projectId?: string; createdBy: string }
export interface DocumentCategory { id: string; code: string; name: string; group: 'project' | 'customer' | 'contractor' | 'management' | 'general' | 'legal' }
export type SecretarySection = 'projects' | 'customers' | 'finance' | 'hr' | 'general';
export type SecretaryRecordType = 'incoming' | 'outgoing' | 'record';
export interface BusinessDocument { id: string; title: string; section?: SecretarySection; recordType?: SecretaryRecordType; projectId?: string; customerId?: string; employeeId?: string; categoryId: string; documentNumber: string; summary: string; senderId: string; recipientId?: string; followUpId?: string; dueDate?: string; status: 'draft' | 'open' | 'completed' | 'archived'; priority: 'low' | 'normal' | 'high'; tags: string[]; attachments: string[]; createdAt: string; updatedAt: string }
export interface Attachment { id: string; name: string; type: string; size: string; url?: string; uploadedBy?: string; uploadedAt?: string; source?: string; sourceId?: string; projectId?: string; customerId?: string; messageId?: string }
export interface Conversation { id: string; participantIds: string[]; title?: string; unreadCount: number; updatedAt: string; groupId?: string; projectId?: string }
export interface ChatGroup { id: string; name: string; projectId?: string; memberIds: string[]; isDefault?: boolean; createdAt: string }
export interface Message { id: string; conversationId: string; senderId: string; body: string; sentAt: string; read: boolean; attachments?: Attachment[] }
export interface ProjectEvent { id: string; projectId?: string; personId?: string; eventType: string; stage: 'ثبت شد' | 'در حال پیگیری' | 'انجام شد'; priority: 'عادی' | 'بالا' | 'بسیار بالا'; status: 'open' | 'completed'; date: string; registeredBy: string; description: string; result?: string; attachments?: string[] }
