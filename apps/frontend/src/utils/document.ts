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

const documentTypes = new Set<BusinessDocumentType>(Object.keys(documentTypeLabels) as BusinessDocumentType[]);
const documentStatuses = new Set<BusinessDocumentStatus>(Object.keys(documentStatusLabels) as BusinessDocumentStatus[]);

const legacyDocumentTypes: Record<string, BusinessDocumentType> = {
  meeting_minutes: 'other',
  policy: 'other',
};

function normalizeStringArray(value: unknown): string[] {
  if (!Array.isArray(value)) return [];
  return value.flatMap((item) => {
    if (typeof item === 'string') return item ? [item] : [];
    if (item && typeof item === 'object' && typeof (item as { name?: unknown }).name === 'string') {
      return [(item as { name: string }).name];
    }
    return [];
  });
}

function normalizeDocumentType(value: unknown): BusinessDocumentType {
  if (typeof value !== 'string') return 'other';
  if (documentTypes.has(value as BusinessDocumentType)) return value as BusinessDocumentType;
  return legacyDocumentTypes[value] ?? 'other';
}

function normalizeDocumentStatus(value: unknown, documentType: BusinessDocumentType): BusinessDocumentStatus {
  const status = typeof value === 'string' && documentStatuses.has(value as BusinessDocumentStatus)
    ? value as BusinessDocumentStatus
    : 'draft';
  if (documentStatusOptions[documentType].includes(status)) return status;
  if (status === 'approved') {
    if (documentType === 'acceptance') return 'accepted';
    if (documentType === 'other' || documentType === 'project_contract' || documentType === 'employment_contract') return 'active';
  }
  return 'draft';
}

/**
 * Keeps old persisted document records readable while MongoDB data is migrated to
 * the canonical BusinessDocument shape. This is compatibility handling only;
 * new writes still use the canonical fields.
 */
export function normalizeBusinessDocument(value: Record<string, unknown>, previous?: BusinessDocument): BusinessDocument {
  const merged = { ...(previous ?? {}), ...value } as Record<string, unknown>;
  const id = String(merged.id ?? previous?.id ?? '');
  const documentType = normalizeDocumentType(merged.documentType ?? merged.type);
  const createdAt = typeof merged.createdAt === 'string' ? merged.createdAt : '';
  return {
    ...merged,
    id,
    documentType,
    title: typeof merged.title === 'string' ? merged.title : '',
    documentNumber: typeof merged.documentNumber === 'string' && merged.documentNumber.trim()
      ? merged.documentNumber
      : `LEGACY-${id || 'DOCUMENT'}`,
    summary: typeof merged.summary === 'string'
      ? merged.summary
      : typeof merged.description === 'string' ? merged.description : '',
    status: normalizeDocumentStatus(merged.status, documentType),
    attachments: normalizeStringArray(merged.attachments),
    fileRecordIds: normalizeStringArray(merged.fileRecordIds),
    createdBy: typeof merged.createdBy === 'string'
      ? merged.createdBy
      : typeof merged.ownerId === 'string' ? merged.ownerId : '',
    createdAt,
    updatedAt: typeof merged.updatedAt === 'string' ? merged.updatedAt : createdAt,
    customerVisible: merged.customerVisible === true,
  } as BusinessDocument;
}

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
