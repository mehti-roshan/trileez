import mongoose from 'mongoose';
import { randomUUID } from 'node:crypto';
import { DEFAULT_ORGANIZATION_ID } from '../config/organizations.js';

const { Schema } = mongoose;
const timestamps = true;
const organizationId = { type: String, required: true, default: DEFAULT_ORGANIZATION_ID, index: true };
const stringId = { type: String, default: () => randomUUID() };

export const UserSchema = new Schema({
  organizationId,
  name: { type: String, required: true, trim: true }, firstName: String, lastName: String,
  email: { type: String, required: true, unique: true, lowercase: true, trim: true, index: true }, phone: String,
  role: { type: String, enum: ['admin', 'manager', 'member', 'customer'], default: 'member', index: true },
  status: { type: String, enum: ['online', 'away', 'offline'], default: 'offline' }, isActive: { type: Boolean, default: true },
  title: { type: String, default: 'همکار' }, customerId: String, avatar: String,
  permissionOverrides: { additions: { type: [String], default: [] }, removals: { type: [String], default: [] } },
  passwordHash: { type: String, required: true, select: false }, lastLoginAt: Date,
  mustChangePassword: { type: Boolean, default: false }, failedLoginAttempts: { type: Number, default: 0, min: 0 },
  lastFailedLoginAt: Date, lockoutUntil: Date, passwordChangedAt: Date,
}, { timestamps });
UserSchema.index({ organizationId: 1, role: 1, isActive: 1, name: 1 });
UserSchema.index({ organizationId: 1, customerId: 1 });

export const AuthSessionSchema = new Schema({
  _id: stringId, organizationId, userId: { type: String, required: true }, refreshTokenHash: { type: String, required: true },
  status: { type: String, enum: ['active', 'revoked'], default: 'active' }, expiresAt: { type: Date, required: true }, lastUsedAt: Date,
  revokedAt: Date, revokedReason: String, replacedBySessionId: String, ip: String, userAgent: String,
}, { timestamps });
AuthSessionSchema.index({ organizationId: 1, userId: 1, status: 1 });
AuthSessionSchema.index({ expiresAt: 1 }, { expireAfterSeconds: 0 });

export const PasswordResetTokenSchema = new Schema({
  _id: stringId, organizationId, userId: { type: String, required: true }, tokenHash: { type: String, required: true },
  expiresAt: { type: Date, required: true }, usedAt: Date, revokedAt: Date, requestedIp: String,
}, { timestamps });
PasswordResetTokenSchema.index({ organizationId: 1, userId: 1, createdAt: -1 });
PasswordResetTokenSchema.index({ expiresAt: 1 }, { expireAfterSeconds: 0 });

export const BackgroundJobSchema = new Schema({
  _id: stringId, organizationId,
  type: { type: String, required: true }, queue: { type: String, required: true, default: 'default' }, payload: { type: Schema.Types.Mixed, required: true, default: {} },
  status: { type: String, enum: ['queued', 'running', 'retry_wait', 'completed', 'failed', 'cancelled'], default: 'queued', required: true },
  priority: { type: Number, min: -100, max: 100, default: 0 }, runAt: { type: Date, required: true }, attempts: { type: Number, min: 0, default: 0 }, maxAttempts: { type: Number, min: 1, max: 20, default: 5 },
  idempotencyKey: String, lockedAt: Date, lockedBy: String, leaseExpiresAt: Date, lastError: String, result: Schema.Types.Mixed,
  createdBy: { type: String, required: true }, requestId: String, recurringTaskId: String, completedAt: Date, failedAt: Date, cancelledAt: Date,
}, { timestamps });
BackgroundJobSchema.index({ status: 1, runAt: 1, priority: -1, createdAt: 1 });
BackgroundJobSchema.index({ status: 1, leaseExpiresAt: 1 });
BackgroundJobSchema.index({ organizationId: 1, status: 1, createdAt: -1 });
BackgroundJobSchema.index({ organizationId: 1, type: 1, createdAt: -1 });
BackgroundJobSchema.index({ organizationId: 1, type: 1, idempotencyKey: 1 }, { unique: true, partialFilterExpression: { idempotencyKey: { $type: 'string' } } });

export const RecurringTaskSchema = new Schema({
  _id: stringId, organizationId, name: { type: String, required: true }, jobType: { type: String, required: true }, payload: { type: Schema.Types.Mixed, default: {} },
  enabled: { type: Boolean, default: true }, intervalMinutes: { type: Number, min: 1, max: 525600, required: true }, nextRunAt: { type: Date, required: true },
  lastEnqueuedAt: Date, lastScheduledFor: Date, createdBy: { type: String, required: true }, updatedBy: String,
  schedulerLockedBy: String, schedulerLockedAt: Date, schedulerLeaseExpiresAt: Date,
}, { timestamps });
RecurringTaskSchema.index({ organizationId: 1, name: 1 }, { unique: true });
RecurringTaskSchema.index({ enabled: 1, nextRunAt: 1 });
RecurringTaskSchema.index({ organizationId: 1, enabled: 1, nextRunAt: 1 });

export const EmployeeSchema = new Schema({
  organizationId,
  userId: { type: String, index: true }, personnelCode: { type: String, required: true }, fullName: { type: String, required: true },
  phone: String, email: String, nationalId: String, jobTitle: String, department: String, managerId: String,
  employmentType: { type: String, enum: ['full_time', 'part_time', 'project', 'intern'] }, employmentStatus: { type: String, enum: ['active', 'leave', 'suspended', 'terminated'], default: 'active' },
  compensationType: { type: String, enum: ['full_time_attendance', 'hourly_task'], required: true, index: true },
  hireDate: Date, workLocation: String, workMode: String, salary: Number, hourlyRate: Number, leaveBalance: Number,
  hasGuarantee: Boolean, guaranteeAmount: Number,
}, { timestamps });
EmployeeSchema.index({ organizationId: 1, personnelCode: 1 }, { unique: true });
EmployeeSchema.index({ organizationId: 1, userId: 1 }, { unique: true, sparse: true });
EmployeeSchema.index({ organizationId: 1, employmentStatus: 1, fullName: 1 });
EmployeeSchema.index({ organizationId: 1, compensationType: 1, employmentStatus: 1 });
EmployeeSchema.index({ organizationId: 1, managerId: 1 });

