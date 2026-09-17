import type { BusinessDocument, BusinessDocumentStatus, BusinessDocumentType, DocumentSection } from '../types/index.ts';

export const documentTypeLabels: Record<BusinessDocumentType, string> = {
  proposal: 'پیشنهاد',
  project_contract: 'قرارداد پروژه',
  change_request: 'درخواست تغییر',
  employment_contract: 'قرارداد استخدام',
  acceptance: 'پذیرش / تأیید نهایی',
  other: 'سایر',
};

export const documentStatusLabels: Record<BusinessDocumentStatus, string> = {
  draft: 'پیش‌نویس', sent: 'ارسال‌شده', submitted: 'ثبت‌شده', under_review: 'در حال بررسی', approved: 'تأیید‌شده',
  active: 'فعال', implemented: 'اجراشده', accepted: 'پذیرفته‌شده', completed: 'تکمیل‌شده', expired: 'منقضی',
  terminated: 'خاتمه‌یافته', rejected: 'ردشده', cancelled: 'لغوشده', archived: 'بایگانی‌شده',
};

export const documentStatusOptions: Record<BusinessDocumentType, BusinessDocumentStatus[]> = {
  proposal: ['draft', 'sent', 'under_review', 'approved', 'rejected', 'expired', 'archived'],
  project_contract: ['draft', 'under_review', 'active', 'expired', 'terminated', 'archived'],
  change_request: ['draft', 'submitted', 'under_review', 'approved', 'rejected', 'implemented', 'cancelled', 'archived'],
  employment_contract: ['draft', 'active', 'expired', 'terminated', 'archived'],
  acceptance: ['draft', 'submitted', 'under_review', 'accepted', 'rejected', 'archived'],
  other: ['draft', 'active', 'completed', 'archived'],
};

export const documentSectionLabels: Record<DocumentSection, string> = {
  projects: 'اسناد پروژه‌ها', customers: 'اسناد مشتریان', finance: 'اسناد مالی', hr: 'اسناد منابع انسانی', general: 'اسناد عمومی',
};

export function documentMatchesSection(document: BusinessDocument, section: DocumentSection | 'all') {
  if (section === 'all') return true;
  if (section === 'projects') return Boolean(document.projectId);
  if (section === 'customers') return Boolean(document.customerId);
  if (section === 'hr') return document.documentType === 'employment_contract' || Boolean(document.employeeId);
  if (section === 'finance') return ['proposal', 'project_contract', 'change_request'].includes(document.documentType) && document.value !== undefined;
  return document.documentType === 'other' && !document.projectId && !document.customerId && !document.employeeId;
}

export function documentStatusColor(status: BusinessDocumentStatus): 'default' | 'success' | 'warning' | 'error' | 'info' {
  if (['approved', 'active', 'accepted', 'implemented', 'completed'].includes(status)) return 'success';
  if (['rejected', 'terminated', 'cancelled', 'expired'].includes(status)) return 'error';
  if (['sent', 'submitted', 'under_review'].includes(status)) return 'warning';
  if (status === 'draft') return 'info';
  return 'default';
}

export function validateBusinessDocument(document: Omit<BusinessDocument, 'id' | 'createdAt' | 'updatedAt'>) {
  const missing: string[] = [];
  if (!document.title.trim()) missing.push('عنوان');
  if (!document.documentNumber.trim()) missing.push('شماره سند');
  if (!document.attachments.length && !document.fileRecordIds?.length) missing.push('فایل سند');
  if (!documentStatusOptions[document.documentType].includes(document.status)) missing.push('وضعیت معتبر');
  if (document.documentType === 'proposal') {
    if (!document.customerId) missing.push('مشتری');
    if (!(document.value && document.value > 0)) missing.push('ارزش پیشنهاد');
    if (!document.validityDate) missing.push('تاریخ اعتبار');
  }
  if (document.documentType === 'project_contract') {
    if (!document.customerId) missing.push('مشتری');
    if (!document.projectId) missing.push('پروژه');
    if (!(document.value && document.value > 0)) missing.push('ارزش قرارداد');
    if (!document.startDate) missing.push('تاریخ شروع');
    if (!document.endDate) missing.push('تاریخ پایان');
  }
  if (document.documentType === 'change_request') {
    if (!document.customerId) missing.push('مشتری');
    if (!document.projectId) missing.push('پروژه');
    if (!document.requestedById) missing.push('درخواست‌کننده');
    if (!document.requestDate) missing.push('تاریخ درخواست');
    if (!document.impactDescription?.trim()) missing.push('اثر تغییر');
  }
  if (document.documentType === 'employment_contract') {
    if (!document.employeeId) missing.push('کارمند');
    if (!document.position?.trim()) missing.push('سمت');
    if (!document.startDate) missing.push('تاریخ شروع');
    if (!(document.compensation && document.compensation > 0)) missing.push('مبلغ قرارداد');
  }
  if (document.documentType === 'acceptance') {
    if (!document.customerId) missing.push('مشتری');
    if (!document.projectId) missing.push('پروژه');
    if (!document.deliverable?.trim()) missing.push('تحویل‌دادنی / نقطه عطف');
    if (!document.requestedDate) missing.push('تاریخ درخواست تأیید');
    if (document.status === 'accepted' && !document.acceptedDate) missing.push('تاریخ پذیرش');
  }
  return missing;
}
