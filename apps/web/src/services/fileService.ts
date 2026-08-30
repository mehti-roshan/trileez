import type { Attachment } from '../types/index.ts';
import { canAccessResource, type ResourceAccess, type ResourceKind } from './accessControl.ts';
import type { User } from '../types/index.ts';

export type FileMetadata = Attachment & {
  uploadedBy: string;
  context?: { kind: ResourceKind; id: string };
  visibility: 'private' | 'workspace';
  access: ResourceAccess[];
};

const key = 'trileez-file-metadata-v1';

export function listFiles(): FileMetadata[] {
  try { return JSON.parse(localStorage.getItem(key) ?? '[]'); } catch { return []; }
}

export function registerFile(file: FileMetadata) {
  const next = [...listFiles().filter((item) => item.id !== file.id), file];
  try { localStorage.setItem(key, JSON.stringify(next)); } catch { /* optional browser storage */ }
  return file;
}

export function filesForContext(kind: ResourceKind, id: string) {
  return listFiles().filter((file) => file.context?.kind === kind && file.context.id === id);
}

export function canAccessFile(user: User, file: FileMetadata, access: ResourceAccess = 'view') {
  return canAccessResource(user, { ownerId: file.uploadedBy, visibility: file.visibility }, access, 'file');
}