export const ProjectSchema = new Schema({
  organizationId, name: { type: String, required: true }, code: String, description: String, customerId: String, managerId: String,
  status: { type: String, enum: ['active', 'on_hold', 'completed', 'archived'], default: 'active' },
  progress: { type: Number, min: 0, max: 100, default: 0 }, startDate: Date, endDate: Date, members: [String],
  tasksCount: { type: Number, min: 0, default: 0 }, completedTasksCount: { type: Number, min: 0, default: 0 },
  plannedHours: { type: Number, min: 0, default: 0 }, estimatedHours: { type: Number, min: 0, default: 0 }, actualHours: { type: Number, min: 0, default: 0 },
  budget: Number, grade: Number, tags: [String], color: String, website: String, instagram: String, telegram: String, about: String,
  goals: String, advantages: String, competitors: String, contactPhone: String, officeAddress: String, factoryAddress: String, defaultChatGroupId: String,
}, { timestamps });
ProjectSchema.index({ organizationId: 1, customerId: 1 });
ProjectSchema.index({ organizationId: 1, code: 1 }, { unique: true, sparse: true });
ProjectSchema.index({ organizationId: 1, status: 1, createdAt: -1 });
ProjectSchema.index({ organizationId: 1, customerId: 1, status: 1 });
export const TaskSchema = new Schema({
  organizationId, title: { type: String, required: true }, description: String, projectId: { type: String, required: true, index: true },
  phaseId: String, activityId: String, assigneeId: String, assigneeIds: [String], assigneeMemberIds: [String], followerIds: [String], creatorId: String,
  status: { type: String, enum: ['todo', 'in_progress', 'review', 'done'], default: 'todo' }, priority: String, startDate: Date, dueDate: Date,
  repeatEvery: Number, estimatedHours: { type: Number, min: 0, default: 0 }, loggedHours: { type: Number, min: 0, default: 0 }, hourlyRate: Number,
  customerVisible: Boolean, attachments: [String], tags: [String], labelIds: [String], createdBy: String, updatedBy: String,
}, { timestamps });
TaskSchema.index({ organizationId: 1, projectId: 1 });
TaskSchema.index({ organizationId: 1, phaseId: 1 });
TaskSchema.index({ organizationId: 1, activityId: 1 });
TaskSchema.index({ organizationId: 1, projectId: 1, status: 1, createdAt: -1 });
TaskSchema.index({ organizationId: 1, assigneeId: 1, status: 1 });
TaskSchema.index({ organizationId: 1, projectId: 1, dueDate: 1 });

export const MeetingSchema = new Schema({
  organizationId,
  title: { type: String, required: true }, startAt: { type: Date, required: true }, durationMinutes: { type: Number, min: 5, max: 1440, required: true }, status: { type: String, enum: ['scheduled', 'completed', 'cancelled'], default: 'scheduled' },
  organizerId: { type: String, required: true }, participantIds: { type: [String], default: [] }, projectId: String, employeeIds: { type: [String], default: [] }, departments: { type: [String], default: [] }, customerId: String,
  location: String, meetingLink: String, agenda: String, description: String, discussionSummary: String, notes: String, decisions: String, outcome: String, actionItems: String, followUpActions: String, nextMeetingAt: Date, taskIds: [String], attachments: [String], meetingDocument: { name: String, type: String, size: Number, lastModified: Number, fileId: String, objectKey: String }, createdBy: { type: String, required: true }, updatedBy: String,
}, { timestamps });
MeetingSchema.index({ organizationId: 1, startAt: -1 });
MeetingSchema.index({ organizationId: 1, projectId: 1, startAt: -1 });
MeetingSchema.index({ organizationId: 1, customerId: 1, startAt: -1 });
MeetingSchema.index({ organizationId: 1, organizerId: 1, startAt: -1 });
MeetingSchema.index({ organizationId: 1, status: 1, startAt: -1 });
MeetingSchema.index({ organizationId: 1, departments: 1, startAt: -1 });

export const ProjectEventSchema = new Schema({
  organizationId, projectId: { type: String, required: true }, eventType: { type: String, required: true }, date: { type: Date, required: true },
  title: { type: String, required: true }, description: { type: String, required: true }, personId: String, projectMemberId: String, taskId: String, phaseId: String,
  stage: { type: String, enum: ['ثبت شد', 'در حال پیگیری', 'انجام شد'], default: 'ثبت شد' }, priority: { type: String, enum: ['عادی', 'بالا', 'بسیار بالا'], default: 'عادی' },
  status: { type: String, enum: ['open', 'completed'], default: 'open' }, result: String, attachments: [String], customerVisible: { type: Boolean, default: false },
  createdBy: { type: String, required: true }, registeredBy: { type: String, required: true }, updatedBy: String,
  source: { type: String, enum: ['manual', 'system'], default: 'manual' }, systemKey: String,
}, { timestamps });
ProjectEventSchema.index({ organizationId: 1, projectId: 1, date: -1 });
ProjectEventSchema.index({ organizationId: 1, projectMemberId: 1, date: -1 });
ProjectEventSchema.index({ organizationId: 1, projectId: 1, eventType: 1, date: -1 });
ProjectEventSchema.index({ organizationId: 1, systemKey: 1 }, { unique: true, sparse: true });
export const PerformanceEventSchema = new Schema({
  organizationId,
  employeeId: { type: String, required: true, index: true },
  periodKey: { type: String, required: true, index: true },
  reason: { type: String, required: true, trim: true },
  category: { type: String, required: true, trim: true, default: 'عمومی' },
  points: { type: Number, required: true, min: -100, max: 100 },
  date: { type: Date, required: true }, description: String, projectId: String, taskId: String, attachmentId: String,
  createdBy: { type: String, required: true },
}, { timestamps });
PerformanceEventSchema.index({ organizationId: 1, employeeId: 1, periodKey: 1, date: -1 });
PerformanceEventSchema.index({ organizationId: 1, projectId: 1, date: -1 });
export const PerformancePeriodSchema = new Schema({
  organizationId,
  employeeId: { type: String, required: true, index: true },
  periodKey: { type: String, required: true },
  title: { type: String, required: true },
  score: { type: Number, required: true, min: 0, max: 100 },
  baselineScore: { type: Number, required: true, min: 0, max: 100 }, adjustmentTotal: { type: Number, required: true },
  eventIds: { type: [String], default: [] }, grade: { type: String, enum: ['A+', 'A', 'B', 'C', 'D', 'F'], required: true },
  trend: { type: String, enum: ['up', 'down', 'flat'], required: true },
  status: { type: String, enum: ['open', 'finalized'], required: true, default: 'open' },
  evaluatedBy: String, notes: String, startedAt: { type: Date, required: true }, endedAt: { type: Date, required: true }, finalizedAt: Date,
  reopenedAt: Date, reopenedBy: String, reopenReason: String, version: { type: Number, min: 1, default: 1 },
}, { timestamps });
PerformancePeriodSchema.index({ organizationId: 1, employeeId: 1, periodKey: 1 }, { unique: true, sparse: true });
PerformancePeriodSchema.index({ organizationId: 1, employeeId: 1, startedAt: -1 });
PerformancePeriodSchema.index({ organizationId: 1, status: 1, periodKey: -1 });
export const AuditLogSchema = new Schema({
  _id: stringId, organizationId, actorId: { type: String, required: true }, action: { type: String, required: true },
  entityType: { type: String, required: true }, entityId: { type: String, required: true }, before: Schema.Types.Mixed, after: Schema.Types.Mixed,
  metadata: Schema.Types.Mixed, ip: String, userAgent: String, requestId: { type: String, required: true }, timestamp: { type: Date, required: true }, reason: String,
}, { timestamps });
AuditLogSchema.index({ organizationId: 1, createdAt: -1 });
AuditLogSchema.index({ organizationId: 1, entityType: 1, entityId: 1, createdAt: -1 });
AuditLogSchema.index({ organizationId: 1, actorId: 1, createdAt: -1 });
AuditLogSchema.index({ organizationId: 1, requestId: 1 });
AuditLogSchema.index({ organizationId: 1, action: 1, createdAt: -1 });
const rejectAuditMutation = function (this: unknown, next: (error?: Error) => void) { next(new Error('Audit records are append-only')); };
AuditLogSchema.pre('updateOne', rejectAuditMutation);
AuditLogSchema.pre('updateMany', rejectAuditMutation);
AuditLogSchema.pre('findOneAndUpdate', rejectAuditMutation);
AuditLogSchema.pre('replaceOne', rejectAuditMutation);
AuditLogSchema.pre('deleteOne', rejectAuditMutation);
AuditLogSchema.pre('deleteMany', rejectAuditMutation);
AuditLogSchema.pre('findOneAndDelete', rejectAuditMutation);

