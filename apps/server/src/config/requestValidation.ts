import { v } from '../middleware/validate.js';
import { legacyResourceNames } from './resourceAccess.js';
import type { LegacyResourceName } from './resourceAccess.js';
import type { ResourceName } from '../types/entities.js';
import type { ValueSchema } from '../middleware/validate.js';

export const protectedInputFields = [
  'organizationId', 'createdAt', 'updatedAt', 'createdBy', 'registeredBy', 'evaluatedBy', 'finalizedAt',
  'approvedAt', 'approvedBy', 'permissionOverrides', 'permissions', 'passwordHash', 'credentialHash',
] as const;

const text = v.string({ max: 10_000 });
const shortText = v.string({ max: 500 });
const optionalText = v.optional(text);
const optionalShort = v.optional(shortText);
const optionalId = v.optional(v.id);
const stringList = v.array(v.string({ min: 1, max: 500 }), { max: 250 });
const idList = v.array(v.id, { max: 250 });
const optionalStringList = v.optional(stringList);
const optionalIdList = v.optional(idList);
const optionalDate = v.optional(v.date);
const optionalNumber = v.optional(v.number());
const optionalBoolean = v.optional(v.boolean());

function mutations(
  fields: Record<string, ValueSchema<unknown>>,
  required: readonly string[],
  immutableOnUpdate: readonly string[] = [],
) {
  const createShape = Object.fromEntries(Object.entries(fields).map(([key, validator]) => [key, required.includes(key) ? validator : v.optional(validator)]));
  const updateShape = Object.fromEntries(Object.entries(fields).filter(([key]) => key !== 'id' && !immutableOnUpdate.includes(key)).map(([key, validator]) => [key, v.optional(validator)]));
  return {
    create: v.object(createShape, { strip: protectedInputFields }),
    update: v.object(updateShape, { strip: [...protectedInputFields, 'id', ...immutableOnUpdate], atLeastOne: true }),
  };
}

const meetingDocument = v.object({
  name: v.string({ min: 1, max: 255 }), type: v.string({ min: 1, max: 200 }), size: v.number({ min: 0 }),
  lastModified: v.optional(v.number({ min: 0 })), fileId: optionalId, objectKey: optionalShort,
});

