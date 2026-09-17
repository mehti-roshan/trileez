import type { Project, ProjectRole } from '../types/index.ts';
import { projectActivityRepository, projectMemberRepository, projectPhaseRepository, projectRoleRepository, projectRoleTemplateRepository } from './repositories.ts';

export const provisionProjectExecution = (project: Project) => {
  let role = projectRoleRepository.list().find((item) => item.projectId === project.id && item.templateId === 'prt-manager');
  if (!role) {
    const template = projectRoleTemplateRepository.get('prt-manager');
    role = projectRoleRepository.create({
      id: `pr-${project.id}-manager`, projectId: project.id, templateId: template?.id, name: template?.name ?? 'مدیر پروژه', description: template?.description ?? 'مدیریت اجرای پروژه', responsibilities: template?.responsibilities ?? ['برنامه‌ریزی پروژه'], objectives: template?.objectives ?? ['تحویل موفق پروژه'], requiredSkills: template?.requiredSkills ?? ['مدیریت پروژه'], expectedHours: template?.expectedHours ?? 40, customerVisible: true,
    } satisfies ProjectRole);
  }
  if (!projectActivityRepository.list().some((item) => item.projectId === project.id && item.roleId === role.id)) {
    projectActivityRepository.create({ id: `pa-${role.id}-planning`, projectId: project.id, roleId: role.id, title: 'برنامه‌ریزی و هماهنگی پروژه', description: 'برنامه‌ریزی اجرا، هماهنگی اعضا و پیگیری تحویل‌ها', objective: role.objectives[0], expectedHours: role.expectedHours, customerVisible: role.customerVisible });
  }
  let member = projectMemberRepository.list().find((item) => item.projectId === project.id && item.personId === project.managerId);
  if (!member) member = projectMemberRepository.create({ id: `pm-${project.id}-${project.managerId}`, projectId: project.id, personId: project.managerId, role: role.name, roleIds: [role.id], status: 'active', joinedAt: project.startDate, responsibilities: 'مدیریت و هماهنگی اجرای پروژه' });
  else if (!member.roleIds.includes(role.id)) projectMemberRepository.update(member.id, { roleIds: [...member.roleIds, role.id], role: [member.role, role.name].filter(Boolean).join('، '), status: 'active', leftAt: undefined });
  let phase = projectPhaseRepository.list().find((item) => item.projectId === project.id);
  if (!phase) phase = projectPhaseRepository.create({ id: `phase-${project.id}-1`, projectId: project.id, title: 'آغاز و برنامه‌ریزی', status: 'planned', startDate: project.startDate, endDate: project.endDate, progress: 0, managerId: project.managerId, description: 'فاز اولیه پروژه؛ قابل تفکیک به فازهای اجرایی بیشتر.', customerVisible: true });
  return { role, member, phase };
};
