import { roleDefinitions } from '../constants/roleDefinitions.ts';
import type { PermissionKey, User } from '../types/index.ts';

export type ResourceKind = 'project' | 'customer' | 'file' | 'conversation' | 'employee' | 'monitoring';
export type ResourceAccess = 'view' | 'edit' | 'delete' | 'share';

export function canAccessResource(user: User, resource: { ownerId?: string; memberIds?: string[]; customerId?: string; visibility?: 'private' | 'workspace' }, access: ResourceAccess = 'view', kind: ResourceKind = 'project') {
  if (user.role === 'admin') return true;
  if (user.role === 'customer') return access === 'view' && Boolean(user.customerId && resource.customerId === user.customerId);
  if (access === 'delete' && user.role !== 'manager') return false;
  if (resource.visibility === 'workspace') return true;
  if (resource.ownerId === user.id || resource.memberIds?.includes(user.id)) return true;
  return kind === 'conversation' && access === 'view';
}

export const permission = { canAccessResource };

export function hasPermission(user: User, permissionKey: PermissionKey): boolean {
  const role = roleDefinitions.find((definition) => definition.id === user.role);
  const inherited = role?.permissions ?? [];
  const additions = user.permissionOverrides?.additions ?? [];
  const removals = new Set(user.permissionOverrides?.removals ?? []);
  return (inherited.includes(permissionKey) || additions.includes(permissionKey)) && !removals.has(permissionKey);
}

export const monitoringPermissions = {
  view: (user: User) => user.role === 'admin' || user.role === 'manager',
  manageGrants: (user: User) => user.role === 'admin' || user.role === 'manager',
  startSession: (user: User) => user.role === 'admin' || user.role === 'manager',
  audit: (user: User) => user.role === 'admin' || user.role === 'manager',
};
