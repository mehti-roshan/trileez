import { models } from '../models/index.js';

export async function backfillAuditRecords(): Promise<void> {
  const rows = await models.AuditLog.collection.find({
    $or: [
      { requestId: { $exists: false } }, { requestId: null }, { requestId: '' },
      { timestamp: { $exists: false } }, { timestamp: null },
      { actorId: { $exists: false } }, { actorId: null }, { actorId: '' },
    ],
  }).toArray();
  for (const row of rows) {
    await models.AuditLog.collection.updateOne({ _id: row._id }, { $set: {
      requestId: row.requestId || `legacy-${String(row._id)}`,
      timestamp: row.timestamp || row.createdAt || new Date(),
      actorId: row.actorId || 'system:migration',
    } });
  }
}
