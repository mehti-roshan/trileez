import { hasPermission } from './permissions.js';
import type { Permission, Role, UserRecord } from '../types/entities.js';

export const accessActions = ['read', 'create', 'update', 'delete'] as const;
export type AccessAction = (typeof accessActions)[number];

interface AccessRule {
  roles: readonly Role[];
  permission?: Permission;
}

export type ResourceAccessPolicy = Record<AccessAction, AccessRule>;

const ADMIN = ['admin'] as const satisfies readonly Role[];
const MANAGEMENT = ['admin', 'manager'] as const satisfies readonly Role[];
const INTERNAL = ['admin', 'manager', 'member'] as const satisfies readonly Role[];
const EVERYONE = ['admin', 'manager', 'member', 'customer'] as const satisfies readonly Role[];
const NONE = [] as const satisfies readonly Role[];

const rule = (roles: readonly Role[], permission?: Permission): AccessRule => permission ? { roles, permission } : { roles };
const policy = (
  readRoles: readonly Role[],
  createRoles: readonly Role[],
  updateRoles: readonly Role[],
  deleteRoles: readonly Role[],
  permissions: Partial<Record<AccessAction, Permission>> = {},
): ResourceAccessPolicy => ({
  read: rule(readRoles, permissions.read),
  create: rule(createRoles, permissions.create),
  update: rule(updateRoles, permissions.update),
  delete: rule(deleteRoles, permissions.delete),
});

export const legacyResourceNames = [
  'activities',
  'activity-logs',
  'bank-accounts',
  'chat-groups',
  'contracts',
  'conversations',
  'credential-audit-events',
  'customers',
  'devices',
  'documents-v2',
  'employee-contracts',
  'expenses',
  'file-folders',
  'goals',
  'installments',
  'invoices',
  'job-openings',
  'lead-activities',
  'lead-contract-versions',
  'lead-proposal-versions',
  'leads',
  'leave-requests',
  'messages',
  'missions',
  'monitoring-activities',
  'monitoring-alerts',
  'monitoring-audit',
  'monitoring-goals',
  'monitoring-grants',
  'monitoring-idle',
  'monitoring-sessions',
  'notifications',
  'payments',
  'payroll',
  'performance-reasons',
  'personnel-events',
  'products',
  'project-accesses',
  'project-activities',
  'project-members',
  'project-notes',
  'project-phases',
  'project-role-templates',
  'project-roles',
  'project-sales',
  'proposals',
  'recruitment-candidates-v2',
  'screenshots',
  'suppliers',
  'task-labels',
  'tickets',
  'timesheets',
] as const;

export type LegacyResourceName = (typeof legacyResourceNames)[number];
export type ResourceAccessName =
  | 'dashboard'
  | 'users'
  | 'employees'
  | 'projects'
  | 'tasks'
  | 'meetings'
  | 'project-events'
  | 'performance-events'
  | 'performance-periods'
  | 'files'
  | 'audit'
  | 'jobs'
  | 'compensations'
  | 'attendance'
  | LegacyResourceName;

