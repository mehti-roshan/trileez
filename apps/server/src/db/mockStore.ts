import { id } from '../utils/id.js';
import { requireOrganizationId } from '../config/organizations.js';
import type { AppRecord, RecordFilter, RecordInput, ResourceName } from '../types/entities.js';

const collections = new Map<string, AppRecord[]>();

export function collection(name: string): AppRecord[] {
  if (!collections.has(name)) collections.set(name, []);
  return collections.get(name)!;
}

export function seedCollection(name: string, rows: AppRecord[]): void {
  const target = collection(name);
  if (target.length === 0) target.push(...rows);
}

export const store = {
  list(name: string, filter: RecordFilter = {}): AppRecord[] {
    return collection(name).filter((row) => Object.entries(filter).every(([key, value]) => value === undefined || row[key] === value));
  },
  get(name: string, value: string, filter: RecordFilter = {}): AppRecord | undefined {
    return collection(name).find((row) => row.id === value && Object.entries(filter).every(([key, expected]) => expected === undefined || row[key] === expected));
  },
  create(name: string, input: RecordInput, prefix = name.toLowerCase()): AppRecord {
    const now = new Date().toISOString();
    const row: AppRecord = {
      ...input,
      organizationId: requireOrganizationId(input.organizationId),
      id: input.id || id(prefix),
      createdAt: input.createdAt as string | Date | undefined || now,
      updatedAt: now,
    };
    collection(name).unshift(row);
    return row;
  },
  update(name: string, value: string, patch: Record<string, unknown>, filter: RecordFilter = {}): AppRecord | undefined {
    const rows = collection(name);
    const index = rows.findIndex((row) => row.id === value && Object.entries(filter).every(([key, expected]) => expected === undefined || row[key] === expected));
    if (index < 0) return undefined;
    const updated = { ...rows[index]!, ...patch, updatedAt: new Date().toISOString() } as AppRecord;
    rows[index] = updated;
    return updated;
  },
  remove(name: string, value: string, filter: RecordFilter = {}): boolean {
    const rows = collection(name);
    const index = rows.findIndex((row) => row.id === value && Object.entries(filter).every(([key, expected]) => expected === undefined || row[key] === expected));
    if (index < 0) return false;
    rows.splice(index, 1);
    return true;
  },
};
