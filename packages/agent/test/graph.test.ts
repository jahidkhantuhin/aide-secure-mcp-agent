import { MemorySaver } from '@langchain/langgraph';
import { seedWorld } from '@aide/mock-world';
import { describe, expect, it } from 'vitest';
import {
  callMockTool,
  MockLLM,
  runGraph,
  type GraphEvent,
} from '../src/index.js';

describe('task graph', () => {
  it('plans, reads both MCP servers, and streams deterministic output', async () => {
    const events: GraphEvent[] = [];
    const world = seedWorld('graph-test');
    const checkpointer = new MemorySaver();
    const result = await runGraph({
      id: 'graph-test',
      prompt: 'Calendar and inbox',
      signal: new AbortController().signal,
      llm: new MockLLM({
        plan: { tools: ['list_events', 'search'], query: 'design' },
        chunks: ['Two events. ', 'One message.'],
      }),
      tool: (name, query, signal) => callMockTool(world, name, query, signal),
      emit: async (event) => {
        events.push(event);
      },
      checkpointer,
    });
    expect(result.observations).toEqual([
      { tool: 'list_events', count: 2 },
      { tool: 'search', count: 1 },
    ]);
    expect(
      events.filter((event) => event.type === 'TOOL_CALL_RESULT'),
    ).toHaveLength(2);
    expect(
      events.flatMap((event) =>
        event.type === 'TEXT_MESSAGE_CONTENT' ? [event.delta] : [],
      ),
    ).toEqual(['Two events. ', 'One message.']);
    expect(
      await checkpointer.getTuple({
        configurable: { thread_id: 'graph-test' },
      }),
    ).toBeDefined();
  });
});