export const RESOURCE_ACCESS = {
  dashboard: policy(INTERNAL, NONE, NONE, NONE),
  users: policy(INTERNAL, ADMIN, ADMIN, ADMIN, { create: 'hr:manage-users', update: 'hr:manage-users', delete: 'hr:manage-users' }),
  employees: policy(MANAGEMENT, ADMIN, ADMIN, ADMIN, { read: 'hr:view', create: 'hr:manage-users', update: 'hr:manage-users', delete: 'hr:manage-users' }),
  projects: policy(INTERNAL, MANAGEMENT, MANAGEMENT, MANAGEMENT, { read: 'project:view', create: 'project:create', update: 'project:update', delete: 'project:update' }),
  tasks: policy(INTERNAL, INTERNAL, MANAGEMENT, MANAGEMENT, { read: 'task:view', create: 'task:create', update: 'task:update', delete: 'task:update' }),
  meetings: policy(INTERNAL, MANAGEMENT, MANAGEMENT, MANAGEMENT, { read: 'project:view', create: 'project:update', update: 'project:update', delete: 'project:update' }),
  'project-events': policy(INTERNAL, MANAGEMENT, MANAGEMENT, MANAGEMENT, { read: 'project:view', create: 'project:update', update: 'project:update', delete: 'project:update' }),
  'performance-events': policy(MANAGEMENT, MANAGEMENT, NONE, NONE, { read: 'hr:view', create: 'hr:manage-performance' }),
  'performance-periods': policy(MANAGEMENT, MANAGEMENT, ADMIN, NONE, { read: 'hr:view', create: 'hr:manage-performance', update: 'hr:reopen-performance' }),
  files: policy(EVERYONE, EVERYONE, EVERYONE, EVERYONE, { read: 'document:view', create: 'document:view', update: 'document:view', delete: 'document:view' }),
  audit: policy(MANAGEMENT, NONE, NONE, NONE),
  jobs: policy(MANAGEMENT, MANAGEMENT, MANAGEMENT, ADMIN),
  compensations: policy(ADMIN, ADMIN, ADMIN, ADMIN),

  customers: policy(INTERNAL, MANAGEMENT, MANAGEMENT, MANAGEMENT),
  timesheets: policy(INTERNAL, INTERNAL, MANAGEMENT, MANAGEMENT),
  notifications: policy(INTERNAL, MANAGEMENT, INTERNAL, MANAGEMENT),
  tickets: policy(INTERNAL, INTERNAL, INTERNAL, MANAGEMENT),
  invoices: policy(ADMIN, ADMIN, ADMIN, ADMIN),
  payments: policy(ADMIN, ADMIN, ADMIN, ADMIN),
  contracts: policy(ADMIN, ADMIN, ADMIN, ADMIN),
  'job-openings': policy(INTERNAL, MANAGEMENT, MANAGEMENT, MANAGEMENT),
  'recruitment-candidates-v2': policy(MANAGEMENT, MANAGEMENT, MANAGEMENT, MANAGEMENT),
  payroll: policy(ADMIN, ADMIN, ADMIN, ADMIN),
  'credential-audit-events': policy(ADMIN, NONE, NONE, NONE),
  'documents-v2': policy(INTERNAL, MANAGEMENT, MANAGEMENT, MANAGEMENT),
  leads: policy(INTERNAL, MANAGEMENT, MANAGEMENT, MANAGEMENT),
  'lead-activities': policy(INTERNAL, MANAGEMENT, MANAGEMENT, MANAGEMENT),
  'lead-proposal-versions': policy(INTERNAL, MANAGEMENT, MANAGEMENT, MANAGEMENT),
  'lead-contract-versions': policy(INTERNAL, MANAGEMENT, MANAGEMENT, MANAGEMENT),
  proposals: policy(INTERNAL, MANAGEMENT, MANAGEMENT, MANAGEMENT),
  products: policy(INTERNAL, MANAGEMENT, MANAGEMENT, MANAGEMENT),
  installments: policy(ADMIN, ADMIN, ADMIN, ADMIN),
  expenses: policy(ADMIN, ADMIN, ADMIN, ADMIN),
  'file-folders': policy(INTERNAL, INTERNAL, INTERNAL, MANAGEMENT),
  suppliers: policy(ADMIN, ADMIN, ADMIN, ADMIN),
  'project-members': policy(INTERNAL, MANAGEMENT, MANAGEMENT, MANAGEMENT),
  'project-role-templates': policy(INTERNAL, MANAGEMENT, MANAGEMENT, MANAGEMENT),
  'project-roles': policy(INTERNAL, MANAGEMENT, MANAGEMENT, MANAGEMENT),
  'project-activities': policy(INTERNAL, MANAGEMENT, MANAGEMENT, MANAGEMENT),
  'project-accesses': policy(MANAGEMENT, MANAGEMENT, MANAGEMENT, MANAGEMENT),
  'task-labels': policy(INTERNAL, MANAGEMENT, MANAGEMENT, MANAGEMENT),
  goals: policy(INTERNAL, MANAGEMENT, MANAGEMENT, MANAGEMENT),
  'personnel-events': policy(MANAGEMENT, ADMIN, ADMIN, ADMIN),
  'employee-contracts': policy(MANAGEMENT, ADMIN, ADMIN, ADMIN),
  'project-phases': policy(INTERNAL, MANAGEMENT, MANAGEMENT, MANAGEMENT),
  'project-notes': policy(INTERNAL, INTERNAL, INTERNAL, MANAGEMENT),
  'project-sales': policy(ADMIN, ADMIN, ADMIN, ADMIN),
  devices: policy(MANAGEMENT, MANAGEMENT, MANAGEMENT, MANAGEMENT),
  'monitoring-sessions': policy(MANAGEMENT, MANAGEMENT, MANAGEMENT, MANAGEMENT),
  screenshots: policy(MANAGEMENT, MANAGEMENT, MANAGEMENT, MANAGEMENT),
  'monitoring-grants': policy(MANAGEMENT, MANAGEMENT, MANAGEMENT, MANAGEMENT),
  'monitoring-alerts': policy(MANAGEMENT, MANAGEMENT, MANAGEMENT, MANAGEMENT),
  'monitoring-audit': policy(MANAGEMENT, NONE, NONE, NONE),
  'monitoring-activities': policy(MANAGEMENT, MANAGEMENT, MANAGEMENT, MANAGEMENT),
  'monitoring-idle': policy(MANAGEMENT, MANAGEMENT, MANAGEMENT, MANAGEMENT),
  'monitoring-goals': policy(MANAGEMENT, MANAGEMENT, MANAGEMENT, MANAGEMENT),
  activities: policy(MANAGEMENT, MANAGEMENT, MANAGEMENT, ADMIN),
  'activity-logs': policy(MANAGEMENT, NONE, NONE, NONE),
  'bank-accounts': policy(ADMIN, ADMIN, ADMIN, ADMIN),
  attendance: policy(MANAGEMENT, MANAGEMENT, MANAGEMENT, ADMIN),
  'leave-requests': policy(MANAGEMENT, INTERNAL, MANAGEMENT, ADMIN),
  missions: policy(MANAGEMENT, INTERNAL, MANAGEMENT, ADMIN),
  'performance-reasons': policy(MANAGEMENT, MANAGEMENT, MANAGEMENT, MANAGEMENT),
  conversations: policy(INTERNAL, INTERNAL, INTERNAL, INTERNAL),
  'chat-groups': policy(INTERNAL, INTERNAL, INTERNAL, INTERNAL),
  messages: policy(INTERNAL, INTERNAL, INTERNAL, INTERNAL),
} as const satisfies Record<ResourceAccessName, ResourceAccessPolicy>;

const legacyResourceSet = new Set<string>(legacyResourceNames);

export function isLegacyResourceName(value: string): value is LegacyResourceName {
  return legacyResourceSet.has(value);
}

export function canAccessResource(user: Pick<UserRecord, 'role' | 'permissionOverrides'>, resource: ResourceAccessName, action: AccessAction): boolean {
  const access = RESOURCE_ACCESS[resource][action];
  if (!access.roles.includes(user.role)) return false;
  return !access.permission || hasPermission(user, access.permission);
}
