import { randomUUID } from 'node:crypto';
import { env } from '../config/env.js';
import { database } from '../db/database.js';
import { store } from '../db/mockStore.js';
import { models } from '../models/index.js';
import type { AppRecord } from '../types/entities.js';
import { HttpError } from '../utils/httpError.js';

interface StorageUsageRecord extends AppRecord {
  quotaBytes: number;
  usedBytes: number;
  reservedBytes: number;
  reservations: Record<string, { bytes: number; createdAt: string }>;
  reconciledAt?: string | Date;
}

export interface StorageReservation { id: string; organizationId: string; bytes: number }

const locks = new Map<string, Promise<void>>();

async function withLock<T>(organizationId: string, task: () => Promise<T>): Promise<T> {
  const previous = locks.get(organizationId) || Promise.resolve();
  let release!: () => void;
  const gate = new Promise<void>((resolve) => { release = resolve; });
  const queued = previous.then(() => gate);
  locks.set(organizationId, queued);
  await previous;
  try { return await task(); } finally { release(); if (locks.get(organizationId) === queued) locks.delete(organizationId); }
}

function storageId(organizationId: string): string { return `storage:${organizationId}`; }
function asUsage(value: unknown): StorageUsageRecord | undefined {
  if (!value) return undefined;
  const document = value as { toObject?: () => Record<string, unknown> };
  const row = typeof document.toObject === 'function' ? document.toObject() : { ...(value as Record<string, unknown>) };
  if (row._id) { row.id = String(row._id); delete row._id; delete row.__v; }
  return row as unknown as StorageUsageRecord;
}

async function ensureUsage(organizationId: string): Promise<StorageUsageRecord> {
  const id = storageId(organizationId);
  if (database.mode() === 'mock') {
    const existing = store.get('OrganizationStorageUsage', id, { organizationId });
    if (existing) return existing as StorageUsageRecord;
    const usedBytes = store.list('FileRecord', { organizationId }).filter((file) => !file.deletionStatus || file.deletionStatus === 'active')
      .reduce((sum, file) => sum + Number(file.sizeBytes || 0), 0);
    return store.create('OrganizationStorageUsage', { id, organizationId, quotaBytes: env.organizationStorageQuotaBytes, usedBytes, reservedBytes: 0, reservations: {} }, 'storage') as StorageUsageRecord;
  }
  const totals = await models.FileRecord.aggregate<{ usedBytes: number }>([
    { $match: { organizationId, $or: [{ deletionStatus: 'active' }, { deletionStatus: { $exists: false } }] } },
    { $group: { _id: null, usedBytes: { $sum: '$sizeBytes' } } },
  ]);
  await models.OrganizationStorageUsage.updateOne({ _id: id }, {
    $setOnInsert: { organizationId, quotaBytes: env.organizationStorageQuotaBytes, usedBytes: totals[0]?.usedBytes || 0, reservedBytes: 0, reservations: {} },
  }, { upsert: true });
  return asUsage(await models.OrganizationStorageUsage.findById(id))!;
}

function quotaError(usage: StorageUsageRecord, bytes: number): HttpError {
  return new HttpError(413, `Organization storage quota exceeded (${usage.usedBytes + usage.reservedBytes + bytes} of ${usage.quotaBytes} bytes)`);
}

