import type { Customer, Project, Task, User } from '../types/index.ts';
import { customerRepository, projectRepository, taskRepository } from './repositories.ts';

export type RelationResult<T> = { ok: true; value: T } | { ok: false; reason: string };

export function projectWithCustomer(projectId: string): RelationResult<{ project: Project; customer: Customer }> {
  const project = projectRepository.get(projectId);
  if (!project) return { ok: false, reason: 'پروژه پیدا نشد.' };
  const customer = customerRepository.get(project.customerId);
  if (!customer) return { ok: false, reason: 'مشتری مرتبط با پروژه پیدا نشد.' };
  return { ok: true, value: { project, customer } };
}

export function taskContext(taskId: string): RelationResult<{ task: Task; project: Project; customer: Customer }> {
  const task = taskRepository.get(taskId);
  if (!task) return { ok: false, reason: 'وظیفه پیدا نشد.' };
  const context = projectWithCustomer(task.projectId);
  if (!context.ok) return context;
  return { ok: true, value: { task, ...context.value } };
}

export function canPerform(user: User, permissionKey: string) {
  if (user.role === 'admin') return true;
  const managerPermissions = ['project:view', 'project:create', 'project:update', 'task:create', 'task:update', 'finance:view', 'hr:view', 'document:view'];
  const memberPermissions = ['project:view', 'task:create', 'task:update', 'document:view'];
  return (user.role === 'manager' ? managerPermissions : memberPermissions).includes(permissionKey);
}

/** Canonical visibility flag for customer-facing records. Keep backend authorization as the final boundary. */
export function isCustomerVisible(record: { customerVisible?: boolean }) {
  return record.customerVisible === true;
}
