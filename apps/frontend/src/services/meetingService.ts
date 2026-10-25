import type { Meeting, MeetingDocument, MeetingStatus } from '../types/index.ts';
import type { Repository } from './mockRepository.ts';

export interface CreateMeetingInput {
  title: string;
  startAt: string;
  durationMinutes: number;
  organizerId: string;
  participantIds?: string[];
  projectId?: string;
  employeeIds?: string[];
  departments?: string[];
  department?: string;
  customerId?: string;
  location?: string;
  meetingLink?: string;
  agenda?: string;
  description?: string;
  discussionSummary?: string;
  notes?: string;
  decisions?: string;
  outcome?: string;
  actionItems?: string;
  followUpActions?: string;
  nextMeetingAt?: string;
  taskIds?: string[];
  attachments?: string[];
  meetingDocument?: MeetingDocument;
  createdBy: string;
  status?: MeetingStatus;
}

export function createMeeting(input: CreateMeetingInput, repository: Repository<Meeting>) {
  if (!input.title?.trim() || !input.startAt || !input.organizerId || !input.createdBy) throw new Error('عنوان، زمان، برگزارکننده و ثبت‌کننده جلسه الزامی هستند.');
  const startAt = new Date(input.startAt);
  if (Number.isNaN(startAt.getTime())) throw new Error('تاریخ و زمان جلسه معتبر نیست.');
  if (!Number.isInteger(input.durationMinutes) || input.durationMinutes < 5 || input.durationMinutes > 1_440) throw new Error('مدت جلسه باید عدد صحیح بین ۵ دقیقه تا ۲۴ ساعت باشد.');
  const unique = (items?: string[]) => [...new Set((items ?? []).map((item) => item.trim()).filter(Boolean))];
  return repository.create({
    title: input.title.trim(),
    startAt: startAt.toISOString(),
    durationMinutes: input.durationMinutes,
    status: input.status ?? 'scheduled',
    organizerId: input.organizerId,
    participantIds: unique(input.participantIds),
    projectId: input.projectId || undefined,
    employeeIds: unique(input.employeeIds),
    departments: unique(input.departments?.length ? input.departments : input.department ? [input.department] : undefined),
    department: input.department?.trim() || input.departments?.[0]?.trim() || undefined,
    customerId: input.customerId || undefined,
    location: input.location?.trim() || undefined,
    meetingLink: input.meetingLink?.trim() || undefined,
    agenda: input.agenda?.trim() || input.description?.trim() || undefined,
    description: input.description?.trim() || undefined,
    discussionSummary: input.discussionSummary?.trim() || undefined,
    notes: input.notes?.trim() || undefined,
    decisions: input.decisions?.trim() || undefined,
    outcome: input.outcome?.trim() || undefined,
    actionItems: input.actionItems?.trim() || undefined,
    followUpActions: input.followUpActions?.trim() || undefined,
    nextMeetingAt: input.nextMeetingAt || undefined,
    taskIds: unique(input.taskIds),
    attachments: unique(input.attachments),
    meetingDocument: input.meetingDocument,
    createdBy: input.createdBy,
    createdAt: new Date().toISOString(),
  });
}
