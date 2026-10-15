import { database } from '../db/database.js';
import { relationshipIssue } from '../middleware/validate.js';
import type { SensitiveResourceConfig } from './sensitiveResourceService.js';

function ensureDateOrder(input: Record<string, unknown>, startField: string, endField: string): void {
  if (input[startField] && input[endField] && Date.parse(String(input[endField])) < Date.parse(String(input[startField]))) {
    throw relationshipIssue(`body.${endField}`, `${endField} must not be before ${startField}`);
  }
}

async function validateProjectCustomer(organizationId: string, input: Record<string, unknown>): Promise<void> {
  if (!input.projectId || !input.customerId) return;
  const project = await database.forOrganization(organizationId).get('Project', String(input.projectId));
  if (project && project.customerId && project.customerId !== input.customerId) throw relationshipIssue('body.projectId', 'Project belongs to a different customer');
}

async function validateInvoice(organizationId: string, input: Record<string, unknown>): Promise<void> {
  ensureDateOrder(input, 'issuedAt', 'dueDate');
  await validateProjectCustomer(organizationId, input);
  if (!input.contractId) return;
  const contract = await database.forOrganization(organizationId).get('Contract', String(input.contractId));
  if (contract && input.customerId && contract.customerId !== input.customerId) throw relationshipIssue('body.contractId', 'Contract belongs to a different customer');
}

async function validatePayment(organizationId: string, input: Record<string, unknown>): Promise<void> {
  await validateProjectCustomer(organizationId, input);
  const invoice = await database.forOrganization(organizationId).get('Invoice', String(input.invoiceId));
  if (!invoice) return;
  if (invoice.customerId !== input.customerId) throw relationshipIssue('body.invoiceId', 'Invoice belongs to a different customer');
  if (input.projectId && invoice.projectId && invoice.projectId !== input.projectId) throw relationshipIssue('body.projectId', 'Project does not match the invoice');
}

async function validateInstallment(organizationId: string, input: Record<string, unknown>): Promise<void> {
  await validateProjectCustomer(organizationId, input);
  const db = database.forOrganization(organizationId);
  const [contract, invoice] = await Promise.all([
    db.get('Contract', String(input.contractId)), db.get('Invoice', String(input.invoiceId)),
  ]);
  if (contract && contract.customerId !== input.customerId) throw relationshipIssue('body.contractId', 'Contract belongs to a different customer');
  if (invoice && invoice.customerId !== input.customerId) throw relationshipIssue('body.invoiceId', 'Invoice belongs to a different customer');
  if (invoice?.contractId && invoice.contractId !== input.contractId) throw relationshipIssue('body.invoiceId', 'Invoice belongs to a different contract');
}

export const financeConfigs: readonly SensitiveResourceConfig[] = [
  {
    model: 'Contract', resource: 'contracts',
    relationships: [
      { field: 'customerId', resource: 'Customer' }, { field: 'projectId', resource: 'Project' }, { field: 'ownerId', resource: 'User' },
    ],
    prepareCreate: (input) => ({ status: 'draft', renewal: false, customerVisible: false, ...input }),
    validate: async (organizationId, input) => { ensureDateOrder(input, 'startDate', 'endDate'); await validateProjectCustomer(organizationId, input); },
    unique: [{ fields: ['number'], message: 'Contract number is already in use' }],
    validateDelete: async (organizationId, current) => {
      const db = database.forOrganization(organizationId);
      if (await db.count('Invoice', { contractId: current.id }) || await db.count('Installment', { contractId: current.id })) throw relationshipIssue('params.id', 'Contract is referenced by invoices or installments');
    },
  },
  {
    model: 'Invoice', resource: 'invoices',
    relationships: [
      { field: 'customerId', resource: 'Customer' }, { field: 'projectId', resource: 'Project' }, { field: 'contractId', resource: 'Contract' },
      { field: 'proposalId', resource: 'proposals', storage: 'legacy' },
    ],
    prepareCreate: (input) => ({ paidAmount: 0, status: 'draft', ...input }), validate: validateInvoice,
    unique: [{ fields: ['number'], message: 'Invoice number is already in use' }],
    validateDelete: async (organizationId, current) => {
      const db = database.forOrganization(organizationId);
      if (await db.count('Payment', { invoiceId: current.id }) || await db.count('Installment', { invoiceId: current.id })) throw relationshipIssue('params.id', 'Invoice is referenced by payments or installments');
    },
  },
  {
    model: 'Payment', resource: 'payments',
    relationships: [
      { field: 'customerId', resource: 'Customer' }, { field: 'invoiceId', resource: 'Invoice' }, { field: 'projectId', resource: 'Project' },
      { field: 'bankAccountId', resource: 'BankAccount' },
    ],
    prepareCreate: (input) => ({ status: 'ثبت شده', ...input }), validate: validatePayment,
    unique: [{ fields: ['receiptNumber'], message: 'Payment receipt number is already in use' }],
  },
  {
    model: 'Installment', resource: 'installments',
    relationships: [
      { field: 'contractId', resource: 'Contract' }, { field: 'invoiceId', resource: 'Invoice' }, { field: 'customerId', resource: 'Customer' },
      { field: 'projectId', resource: 'Project' },
    ],
    prepareCreate: (input) => ({ paidAmount: 0, status: 'future', ...input }), validate: validateInstallment,
    unique: [{ fields: ['contractId', 'number'], message: 'Installment number already exists for this contract' }],
  },
  {
    model: 'Expense', resource: 'expenses',
    relationships: [
      { field: 'projectId', resource: 'Project' }, { field: 'supplierId', resource: 'Supplier' }, { field: 'bankAccountId', resource: 'BankAccount' },
    ],
    prepareCreate: (input) => ({ status: 'pending', ...input }),
  },
  { model: 'BankAccount', resource: 'bank-accounts', prepareCreate: (input) => ({ balance: 0, status: 'active', ...input }), validateDelete: async (organizationId, current) => {
    const db = database.forOrganization(organizationId); if (await db.count('Payment', { bankAccountId: current.id }) || await db.count('Expense', { bankAccountId: current.id })) throw relationshipIssue('params.id', 'Bank account is referenced by payments or expenses');
  } },
  { model: 'Supplier', resource: 'suppliers', prepareCreate: (input) => ({ balance: 0, ...input }), validateDelete: async (organizationId, current) => {
    if (await database.forOrganization(organizationId).count('Expense', { supplierId: current.id })) throw relationshipIssue('params.id', 'Supplier is referenced by expenses');
  } },
  {
    model: 'ProjectSale', resource: 'project-sales',
    relationships: [{ field: 'projectId', resource: 'Project' }, { field: 'customerId', resource: 'Customer' }],
    validate: validateProjectCustomer,
    unique: [{ fields: ['documentNumber'], message: 'Sale document number is already in use' }],
  },
] as const;

export function calculatePayroll(input: Record<string, unknown>): number {
  const number = (field: string) => typeof input[field] === 'number' ? input[field] as number : 0;
  return Math.max(0, number('baseSalary') + number('overtime') + number('benefits') + number('adjustments') - number('deductions') - number('tax'));
}