export const dedicatedMutationSchemas: Partial<Record<ResourceName, ReturnType<typeof mutations>>> = {
  Employee: mutations({
    id: v.id, userId: v.id, personnelCode: v.string({ min: 1, max: 100 }), fullName: v.string({ min: 1, max: 250 }), phone: shortText,
    email: v.email, nationalId: shortText, jobTitle: shortText, department: shortText, managerId: v.id,
    employmentType: v.string({ values: ['full_time', 'part_time', 'project', 'intern'] }),
    compensationType: v.string({ values: ['full_time_attendance', 'hourly_task'] }),
    employmentStatus: v.string({ values: ['active', 'leave', 'suspended', 'terminated'] }), hireDate: v.date,
    workLocation: shortText, workMode: shortText, contractType: shortText, salary: v.number({ min: 0 }), hourlyRate: v.number({ min: 0 }),
    leaveBalance: v.number({ min: 0 }), hasGuarantee: v.boolean(), guaranteeAmount: v.number({ min: 0 }), hourlyRateHistory: v.array(v.jsonObject, { max: 100 }),
  }, ['fullName', 'personnelCode', 'compensationType'], ['userId']),
  Project: mutations({
    id: v.id, name: v.string({ min: 1, max: 250 }), code: shortText, description: text, customerId: v.id, managerId: v.id,
    status: v.string({ values: ['active', 'on_hold', 'completed', 'archived'] }), progress: v.number({ min: 0, max: 100 }),
    startDate: v.date, endDate: v.date, members: idList, budget: v.number({ min: 0 }), grade: v.number({ min: 0, max: 100 }), tags: stringList,
    tasksCount: v.number({ min: 0, integer: true }), completedTasksCount: v.number({ min: 0, integer: true }),
    plannedHours: v.number({ min: 0 }), estimatedHours: v.number({ min: 0 }), actualHours: v.number({ min: 0 }), color: shortText,
    website: shortText, instagram: shortText, telegram: shortText, about: text, goals: text, advantages: text, competitors: text,
    contactPhone: shortText, officeAddress: text, factoryAddress: text, defaultChatGroupId: v.id,
  }, ['name']),
  Task: mutations({
    id: v.id, title: v.string({ min: 1, max: 500 }), description: text, projectId: v.id,
    assigneeId: v.id, assigneeIds: idList, assigneeMemberIds: idList, followerIds: idList,
    status: v.string({ values: ['todo', 'in_progress', 'review', 'done'] }), priority: v.string({ values: ['low', 'medium', 'high', 'urgent'] }),
    dueDate: v.date, startDate: v.date, customerVisible: v.boolean(), phaseId: v.id, activityId: v.id, creatorId: v.id,
    repeatEvery: v.number({ min: 1, integer: true }), estimatedHours: v.number({ min: 0 }), loggedHours: v.number({ min: 0 }), hourlyRate: v.number({ min: 0 }),
    tags: stringList, labelIds: idList, attachments: idList,
  }, ['title', 'projectId'], ['projectId', 'creatorId']),
  Meeting: mutations({
    id: v.id, title: v.string({ min: 1, max: 500 }), startAt: v.date, durationMinutes: v.number({ min: 5, max: 1440, integer: true }),
    status: v.string({ values: ['scheduled', 'completed', 'cancelled'] }), organizerId: v.id, participantIds: idList,
    projectId: v.id, employeeIds: idList, departments: stringList, department: shortText, customerId: v.id, location: shortText,
    meetingLink: shortText, agenda: text, description: text, discussionSummary: text, notes: text, decisions: text, outcome: text,
    actionItems: text, followUpActions: text, nextMeetingAt: v.date, taskIds: idList, attachments: idList, meetingDocument,
  }, ['title', 'startAt', 'durationMinutes', 'organizerId']),
  ProjectEvent: mutations({
    id: v.id, projectId: v.id, personId: v.id, projectMemberId: v.id, taskId: v.id, phaseId: v.id, eventType: v.string({ min: 1, max: 250 }),
    title: shortText, stage: v.string({ values: ['ثبت شد', 'در حال پیگیری', 'انجام شد'] }), priority: v.string({ values: ['عادی', 'بالا', 'بسیار بالا'] }),
    status: v.string({ values: ['open', 'completed'] }), date: v.date, description: v.string({ min: 1, max: 10_000 }), result: text,
    attachments: idList, customerVisible: v.boolean(),
  }, ['projectId', 'eventType', 'date', 'title', 'description'], ['projectId', 'personId', 'projectMemberId', 'taskId', 'phaseId']),
  PerformanceEvent: mutations({
    id: v.id, employeeId: v.id, reason: v.string({ min: 1, max: 1000 }), reasonId: v.id, points: v.number({ min: -100, max: 100, integer: true }),
    date: v.date, description: text, projectId: v.id, taskId: v.id, attachmentId: v.id,
  }, ['employeeId', 'reason', 'points'], ['employeeId']),
  PerformancePeriod: mutations({
    id: v.id, employeeId: v.id, title: v.string({ min: 1, max: 500 }), score: v.number({ min: 0, max: 100 }), baselineScore: v.number({ min: 0, max: 100 }),
    adjustmentTotal: v.number({ min: -1000, max: 1000 }), eventIds: idList, grade: v.string({ values: ['A+', 'A', 'B', 'C', 'D', 'F'] }),
    trend: v.string({ values: ['up', 'down', 'flat'] }), status: v.string({ values: ['open', 'finalized'] }), notes: text, startedAt: v.date, endedAt: v.date,
  }, ['employeeId', 'score'], ['employeeId', 'score', 'baselineScore', 'adjustmentTotal', 'eventIds', 'grade', 'trend', 'status', 'startedAt', 'endedAt']),
};

