import type { Project, ProjectStatus } from '../types/index.ts';

export const projectStatusLabels: Record<ProjectStatus, string> = {
  active: 'فعال',
  on_hold: 'متوقف',
  completed: 'تکمیل‌شده',
  archived: 'بایگانی‌شده',
};

export const defaultProjectTags = [
  'سئو', 'طراحی وب‌سایت', 'توسعه نرم‌افزار', 'شبکه‌های اجتماعی', 'بازاریابی دیجیتال',
  'تولید محتوا', 'طراحی رابط کاربری', 'فروش', 'پشتیبانی', 'زیرساخت',
];

export function normalizeProjectTags(values: string[]): string[] {
  return [...new Set(values.map((value) => value.trim()).filter(Boolean))];
}

export function normalizeProjectGrade(value: unknown, fallback = 50): number {
  const numeric = Number(value);
  return Number.isFinite(numeric) ? Math.max(0, Math.min(100, Math.round(numeric))) : fallback;
}

export function projectGrade(project: Pick<Project, 'grade'> | Partial<Pick<Project, 'grade'>>): number {
  return normalizeProjectGrade(project.grade);
}

export function projectGradeLabel(value: number): string {
  const grade = normalizeProjectGrade(value);
  if (grade >= 85) return 'بسیار مهم';
  if (grade >= 65) return 'مهم';
  if (grade >= 40) return 'متوسط';
  return 'کم‌اهمیت';
}
