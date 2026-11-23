import {
  Annotation,
  END,
  START,
  StateGraph,
  Command,
  interrupt,
  type BaseCheckpointSaver,
} from '@langchain/langgraph';
import { resolutionSchema, type Resolution } from '@aide/shared/approval';

const state = Annotation.Root({
  approvalId: Annotation<string>(),
  resolution: Annotation<Resolution>(),
});

export function createApprovalGraph(checkpointer: BaseCheckpointSaver) {
  const graph = new StateGraph(state)
    .addNode('approveAction', (input) => ({
      resolution: resolutionSchema.parse(
        interrupt({ approvalId: input.approvalId }),
      ),
    }))
    .addEdge(START, 'approveAction')
    .addEdge('approveAction', END)
    .compile({ checkpointer });
  const options = (runId: string) => ({
    configurable: { thread_id: runId },
    durability: 'sync' as const,
  });
  return {
    async pause(runId: string, approvalId: string) {
      await graph.invoke({ approvalId }, options(runId));
      const checkpoint = await graph.getState(options(runId));
      if (!checkpoint.tasks.some((task) => task.interrupts.length))
        throw new Error('Approval graph did not pause');
    },
    async resume(runId: string, resolution: Resolution) {
      const prior = await graph.getState(options(runId));
      if (prior.values.resolution)
        return resolutionSchema.parse(prior.values.resolution);
      const result = await graph.invoke(
        new Command({ resume: resolution }),
        options(runId),
      );
      return resolutionSchema.parse(result.resolution);
    },
  };
}