export const idParamsSchema = v.object({ id: v.id });
export const legacyResourceParamsSchema = v.object({ resource: v.string({ values: legacyResourceNames }) });
export const legacyRecordParamsSchema = v.object({ resource: v.string({ values: legacyResourceNames }), id: v.id });
export const loginSchema = v.object({ email: v.email, password: v.string({ min: 1, max: 128, trim: false }) });
export const passwordChangeSchema = v.object({
  currentPassword: v.string({ min: 1, max: 128, trim: false }),
  newPassword: v.string({ min: 1, max: 128, trim: false }),
});
export const passwordResetRequestSchema = v.object({ email: v.email });
export const passwordResetConfirmSchema = v.object({
  token: v.string({ min: 40, max: 500, trim: false }),
  newPassword: v.string({ min: 1, max: 128, trim: false }),
});
export const auditQuerySchema = v.object({
  actorId: v.optional(v.id), entityType: v.optional(v.string({ min: 1, max: 250 })), entityId: v.optional(v.id),
  action: v.optional(v.string({ min: 1, max: 250 })), requestId: v.optional(v.string({ min: 1, max: 200 })),
  limit: v.optional(v.number({ min: 1, max: 500, integer: true, coerce: true })),
});
export const userCreateSchema = v.object({
  name: v.string({ min: 1, max: 250 }), firstName: optionalShort, lastName: optionalShort, email: v.email,
  phone: optionalShort, role: v.optional(v.string({ values: ['admin', 'manager', 'member', 'customer'] })), status: v.optional(v.string({ values: ['online', 'away', 'offline'] })),
  isActive: v.optional(v.boolean()), title: v.optional(v.string({ min: 1, max: 250 })), customerId: optionalId, avatar: optionalShort,
  password: v.string({ min: 8, max: 128, trim: false }),
}, { strip: [...protectedInputFields, 'id'] });
export const userUpdateSchema = v.object({
  name: v.optional(v.string({ min: 1, max: 250 })), firstName: optionalShort, lastName: optionalShort, email: v.optional(v.email), phone: optionalShort,
  role: v.optional(v.string({ values: ['admin', 'manager', 'member', 'customer'] })), status: v.optional(v.string({ values: ['online', 'away', 'offline'] })),
  isActive: v.optional(v.boolean()), title: v.optional(v.string({ min: 1, max: 250 })), customerId: optionalId, avatar: optionalShort,
  password: v.optional(v.string({ min: 8, max: 128, trim: false })),
}, { strip: [...protectedInputFields, 'id'], atLeastOne: true });

