export const roles = ['admin', 'manager', 'member', 'customer'] as const;

export type Role = (typeof roles)[number];

export type Permission =
  | 'project:view'
  | 'project:create'
  | 'project:update'
  | 'task:view'
  | 'task:create'
  | 'task:update'
  | 'finance:view'
  | 'finance:pay'
  | 'hr:view'
  | 'hr:manage-users'
  | 'hr:manage-performance'
  | 'hr:reopen-performance'
  | 'reports:view'
  | 'document:view';

export interface PermissionOverrides {
  additions: Permission[];
  removals: Permission[];
}

export interface AppRecord {
  id: string;
  organizationId: string;
  createdAt?: string | Date;
  updatedAt?: string | Date;
  [key: string]: unknown;
}

export interface UserRecord extends AppRecord {
  name: string;
  email: string;
  role: Role;
  status: 'online' | 'away' | 'offline';
  isActive: boolean;
  title: string;
  passwordHash: string;
  permissionOverrides: PermissionOverrides;
  lastLoginAt?: string | Date;
  mustChangePassword?: boolean;
  failedLoginAttempts?: number;
  lastFailedLoginAt?: string | Date;
  lockoutUntil?: string | Date;
  passwordChangedAt?: string | Date;
}

export interface FileRecord extends AppRecord {
  name: string;
  originalName: string;
  objectKey: string;
  bucket: string;
  mimeType: string;
  declaredMimeType?: string;
  detectedMimeType?: string;
  sizeBytes: number;
  etag?: string;
  uploadedBy: string;
  visibility: 'private' | 'workspace';
  customerVisible: boolean;
  customerId?: string;
  projectId?: string;
  employeeId?: string;
  folderId?: string;
  contextKind?: string;
  contextId?: string;
  description?: string;
  tags?: string[];
  favorite?: boolean;
  downloadCount?: number;
  processingStatus?: 'pending' | 'processing' | 'processed' | 'failed';
  processingError?: string;
  processedAt?: string | Date;
  sha256?: string;
  metadataVersion?: number;
  deletionStatus?: 'active' | 'deleting' | 'delete_failed' | 'missing';
  deletionError?: string;
  deletionRequestedAt?: string | Date;
  contentVerifiedAt?: string | Date;
}

export const resourceNames = [
  'User',
  'Employee',
  'Project',
  'ProjectPhase',
  'ProjectRole',
  'ProjectActivity',
  'ProjectMember',
  'Task',
  'TimeEntry',
  'EmploymentCompensation',
  'AttendanceRecord',
  'Meeting',
  'ProjectEvent',
  'PerformanceEvent',
  'PerformancePeriod',
  'AuditLog',
  'FileRecord',
  'OrganizationStorageUsage',
  'Customer',
  'Contract',
  'Invoice',
  'Payment',
  'Installment',
  'Expense',
  'BankAccount',
  'Supplier',
  'ProjectSale',
  'PayrollRecord',
  'PayrollAdjustment',
  'PayrollPayment',
  'PayrollPaymentDocument',
  'EmployeeContract',
  'ProjectAccess',
  'AgentEnrollment',
  'AgentUsagePolicy',
  'AgentUsagePreference',
  'AgentUsageSession',
  'AgentUsageInterval',
  'AgentUsageStatus',
  'AgentHealthSample',
  'AgentHealthStatus',
  'AgentScreenSession',
  'AuthSession',
  'PasswordResetToken',
  'BackgroundJob',
  'RecurringTask',
] as const;

export type ResourceName = (typeof resourceNames)[number];
export type RecordFilter = Record<string, unknown>;
export type RecordInput = Record<string, unknown> & { id?: string };

export function isUserRecord(value: AppRecord | undefined): value is UserRecord {
  return Boolean(
    value
    && typeof value.name === 'string'
    && typeof value.email === 'string'
    && typeof value.organizationId === 'string'
    && value.organizationId.length > 0
    && typeof value.role === 'string'
    && typeof value.isActive === 'boolean',
  );
}
