import type { ProjectAccess, ProjectMember, ProjectPhase, ProjectRole, Task, TimesheetEntry } from '../types/index.ts';

export const taskProgress = (task: Task) => ({ todo: 0, in_progress: 50, review: 80, done: 100 })[task.status];

export const actualTaskHours = (taskId: string, entries: TimesheetEntry[]) => entries
  .filter((entry) => entry.taskId === taskId)
  .reduce((sum, entry) => sum + entry.hours, 0);

export const derivedPhaseProgress = (phaseId: string, tasks: Task[], fallback = 0) => {
  const phaseTasks = tasks.filter((task) => task.phaseId === phaseId);
  if (!phaseTasks.length) return fallback;
  return Math.round(phaseTasks.reduce((sum, task) => sum + taskProgress(task), 0) / phaseTasks.length);
};

export const derivedProjectProgress = (projectId: string, phases: ProjectPhase[], tasks: Task[]) => {
  const projectTasks = tasks.filter((task) => task.projectId === projectId);
  const projectPhases = phases.filter((phase) => phase.projectId === projectId);
  if (!projectTasks.length) return 0;
  if (!projectPhases.length) return Math.round(projectTasks.reduce((sum, task) => sum + taskProgress(task), 0) / projectTasks.length);
  const populatedPhases = projectPhases.filter((phase) => projectTasks.some((task) => task.phaseId === phase.id));
  if (!populatedPhases.length) return 0;
  return Math.round(populatedPhases.reduce((sum, phase) => sum + derivedPhaseProgress(phase.id, projectTasks), 0) / populatedPhases.length);
};

export interface EffectiveProjectAccess extends ProjectAccess {
  source: 'محدوده پروژه' | 'نقش پروژه' | 'اختصاص مستقیم';
  sourceName: string;
}

const accessKey = (access: ProjectAccess) => access.content.trim().toLocaleLowerCase();
const precedence: Record<ProjectAccess['scope'], number> = { project: 1, role: 2, person: 3 };

export const effectiveProjectAccesses = (
  member: ProjectMember,
  roles: ProjectRole[],
  accesses: ProjectAccess[],
  today = new Date().toISOString().slice(0, 10),
): EffectiveProjectAccess[] => {
  const applicable = accesses.filter((access) => {
    if (access.projectId !== member.projectId) return false;
    if (access.startDate && access.startDate > today) return false;
    if (access.expiryDate && access.expiryDate < today) return false;
    if (access.scope === 'project') return true;
    if (access.scope === 'role') return Boolean(access.roleId && member.roleIds.includes(access.roleId));
    return access.projectMemberId === member.id;
  });
  const resolved = new Map<string, ProjectAccess>();
  applicable.forEach((access) => {
    const current = resolved.get(accessKey(access));
    if (!current || precedence[access.scope] > precedence[current.scope]
      || (precedence[access.scope] === precedence[current.scope] && access.createdAt >= current.createdAt)) resolved.set(accessKey(access), access);
  });
  return [...resolved.values()].map((access) => ({
    ...access,
    source: access.scope === 'project' ? 'محدوده پروژه' : access.scope === 'role' ? 'نقش پروژه' : 'اختصاص مستقیم',
    sourceName: access.scope === 'project' ? 'همه اعضای پروژه' : access.scope === 'role' ? roles.find((role) => role.id === access.roleId)?.name ?? 'نقش حذف‌شده' : 'این عضو',
  }));
};