const legacyFields: Record<LegacyResourceName, readonly string[]> = {
  activities: ['id','description','entityId','entityName','entityType','type','userId','userName'],
  'activity-logs': ['id','action','description','entityId','entityType','ip','metadata','timestamp','userId'],
  'bank-accounts': ['id','accountType','balance','bankName','label','maskedNumber','status'],
  'chat-groups': ['id','isDefault','memberIds','name','projectId'],
  contracts: ['id','amount','customerId','customerVisible','endDate','externalId','externalSystem','number','ownerId','paymentTerms','projectId','renewal','startDate','status','syncStatus','title'],
  conversations: ['id','groupId','participantIds','projectId','title','unreadCount'],
  'credential-audit-events': ['id','userId','actorId','action','deliveryMethod'],
  customers: ['id','additionalPhones','address','assignedTo','city','code','company','country','currency','email','entityType','fax','groups','lastContact','name','nationalCode','phone','postalCode','province','status','value','vatRegistrationNumber','website'],
  devices: ['id','agentVersion','health','ipAddress','lastSeen','location','name','os','osVersion','status','userId','userName'],
  'documents-v2': ['id','acceptedDate','attachments','compensation','customerId','customerVisible','deliverable','documentNumber','documentType','employeeId','endDate','impactDescription','notes','position','projectId','requestDate','requestedById','requestedDate','startDate','status','summary','title','validityDate','value'],
  'employee-contracts': ['id','description','employeeId','endDate','hourlyRate','signed','startDate','status','type','fileId'],
  expenses: ['id','amount','bankAccountId','category','date','description','paymentMethod','projectId','status','supplierId','title'],
  'file-folders': ['id','name','parentId','deletedAt'],
  goals: ['id','current','department','description','dueDate','ownerId','period','progress','status','target','title'],
  installments: ['id','amount','contractId','customerId','dueDate','invoiceId','number','paidAmount','projectId','status'],
  invoices: ['id','amount','contractId','customerId','dueDate','externalId','externalSystem','issuedAt','items','lastSyncedAt','number','paidAmount','projectId','proposalId','status','syncStatus'],
  'job-openings': ['id','applicants','department','employmentType','openings','postedAt','status','title'],
  'lead-activities': ['id','actorId','description','leadId','occurredAt','title','type'],
  'lead-contract-versions': ['id','leadId','version','title','status','amount','fileName','fileType','fileRecordId','sentAt','sentVia','feedback'],
  'lead-proposal-versions': ['id','leadId','version','title','status','amount','fileName','fileType','fileRecordId','sentAt','sentVia','feedback'],
  leads: ['id','assignedTo','company','email','estimatedValue','lastContactAt','name','nextFollowUpAt','notes','phone','source','status','tags','firstName','lastName','phones','emails','address','city','province','country','postalCode','companyId','website','stage','referralContact','referralDescription'],
  'leave-requests': ['id','approverId','days','employeeId','endDate','leaveType','reason','startDate','status'],
  messages: ['id','body','conversationId','read','senderId','sentAt','attachments'],
  missions: ['id','actualCost','approverId','days','description','destination','employeeId','endDate','estimatedCost','purpose','startDate','status'],
  'monitoring-activities': ['id','employeeId','deviceId','projectId','application','title','startedAt','endedAt','duration','status'],
  'monitoring-alerts': ['id','description','deviceId','employeeId','severity','status','title'],
  'monitoring-audit': ['id','actorId','actorName','event','ip','projectId','sessionId','severity','target','timestamp'],
  'monitoring-goals': ['id','employeeId','title','description','target','current','period','status','dueDate'],
  'monitoring-grants': ['id','capabilities','consentMode','customerVisible','deviceId','expiresAt','operatorId','projectId','reason','startAt','status','subjectId','ticketId'],
  'monitoring-idle': ['id','employeeId','deviceId','startedAt','endedAt','duration','reason','status'],
  'monitoring-sessions': ['id','capabilities','consentMode','customerVisible','deviceId','duration','endedAt','ip','operatorId','operatorName','projectId','reason','startedAt','status','subjectId','ticketId'],
  notifications: ['id','body','entityId','entityType','priority','projectId','read','recipientId','taskId','ticketId','title','type'],
  payments: ['id','amount','bankAccountId','customerId','externalId','externalSystem','invoiceId','method','paidAt','projectId','receiptNumber','reference','status','syncStatus'],
  payroll: ['id','baseSalary','benefits','deductions','employeeId','month','netSalary','overtime','paidAt','status','tax'],
  'performance-reasons': ['id','category','defaultPoints','direction','title'],
  'personnel-events': ['id','date','description','employeeId','title','type','projectId','attachmentId'],
  products: ['id','active','category','name','price','sku','stock','taxRate','type','unit'],
  'project-accesses': ['id','content','documentId','expiryDate','grantedBy','notes','projectId','projectMemberId','roleId','scope','startDate','status','kind','system','resource','permission','username','secret'],
  'project-activities': ['id','customerVisible','description','expectedHours','objective','projectId','roleId','title'],
  'project-members': ['id','hourlyCost','joinedAt','leftAt','personId','projectId','responsibilities','role','roleIds','status'],
  'project-notes': ['id','authorId','body','category','customerVisible','projectId','taskId','title'],
  'project-phases': ['id','customerVisible','description','endDate','managerId','progress','projectId','startDate','status','title'],
  'project-role-templates': ['id','customerVisible','description','expectedHours','name','objectives','requiredSkills','responsibilities'],
  'project-roles': ['id','customerVisible','description','expectedHours','name','objectives','projectId','requiredSkills','responsibilities','templateId'],
  'project-sales': ['id','amount','customerId','date','documentNumber','projectId','status','title','type'],
  proposals: ['id','amount','customerId','issuedAt','items','number','ownerId','projectId','relatedLeadId','status','title','validUntil'],
  'recruitment-candidates-v2': ['id','appliedAt','description','email','fullName','grade','jobId','lossReason','meetings','otherSource','ownerId','phone','resume','source','stage','status'],
  screenshots: ['id','application','capturedAt','customerVisible','deviceId','deviceName','employeeId','label','projectId','retentionDays','tone'],
  suppliers: ['id','balance','contactName','email','name','phone','type'],
  'task-labels': ['id','color','icon','name'],
  tickets: ['id','activities','assigneeId','category','contactEmail','contactName','contactPhone','customerId','customerVisible','department','description','dueDate','priority','projectId','replies','reporterId','service','status','tags','title'],
  timesheets: ['id','billable','billingStatus','calculatedCost','customerVisible','date','description','employeeId','endTime','hourlyRate','hours','projectId','startTime','status','taskId'],
};

