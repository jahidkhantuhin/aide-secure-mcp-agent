# Aide

**Agents that ask before they act.**

Aide is a personal AI assistant designed to read untrusted content and give the user control over actions that affect other people and accounts.

## Project goals

1. Quarantine untrusted content and enforce deterministic policy.
2. Preview side effects and require approval or a scoped grant, with undo where possible.
3. Expose capabilities through interoperable MCP servers.
4. Publish measured security and task benchmark results.
5. Provide a public, no-signup, mock-only demo with a Security Lab.

Step 1 provides the workspace, local infrastructure, web shell, and dependency health check. Desktop control, voice input, multi-agent swarms, and generic long-term memory are outside the project scope.

## Local development

Use Node.js 24, Corepack or the pnpm version listed in package.json, and Docker Compose. The web scripts use webpack for compatibility with the Windows development host. Defaults work without an env file. Copy .env.example to .env to override them.

```sh
pnpm install
docker compose up -d --wait
pnpm dev
```

Open http://localhost:3000 and look for the green **API online** badge. The API health endpoint is http://127.0.0.1:4000/health. Mailpit's inbox is at http://127.0.0.1:8125. The Compose stack publishes MongoDB on 27027, Redis on 6389, and Mailpit SMTP on 1125. All four ports bind to loopback.

Run `pnpm check` from the root to reproduce the Husky pre-push and GitHub Actions checks. It starts the local MongoDB replica set, runs lint and type checking, runs every workspace package's test script with MongoDB integration enabled, and runs workspace build scripts. Keep Docker running for pushes. Run `pnpm prepare` if you installed dependencies with hooks disabled.

When adding a test, make sure its package's `test` script discovers it. When a suite needs another runner or service, wire it into the shared check so both gates run it. For GitHub-side enforcement, configure the CI `checks` job as a required status check on the default branch and require pull requests.

## Workspace

- `apps/web` renders the Next.js app shell and API badge.
- `apps/api` serves the Express health endpoint.
- `packages/shared` owns the Zod health response contract.
- `packages/mock-world` seeds Sam Rivera's fictional calendar, inbox, and social account.
- `packages/mcp-calendar` and `packages/mcp-mail` expose typed mock tools over MCP.

See [Progress](docs/PROGRESS.md), [Technology notes](docs/TECH-NOTES.md), and [Interview Q&A](docs/INTERVIEW-QA.md).

## Owner and demo sessions

Choose **Try the demo, no signup** on the home page to open a temporary mock workspace seeded with Sam Rivera's data. Each session has its own mailbox, calendar, and social data. The default limit is 30 requests per minute, the session expires after one hour, and its token allowance is reserved for agent work in later steps.

Owner registration is a local CLI operation. Set `AIDE_SESSION_SECRET` in the root `.env` using the output of `node -p "require('node:crypto').randomBytes(32).toString('base64url')"`. Set `AIDE_OWNER_EMAIL`, `AIDE_OWNER_NAME`, and a password of at least 12 characters through the command environment or ignored `.env`. Run `pnpm owner:register`, remove the registration password from that environment or file, and start or restart `pnpm dev`. Open **Owner sign in** and use the registered credentials.

The API creates its indexes when it first handles a session request. You can pre-create them with `pnpm db:bootstrap`. Set `TEST_MONGODB_URI` in your test shell to the Compose replica-set URI and run `pnpm test` for auth, session isolation, request and token limits, and TTL cleanup. The TTL monitor test can take about a minute.

## Assistant timeline

Open the demo or sign into the owner workspace and ask **What’s on Sam’s calendar and in the inbox?** The timeline shows the plan, mock tool calls and result counts, and the streamed answer. Cancel while a task is running to stop it. The demo uses MockLLM and reserves 1,000 units of its token allowance per submitted task. Refresh the demo to see its current balance.

The owner also uses MockLLM unless a provider is configured. Set `AIDE_LLM_PROVIDER=gemini`, `AIDE_MODEL`, and `GOOGLE_GENERATIVE_AI_API_KEY` for Gemini. Alternatively set `AIDE_LLM_PROVIDER=ollama` and `AIDE_MODEL` to a local model that supports structured output. The default Ollama base URL is `http://127.0.0.1:11434/v1`. Gemini is selected automatically when its key is supplied and no provider is specified. The sandbox always uses MockLLM.

The API persists run events for SSE replay and saves checkpoints to MongoDB. Cancellation and execution are local to the running API process. A restart does not automatically resume an interrupted task.

## Trust settings

Sign in as the owner and choose **Trust settings**. Change a tool's trust mode and inspect the policy version. To see that decision on a real run, set `list_events` to **Ask first**, then ask the Assistant about Sam's calendar. The timeline records the approval requirement and stops before reading the calendar. Set it back to **Read-only** to allow the read.

Use **Preview a decision** to check mock write rules without running a tool. For example, preview `send` to `external@partner.test` to see why it needs approval. **Narrow auto** can match an active one-hour grant for the listed team addresses during 09:00–17:00 UTC. The Assistant still only calls read tools. The localhost Inspector endpoints remain mock development fixtures.

## Approvals and Undo

Sign in as the owner and open **Approvals** to request a mock email or calendar move. Review the action and its risk, edit mail if needed, then approve or reject. Approval starts the undo window, which defaults to ten seconds. The worker applies changes to the MongoDB mock calendar or outbox after the window. The page refreshes approval status every second. A calendar move stores an inverse operation for future rollback.

`pnpm dev` starts the worker alongside the API and web app. The approval worker uses the existing MongoDB replica set and Redis. Set `AIDE_UNDO_SECONDS` to change the window. The Assistant continues to offer read tools, and the Approvals page is the entry point for mock writes.

## Quarantine and egress

Ask about Sam's inbox in a fresh demo and look for the **Flagged content** banner. A harmless hidden-formatting sample in the seeded mailbox exercises the notice. Open **Activity** to see the source layer and outcome. Activity is scoped to the current owner or sandbox session.

A tool-free extractor reduces inbox messages, calendar titles, and social posts to fixed sender and intent categories, dates, and action categories marked as data. The planner and its MCP read tools get the guarded view. Source risk influences policy, and high-risk reads stop before MCP invocation. The same extractor can handle web fragments when that source is connected.

The owner can verify egress without sending mail by requesting a mock email with the body `[restricted] QA sample`. The request should be denied and **Activity** should show an egress block. The worker rechecks before writing to the mock outbox. New recipients require approval, and the link allowlist currently accepts only the fixture origin `https://example.test`.

The extractor caps source text at 8,192 characters and handles a bounded set of encodings and formatting. It does not evaluate browser layout, identify arbitrary secrets, or detect every malicious instruction. Screening uses deterministic signals. The direct localhost MCP endpoints serve development fixtures.

## Local MCP tools

With `pnpm dev` running, the local API serves Streamable HTTP at `/mcp/calendar` and `/mcp/mail`. See [MCP setup](docs/MCP.md) for tool examples, Inspector, and Claude Desktop configuration.

## Author

Jahid Khan Tuhin, Full Stack JavaScript Engineer.

Portfolio and contact links: to be added by the author.
