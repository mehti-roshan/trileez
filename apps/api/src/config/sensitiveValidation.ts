import { protectedInputFields } from './requestValidation.js';
import { v } from '../middleware/validate.js';
import type { ValueSchema } from '../middleware/validate.js';

type Fields = Record<string, ValueSchema<unknown>>;

function mutationSchemas(
  fields: Fields,
  required: readonly string[],
  options: { createProtected?: readonly string[]; updateProtected?: readonly string[] } = {},
) {
  const createProtected = new Set(options.createProtected || []);
  const updateProtected = new Set(['id', ...(options.updateProtected || [])]);
  const createShape = Object.fromEntries(Object.entries(fields)
    .filter(([key]) => !createProtected.has(key))
    .map(([key, validator]) => [key, required.includes(key) ? validator : v.optional(validator)]));
  const updateShape = Object.fromEntries(Object.entries(fields)
    .filter(([key]) => !updateProtected.has(key))
    .map(([key, validator]) => [key, v.optional(validator)]));
  const createStrip = [...protectedInputFields, ...createProtected];
  const updateStrip = [...protectedInputFields, ...updateProtected];
  return {
    create: v.object(createShape, { strip: createStrip }),
    update: v.object(updateShape, { strip: updateStrip, atLeastOne: true }),
    bulk: v.object({ items: v.array(v.object(createShape, { strip: createStrip }), { max: 1000 }) }),
  };
}

const short = v.string({ min: 1, max: 500 });
const text = v.string({ max: 10_000 });
const money = v.number({ min: 0 });
const nonNegative = v.number({ min: 0 });
const stringList = v.array(v.string({ min: 1, max: 500 }), { max: 250 });
const syncFields: Fields = {
  externalSystem: v.string({ min: 1, max: 100, pattern: /^[A-Za-z0-9][A-Za-z0-9._-]*$/ }), externalId: short,
  syncStatus: v.string({ values: ['synced', 'pending', 'changed', 'error'] }), lastSyncedAt: v.date,
};
const lineItem = v.object({
  productId: v.id, quantity: nonNegative, unitPrice: money, discount: money, tax: money,
});

export const customerSchemas = mutationSchemas({
  id: v.id, code: short, entityType: v.string({ values: ['company', 'person'] }), name: short, company: short,
  email: v.email, phone: short, additionalPhones: stringList, fax: short, nationalCode: short, vatRegistrationNumber: short,
  groups: stringList, currency: short, country: short, province: short, city: short, postalCode: short, address: text,
  website: v.string({ max: 2_000 }), status: v.string({ values: ['active', 'inactive', 'lead'] }), value: money,
  lastContact: v.date, assignedTo: v.id,
}, ['entityType', 'name', 'company', 'currency']);

export const contractSchemas = mutationSchemas({
  id: v.id, number: short, customerId: v.id, projectId: v.id, title: short, amount: money, startDate: v.date, endDate: v.date,
  status: v.string({ values: ['draft', 'pending', 'active', 'expiring', 'expired', 'terminated'] }), renewal: v.boolean(),
  ownerId: v.id, paymentTerms: text, customerVisible: v.boolean(), ...syncFields,
}, ['number', 'customerId', 'title', 'amount', 'startDate', 'endDate', 'ownerId', 'paymentTerms'], { updateProtected: ['customerId'] });

export const invoiceSchemas = mutationSchemas({
  id: v.id, number: short, customerId: v.id, projectId: v.id, contractId: v.id, proposalId: v.id,
  amount: money, paidAmount: money,
  status: v.string({ values: ['draft', 'sent', 'viewed', 'approved', 'rejected', 'expired', 'issued', 'partial', 'paid', 'overdue', 'cancelled'] }),
  issuedAt: v.date, dueDate: v.date, items: v.array(lineItem, { max: 500 }), ...syncFields,
}, ['number', 'customerId', 'amount', 'issuedAt', 'dueDate', 'items'], { createProtected: ['paidAmount', 'status'], updateProtected: ['customerId', 'paidAmount', 'status'] });

export const paymentSchemas = mutationSchemas({
  id: v.id, receiptNumber: short, customerId: v.id, invoiceId: v.id, projectId: v.id, bankAccountId: v.id,
  amount: money, method: v.string({ values: ['انتقال بانکی', 'کارت', 'چک', 'نقدی', 'درگاه اینترنتی', 'سایر'] }),
  paidAt: v.date, reference: short, status: v.string({ values: ['ثبت شده', 'در انتظار تایید', 'تایید شده', 'برگشت خورده'] }), ...syncFields,
}, ['receiptNumber', 'customerId', 'invoiceId', 'amount', 'method', 'paidAt', 'reference'], { createProtected: ['status'], updateProtected: ['customerId', 'invoiceId', 'status'] });

