import type { User } from '../types/index.ts';

export type ResourceKind = 'project' | 'customer' | 'file' | 'conversation' | 'employee' | 'monitoring';
export type ResourceAccess = 'view' | 'edit' | 'delete' | 'share';

export function canAccessResource(user: User, resource: { ownerId?: string; memberIds?: string[]; visibility?: 'private' | 'workspace' }, access: ResourceAccess = 'view', kind: ResourceKind = 'project') {
  if (user.role === 'admin') return true;
  if (access === 'delete' && user.role !== 'manager') return false;
  if (resource.visibility === 'workspace') return true;
  if (resource.ownerId === user.id || resource.memberIds?.includes(user.id)) return true;
  return kind === 'conversation' && access === 'view';
}

export const permission = { canAccessResource };

export const monitoringPermissions = {
  view: (user: User) => user.role === 'admin' || user.role === 'manager',
  manageGrants: (user: User) => user.role === 'admin' || user.role === 'manager',
  startSession: (user: User) => user.role === 'admin' || user.role === 'manager',
  audit: (user: User) => user.role === 'admin' || user.role === 'manager',
};
