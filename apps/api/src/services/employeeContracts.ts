import { relationshipIssue } from '../middleware/validate.js';
import type { SensitiveResourceConfig } from './sensitiveResourceService.js';
import { assertAttachableFile } from './fileAccess.js';

export const employeeContractConfig: SensitiveResourceConfig = {
  model: 'EmployeeContract', resource: 'employee-contracts',
  relationships: [{ field: 'employeeId', resource: 'Employee' }, { field: 'fileId', resource: 'FileRecord' }],
  prepareCreate: (input) => ({ status: 'draft', signed: false, ...input }),
  validate: async (organizationId, input, _current, actorId) => {
    if (input.endDate && Date.parse(String(input.endDate)) < Date.parse(String(input.startDate))) {
      throw relationshipIssue('body.endDate', 'endDate must not be before startDate');
    }
    if (input.fileId && actorId) await assertAttachableFile(organizationId, actorId, String(input.fileId), 'body.fileId', { employeeId: String(input.employeeId) });
  },
};