export const installmentSchemas = mutationSchemas({
  id: v.id, contractId: v.id, invoiceId: v.id, customerId: v.id, projectId: v.id, number: v.number({ min: 1, integer: true }),
  dueDate: v.date, amount: money, paidAmount: money, status: v.string({ values: ['future', 'due', 'partial', 'paid', 'overdue'] }),
}, ['contractId', 'invoiceId', 'customerId', 'number', 'dueDate', 'amount'], { createProtected: ['paidAmount', 'status'], updateProtected: ['contractId', 'invoiceId', 'customerId', 'number', 'paidAmount', 'status'] });

export const bankAccountSchemas = mutationSchemas({
  id: v.id, bankName: short, label: short, maskedNumber: short, accountType: short, balance: v.number(),
  status: v.string({ values: ['active', 'inactive'] }),
}, ['bankName', 'label', 'maskedNumber', 'accountType'], { createProtected: ['balance'], updateProtected: ['balance'] });

export const supplierSchemas = mutationSchemas({
  id: v.id, name: short, contactName: short, phone: short, email: v.email, balance: v.number(), type: v.string({ values: ['supplier', 'both'] }),
}, ['name', 'type'], { createProtected: ['balance'], updateProtected: ['balance'] });

export const expenseSchemas = mutationSchemas({
  id: v.id, title: short, category: short, projectId: v.id, supplierId: v.id, amount: money, date: v.date,
  status: v.string({ values: ['paid', 'pending', 'approved'] }), paymentMethod: short, bankAccountId: v.id, description: text, ...syncFields,
}, ['title', 'category', 'amount', 'date', 'paymentMethod'], { createProtected: ['status'], updateProtected: ['status'] });

export const projectSaleSchemas = mutationSchemas({
  id: v.id, projectId: v.id, customerId: v.id, title: short, amount: money, type: short, status: short, date: v.date, documentNumber: short,
}, ['projectId', 'customerId', 'title', 'amount', 'type', 'status', 'date', 'documentNumber'], { updateProtected: ['projectId', 'customerId', 'documentNumber'] });

const scheduleDay = v.object({
  weekday: v.number({ min: 0, max: 6, integer: true }),
  expectedMinutes: v.number({ min: 0, max: 1_440, integer: true }),
});
const expectedSchedule = v.object({
  timezone: v.optional(v.string({ min: 1, max: 100 })),
  days: v.array(scheduleDay, { max: 7 }),
  weeklyExpectedMinutes: v.optional(v.number({ min: 0, max: 10_080, integer: true })),
});

export const compensationSchemas = mutationSchemas({
  id: v.id, employeeId: v.id, paymentMethod: v.string({ values: ['hourly_task', 'full_time_attendance'] }),
  effectiveFrom: v.date, effectiveTo: v.date, currency: v.string({ min: 3, max: 10 }), payPeriod: v.string({ values: ['monthly'] }),
  hourlyRate: money, monthlySalary: money, expectedSchedule,
  overtimeEnabled: v.boolean(), overtimeRateMultiplier: v.number({ min: 1, max: 10 }),
  status: v.string({ values: ['active', 'inactive'] }), notes: text,
}, ['employeeId', 'paymentMethod', 'effectiveFrom'], {
  updateProtected: ['employeeId', 'paymentMethod', 'effectiveFrom'],
});

export const attendanceSchemas = mutationSchemas({
  id: v.id, employeeId: v.id, compensationId: v.id, date: v.date, clockIn: v.date, clockOut: v.date,
  status: v.string({ values: ['present', 'absent', 'late', 'leave', 'mission', 'remote'] }),
  approvalStatus: v.string({ values: ['pending', 'approved', 'rejected'] }),
  expectedMinutes: nonNegative, workedMinutes: nonNegative, regularMinutes: nonNegative, overtimeMinutes: nonNegative,
  absenceMinutes: nonNegative, approvedLeaveMinutes: nonNegative, leaveRequestId: v.id,
  source: v.string({ values: ['manual', 'clock'] }), notes: text, approvedBy: v.id, approvedAt: v.date, rejectionReason: text,
}, ['employeeId', 'date', 'status'], {
  createProtected: ['compensationId', 'approvalStatus', 'expectedMinutes', 'workedMinutes', 'regularMinutes', 'overtimeMinutes', 'absenceMinutes', 'approvedLeaveMinutes', 'approvedBy', 'approvedAt', 'rejectionReason'],
  updateProtected: ['employeeId', 'date', 'compensationId', 'approvalStatus', 'expectedMinutes', 'workedMinutes', 'regularMinutes', 'overtimeMinutes', 'absenceMinutes', 'approvedLeaveMinutes', 'approvedBy', 'approvedAt', 'rejectionReason'],
});

