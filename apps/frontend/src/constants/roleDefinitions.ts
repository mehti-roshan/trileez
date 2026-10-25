import type { RoleDefinition } from '../types/index.ts';

/** Static UI labels and inherited permission descriptions, not business records. */
export const roleDefinitions: RoleDefinition[] = [
  { id: 'admin', label: 'مدیر سامانه', permissions: ['project:view', 'project:create', 'project:update', 'task:view', 'task:create', 'task:update', 'finance:view', 'finance:pay', 'hr:view', 'hr:manage-users', 'hr:manage-performance', 'hr:reopen-performance', 'reports:view', 'document:view'] },
  { id: 'manager', label: 'مدیر / سرپرست', permissions: ['project:view', 'project:create', 'project:update', 'task:view', 'task:create', 'task:update', 'finance:view', 'hr:view', 'hr:manage-performance', 'reports:view', 'document:view'] },
  { id: 'member', label: 'کارمند / همکار', permissions: ['project:view', 'task:view', 'task:create', 'task:update', 'document:view'] },
  { id: 'customer', label: 'کاربر مشتری', permissions: [] },
];
