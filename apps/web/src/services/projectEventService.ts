import type { ProjectEvent } from '../types/index.ts';
import type { Repository } from './mockRepository.ts';

export const PROJECT_EVENT_TYPES = [
  'عضویت کارمند در پروژه',
  'خروج کارمند از پروژه',
  'تغییر وضعیت پروژه',
  'قطعی سرویس / سایت',
  'دستاورد یا نقطه عطف',
  'تأیید مشتری',
  'مشکل یا رخداد مهم',
  'رویداد قرارداد',
  'یادداشت عملیاتی',
] as const;

export interface CreateProjectEventInput {
  projectId: string;
  eventType: string;
  title: string;
  date: string;
  description: string;
  createdBy: string;
  personId?: string;
  taskId?: string;
  phaseId?: string;
  attachments?: string[];
  customerVisible?: boolean;
  stage?: ProjectEvent['stage'];
  priority?: ProjectEvent['priority'];
  status?: ProjectEvent['status'];
  result?: string;
}

export function createProjectEvent(input: CreateProjectEventInput, repository: Repository<ProjectEvent>) {
  if (!input.projectId || !input.eventType?.trim() || !input.title?.trim() || !input.date || !input.description?.trim() || !input.createdBy) {
    throw new Error('پروژه، نوع، عنوان، تاریخ، شرح و ثبت‌کننده الزامی هستند.');
  }
  const date = new Date(input.date);
  if (Number.isNaN(date.getTime())) throw new Error('تاریخ و زمان رویداد معتبر نیست.');
  const attachments = (input.attachments ?? []).map((item) => item.trim()).filter(Boolean);
  return repository.create({
    projectId: input.projectId,
    personId: input.personId || undefined,
    taskId: input.taskId || undefined,
    phaseId: input.phaseId || undefined,
    eventType: input.eventType.trim(),
    title: input.title.trim(),
    stage: input.stage ?? 'ثبت شد',
    priority: input.priority ?? 'عادی',
    status: input.status ?? 'open',
    date: date.toISOString(),
    registeredBy: input.createdBy,
    createdAt: new Date().toISOString(),
    description: input.description.trim(),
    result: input.result?.trim() || undefined,
    attachments: attachments.length ? attachments : undefined,
    customerVisible: Boolean(input.customerVisible),
  });
}