export const attendanceReviewSchema = v.object({
  approvalStatus: v.string({ values: ['approved', 'rejected'] }),
  reason: v.optional(v.string({ min: 1, max: 2_000 })),
});
export const compensationInputQuerySchema = v.object({ from: v.date, to: v.date });

const payrollServerFields = [
  'compensationId', 'paymentMethod', 'taskTimeMinutes', 'attendanceMinutes', 'payrollMinutes', 'expectedMinutes',
  'regularMinutes', 'overtimeMinutes', 'absenceMinutes', 'approvedLeaveMinutes', 'baseSalary', 'workedHours',
  'hourlyRate', 'overtime', 'overtimeHours', 'benefits', 'adjustments', 'deductions', 'tax', 'netSalary',
  'grossBaseAmount', 'overtimeAmount', 'bonusAmount', 'adjustmentCreditAmount', 'adjustmentDebitAmount',
  'deductionAmount', 'grossAmount', 'finalPayableAmount', 'compensationSnapshot', 'taskLines', 'attendanceLines',
  'adjustmentSnapshots', 'calculationVersion', 'status', 'calculatedAt', 'calculatedBy', 'reviewedAt', 'reviewedBy',
  'approvedAt', 'approvedBy', 'paidAt', 'paidBy', 'paymentNote',
  'paymentRecordId', 'paymentDocumentId', 'paymentReference', 'paymentDocumentNumber', 'accountingSubmissionStatus',
] as const;

export const payrollDraftCreateSchema = v.object({
  id: v.optional(v.id), employeeId: v.id, month: short, periodStart: v.date, periodEnd: v.date,
}, { strip: [...protectedInputFields, ...payrollServerFields] });
export const payrollTransitionSchema = v.object({ reason: v.optional(v.string({ min: 1, max: 2_000 })) });
export const payrollPaymentSchema = v.object({
  paidAt: v.optional(v.date), paymentNote: v.optional(v.string({ min: 1, max: 2_000 })), reason: v.optional(v.string({ min: 1, max: 2_000 })),
  settlementMethod: v.optional(v.string({ values: ['bank_transfer', 'cash', 'cheque', 'other'] })),
  paymentReference: v.optional(v.string({ min: 1, max: 250 })),
});
const payrollAdjustmentFields = {
  type: v.string({ values: ['adjustment_credit', 'adjustment_debit', 'bonus', 'deduction'] }),
  amount: v.number({ min: 0.01 }), reason: v.string({ min: 1, max: 2_000 }), adjustmentDate: v.date,
};
export const payrollAdjustmentCreateSchema = v.object(payrollAdjustmentFields, { strip: protectedInputFields });
export const payrollAdjustmentUpdateSchema = v.object({
  type: v.optional(payrollAdjustmentFields.type), amount: v.optional(payrollAdjustmentFields.amount),
  reason: v.optional(payrollAdjustmentFields.reason), adjustmentDate: v.optional(payrollAdjustmentFields.adjustmentDate),
}, { strip: protectedInputFields, atLeastOne: true });
export const payrollAdjustmentParamsSchema = v.object({ id: v.id, adjustmentId: v.id });

export const employeeContractSchemas = mutationSchemas({
  id: v.id, employeeId: v.id, type: v.string({ values: ['استخدام', 'فریلنسری', 'کارآموزی', 'پیمانکاری', 'پاره‌وقت', 'تمام‌وقت'] }),
  startDate: v.date, endDate: v.date, status: v.string({ values: ['draft', 'active', 'expired', 'terminated'] }),
  hourlyRate: money, description: text, fileId: v.id, signed: v.boolean(),
}, ['employeeId', 'type', 'startDate'], { createProtected: ['signed'], updateProtected: ['employeeId', 'startDate', 'signed'] });

export const projectAccessSchemas = mutationSchemas({
  id: v.id, projectId: v.id, content: text, kind: v.string({ values: ['telegram', 'credentials', 'link', 'other'] }),
  system: short, resource: short, permission: short, username: short, secret: text,
  scope: v.string({ values: ['project', 'role', 'person'] }), status: v.string({ values: ['granted', 'revoked'] }),
  roleId: v.id, projectMemberId: v.id, startDate: v.date, expiryDate: v.date, documentId: v.id, requestId: v.id, notes: text,
  grantedBy: v.id,
}, ['projectId', 'content', 'scope'], {
  createProtected: ['grantedBy'],
  updateProtected: ['projectId', 'scope', 'roleId', 'projectMemberId', 'resource', 'permission', 'system', 'kind', 'grantedBy'],
});

export type SensitiveSchemas = typeof customerSchemas;
