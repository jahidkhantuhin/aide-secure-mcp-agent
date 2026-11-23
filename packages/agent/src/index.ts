import {
  Annotation,
  END,
  START,
  StateGraph,
  type BaseCheckpointSaver,
} from '@langchain/langgraph';
import { createGoogleGenerativeAI } from '@ai-sdk/google';
import { createOpenAI } from '@ai-sdk/openai';
import {
  planSchema,
  aiSdkLLM,
  MockLLM,
  type LLM,
  type Observation,
  type Plan,
} from './provider.js';
import type { RunTool } from './tools.js';

export { MockLLM, type LLM } from './provider.js';
export { callMockTool } from './tools.js';

export function createLLM(settings: {
  provider: 'mock' | 'gemini' | 'ollama';
  model?: string;
  googleKey?: string;
  ollamaUrl: string;
}): LLM {
  if (settings.provider === 'mock') return new MockLLM();
  if (!settings.model)
    throw new Error('AIDE_MODEL is required for the configured provider');
  if (settings.provider === 'gemini') {
    if (!settings.googleKey)
      throw new Error('GOOGLE_GENERATIVE_AI_API_KEY is required');
    return aiSdkLLM(
      createGoogleGenerativeAI({ apiKey: settings.googleKey })(settings.model),
    );
  }
  return aiSdkLLM(
    createOpenAI({ baseURL: settings.ollamaUrl, apiKey: 'ollama' }).chat(
      settings.model,
    ),
  );
}

const graphState = Annotation.Root({
  prompt: Annotation<string>(),
  plan: Annotation<Plan>(),
  observations: Annotation<Observation[]>(),
});

export type GraphEvent =
  | { type: 'STEP_STARTED' | 'STEP_FINISHED'; stepName: string }
  | { type: 'PLAN_CREATED'; tools: string[] }
  | { type: 'TOOL_CALL_START'; toolCallId: string; toolCallName: string }
  | { type: 'TOOL_CALL_END'; toolCallId: string }
  | { type: 'TOOL_CALL_RESULT'; toolCallId: string; count: number }
  | { type: 'TEXT_MESSAGE_START' | 'TEXT_MESSAGE_END'; messageId: string }
  | { type: 'TEXT_MESSAGE_CONTENT'; messageId: string; delta: string };

export function runGraph(options: {
  id: string;
  prompt: string;
  signal: AbortSignal;
  llm: LLM;
  tool: RunTool;
  emit: (event: GraphEvent) => Promise<void>;
  checkpointer: BaseCheckpointSaver;
}) {
  const { id, prompt, signal, llm, tool, emit, checkpointer } = options;
  async function step<T>(stepName: string, operation: () => Promise<T>) {
    signal.throwIfAborted();
    await emit({ type: 'STEP_STARTED', stepName });
    const result = await operation();
    signal.throwIfAborted();
    await emit({ type: 'STEP_FINISHED', stepName });
    return result;
  }
  const graph = new StateGraph(graphState)
    .addNode('understand', (state) =>
      step('Understand', async () => ({ prompt: state.prompt.trim() })),
    )
    .addNode('makePlan', (state) =>
      step('Plan', async () => {
        const parsed = planSchema.parse(await llm.plan(state.prompt, signal));
        const plan = { ...parsed, tools: [...new Set(parsed.tools)] };
        await emit({ type: 'PLAN_CREATED', tools: plan.tools });
        return { plan };
      }),
    )
    .addNode('tool', (state) =>
      step('Read mock data', async () => {
        const index = state.observations.length;
        const name = state.plan.tools[index];
        const toolCallId = `${id}:tool:${index}`;
        await emit({ type: 'TOOL_CALL_START', toolCallId, toolCallName: name });
        const count = await tool(name, state.plan.query, signal);
        await emit({ type: 'TOOL_CALL_END', toolCallId });
        await emit({ type: 'TOOL_CALL_RESULT', toolCallId, count });
        return { observations: [...state.observations, { tool: name, count }] };
      }),
    )
    .addNode('respond', (state) =>
      step('Respond', async () => {
        const messageId = id + ':answer';
        await emit({ type: 'TEXT_MESSAGE_START', messageId });
        for await (const delta of llm.respond(
          state.prompt,
          state.observations,
          signal,
        )) {
          signal.throwIfAborted();
          if (delta)
            await emit({ type: 'TEXT_MESSAGE_CONTENT', messageId, delta });
        }
        await emit({ type: 'TEXT_MESSAGE_END', messageId });
        return {};
      }),
    )
    .addEdge(START, 'understand')
    .addEdge('understand', 'makePlan')
    .addConditionalEdges(
      'makePlan',
      (state) => (state.plan.tools.length ? 'tool' : 'respond'),
      ['tool', 'respond'],
    )
    .addConditionalEdges(
      'tool',
      (state) =>
        state.observations.length < state.plan.tools.length
          ? 'tool'
          : 'respond',
      ['tool', 'respond'],
    )
    .addEdge('respond', END)
    .compile({ checkpointer });
  return graph.invoke(
    { prompt, observations: [] },
    { configurable: { thread_id: id }, signal, durability: 'sync' },
  );
}
