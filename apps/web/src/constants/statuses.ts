export const statusLabels = {
  project: { active: 'فعال', on_hold: 'متوقف', completed: 'تکمیل‌شده', archived: 'بایگانی' },
  task: { todo: 'انجام نشده', in_progress: 'در حال انجام', review: 'بازبینی', done: 'انجام‌شده' },
  ticket: { open: 'باز', in_progress: 'در حال بررسی', waiting: 'در انتظار', closed: 'بسته‌شده' },
  invoice: { draft: 'پیش‌نویس', issued: 'صادر شده', partial: 'بخشی پرداخت شده', paid: 'پرداخت شده', overdue: 'سررسید گذشته', cancelled: 'لغو شده' },
  payment: { 'ثبت شده': 'ثبت شده', 'در انتظار تایید': 'در انتظار تایید', 'تایید شده': 'تایید شده', 'برگشت خورده': 'برگشت خورده' },
  employee: { active: 'فعال', leave: 'در مرخصی', suspended: 'تعلیق‌شده', terminated: 'پایان همکاری' },
  lead: { new: 'تماس نگرفته', contacted: 'تماس گرفته شده', qualified: 'واجد شرایط', lost: 'از دست رفته', converted: 'تبدیل شده' },
} as const;

export type StatusDomain = keyof typeof statusLabels;
export function getStatusLabel(domain: StatusDomain, value: string): string {
  return (statusLabels[domain] as Record<string, string>)[value] ?? value;
}