const numericFields = new Set(['amount','balance','value','compensation','health','hours','days','actualCost','estimatedCost','duration','current','progress','target','number','paidAmount','applicants','openings','estimatedValue','grade','defaultPoints','price','stock','taxRate','expectedHours','hourlyCost','retentionDays','unreadCount','baseSalary','benefits','deductions','netSalary','overtime','tax','hourlyRate','regularHours','overtimeHours','overtimeAmount','insurance','calculatedCost','version']);
const booleanFields = new Set(['active','billable','customerVisible','isDefault','read','renewal','signed']);
const arrayFields = new Set(['additionalPhones','attachments','capabilities','groups','items','lineItems','meetings','memberIds','objectives','participantIds','phones','emails','replies','requiredSkills','responsibilities','roleIds','tags','activities']);
const objectFields = new Set(['metadata','resume','content']);
const dateFields = new Set(['acceptedDate','appliedAt','capturedAt','checkIn','checkOut','date','dueDate','endDate','endedAt','expiresAt','expiryDate','issuedAt','joinedAt','lastContact','lastContactAt','lastSeen','lastSyncedAt','leftAt','month','nextFollowUpAt','occurredAt','paidAt','postedAt','requestDate','requestedDate','sentAt','startAt','startDate','startedAt','timestamp','validityDate','validUntil']);

const legacyEnums: Partial<Record<LegacyResourceName, Record<string, readonly string[]>>> = {
  contracts: { status: ['draft', 'pending', 'active', 'expiring', 'expired', 'terminated'] },
  devices: { status: ['online', 'offline', 'busy'] },
  goals: { status: ['in_progress', 'completed', 'overdue', 'cancelled'] },
  invoices: { status: ['draft', 'sent', 'viewed', 'approved', 'rejected', 'expired', 'issued', 'partial', 'paid', 'overdue', 'cancelled'] },
  'leave-requests': { status: ['pending', 'approved', 'rejected', 'cancelled'] },
  missions: { status: ['pending', 'approved', 'in_progress', 'completed', 'rejected', 'cancelled'] },
  'monitoring-grants': { status: ['pending', 'active', 'expired', 'revoked', 'denied'] },
  'monitoring-sessions': { status: ['pending', 'active', 'ended', 'rejected'] },
  payments: { status: ['ثبت شده', 'در انتظار تایید', 'تایید شده', 'برگشت خورده'] },
  payroll: { status: ['draft', 'approved', 'paid'] },
  'performance-reasons': { direction: ['positive', 'negative'] },
  'project-accesses': { scope: ['project', 'role', 'person'], status: ['granted', 'revoked'] },
  'project-members': { status: ['active', 'inactive'] },
  'project-phases': { status: ['planned', 'in_progress', 'completed', 'on_hold'] },
  tickets: { status: ['open', 'in_progress', 'waiting', 'closed'], priority: ['low', 'medium', 'high', 'urgent'] },
  timesheets: { status: ['approved', 'pending_review', 'review_again', 'suspended', 'rejected'], billingStatus: ['paid', 'purchase_invoice_registered', 'purchase_invoice_queued', 'payment_queued', 'suspended'] },
};