export const FileRecordSchema = new Schema({
  organizationId,
  name: { type: String, required: true, trim: true },
  originalName: { type: String, required: true },
  objectKey: { type: String, required: true, unique: true, index: true },
  bucket: { type: String, required: true },
  mimeType: { type: String, required: true },
  declaredMimeType: String,
  detectedMimeType: String,
  sizeBytes: { type: Number, required: true, min: 0 },
  etag: String,
  uploadedBy: { type: String, required: true, index: true },
  visibility: { type: String, enum: ['private', 'workspace'], default: 'workspace' },
  customerVisible: { type: Boolean, default: false, index: true },
  customerId: { type: String, index: true }, projectId: { type: String, index: true }, employeeId: { type: String, index: true },
  folderId: { type: String, index: true }, contextKind: String, contextId: String,
  description: String, tags: { type: [String], default: [] }, favorite: { type: Boolean, default: false }, downloadCount: { type: Number, default: 0 },
  processingStatus: { type: String, enum: ['pending', 'processing', 'processed', 'failed'], default: 'pending' }, processingError: String,
  processedAt: Date, sha256: String,
  metadataVersion: { type: Number, default: 1, min: 1 },
  deletionStatus: { type: String, enum: ['active', 'deleting', 'delete_failed', 'missing'], default: 'active', index: true },
  deletionError: String, deletionRequestedAt: Date, contentVerifiedAt: Date,
}, { timestamps });
FileRecordSchema.index({ organizationId: 1, projectId: 1 });
FileRecordSchema.index({ organizationId: 1, folderId: 1 });
FileRecordSchema.index({ organizationId: 1, projectId: 1, createdAt: -1 });
FileRecordSchema.index({ organizationId: 1, customerId: 1, customerVisible: 1, createdAt: -1 });
FileRecordSchema.index({ organizationId: 1, employeeId: 1, createdAt: -1 });
FileRecordSchema.index({ organizationId: 1, contextKind: 1, contextId: 1, createdAt: -1 });
FileRecordSchema.index({ organizationId: 1, folderId: 1, createdAt: -1 });
FileRecordSchema.index({ organizationId: 1, processingStatus: 1, createdAt: -1 });
FileRecordSchema.index({ organizationId: 1, deletionStatus: 1, updatedAt: 1 });

export const OrganizationStorageUsageSchema = new Schema({
  _id: { type: String, required: true }, organizationId: { type: String, required: true, unique: true, index: true },
  quotaBytes: { type: Number, required: true, min: 0 }, usedBytes: { type: Number, required: true, min: 0, default: 0 },
  reservedBytes: { type: Number, required: true, min: 0, default: 0 }, reservations: { type: Schema.Types.Mixed, default: {} },
  reconciledAt: Date,
}, { timestamps });

const auditFields = { createdBy: { type: String, required: true }, updatedBy: String };
const externalSyncFields = {
  externalSystem: { type: String, trim: true, maxlength: 100, match: /^[A-Za-z0-9][A-Za-z0-9._-]*$/ }, externalId: String,
  syncStatus: { type: String, enum: ['synced', 'pending', 'changed', 'error'] }, lastSyncedAt: Date,
};

export const ProjectPhaseSchema = new Schema({
  _id: stringId, organizationId, ...auditFields, projectId: { type: String, required: true }, title: { type: String, required: true },
  status: { type: String, enum: ['planned', 'in_progress', 'completed', 'on_hold'], default: 'planned' }, startDate: Date, endDate: Date,
  progress: { type: Number, min: 0, max: 100, default: 0 }, managerId: String, description: String, customerVisible: Boolean,
  plannedHours: { type: Number, min: 0, default: 0 }, estimatedHours: { type: Number, min: 0, default: 0 }, actualHours: { type: Number, min: 0, default: 0 },
}, { timestamps });
ProjectPhaseSchema.index({ organizationId: 1, projectId: 1, startDate: 1 });

export const ProjectRoleSchema = new Schema({
  _id: stringId, organizationId, ...auditFields, projectId: { type: String, required: true }, templateId: String, name: { type: String, required: true },
  description: String, responsibilities: [String], objectives: [String], requiredSkills: [String], expectedHours: { type: Number, min: 0, default: 0 }, customerVisible: Boolean,
}, { timestamps });
ProjectRoleSchema.index({ organizationId: 1, projectId: 1, name: 1 }, { unique: true });