export const storageQuota = {
  async reserve(organizationId: string, bytes: number): Promise<StorageReservation> {
    if (!Number.isSafeInteger(bytes) || bytes <= 0) throw new HttpError(400, 'Invalid storage reservation size');
    const reservationId = randomUUID();
    const createdAt = new Date().toISOString();
    if (database.mode() === 'mock') return withLock(organizationId, async () => {
      const usage = await ensureUsage(organizationId);
      if (usage.quotaBytes > 0 && usage.usedBytes + usage.reservedBytes + bytes > usage.quotaBytes) throw quotaError(usage, bytes);
      store.update('OrganizationStorageUsage', usage.id, {
        reservedBytes: usage.reservedBytes + bytes,
        reservations: { ...(usage.reservations || {}), [reservationId]: { bytes, createdAt } },
      }, { organizationId });
      return { id: reservationId, organizationId, bytes };
    });
    const usage = await ensureUsage(organizationId);
    const limitFilter = usage.quotaBytes > 0 ? { $expr: { $lte: [{ $add: ['$usedBytes', '$reservedBytes', bytes] }, '$quotaBytes'] } } : {};
    const updated = await models.OrganizationStorageUsage.findOneAndUpdate({ _id: usage.id, organizationId, ...limitFilter }, {
      $inc: { reservedBytes: bytes }, $set: { [`reservations.${reservationId}`]: { bytes, createdAt } },
    }, { new: true });
    if (!updated) throw quotaError(usage, bytes);
    return { id: reservationId, organizationId, bytes };
  },

  async commit(reservation: StorageReservation): Promise<void> {
    if (database.mode() === 'mock') return withLock(reservation.organizationId, async () => {
      const usage = await ensureUsage(reservation.organizationId);
      const entry = usage.reservations?.[reservation.id];
      if (!entry) return;
      const reservations = { ...usage.reservations }; delete reservations[reservation.id];
      store.update('OrganizationStorageUsage', usage.id, {
        usedBytes: usage.usedBytes + entry.bytes, reservedBytes: Math.max(0, usage.reservedBytes - entry.bytes), reservations,
      }, { organizationId: reservation.organizationId });
    });
    const path = `reservations.${reservation.id}`;
    await models.OrganizationStorageUsage.updateOne({ _id: storageId(reservation.organizationId), organizationId: reservation.organizationId, [path]: { $exists: true } }, {
      $inc: { usedBytes: reservation.bytes, reservedBytes: -reservation.bytes }, $unset: { [path]: 1 },
    });
  },

  async release(reservation: StorageReservation): Promise<void> {
    if (database.mode() === 'mock') return withLock(reservation.organizationId, async () => {
      const usage = await ensureUsage(reservation.organizationId);
      const entry = usage.reservations?.[reservation.id];
      if (!entry) return;
      const reservations = { ...usage.reservations }; delete reservations[reservation.id];
      store.update('OrganizationStorageUsage', usage.id, { reservedBytes: Math.max(0, usage.reservedBytes - entry.bytes), reservations }, { organizationId: reservation.organizationId });
    });
    const path = `reservations.${reservation.id}`;
    await models.OrganizationStorageUsage.updateOne({ _id: storageId(reservation.organizationId), organizationId: reservation.organizationId, [path]: { $exists: true } }, {
      $inc: { reservedBytes: -reservation.bytes }, $unset: { [path]: 1 },
    });
  },

  async releaseUsed(organizationId: string, bytes: number): Promise<void> {
    if (bytes <= 0) return;
    if (database.mode() === 'mock') return withLock(organizationId, async () => {
      const usage = await ensureUsage(organizationId);
      store.update('OrganizationStorageUsage', usage.id, { usedBytes: Math.max(0, usage.usedBytes - bytes) }, { organizationId });
    });
    const usage = await ensureUsage(organizationId);
    await models.OrganizationStorageUsage.updateOne({ _id: usage.id, organizationId }, [{ $set: { usedBytes: { $max: [0, { $subtract: ['$usedBytes', bytes] }] } } }]);
  },

  async reconcile(organizationId: string, usedBytes: number): Promise<StorageUsageRecord> {
    const usage = await ensureUsage(organizationId);
    const cutoff = Date.now() - 24 * 60 * 60 * 1000;
    const reservations = Object.fromEntries(Object.entries(usage.reservations || {}).filter(([, value]) => Date.parse(value.createdAt) >= cutoff));
    const reservedBytes = Object.values(reservations).reduce((sum, entry) => sum + entry.bytes, 0);
    const patch = { usedBytes: Math.max(0, usedBytes), reservedBytes, reservations, reconciledAt: new Date().toISOString() };
    if (database.mode() === 'mock') return store.update('OrganizationStorageUsage', usage.id, patch, { organizationId }) as StorageUsageRecord;
    return asUsage(await models.OrganizationStorageUsage.findOneAndUpdate({ _id: usage.id, organizationId }, { $set: patch }, { new: true }))!;
  },

  async get(organizationId: string): Promise<StorageUsageRecord> { return ensureUsage(organizationId); },

  async setLimit(organizationId: string, quotaBytes: number): Promise<StorageUsageRecord> {
    if (!Number.isSafeInteger(quotaBytes) || quotaBytes < 0) throw new HttpError(400, 'Storage quota must be a non-negative integer');
    const usage = await ensureUsage(organizationId);
    if (quotaBytes > 0 && usage.usedBytes + usage.reservedBytes > quotaBytes) throw new HttpError(409, 'Storage quota cannot be lower than current usage and reservations');
    if (database.mode() === 'mock') return store.update('OrganizationStorageUsage', usage.id, { quotaBytes }, { organizationId }) as StorageUsageRecord;
    return asUsage(await models.OrganizationStorageUsage.findOneAndUpdate({ _id: usage.id, organizationId }, { $set: { quotaBytes } }, { new: true }))!;
  },
};
