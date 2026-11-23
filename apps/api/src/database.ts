import type { Db } from 'mongodb';

export async function ensureIndexes(db: Db) {
  await Promise.all([
    db
      .collection('policies')
      .createIndex(
        { 'principal.kind': 1, 'principal.id': 1, version: -1 },
        { unique: true },
      ),
    db.collection('users').createIndex({ ownerSlot: 1 }, { unique: true }),
    db
      .collection('sessions')
      .createIndex({ expiresAt: 1 }, { expireAfterSeconds: 0 }),
    db
      .collection('sandboxSessions')
      .createIndex({ expiresAt: 1 }, { expireAfterSeconds: 0 }),
    db
      .collection('runs')
      .createIndex({ 'principal.kind': 1, 'principal.id': 1, createdAt: -1 }),
    db
      .collection('runEvents')
      .createIndex({ runId: 1, sequence: 1 }, { unique: true }),
    db.collection('approvals').createIndex({ runId: 1, status: 1 }),
    db.collection('grants').createIndex({ 'principal.id': 1, expiresAt: 1 }),
    db.collection('idempotencyKeys').createIndexes([
      { key: { key: 1 }, unique: true },
      { key: { expiresAt: 1 }, expireAfterSeconds: 0 },
    ]),
    db
      .collection('auditLogs')
      .createIndex({ 'principal.id': 1, createdAt: -1 }),
    db
      .collection('attackAttempts')
      .createIndexes([
        { key: { sandboxSessionId: 1, createdAt: -1 } },
        { key: { expiresAt: 1 }, expireAfterSeconds: 0 },
      ]),
  ]);
}
