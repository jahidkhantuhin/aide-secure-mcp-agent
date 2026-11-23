import type { createClient } from 'redis';

const reserve = `
local remaining = tonumber(redis.call('GET', KEYS[1]) or '0')
if remaining + tonumber(ARGV[1]) > tonumber(ARGV[2]) then return 0 end
redis.call('INCRBY', KEYS[1], ARGV[1])
redis.call('EXPIRE', KEYS[1], ARGV[3])
return 1
`;

export function createPublicSandboxLimits(
  redis: ReturnType<typeof createClient>,
  globalRequestLimit: number,
  sessionRequestLimit: number,
  tokenBudget: number,
) {
  async function charge(
    bucket: string,
    seconds: number,
    cost: number,
    limit: number,
  ) {
    const window = Math.floor(Date.now() / (seconds * 1000));
    const result = await redis
      .withCommandOptions({ abortSignal: AbortSignal.timeout(2000) })
      .eval(reserve, {
        keys: [`aide:public-sandbox:${bucket}:${window}`],
        arguments: [String(cost), String(limit), String(seconds)],
      });
    return result === 1;
  }

  return {
    async request(sessionId: string | null) {
      if (!(await charge('requests', 60, 1, globalRequestLimit))) return false;
      return sessionId
        ? charge(`session:${sessionId}`, 60, 1, sessionRequestLimit)
        : true;
    },
    task: (cost: number) => charge('tokens', 3600, cost, tokenBudget),
  };
}
