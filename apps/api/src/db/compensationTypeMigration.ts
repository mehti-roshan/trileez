import { models } from '../models/index.js';

type CompensationType = 'full_time_attendance' | 'hourly_task';

function legacyFallback(employee: Record<string, unknown>): CompensationType {
  if (employee.employmentType === 'project') return 'hourly_task';
  if (Number(employee.hourlyRate || 0) > 0 && Number(employee.salary || 0) <= 0) return 'hourly_task';
  return 'full_time_attendance';
}

/**
 * Backfills the required employee classification without changing historical
 * compensation records. Existing effective-dated compensation wins; legacy
 * profile fields are used only when no compensation history exists.
 */
export async function backfillEmployeeCompensationTypes(): Promise<void> {
  const employees = await models.Employee.find({
    $or: [
      { compensationType: { $exists: false } },
      { compensationType: null },
      { compensationType: { $nin: ['full_time_attendance', 'hourly_task'] } },
    ],
  }).lean();
  if (!employees.length) return;

  const operations = await Promise.all(employees.map(async (employee) => {
    const compensation = await models.EmploymentCompensation.findOne({
      organizationId: employee.organizationId,
      employeeId: String(employee._id),
    }).sort({ effectiveFrom: -1, createdAt: -1 }).lean();
    const compensationType = compensation?.paymentMethod === 'hourly_task' || compensation?.paymentMethod === 'full_time_attendance'
      ? compensation.paymentMethod
      : legacyFallback(employee as Record<string, unknown>);
    return {
      updateOne: {
        filter: { _id: employee._id },
        update: { $set: { compensationType } },
      },
    };
  }));
  await models.Employee.bulkWrite(operations, { ordered: false });
}