export const ProjectActivitySchema = new Schema({
  _id: stringId, organizationId, ...auditFields, projectId: { type: String, required: true }, roleId: { type: String, required: true },
  title: { type: String, required: true }, description: String, objective: String, expectedHours: { type: Number, min: 0, default: 0 }, customerVisible: Boolean,
}, { timestamps });
ProjectActivitySchema.index({ organizationId: 1, projectId: 1, roleId: 1 });

export const ProjectMemberSchema = new Schema({
  _id: stringId, organizationId, ...auditFields, projectId: { type: String, required: true }, personId: { type: String, required: true },
  role: String, roleIds: { type: [String], default: [] }, status: { type: String, enum: ['active', 'inactive'], default: 'active' },
  joinedAt: { type: Date, required: true }, leftAt: Date, hourlyCost: { type: Number, min: 0 }, responsibilities: String,
}, { timestamps });
ProjectMemberSchema.index({ organizationId: 1, projectId: 1, personId: 1, status: 1 });
ProjectMemberSchema.index({ organizationId: 1, projectId: 1, status: 1 });

export const TimeEntrySchema = new Schema({
  _id: stringId, organizationId, ...auditFields, employeeId: { type: String, required: true }, projectId: { type: String, required: true }, taskId: { type: String, required: true },
  date: { type: Date, required: true }, hours: { type: Number, required: true, min: 0.01, max: 24 }, startTime: String, endTime: String,
  hourlyRate: { type: Number, min: 0 }, calculatedCost: { type: Number, min: 0 }, billable: { type: Boolean, default: false },
  billingStatus: String, customerVisible: Boolean, description: String,
  status: { type: String, enum: ['approved', 'pending_review', 'review_again', 'suspended', 'rejected'], default: 'pending_review' },
  reviewedBy: String, reviewedAt: Date, reviewReason: String,
}, { timestamps });
TimeEntrySchema.index({ organizationId: 1, projectId: 1, date: -1 });
TimeEntrySchema.index({ organizationId: 1, taskId: 1, employeeId: 1, date: -1 });
TimeEntrySchema.index({ organizationId: 1, employeeId: 1, status: 1, date: 1 });

const scheduleDay = new Schema({
  weekday: { type: Number, required: true, min: 0, max: 6 },
  expectedMinutes: { type: Number, required: true, min: 0, max: 1_440 },
}, { _id: false });

export const EmploymentCompensationSchema = new Schema({
  _id: stringId, organizationId, ...auditFields,
  employeeId: { type: String, required: true },
  paymentMethod: { type: String, enum: ['hourly_task', 'full_time_attendance'], required: true },
  effectiveFrom: { type: Date, required: true }, effectiveTo: Date,
  currency: { type: String, required: true, default: 'IRR' }, payPeriod: { type: String, enum: ['monthly'], default: 'monthly', required: true },
  hourlyRate: { type: Number, min: 0 }, monthlySalary: { type: Number, min: 0 },
  expectedSchedule: {
    timezone: { type: String, default: 'Asia/Tehran' },
    days: { type: [scheduleDay], default: [] },
    weeklyExpectedMinutes: { type: Number, min: 0, max: 10_080, default: 0 },
  },
  overtimeEnabled: { type: Boolean, default: false }, overtimeRateMultiplier: { type: Number, min: 1, default: 1.4 },
  status: { type: String, enum: ['active', 'inactive'], default: 'active' }, notes: String,
}, { timestamps });
EmploymentCompensationSchema.index({ organizationId: 1, employeeId: 1, effectiveFrom: -1 });
EmploymentCompensationSchema.index({ organizationId: 1, employeeId: 1, status: 1, effectiveFrom: 1, effectiveTo: 1 });
EmploymentCompensationSchema.index({ organizationId: 1, paymentMethod: 1, status: 1 });

export const AttendanceRecordSchema = new Schema({
  _id: stringId, organizationId, ...auditFields,
  employeeId: { type: String, required: true }, compensationId: String, date: { type: Date, required: true },
  clockIn: Date, clockOut: Date,
  status: { type: String, enum: ['present', 'absent', 'late', 'leave', 'mission', 'remote'], required: true, default: 'present' },
  approvalStatus: { type: String, enum: ['pending', 'approved', 'rejected'], default: 'pending', required: true },
  expectedMinutes: { type: Number, min: 0, default: 0 }, workedMinutes: { type: Number, min: 0, default: 0 },
  regularMinutes: { type: Number, min: 0, default: 0 }, overtimeMinutes: { type: Number, min: 0, default: 0 },
  absenceMinutes: { type: Number, min: 0, default: 0 }, approvedLeaveMinutes: { type: Number, min: 0, default: 0 },
  leaveRequestId: String, source: { type: String, enum: ['manual', 'clock'], default: 'manual' }, notes: String,
  approvedBy: String, approvedAt: Date, rejectionReason: String,
}, { timestamps });
AttendanceRecordSchema.index({ organizationId: 1, employeeId: 1, date: 1 }, { unique: true });
AttendanceRecordSchema.index({ organizationId: 1, approvalStatus: 1, date: -1 });
AttendanceRecordSchema.index({ organizationId: 1, compensationId: 1, date: 1 });

export const CustomerSchema = new Schema({
  _id: stringId, organizationId, ...auditFields,
  code: String, entityType: { type: String, enum: ['company', 'person'], required: true }, name: { type: String, required: true, trim: true },
  company: { type: String, required: true }, email: { type: String, lowercase: true, trim: true }, phone: String,
  additionalPhones: { type: [String], default: [] }, fax: String, nationalCode: String, vatRegistrationNumber: String,
  groups: { type: [String], default: [] }, currency: { type: String, required: true }, country: String, province: String, city: String,
  postalCode: String, address: String, website: String, status: { type: String, enum: ['active', 'inactive', 'lead'], default: 'lead' },
  value: { type: Number, min: 0, default: 0 }, lastContact: Date, assignedTo: String,
}, { timestamps });
CustomerSchema.index({ organizationId: 1, status: 1, name: 1 });
CustomerSchema.index({ organizationId: 1, code: 1 }, { unique: true, sparse: true });
CustomerSchema.index({ organizationId: 1, assignedTo: 1 });

