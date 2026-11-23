import { randomUUID } from 'node:crypto';
import type { Principal } from '@aide/shared/domain';
import {
  activityItemSchema,
  guardNoticeSchema,
  type GuardNotice,
} from '@aide/shared/security';
import type { Db } from 'mongodb';

type Row = GuardNotice & {
  _id: string;
  principal: Principal;
  at: Date;
  expiresAt: Date;
};

export async function recordGuard(
  db: Db,
  principal: Principal,
  notice: GuardNotice,
) {
  const at = new Date();
  await db.collection<Row>('guardActivity').insertOne({
    ...guardNoticeSchema.parse(notice),
    _id: randomUUID(),
    principal,
    at,
    expiresAt: new Date(at.getTime() + 7 * 86400000),
  });
}

export async function listGuardActivity(db: Db, principal: Principal) {
  const rows = await db
    .collection<Row>('guardActivity')
    .find({ 'principal.kind': principal.kind, 'principal.id': principal.id })
    .sort({ at: -1, _id: -1 })
    .limit(50)
    .toArray();
  return rows.map(({ _id, at, layer, outcome, reason }) =>
    activityItemSchema.parse({
      id: String(_id),
      at: at.toISOString(),
      layer,
      outcome,
      reason,
    }),
  );
}
