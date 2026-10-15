import type { Attachment } from '../types/index.ts';
import { canAccessResource, type ResourceAccess, type ResourceKind } from './accessControl.ts';
import type { User } from '../types/index.ts';
import { apiClient } from './apiClient.ts';
import { reportApiFailure } from './apiEvents.ts';

export type FileMetadata = Attachment & {
  originalName?: string;
  extension?: string;
  mimeType?: string;
  objectKey?: string;
  folderId?: string;
  projectId?: string;
  customerId?: string;
  employeeId?: string;
  description?: string;
  tags?: string[];
  favorite?: boolean;
  deletedAt?: string;
  downloadCount?: number;
  uploadedBy: string;
  context?: { kind: ResourceKind; id: string };
  visibility: 'private' | 'workspace';
  access: ResourceAccess[];
  /** Explicit customer exposure flag; defaults to internal. */
  customerVisible?: boolean;
};

let fileCache: FileMetadata[] = [];

type ApiFileRecord = {
  id: string; name: string; originalName: string; mimeType: string; sizeBytes: number; objectKey: string;
  uploadedBy: string; visibility: 'private' | 'workspace'; customerVisible: boolean; createdAt: string;
  projectId?: string; customerId?: string; employeeId?: string; folderId?: string; contextKind?: ResourceKind; contextId?: string;
  description?: string; tags?: string[]; favorite?: boolean; deletedAt?: string; downloadCount?: number;
};

function fromApi(file: ApiFileRecord): FileMetadata {
  return {
    id: file.id,
    name: file.name,
    originalName: file.originalName,
    extension: file.originalName.split('.').pop(),
    type: file.mimeType,
    mimeType: file.mimeType,
    size: `${Math.max(1, Math.round(file.sizeBytes / 1024)).toLocaleString('fa-IR')} کیلوبایت`,
    objectKey: file.objectKey,
    folderId: file.folderId,
    projectId: file.projectId,
    customerId: file.customerId,
    employeeId: file.employeeId,
    description: file.description,
    tags: file.tags ?? [],
    favorite: file.favorite,
    deletedAt: file.deletedAt,
    downloadCount: file.downloadCount,
    uploadedBy: file.uploadedBy,
    uploadedAt: file.createdAt,
    source: 'seaweedfs',
    visibility: file.visibility,
    access: ['view', 'share'],
    customerVisible: file.customerVisible,
    context: file.contextKind && file.contextId ? { kind: file.contextKind, id: file.contextId } : undefined,
  };
}

export function listFiles(): FileMetadata[] {
  return [...fileCache];
}

export function registerFile(file: FileMetadata) {
  fileCache = [...fileCache.filter((item) => item.id !== file.id), file];
  return file;
}

export async function hydrateFiles(): Promise<FileMetadata[]> {
  const result = await apiClient.list<ApiFileRecord>('files');
  const files = result.data.map(fromApi);
  fileCache = files;
  return files;
}

export async function uploadStoredFile(file: File, metadata: Partial<FileMetadata> = {}): Promise<FileMetadata> {
  try {
    const result = await apiClient.uploadFile<ApiFileRecord>(file, {
    name: metadata.name || file.name,
    folderId: metadata.folderId || 'root',
    projectId: metadata.projectId,
    customerId: metadata.customerId,
    employeeId: metadata.employeeId,
    description: metadata.description,
    tags: metadata.tags,
    visibility: metadata.visibility || 'workspace',
    customerVisible: metadata.customerVisible ?? false,
    contextKind: metadata.context?.kind,
    contextId: metadata.context?.id,
    });
    return registerFile(fromApi(result.data));
  } catch (error) {
    reportApiFailure({ message: error instanceof Error ? error.message : 'بارگذاری فایل در سرور انجام نشد.', operation: 'upload', resource: 'files' });
    throw error;
  }
}

export async function persistFileUpdate(id: string, patch: Partial<FileMetadata>): Promise<FileMetadata> {
  try {
    const result = await apiClient.update<ApiFileRecord>('files', id, patch);
    return registerFile(fromApi(result.data));
  } catch (error) {
    reportApiFailure({ message: error instanceof Error ? error.message : 'به‌روزرسانی فایل در سرور انجام نشد.', operation: 'update', resource: 'files' });
    throw error;
  }
}

export async function downloadStoredFile(file: FileMetadata): Promise<void> {
  try {
    const result = await apiClient.downloadFile(file.id);
    const url = URL.createObjectURL(result.blob);
    const anchor = document.createElement('a');
    anchor.href = url;
    anchor.download = result.filename || file.name;
    anchor.click();
    URL.revokeObjectURL(url);
  } catch (error) {
    reportApiFailure({ message: error instanceof Error ? error.message : 'دریافت فایل از سرور انجام نشد.', operation: 'download', resource: 'files' });
    throw error;
  }
}

export function filesForContext(kind: ResourceKind, id: string) {
  return listFiles().filter((file) => file.context?.kind === kind && file.context.id === id);
}

export function canAccessFile(user: User, file: FileMetadata, access: ResourceAccess = 'view') {
  return canAccessResource(user, { ownerId: file.uploadedBy, visibility: file.visibility }, access, 'file');
}