const lineItem = new Schema({ productId: { type: String, required: true }, quantity: { type: Number, required: true, min: 0 }, unitPrice: { type: Number, required: true, min: 0 }, discount: { type: Number, required: true, min: 0 }, tax: { type: Number, required: true, min: 0 } }, { _id: false });
export const ContractSchema = new Schema({
  _id: stringId, organizationId, ...auditFields, ...externalSyncFields,
  number: { type: String, required: true }, customerId: { type: String, required: true }, projectId: String, title: { type: String, required: true },
  amount: { type: Number, required: true, min: 0 }, startDate: { type: Date, required: true }, endDate: { type: Date, required: true },
  status: { type: String, enum: ['draft', 'pending', 'active', 'expiring', 'expired', 'terminated'], default: 'draft' },
  renewal: { type: Boolean, default: false }, ownerId: { type: String, required: true }, paymentTerms: { type: String, required: true }, customerVisible: { type: Boolean, default: false },
}, { timestamps });
ContractSchema.index({ organizationId: 1, number: 1 }, { unique: true });
ContractSchema.index({ organizationId: 1, customerId: 1, status: 1 });
ContractSchema.index({ organizationId: 1, projectId: 1 });

export const InvoiceSchema = new Schema({
  _id: stringId, organizationId, ...auditFields, ...externalSyncFields,
  number: { type: String, required: true }, customerId: { type: String, required: true }, projectId: String, contractId: String, proposalId: String,
  amount: { type: Number, required: true, min: 0 }, paidAmount: { type: Number, min: 0, default: 0 },
  status: { type: String, enum: ['draft', 'sent', 'viewed', 'approved', 'rejected', 'expired', 'issued', 'partial', 'paid', 'overdue', 'cancelled'], default: 'draft' },
  issuedAt: { type: Date, required: true }, dueDate: { type: Date, required: true }, items: { type: [lineItem], default: [] },
}, { timestamps });
InvoiceSchema.index({ organizationId: 1, number: 1 }, { unique: true });
InvoiceSchema.index({ organizationId: 1, customerId: 1, status: 1 });
InvoiceSchema.index({ organizationId: 1, dueDate: 1 });

export const BankAccountSchema = new Schema({
  _id: stringId, organizationId, ...auditFields,
  bankName: { type: String, required: true }, label: { type: String, required: true }, maskedNumber: { type: String, required: true },
  accountType: { type: String, required: true }, balance: { type: Number, default: 0 }, status: { type: String, enum: ['active', 'inactive'], default: 'active' },
}, { timestamps });
BankAccountSchema.index({ organizationId: 1, status: 1, bankName: 1 });

export const PaymentSchema = new Schema({
  _id: stringId, organizationId, ...auditFields, ...externalSyncFields,
  receiptNumber: { type: String, required: true }, customerId: { type: String, required: true }, invoiceId: { type: String, required: true },
  projectId: String, bankAccountId: String, amount: { type: Number, required: true, min: 0 },
  method: { type: String, required: true }, paidAt: { type: Date, required: true }, reference: { type: String, required: true },
  status: { type: String, enum: ['ثبت شده', 'در انتظار تایید', 'تایید شده', 'برگشت خورده'], default: 'ثبت شده' },
}, { timestamps });
PaymentSchema.index({ organizationId: 1, receiptNumber: 1 }, { unique: true });
PaymentSchema.index({ organizationId: 1, invoiceId: 1, paidAt: -1 });
PaymentSchema.index({ organizationId: 1, customerId: 1 });

export const InstallmentSchema = new Schema({
  _id: stringId, organizationId, ...auditFields,
  contractId: { type: String, required: true }, invoiceId: { type: String, required: true }, customerId: { type: String, required: true }, projectId: String,
  number: { type: Number, required: true, min: 1 }, dueDate: { type: Date, required: true }, amount: { type: Number, required: true, min: 0 },
  paidAmount: { type: Number, min: 0, default: 0 }, status: { type: String, enum: ['future', 'due', 'partial', 'paid', 'overdue'], default: 'future' },
}, { timestamps });
InstallmentSchema.index({ organizationId: 1, contractId: 1, number: 1 }, { unique: true });
InstallmentSchema.index({ organizationId: 1, dueDate: 1, status: 1 });

export const SupplierSchema = new Schema({
  _id: stringId, organizationId, ...auditFields,
  name: { type: String, required: true }, contactName: String, phone: String, email: String, balance: { type: Number, default: 0 },
  type: { type: String, enum: ['supplier', 'both'], required: true },
}, { timestamps });
SupplierSchema.index({ organizationId: 1, name: 1 });

export const ExpenseSchema = new Schema({
  _id: stringId, organizationId, ...auditFields, ...externalSyncFields,
  title: { type: String, required: true }, category: { type: String, required: true }, projectId: String, supplierId: String,
  amount: { type: Number, required: true, min: 0 }, date: { type: Date, required: true },
  status: { type: String, enum: ['paid', 'pending', 'approved'], default: 'pending' }, paymentMethod: { type: String, required: true }, bankAccountId: String, description: String,
}, { timestamps });
ExpenseSchema.index({ organizationId: 1, date: -1, status: 1 });
ExpenseSchema.index({ organizationId: 1, projectId: 1 });
ExpenseSchema.index({ organizationId: 1, supplierId: 1 });

export const ProjectSaleSchema = new Schema({
  _id: stringId, organizationId, ...auditFields,
  projectId: { type: String, required: true }, customerId: { type: String, required: true }, title: { type: String, required: true },
  amount: { type: Number, required: true, min: 0 }, type: { type: String, required: true }, status: { type: String, required: true },
  date: { type: Date, required: true }, documentNumber: { type: String, required: true },
}, { timestamps });
ProjectSaleSchema.index({ organizationId: 1, projectId: 1, date: -1 });
ProjectSaleSchema.index({ organizationId: 1, documentNumber: 1 }, { unique: true });

const payrollTaskLine = new Schema({
  timeEntryId: { type: String, required: true }, projectId: { type: String, required: true }, taskId: { type: String, required: true },
  date: { type: Date, required: true }, minutes: { type: Number, required: true, min: 0 }, hourlyRate: { type: Number, required: true, min: 0 },
  amount: { type: Number, required: true, min: 0 },
}, { _id: false });
const payrollAttendanceLine = new Schema({
  attendanceRecordId: { type: String, required: true }, date: { type: Date, required: true }, status: { type: String, required: true },
  clockIn: Date, clockOut: Date,
  expectedMinutes: { type: Number, min: 0, default: 0 }, workedMinutes: { type: Number, min: 0, default: 0 },
  regularMinutes: { type: Number, min: 0, default: 0 }, overtimeMinutes: { type: Number, min: 0, default: 0 },
  absenceMinutes: { type: Number, min: 0, default: 0 }, approvedLeaveMinutes: { type: Number, min: 0, default: 0 },
}, { _id: false });
const payrollAdjustmentSnapshot = new Schema({
  adjustmentId: { type: String, required: true }, type: { type: String, enum: ['adjustment_credit', 'adjustment_debit', 'bonus', 'deduction'], required: true },
  amount: { type: Number, required: true, min: 0 }, reason: { type: String, required: true }, adjustmentDate: { type: Date, required: true },
  createdBy: { type: String, required: true },
}, { _id: false });
const compensationSnapshot = new Schema({
  compensationId: { type: String, required: true }, paymentMethod: { type: String, enum: ['hourly_task', 'full_time_attendance'], required: true },
  currency: { type: String, required: true }, payPeriod: { type: String, required: true }, hourlyRate: { type: Number, min: 0 },
  monthlySalary: { type: Number, min: 0 }, overtimeEnabled: { type: Boolean, required: true }, overtimeRateMultiplier: { type: Number, min: 1, required: true },
  expectedSchedule: {
    timezone: String, days: { type: [scheduleDay], default: [] }, weeklyExpectedMinutes: { type: Number, min: 0, default: 0 },
  },
}, { _id: false });

