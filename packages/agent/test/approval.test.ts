import { MemorySaver } from '@langchain/langgraph';
import { expect, it } from 'vitest';
import { createApprovalGraph } from '../src/approval.js';

it.each(['approved', 'rejected', 'undone'] as const)(
  'pauses and resumes with %s',
  async (decision) => {
    const checkpoint = new MemorySaver();
    await createApprovalGraph(checkpoint).pause('run', 'approval');
    const graph = createApprovalGraph(checkpoint);
    expect(await graph.resume('run', decision)).toBe(decision);
    expect(await graph.resume('run', decision)).toBe(decision);
  },
);
