import dayjs from 'dayjs';
import jalaliday from 'jalaliday';
import type { Priority, TaskStatus, TicketStatus, DeviceStatus, ProjectStatus, CustomerStatus, SessionStatus, UserRole } from '../types/index.ts';

dayjs.extend(jalaliday);

const jalali = (value?: string) =>
  dayjs(value).calendar('jalali').locale('fa');

export function formatDate(value?: string) {
  if (!value) return '—';
  return jalali(value).format('YYYY/MM/DD');
}

export function formatDateTime(value?: string) {
  if (!value) return '—';
  return jalali(value).format('YYYY/MM/DD HH:mm');
}

export function formatRelative(value?: string) {
  if (!value) return '—';
  const now = dayjs();
  const then = dayjs(value);
  const minutes = now.diff(then, 'minute');
  if (minutes < 1) return 'همین الان';
  if (minutes < 60) return `${minutes} دقیقه پیش`;
  const hours = now.diff(then, 'hour');
  if (hours < 24) return `${hours} ساعت پیش`;
  const days = now.diff(then, 'day');
  if (days < 7) return `${days} روز پیش`;
  return formatDate(value);
}

export function formatCurrency(value: number) {
  return `${new Intl.NumberFormat('fa-IR').format(value)} تومان`;
}

export function formatNumber(value: number) {
  return new Intl.NumberFormat('fa-IR').format(value);
}

export const priorityLabel: Record<Priority, string> = {
  low: 'کم',
  medium: 'متوسط',
  high: 'بالا',
  urgent: 'فوری',
};

export const taskStatusLabel: Record<TaskStatus, string> = {
  todo: 'انجام نشده',
  in_progress: 'در حال انجام',
  review: 'بازبینی',
  done: 'انجام‌شده',
};

export const ticketStatusLabel: Record<TicketStatus, string> = {
  open: 'باز',
  in_progress: 'در حال بررسی',
  waiting: 'در انتظار',
  closed: 'بسته‌شده',
};

export const deviceStatusLabel: Record<DeviceStatus, string> = {
  online: 'آنلاین',
  offline: 'آفلاین',
  busy: 'مشغول',
};

export const projectStatusLabel: Record<ProjectStatus, string> = {
  active: 'فعال',
  on_hold: 'متوقف',
  completed: 'تکمیل‌شده',
  archived: 'بایگانی',
};

export const customerStatusLabel: Record<CustomerStatus, string> = {
  active: 'فعال',
  inactive: 'غیرفعال',
  lead: 'سرنخ',
};

export const sessionStatusLabel: Record<SessionStatus, string> = {
  pending: 'در انتظار رضایت',
  active: 'فعال',
  ended: 'پایان‌یافته',
  rejected: 'رد شده',
};

export const roleLabel: Record<UserRole, string> = {
  admin: 'مدیر سیستم',
  manager: 'مدیر',
  member: 'کارشناس',
};

export const ticketCategoryLabel = {
  bug: 'خطا',
  feature: 'قابلیت',
  support: 'پشتیبانی',
  other: 'سایر',
} as const;
