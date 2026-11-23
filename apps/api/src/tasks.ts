import { setTimeout as delay } from 'node:timers/promises';
import {
  callMockTool,
  createLLM,
  MockLLM,
  runGraph,
  type LLM,
} from '@aide/agent';
import {
  agentEventSchema,
  taskInputSchema,
  type Run,
  type Principal,
  type AgentEvent,
} from '@aide/shared/domain';
import { seedWorld } from '@aide/mock-world';
import { calendarEventSchema, type MockWorld } from '@aide/shared/mock-world';
import type { MongoDBSaver } from '@langchain/langgraph-checkpoint-mongodb';
import { Router, type Request } from 'express';
import type { MongoClient } from 'mongodb';
import type { z } from 'zod';
import type { configSchema } from './config.js';
import { TaskRepository } from './task-repository.js';
import { PolicyRepository } from './policy-repository.js';

type TaskAccess = {
  principal: Principal;
  world?: MockWorld;
  charge?: () => Promise<boolean>;
};
const terminal = new Set<AgentEvent['type']>([
  'RUN_FINISHED',
  'RUN_ERROR',
  'RUN_CANCELLED',
]);

export function createTaskRouter(
  mongo: MongoClient,
  checkpointer: MongoDBSaver,
  config: z.infer<typeof configSchema>,
  authorize: (req: Request) => Promise<TaskAccess | null>,
  mock: LLM = new MockLLM(),
  policy: PolicyRepository = new PolicyRepository(mongo.db()),
) {
  const db = mongo.db();
  const repository = new TaskRepository(db);
  let setup: Promise<void> | undefined;
  function setupCheckpointer() {
    setup ??= checkpointer
      .setup()
      .then((errors) => {
        if (errors.length)
          throw new AggregateError(
            errors,
            'Could not set up graph checkpoints',
          );
      })
      .catch((error: unknown) => {
        setup = undefined;
        throw error;
      });
    return setup;
  }
  const provider =
    config.AIDE_LLM_PROVIDER ??
    (config.GOOGLE_GENERATIVE_AI_API_KEY ? 'gemini' : 'mock');
  const owner =
    provider === 'mock'
      ? mock
      : createLLM({
          provider,
          model: config.AIDE_MODEL,
          googleKey: config.GOOGLE_GENERATIVE_AI_API_KEY,
          ollamaUrl: config.OLLAMA_BASE_URL,
        });
  const origin = new URL(config.WEB_ORIGIN).origin;
  const active = new Map<string, AbortController>();
  let starting = 0;
  const router = Router();

  async function execute(
    run: Run,
    prompt: string,
    access: TaskAccess,
    controller: AbortController,
  ) {
    const signal = AbortSignal.any([
      controller.signal,
      AbortSignal.timeout(60_000),
    ]);
    const base = { runId: run._id, threadId: run._id };
    let sequence = 0;
    let phase = '';
    let failureMessage: string | undefined;
    async function append(event: { type: string; stepName?: string }) {
      const parsed = agentEventSchema.parse({
        ...base,
        ...event,
        timestamp: Date.now(),
      });
      await repository.append(run._id, sequence + 1, parsed);
      sequence++;
      if (event.type === 'STEP_STARTED') phase = event.stepName ?? '';
    }
    let status: 'completed' | 'failed' | 'cancelled' = 'completed';
    try {
      await append({ type: 'RUN_STARTED' });
      signal.throwIfAborted();
      await setupCheckpointer();
      signal.throwIfAborted();
      const world = access.world ?? seedWorld(run._id);
      if (access.principal.kind === 'owner') {
        const changes = await db
          .collection('mockCalendar')
          .find({ ownerId: access.principal.id })
          .toArray();
        const revised = new Map(
          changes.map((row) => [
            row.eventId,
            calendarEventSchema.parse(row.event),
          ]),
        );
        world.calendar = world.calendar.map(
          (event) => revised.get(event.id) ?? event,
        );
      }
      signal.throwIfAborted();
      await runGraph({
        id: run._id,
        prompt,
        signal,
        checkpointer,
        llm: access.principal.kind === 'sandbox' ? mock : owner,
        authorizeTool: async (name) => {
          const decision = await policy.decide(
            access.principal,
            {
              tool: name,
              recipients: [],
              sensitivity: 'internal',
            },
            'agent',
            new Date(),
            run._id,
          );
          const event = { type: 'POLICY_DECISION', tool: name, decision };
          await append(event);
          if (decision.outcome !== 'allow') {
            failureMessage =
              decision.outcome === 'require_approval'
                ? `Approval required for ${name}. ${decision.reasons.join(' ')}`
                : `Policy denied ${name}. ${decision.reasons.join(' ')}`;
            throw new Error(failureMessage);
          }
        },
        tool: (name, query, abortSignal) =>
          callMockTool(world, name, query, abortSignal),
        emit: append,
      });
      signal.throwIfAborted();
    } catch (error) {
      status = controller.signal.aborted ? 'cancelled' : 'failed';
      if (status === 'failed' && !failureMessage && phase === 'Plan') {
        const details = error as { statusCode?: unknown };
        const code = details?.statusCode;
        const modelProvider =
          access.principal.kind === 'sandbox' ? 'mock' : provider;
        const reason =
          code === 401 || code === 403
            ? 'Check the provider credentials.'
            : code === 404
              ? 'Check the configured model ID and access.'
              : code === 429
                ? 'The provider rate limit or quota was reached.'
                : 'Check the model configuration or retry the task.';
        failureMessage = `Planning failed (${modelProvider}). ${reason}`;
      }
    }
    active.delete(run._id);
    const event =
      status === 'completed'
        ? { type: 'RUN_FINISHED' }
        : status === 'cancelled'
          ? { type: 'RUN_CANCELLED' }
          : {
              type: 'RUN_ERROR',
              message: failureMessage ?? 'The task could not finish.',
            };
    await append(event);
    await repository.finish(run._id, status);
  }

  router.use((req, res, next) => {
    res.set('Cache-Control', 'no-store');
    if (req.method === 'POST' && req.get('origin') !== origin) {
      res.status(403).json({ error: 'Origin forbidden' });
      return;
    }
    next();
  });
  router.post('/', async (req, res) => {
    const parsed = taskInputSchema.safeParse(req.body);
    if (!parsed.success) {
      res.status(400).json({ error: 'Enter a task up to 1200 characters.' });
      return;
    }
    const access = await authorize(req);
    if (!access) {
      res.status(401).json({ error: 'Open the demo or sign in first.' });
      return;
    }
    if (active.size + starting >= 16) {
      res
        .status(429)
        .json({ error: 'Task capacity or sandbox allowance reached.' });
      return;
    }
    starting++;
    try {
      if (access.charge && !(await access.charge())) {
        res.status(429).json({ error: 'Sandbox allowance reached.' });
        return;
      }
      const run = await repository.create(access.principal);
      const controller = new AbortController();
      active.set(run._id, controller);
      void execute(run, parsed.data.prompt, access, controller).catch(
        (error: unknown) => {
          active.delete(run._id);
          req.log.error(
            { err: error, runId: run._id },
            'Could not persist task result',
          );
        },
      );
      res.status(202).json({ id: run._id });
    } finally {
      starting--;
    }
  });

  router.post('/:id/cancel', async (req, res) => {
    const access = await authorize(req);
    const run =
      access && (await repository.find(req.params.id, access.principal));
    if (!run) {
      res.status(404).json({ error: 'Task not found' });
      return;
    }
    const controller = active.get(run._id);
    if (!controller) {
      res.status(409).json({ error: 'Task is no longer running' });
      return;
    }
    controller.abort();
    res.status(202).json({ id: run._id });
  });

  router.get('/:id/events', async (req, res) => {
    const access = await authorize(req);
    const run =
      access && (await repository.find(req.params.id, access.principal));
    if (!run) {
      res.status(404).json({ error: 'Task not found' });
      return;
    }
    const raw = req.get('last-event-id') ?? '0';
    let cursor = Number(raw);
    if (!/^\d+$/.test(raw) || !Number.isSafeInteger(cursor)) {
      res.status(400).json({ error: 'Invalid Last-Event-ID' });
      return;
    }

    res.set({
      'Content-Type': 'text/event-stream',
      'Cache-Control': 'no-cache, no-transform, private',
      'X-Accel-Buffering': 'no',
    });
    res.flushHeaders();
    const disconnected = new AbortController();
    res.once('close', () => disconnected.abort());
    const deadline = Date.now() + 65_000;
    let heartbeat = Date.now();
    res.write(': connected\n\n');
    try {
      while (!disconnected.signal.aborted && Date.now() < deadline) {
        if (!res.writableNeedDrain) {
          const rows = await repository.after(run._id, cursor);
          if (res.destroyed) return;
          for (const row of rows) {
            cursor = row.sequence;
            res.write(`id: ${cursor}\ndata: ${JSON.stringify(row.event)}\n\n`);
            if (terminal.has(row.event.type)) return;
          }
          if (
            rows.length === 0 &&
            (run.status !== 'running' || !active.has(run._id))
          ) {
            // Check live state once more to avoid racing a final event written during this read.
            const latest = await repository.find(run._id, access.principal);
            if (
              latest?.status !== 'running' &&
              !(await repository.after(run._id, cursor)).length
            )
              return;
          }
          if (Date.now() - heartbeat >= 10_000) {
            res.write(': heartbeat\n\n');
            heartbeat = Date.now();
          }
        }
        await delay(200, undefined, { signal: disconnected.signal });
      }
    } catch (error) {
      if (!disconnected.signal.aborted)
        req.log.error({ err: error }, 'Task stream interrupted');
    } finally {
      if (!res.destroyed) res.end();
    }
  });
  return router;
}
