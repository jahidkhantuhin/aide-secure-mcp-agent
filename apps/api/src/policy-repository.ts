import { randomUUID } from 'node:crypto';
import { evaluatePolicy, type ActiveGrant } from '@aide/guard/policy';
import type { Principal } from '@aide/shared/domain';
import {
  policyModesSchema,
  teamRecipients,
  type PolicyInput,
  type PolicyModes,
  type PolicyTool,
  type TrustMode,
  type PolicyDecision,
} from '@aide/shared/policy';
import { MongoServerError, type Db } from 'mongodb';

type Version = {
  principal: Principal;
  version: number;
  modes: PolicyModes;
  createdAt: Date;
};
type Grant = Omit<ActiveGrant, 'id'> & {
  _id: string;
  principal: Principal;
  createdAt: Date;
};
type Audit = {
  _id: string;
  principal: Principal;
  action: 'policy_decision' | 'policy_preview' | 'grant_used';
  tool: string;
  policyVersion: number;
  runId?: string;
  createdAt: Date;
  decision: PolicyDecision;
};

export class PolicyRepository {
  constructor(private readonly db: Db) {}

  async latest(principal: Principal) {
    const row = await this.db
      .collection<Version>('policies')
      .findOne(
        { 'principal.kind': principal.kind, 'principal.id': principal.id },
        { sort: { version: -1 } },
      );
    return {
      version: row?.version ?? 0,
      modes: policyModesSchema.parse(row?.modes ?? {}),
    };
  }

  async change(
    principal: Principal,
    expectedVersion: number,
    tool: PolicyTool,
    mode: TrustMode,
  ) {
    const current = await this.latest(principal);
    if (expectedVersion !== current.version) return false;
    try {
      await this.db.collection<Version>('policies').insertOne({
        principal,
        version: current.version + 1,
        modes: { ...current.modes, [tool]: mode },
        createdAt: new Date(),
      });
      return true;
    } catch (error) {
      if (error instanceof MongoServerError && error.code === 11000)
        return false;
      throw error;
    }
  }

  async activeGrants(principal: Principal, now: Date) {
    return this.db
      .collection<Grant>('grants')
      .find({
        'principal.kind': principal.kind,
        'principal.id': principal.id,
        tool: 'send',
        revokedAt: { $exists: false },
        expiresAt: { $gt: now },
      })
      .sort({ expiresAt: 1, _id: 1 })
      .toArray();
  }

  async grantTeamMail(principal: Principal, now: Date) {
    const row: Grant = {
      _id: randomUUID(),
      principal,
      tool: 'send',
      recipients: [...teamRecipients],
      createdAt: now,
      expiresAt: new Date(now.getTime() + 3600000),
    };
    await this.db.collection<Grant>('grants').insertOne(row);
  }

  async revoke(principal: Principal, id: string, now: Date) {
    const result = await this.db.collection<Grant>('grants').updateOne(
      {
        _id: id,
        'principal.kind': principal.kind,
        'principal.id': principal.id,
        expiresAt: { $gt: now },
        revokedAt: { $exists: false },
      },
      { $set: { revokedAt: now } },
    );
    return result.modifiedCount === 1;
  }

  async decisions(principal: Principal) {
    return this.db
      .collection<Audit>('auditLogs')
      .find({
        'principal.kind': principal.kind,
        'principal.id': principal.id,
        action: { $in: ['policy_decision', 'policy_preview', 'grant_used'] },
      })
      .sort({ createdAt: -1, _id: -1 })
      .limit(25)
      .toArray();
  }

  async decide(
    principal: Principal,
    input: PolicyInput,
    source: 'agent' | 'preview',
    now: Date,
    runId?: string,
  ) {
    const policy = await this.latest(principal);
    const grants = await this.activeGrants(principal, now);
    const decision = evaluatePolicy(
      input,
      policy.modes,
      grants.map((grant) => ({ ...grant, id: grant._id })),
      now,
    );
    const action =
      source === 'preview'
        ? 'policy_preview'
        : decision.grantId
          ? 'grant_used'
          : 'policy_decision';
    await this.db.collection<Audit>('auditLogs').insertOne({
      _id: randomUUID(),
      principal,
      action,
      tool: input.tool,
      policyVersion: policy.version,
      createdAt: now,
      decision,
      ...(runId ? { runId } : {}),
    });
    return decision;
  }
}
