import { generateText, Output, streamText, type LanguageModel } from 'ai';
import { z } from 'zod';

export const toolName = z.enum(['list_events', 'search']);
export const planSchema = z.object({
  tools: z.array(toolName).max(2),
  query: z.string().max(120),
});
export type Plan = z.infer<typeof planSchema>;
export type Observation = { tool: z.infer<typeof toolName>; count: number };

export interface LLM {
  plan(prompt: string, signal: AbortSignal): Promise<Plan>;
  respond(
    prompt: string,
    observations: Observation[],
    signal: AbortSignal,
  ): AsyncIterable<string>;
}

export class MockLLM implements LLM {
  constructor(private readonly scenario?: { plan: Plan; chunks: string[] }) {}

  async plan(prompt: string, signal: AbortSignal): Promise<Plan> {
    signal.throwIfAborted();
    if (this.scenario) return this.scenario.plan;
    const tools: Plan['tools'] = [];
    if (/calendar|schedule|event|meeting/i.test(prompt))
      tools.push('list_events');
    if (/mail|inbox|email|message/i.test(prompt)) tools.push('search');
    return { tools, query: /sync/i.test(prompt) ? 'sync' : 'design' };
  }

  async *respond(
    _prompt: string,
    observations: Observation[],
    signal: AbortSignal,
  ) {
    const chunks =
      this.scenario?.chunks ??
      (observations.length
        ? observations.map(({ tool, count }) =>
            tool === 'list_events'
              ? `Sam has ${count} event(s) on the demo calendar. `
              : `The demo inbox has ${count} matching message(s). `,
          )
        : ['Ask me about Sam’s demo calendar or inbox.']);
    for (const chunk of chunks) {
      signal.throwIfAborted();
      yield chunk;
    }
  }
}

export function aiSdkLLM(model: LanguageModel): LLM {
  return {
    async plan(prompt, abortSignal) {
      const response = await generateText({
        model,
        abortSignal,
        maxRetries: 2,
        maxOutputTokens: 300,
        output: Output.object({ schema: planSchema }),
        system:
          'Choose read-only tools for the fictional demo. list_events lists the demo calendar. search searches the mock inbox. Use an empty tools array for unrelated requests. Set query to a short search term.',
        prompt,
      });
      return response.output;
    },
    async *respond(prompt, observations, abortSignal) {
      const result = streamText({
        model,
        abortSignal,
        maxRetries: 2,
        maxOutputTokens: 500,
        system:
          'Summarize only the provided counts from the fictional demo. No calendar or mail changes were made. If there are no observations, explain that the demo supports calendar listing and inbox search.',
        prompt: JSON.stringify({ question: prompt, observations }),
      });
      yield* result.textStream;
    },
  };
}