const legacyImmutableOnUpdate: Partial<Record<LegacyResourceName, readonly string[]>> = {
  'bank-accounts': ['balance'],
  'documents-v2': ['acceptedDate'],
  installments: ['paidAmount'],
  invoices: ['paidAmount'],
  'leave-requests': ['approverId', 'status'],
  missions: ['approverId', 'status'],
  payments: ['status'],
  payroll: ['netSalary', 'status', 'paidAt'],
  suppliers: ['balance'],
  timesheets: ['calculatedCost', 'status', 'billingStatus'],
};

function legacyFieldSchema(resource: LegacyResourceName, field: string): ValueSchema<unknown> {
  const values = legacyEnums[resource]?.[field];
  if (values) return v.string({ values });
  if (numericFields.has(field)) return v.number();
  if (booleanFields.has(field)) return v.boolean();
  if (arrayFields.has(field) || field.endsWith('Ids')) return v.array(v.json, { max: 500 });
  if (objectFields.has(field)) return v.jsonObject;
  if (dateFields.has(field) || field.endsWith('At')) return v.date;
  if (field === 'email' || field.endsWith('Email')) return v.email;
  if (field === 'id' || field.endsWith('Id')) return v.id;
  return v.string({ max: 10_000 });
}

export function legacyMutationSchema(resource: LegacyResourceName, update: boolean): ValueSchema<Record<string, unknown>> {
  const fields = legacyFields[resource];
  const immutable = update ? legacyImmutableOnUpdate[resource] || [] : [];
  const shape = Object.fromEntries(fields.filter((field) => !(update && (field === 'id' || immutable.includes(field)))).map((field) => [field, v.optional(legacyFieldSchema(resource, field))]));
  return v.object(shape, { strip: [...protectedInputFields, ...(update ? ['id', ...immutable] : [])], atLeastOne: true });
}

export const legacyBulkSchema = (resource: LegacyResourceName) => v.object({ items: v.array(legacyMutationSchema(resource, false), { max: 1000 }) });

export const fileListQuerySchema = v.object({ projectId: optionalId, customerId: optionalId, employeeId: optionalId, folderId: optionalId, contextKind: optionalShort, contextId: optionalId });
export const fileContentQuerySchema = v.object({ disposition: v.optional(v.string({ values: ['inline', 'attachment'] })) });
export const fileUploadBodySchema = v.object({
  name: optionalShort, visibility: v.optional(v.string({ values: ['private', 'workspace'] })), customerVisible: v.optional(v.boolean({ coerce: true })),
  customerId: optionalId, projectId: optionalId, employeeId: optionalId, folderId: optionalId, contextKind: optionalShort, contextId: optionalId,
  description: optionalText, tags: v.optional(v.array(v.string({ min: 1, max: 100 }), { max: 100, coerceJson: true })),
}, { strip: protectedInputFields });
export const fileUpdateSchema = v.object({
  name: optionalShort, description: optionalText, tags: optionalStringList, favorite: optionalBoolean, visibility: v.optional(v.string({ values: ['private', 'workspace'] })),
  customerVisible: optionalBoolean, customerId: optionalId, projectId: optionalId, employeeId: optionalId, folderId: optionalId, contextKind: optionalShort, contextId: optionalId,
}, { strip: protectedInputFields, atLeastOne: true });