export const PayrollRecordSchema = new Schema({
  _id: stringId, organizationId, ...auditFields,
  employeeId: { type: String, required: true }, compensationId: String,
  paymentMethod: { type: String, enum: ['hourly_task', 'full_time_attendance'] },
  month: { type: String, required: true }, periodStart: Date, periodEnd: Date,
  taskTimeMinutes: { type: Number, min: 0, default: 0 }, attendanceMinutes: { type: Number, min: 0, default: 0 },
  payrollMinutes: { type: Number, min: 0, default: 0 }, expectedMinutes: { type: Number, min: 0, default: 0 },
  regularMinutes: { type: Number, min: 0, default: 0 }, overtimeMinutes: { type: Number, min: 0, default: 0 },
  absenceMinutes: { type: Number, min: 0, default: 0 }, approvedLeaveMinutes: { type: Number, min: 0, default: 0 },
  baseSalary: { type: Number, required: true, min: 0 },
  workedHours: { type: Number, min: 0 }, hourlyRate: { type: Number, min: 0 }, overtime: { type: Number, required: true, min: 0 }, overtimeHours: { type: Number, min: 0 },
  benefits: { type: Number, required: true, min: 0 }, adjustments: { type: Number, default: 0 }, deductions: { type: Number, required: true, min: 0 },
  tax: { type: Number, required: true, min: 0 }, netSalary: { type: Number, required: true, min: 0 },
  grossBaseAmount: { type: Number, min: 0, default: 0 }, overtimeAmount: { type: Number, min: 0, default: 0 },
  bonusAmount: { type: Number, min: 0, default: 0 }, adjustmentCreditAmount: { type: Number, min: 0, default: 0 },
  adjustmentDebitAmount: { type: Number, min: 0, default: 0 }, deductionAmount: { type: Number, min: 0, default: 0 },
  grossAmount: { type: Number, min: 0, default: 0 }, finalPayableAmount: { type: Number, min: 0, default: 0 },
  compensationSnapshot, taskLines: { type: [payrollTaskLine], default: [] }, attendanceLines: { type: [payrollAttendanceLine], default: [] },
  adjustmentSnapshots: { type: [payrollAdjustmentSnapshot], default: [] },
  calculationVersion: { type: Number, min: 0, default: 0 },
  status: { type: String, enum: ['draft', 'calculated', 'reviewed', 'approved', 'paid'], default: 'draft' },
  calculatedAt: Date, calculatedBy: String, reviewedAt: Date, reviewedBy: String, approvedAt: Date, approvedBy: String,
  paidAt: Date, paidBy: String, paymentNote: String,
  paymentRecordId: String, paymentDocumentId: String, paymentReference: String, paymentDocumentNumber: String,
  accountingSubmissionStatus: { type: String, enum: ['not_submitted', 'queued', 'submitted', 'synced', 'error'] },
}, { timestamps });
PayrollRecordSchema.index({ organizationId: 1, employeeId: 1, month: 1 }, { unique: true });
PayrollRecordSchema.index({ organizationId: 1, status: 1, month: 1 });
PayrollRecordSchema.index({ organizationId: 1, employeeId: 1, periodStart: 1, periodEnd: 1 });
PayrollRecordSchema.index({ organizationId: 1, compensationId: 1 });
PayrollRecordSchema.index({ organizationId: 1, accountingSubmissionStatus: 1, paidAt: -1 });

const accountingSubmissionStatus = {
  type: String,
  enum: ['not_submitted', 'queued', 'submitted', 'synced', 'error'],
  default: 'not_submitted',
  required: true,
  index: true,
};

export const PayrollPaymentSchema = new Schema({
  _id: stringId, organizationId, ...auditFields,
  payrollId: { type: String, required: true }, employeeId: { type: String, required: true },
  receiptNumber: { type: String, required: true }, amount: { type: Number, required: true, min: 0.01 },
  currency: { type: String, required: true, default: 'IRR' }, paidAt: { type: Date, required: true },
  settlementMethod: { type: String, enum: ['bank_transfer', 'cash', 'cheque', 'other'], required: true },
  reference: { type: String, required: true }, note: String,
  status: { type: String, enum: ['recorded', 'voided'], default: 'recorded', required: true },
  accountingSubmissionStatus,
}, { timestamps });
PayrollPaymentSchema.index({ organizationId: 1, payrollId: 1 }, { unique: true });
PayrollPaymentSchema.index({ organizationId: 1, receiptNumber: 1 }, { unique: true });
PayrollPaymentSchema.index({ organizationId: 1, employeeId: 1, paidAt: -1 });

export const PayrollPaymentDocumentSchema = new Schema({
  _id: stringId, organizationId, ...auditFields,
  payrollId: { type: String, required: true }, paymentId: { type: String, required: true }, employeeId: { type: String, required: true },
  documentNumber: { type: String, required: true }, title: { type: String, required: true },
  payrollMonth: { type: String, required: true }, periodStart: Date, periodEnd: Date,
  amount: { type: Number, required: true, min: 0.01 }, currency: { type: String, required: true, default: 'IRR' },
  paidAt: { type: Date, required: true }, settlementMethod: { type: String, enum: ['bank_transfer', 'cash', 'cheque', 'other'], required: true },
  reference: { type: String, required: true }, status: { type: String, enum: ['issued', 'voided'], default: 'issued', required: true },
  accountingSubmissionStatus, snapshot: { type: Schema.Types.Mixed, required: true },
}, { timestamps });
PayrollPaymentDocumentSchema.index({ organizationId: 1, payrollId: 1 }, { unique: true });
PayrollPaymentDocumentSchema.index({ organizationId: 1, paymentId: 1 }, { unique: true });
PayrollPaymentDocumentSchema.index({ organizationId: 1, documentNumber: 1 }, { unique: true });
PayrollPaymentDocumentSchema.index({ organizationId: 1, employeeId: 1, paidAt: -1 });

