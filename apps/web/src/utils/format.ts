import dayjs from 'dayjs';
import jalaliday from 'jalaliday';
import type { Priority, TaskStatus, TicketStatus, DeviceStatus, ProjectStatus, CustomerStatus, SessionStatus, TimesheetBillingStatus, TimesheetStatus, UserRole } from '../types/index.ts';
import { statusLabels } from '../constants/statuses.ts';

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

export const taskStatusLabel: Record<TaskStatus, string> = statusLabels.task;

export const ticketStatusLabel: Record<TicketStatus, string> = statusLabels.ticket;

export const deviceStatusLabel: Record<DeviceStatus, string> = {
  online: 'آنلاین',
  offline: 'آفلاین',
  busy: 'مشغول',
};

export const projectStatusLabel: Record<ProjectStatus, string> = statusLabels.project;

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
  customer: 'کاربر مشتری',
};

export const timesheetStatusLabel: Record<TimesheetStatus, string> = {
  approved: 'تایید',
  pending_review: 'در صف بررسی',
  review_again: 'در صف بررسی مجدد',
  suspended: 'تعلیق یا نامشخص',
  rejected: 'عدم تایید',
};

export const timesheetBillingStatusLabel: Record<TimesheetBillingStatus, string> = {
  paid: 'پرداخت شده',
  purchase_invoice_registered: 'ثبت صدور فاکتور',
  purchase_invoice_queued: 'در صف فاکتور پرداخت',
  payment_queued: 'در صف پرداخت',
  suspended: 'تعلیق یا نامشخص',
};

export const timesheetStatusOptions = Object.entries(timesheetStatusLabel).map(([value, label]) => ({ value: value as TimesheetStatus, label }));
export const timesheetBillingStatusOptions = Object.entries(timesheetBillingStatusLabel).map(([value, label]) => ({ value: value as TimesheetBillingStatus, label }));

export function normalizeTimesheetBillingStatus(value: string): TimesheetBillingStatus {
  const normalized = String(value ?? '').trim();
  if (normalized in timesheetBillingStatusLabel) return normalized as TimesheetBillingStatus;
  if (['پرداخت شده', 'paid'].includes(normalized)) return 'paid';
  if (['ثبت صدور فاکتور', 'ثبت فاکتور پرداخت', 'purchase_invoice_registered'].includes(normalized)) return 'purchase_invoice_registered';
  if (['در صف فاکتور پرداخت', 'در صف فاکتور خرید', 'purchase_invoice_queued'].includes(normalized)) return 'purchase_invoice_queued';
  if (['در صف پرداخت', 'payment_queued'].includes(normalized)) return 'payment_queued';
  return 'suspended';
}

export function getTimesheetBillingStatusLabel(value: string) {
  return timesheetBillingStatusLabel[normalizeTimesheetBillingStatus(value)];
}

export function normalizeTimesheetStatus(value: string): TimesheetStatus {
  const normalized = String(value ?? '').trim();
  if (normalized in timesheetStatusLabel) return normalized as TimesheetStatus;
  if (['submitted', 'pending', 'در انتظار بررسی', 'در صف بررسی'].includes(normalized)) return 'pending_review';
  if (['review_again', 'در انتظار بررسی مجدد', 'در صف بررسی مجدد'].includes(normalized)) return 'review_again';
  if (['draft', 'suspended', 'تعلیق', 'تعلیق یا نامشخص'].includes(normalized)) return 'suspended';
  if (['approved', 'تایید', 'تایید شده'].includes(normalized)) return 'approved';
  if (['rejected', 'رد شده', 'عدم تایید', 'عدم تأیید'].includes(normalized)) return 'rejected';
  return 'suspended';
}

export function getTimesheetStatusLabel(value: string) {
  return timesheetStatusLabel[normalizeTimesheetStatus(value)];
}

export const ticketCategoryLabel = {
  bug: 'خطا',
  feature: 'قابلیت',
  support: 'پشتیبانی',
  other: 'سایر',
} as const;
