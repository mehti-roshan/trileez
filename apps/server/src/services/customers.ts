import type { SensitiveResourceConfig } from './sensitiveResourceService.js';
import { database } from '../db/database.js';
import { relationshipIssue } from '../middleware/validate.js';

export const customerConfig: SensitiveResourceConfig = {
  model: 'Customer',
  resource: 'customers',
  relationships: [{ field: 'assignedTo', resource: 'User' }],
  unique: [{ fields: ['code'], message: 'Customer code is already in use' }],
  prepareCreate: (input) => ({ groups: [], status: 'lead', value: 0, ...input }),
  validateDelete: async (organizationId, current) => {
    const db = database.forOrganization(organizationId);
    const references = await Promise.all([
      db.count('Project', { customerId: current.id }), db.count('Contract', { customerId: current.id }), db.count('Invoice', { customerId: current.id }),
      db.count('Payment', { customerId: current.id }), db.count('Installment', { customerId: current.id }), db.count('ProjectSale', { customerId: current.id }),
      db.count('Meeting', { customerId: current.id }), db.count('FileRecord', { customerId: current.id }),
    ]);
    if (references.some(Boolean)) throw relationshipIssue('params.id', 'Customer is referenced by projects, finance records, meetings, or files');
  },
};