export const PayrollAdjustmentSchema = new Schema({
  _id: stringId, organizationId, ...auditFields,
  payrollId: { type: String, required: true }, employeeId: { type: String, required: true },
  type: { type: String, enum: ['adjustment_credit', 'adjustment_debit', 'bonus', 'deduction'], required: true },
  amount: { type: Number, required: true, min: 0.01 }, reason: { type: String, required: true }, adjustmentDate: { type: Date, required: true },
}, { timestamps });
PayrollAdjustmentSchema.index({ organizationId: 1, payrollId: 1, adjustmentDate: 1 });
PayrollAdjustmentSchema.index({ organizationId: 1, employeeId: 1, adjustmentDate: -1 });

export const EmployeeContractSchema = new Schema({
  _id: stringId, organizationId, ...auditFields,
  employeeId: { type: String, required: true }, type: { type: String, enum: ['استخدام', 'فریلنسری', 'کارآموزی', 'پیمانکاری', 'پاره‌وقت', 'تمام‌وقت'], required: true },
  startDate: { type: Date, required: true }, endDate: Date, status: { type: String, enum: ['draft', 'active', 'expired', 'terminated'], default: 'draft' },
  hourlyRate: { type: Number, min: 0 }, description: String, fileId: String, signed: { type: Boolean, default: false },
}, { timestamps });
EmployeeContractSchema.index({ organizationId: 1, employeeId: 1, startDate: -1 });
EmployeeContractSchema.index({ organizationId: 1, status: 1, endDate: 1 });

export const ProjectAccessSchema = new Schema({
  _id: stringId, organizationId, ...auditFields,
  projectId: { type: String, required: true }, content: { type: String, required: true }, kind: { type: String, enum: ['telegram', 'credentials', 'link', 'other'] },
  system: String, resource: { type: String, required: true }, permission: { type: String, required: true }, username: String,
  secretCiphertext: { type: String, select: false }, secretIv: { type: String, select: false }, secretTag: { type: String, select: false },
  secretVersion: { type: Number, select: false }, hasSecret: { type: Boolean, default: false }, secretUpdatedAt: Date,
  scope: { type: String, enum: ['project', 'role', 'person'], required: true }, status: { type: String, enum: ['granted', 'revoked'], default: 'granted' },
  roleId: String, projectMemberId: String, startDate: Date, expiryDate: Date, documentId: String, requestId: String, notes: String,
  grantedBy: { type: String, required: true }, revokedAt: Date, revokedBy: String,
}, { timestamps });
ProjectAccessSchema.index({ organizationId: 1, projectId: 1, status: 1 });
ProjectAccessSchema.index({ organizationId: 1, projectId: 1, scope: 1, roleId: 1, projectMemberId: 1 });
ProjectAccessSchema.index({ organizationId: 1, projectId: 1, resource: 1, permission: 1 });
ProjectAccessSchema.index({ organizationId: 1, projectMemberId: 1 });
ProjectAccessSchema.index({ organizationId: 1, expiryDate: 1 });

export const AgentEnrollmentSchema = new Schema({
  _id: stringId, organizationId, ...auditFields,
  userId: { type: String, required: true },
  employeeId: String,
  installationId: { type: String, required: true },
  deviceName: { type: String, required: true },
  agentVersion: { type: String, required: true },
  capabilities: { type: [String], default: [] },
  platform: String,
  osDescription: String,
  status: { type: String, enum: ['active', 'disabled', 'revoked'], default: 'active' },
  connectionStatus: { type: String, enum: ['online', 'offline'], default: 'offline' },
  lastSeenAt: Date, enrolledAt: { type: Date, required: true }, revokedAt: Date, disabledAt: Date,
  // Hidden from ordinary queries. Credential checks load it explicitly. Responses never include it.
  credentialHash: { type: String, required: true, select: false },
}, { timestamps });
AgentEnrollmentSchema.index({ organizationId: 1, installationId: 1 }, { unique: true });
AgentEnrollmentSchema.index({ organizationId: 1, userId: 1, status: 1 });

const usageEndReason = ['shutdown', 'disabled', 'lock', 'sleep', 'logout', 'restart', 'idle', 'manual', 'stop'];

export const AgentUsagePolicySchema = new Schema({
  _id: stringId, organizationId, ...auditFields,
  enabled: { type: Boolean, default: false },
  employeeMayPause: { type: Boolean, default: true },
  idleThresholdSeconds: { type: Number, default: 60, min: 30, max: 1800 },
  retentionDays: { type: Number, default: 30, min: 7, max: 90 },
  disabledAt: Date,
}, { timestamps });

export const AgentUsagePreferenceSchema = new Schema({
  _id: stringId, organizationId, ...auditFields,
  userId: { type: String, required: true },
  paused: { type: Boolean, default: false },
  pausedAt: Date,
}, { timestamps });
AgentUsagePreferenceSchema.index({ organizationId: 1, userId: 1 }, { unique: true });

export const AgentUsageSessionSchema = new Schema({
  _id: stringId, organizationId, ...auditFields,
  userId: { type: String, required: true },
  employeeId: String,
  deviceId: { type: String, required: true },
  clientSessionId: { type: String, required: true },
  startedAt: { type: Date, required: true },
  endedAt: Date,
  endReason: { type: String, enum: usageEndReason },
  status: { type: String, enum: ['open', 'closed'], default: 'open' },
}, { timestamps });
AgentUsageSessionSchema.index({ organizationId: 1, deviceId: 1, clientSessionId: 1 }, { unique: true });
AgentUsageSessionSchema.index({ organizationId: 1, userId: 1, startedAt: -1 });

export const AgentUsageIntervalSchema = new Schema({
  _id: stringId, organizationId, ...auditFields,
  userId: { type: String, required: true },
  employeeId: String,
  deviceId: { type: String, required: true },
  clientSessionId: { type: String, required: true },
  clientIntervalId: { type: String, required: true },
  processName: { type: String, required: true },
  displayName: String,
  startedAt: { type: Date, required: true },
  durationMs: { type: Number, required: true, min: 1, max: 302000 },
}, { timestamps });
AgentUsageIntervalSchema.index({ organizationId: 1, deviceId: 1, clientIntervalId: 1 }, { unique: true });
AgentUsageIntervalSchema.index({ organizationId: 1, userId: 1, startedAt: -1 });

