import { database } from '../db/database.js';
import { relationshipIssue } from '../middleware/validate.js';
import type { AppRecord } from '../types/entities.js';

export interface EmployeeAssociation {
  state: 'active' | 'none' | 'inactive';
  employeeId: string | null;
  employmentStatus: string | null;
}

export interface SelfIdentity {
  userId: string;
  employee?: AppRecord;
  association: EmployeeAssociation;
  aliases: string[];
}

export interface OwnerScope {
  accessFilter: Record<string, unknown>;
  accessPredicate: (row: Record<string, unknown>) => boolean;
}

export function associationOf(employee: AppRecord | undefined): EmployeeAssociation {
  if (!employee) return { state: 'none', employeeId: null, employmentStatus: null };
  const status = typeof employee.employmentStatus === 'string' && employee.employmentStatus ? employee.employmentStatus : 'active';
  if (status === 'active') return { state: 'active', employeeId: employee.id, employmentStatus: status };
  return { state: 'inactive', employeeId: null, employmentStatus: status };
}

export async function linkedEmployee(organizationId: string, userId: string): Promise<AppRecord | undefined> {
  const rows = await database.forOrganization(organizationId).list('Employee', { userId });
  return rows.find((row) => row.employmentStatus === 'active') || rows[0];
}

export async function selfIdentity(organizationId: string, userId: string): Promise<SelfIdentity> {
  const employee = await linkedEmployee(organizationId, userId);
  const aliases = [userId];
  if (employee) aliases.push(employee.id);
  return { userId, ...(employee ? { employee } : {}), association: associationOf(employee), aliases };
}

export function includesAlias(value: unknown, aliases: readonly string[]): boolean {
  return typeof value === 'string' && aliases.includes(value);
}

export function includesAnyAlias(value: unknown, aliases: readonly string[]): boolean {
  return Array.isArray(value) && value.some((item) => includesAlias(item, aliases));
}

export function assignedTaskScope(aliases: readonly string[]): OwnerScope {
  return {
    accessFilter: { $or: [{ assigneeId: { $in: aliases } }, { assigneeIds: { $in: aliases } }] },
    accessPredicate: (row) => includesAlias(row.assigneeId, aliases) || includesAnyAlias(row.assigneeIds, aliases),
  };
}

export function authorizedMeetingScope(aliases: readonly string[]): OwnerScope {
  return {
    accessFilter: {
      $or: [
        { organizerId: { $in: aliases } },
        { participantIds: { $in: aliases } },
        { employeeIds: { $in: aliases } },
      ],
    },
    accessPredicate: (row) => includesAlias(row.organizerId, aliases)
      || includesAnyAlias(row.participantIds, aliases)
      || includesAnyAlias(row.employeeIds, aliases),
  };
}

export function ownEmployeeRecordScope(employeeId: string | undefined): OwnerScope {
  const ids = employeeId ? [employeeId] : [];
  const allowed = new Set(ids);
  return {
    accessFilter: { employeeId: { $in: ids } },
    accessPredicate: (row) => allowed.has(String(row.employeeId ?? '')),
  };
}

export function managesOrganization(role: string | undefined): boolean {
  return role === 'admin' || role === 'manager';
}

export async function memberRecordScope(organizationId: string, userId: string, role: string | undefined): Promise<OwnerScope | undefined> {
  if (managesOrganization(role)) return undefined;
  const employee = await linkedEmployee(organizationId, userId);
  return ownEmployeeRecordScope(employee?.id);
}

export async function memberMeetingScope(organizationId: string, userId: string, role: string | undefined): Promise<OwnerScope | undefined> {
  if (managesOrganization(role)) return undefined;
  const identity = await selfIdentity(organizationId, userId);
  return authorizedMeetingScope(identity.aliases);
}

/** Members and customers can record time only for their own active employee. Managers keep the existing employeeId field. */
export async function claimOwnTimeEntry(organizationId: string, actorId: string, input: Record<string, unknown>): Promise<void> {
  const user = await database.forOrganization(organizationId).get('User', actorId);
  if (!user || managesOrganization(typeof user.role === 'string' ? user.role : undefined)) return;
  const employee = await linkedEmployee(organizationId, actorId);
  const association = associationOf(employee);
  if (association.state !== 'active' || !employee) {
    throw relationshipIssue('body.employeeId', 'Time can only be recorded for an active employee record linked to the signed-in user');
  }
  const requested = input.employeeId === undefined || input.employeeId === null || input.employeeId === '' ? '' : String(input.employeeId);
  const aliases = new Set([actorId, employee.id]);
  if (requested && !aliases.has(requested)) {
    throw relationshipIssue('body.employeeId', 'Time can only be recorded for the signed-in employee');
  }
  input.employeeId = employee.id;
}
