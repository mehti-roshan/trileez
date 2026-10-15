import type { Permission, Role, UserRecord } from '../types/entities.js';

export const ROLE_PERMISSIONS: Record<Role, readonly Permission[]> = {
  admin: ['project:view', 'project:create', 'project:update', 'task:view', 'task:create', 'task:update', 'finance:view', 'finance:pay', 'hr:view', 'hr:manage-users', 'hr:manage-performance', 'hr:reopen-performance', 'reports:view', 'document:view'],
  manager: ['project:view', 'project:create', 'project:update', 'task:view', 'task:create', 'task:update', 'hr:view', 'hr:manage-performance', 'reports:view', 'document:view'],
  member: ['project:view', 'task:view', 'task:create', 'document:view'],
  customer: ['project:view', 'task:view', 'document:view'],
};

export function permissionsFor(user: Pick<UserRecord, 'role' | 'permissionOverrides'>): Permission[] {
  const inherited = ROLE_PERMISSIONS[user.role] || [];
  const additions = user.permissionOverrides?.additions || [];
  const removals = new Set(user.permissionOverrides?.removals || []);
  return [...new Set([...inherited, ...additions])].filter((permission) => !removals.has(permission));
}

export function hasPermission(user: Pick<UserRecord, 'role' | 'permissionOverrides'>, permission: Permission): boolean {
  return permissionsFor(user).includes(permission);
}