export const AgentUsageStatusSchema = new Schema({
  _id: stringId, organizationId, ...auditFields,
  userId: { type: String, required: true },
  deviceId: { type: String, required: true },
  lastSuccessfulUploadAt: Date,
  lastSampleAt: Date,
}, { timestamps });
AgentUsageStatusSchema.index({ organizationId: 1, deviceId: 1 }, { unique: true });
AgentUsageStatusSchema.index({ organizationId: 1, userId: 1 });

const healthCollectorPhase = ['stopped', 'running', 'offline', 'paused', 'disabled'];
const healthSyncPhase = ['idle', 'pending', 'retrying', 'offline', 'stopped', 'revoked'];

export const AgentHealthSampleSchema = new Schema({
  _id: stringId, organizationId, ...auditFields,
  userId: { type: String, required: true },
  employeeId: String,
  deviceId: { type: String, required: true },
  clientSampleId: { type: String, required: true },
  sampledAt: { type: Date, required: true },
  cpuPercent: { type: Number, min: 0, max: 100 },
  memoryUsedBytes: { type: Number, min: 0 },
  memoryTotalBytes: { type: Number, min: 0 },
  diskFreeBytes: { type: Number, min: 0 },
  diskTotalBytes: { type: Number, min: 0 },
  osName: String,
  osVersion: String,
  architecture: String,
  agentVersion: { type: String, required: true },
  online: { type: Boolean, required: true },
  lastHeartbeatAt: Date,
  collectorPhase: { type: String, enum: healthCollectorPhase, required: true },
  syncPhase: { type: String, enum: healthSyncPhase, required: true },
  queueDepth: { type: Number, min: 0, max: 10_000, required: true },
  pendingBytes: { type: Number, min: 0, required: true },
  fingerprint: { type: String, required: true },
}, { timestamps });
AgentHealthSampleSchema.index({ organizationId: 1, deviceId: 1, clientSampleId: 1 }, { unique: true });
AgentHealthSampleSchema.index({ organizationId: 1, deviceId: 1, sampledAt: -1 });

export const AgentHealthStatusSchema = new Schema({
  _id: stringId, organizationId, ...auditFields,
  userId: { type: String, required: true },
  deviceId: { type: String, required: true },
  lastSuccessfulUploadAt: Date,
  lastSampleAt: Date,
}, { timestamps });
AgentHealthStatusSchema.index({ organizationId: 1, deviceId: 1 }, { unique: true });

const screenState = ['requested', 'active', 'ended'];
const screenEndReason = ['employee_stop', 'rejected', 'shutdown', 'agent_lost', 'support_end', 'timeout'];

export const AgentScreenSessionSchema = new Schema({
  _id: stringId, organizationId, ...auditFields,
  deviceId: { type: String, required: true },
  userId: { type: String, required: true },
  employeeId: String,
  supportUserId: { type: String, required: true },
  state: { type: String, enum: screenState, required: true },
  requestedAt: { type: Date, required: true },
  startedAt: Date,
  endedAt: Date,
  endReason: { type: String, enum: screenEndReason },
  expiresAt: { type: Date, required: true },
  lastAgentAt: Date,
  requestNote: String,
  frameCount: { type: Number, min: 0, default: 0 },
  qualityMode: { type: String, enum: ['assistance', 'high'], default: 'assistance' },
  maxFps: { type: Number, min: 1, max: 30, default: 2 },
  maxEdge: { type: Number, min: 640, max: 1920, default: 1280 },
  jpegQuality: { type: Number, min: 30, max: 85, default: 60 },
  controlState: { type: String, enum: ['off', 'requested', 'granted', 'denied', 'revoked', 'expired'], default: 'off' },
  controlGrantId: String,
  controlRequestedAt: Date,
  controlGrantedAt: Date,
  controlExpiresAt: Date,
  controlEndedAt: Date,
  controlEndReason: { type: String, enum: ['employee_revoke', 'support_revoke', 'denied', 'expired', 'session_ended', 'capability_lost'] },
  permittedCapabilities: { type: [String], default: [] },
}, { timestamps });
AgentScreenSessionSchema.index({ organizationId: 1, deviceId: 1, requestedAt: -1 });

export const schemas = {
  User: UserSchema, Employee: EmployeeSchema, Project: ProjectSchema, ProjectPhase: ProjectPhaseSchema,
  ProjectRole: ProjectRoleSchema, ProjectActivity: ProjectActivitySchema, ProjectMember: ProjectMemberSchema,
  Task: TaskSchema, TimeEntry: TimeEntrySchema, EmploymentCompensation: EmploymentCompensationSchema, AttendanceRecord: AttendanceRecordSchema, Meeting: MeetingSchema,
  ProjectEvent: ProjectEventSchema, PerformanceEvent: PerformanceEventSchema, PerformancePeriod: PerformancePeriodSchema,
  AuditLog: AuditLogSchema, FileRecord: FileRecordSchema, OrganizationStorageUsage: OrganizationStorageUsageSchema, Customer: CustomerSchema, Contract: ContractSchema,
  Invoice: InvoiceSchema, Payment: PaymentSchema, Installment: InstallmentSchema, Expense: ExpenseSchema,
  BankAccount: BankAccountSchema, Supplier: SupplierSchema, ProjectSale: ProjectSaleSchema, PayrollRecord: PayrollRecordSchema, PayrollAdjustment: PayrollAdjustmentSchema,
  PayrollPayment: PayrollPaymentSchema, PayrollPaymentDocument: PayrollPaymentDocumentSchema,
  EmployeeContract: EmployeeContractSchema, ProjectAccess: ProjectAccessSchema, AgentEnrollment: AgentEnrollmentSchema,
  AgentUsagePolicy: AgentUsagePolicySchema, AgentUsagePreference: AgentUsagePreferenceSchema, AgentUsageSession: AgentUsageSessionSchema,
  AgentUsageInterval: AgentUsageIntervalSchema, AgentUsageStatus: AgentUsageStatusSchema,
  AgentHealthSample: AgentHealthSampleSchema, AgentHealthStatus: AgentHealthStatusSchema,
  AgentScreenSession: AgentScreenSessionSchema,
  AuthSession: AuthSessionSchema, PasswordResetToken: PasswordResetTokenSchema,
  BackgroundJob: BackgroundJobSchema, RecurringTask: RecurringTaskSchema,
};
