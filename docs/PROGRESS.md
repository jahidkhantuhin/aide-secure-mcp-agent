# Progress

## Step 1

Added the pnpm workspace, strict TypeScript configuration, the Next.js shell, the Express health endpoint, shared health schema, local Compose services, and CI checks.

Verified Compose startup, MongoDB replica-set readiness, Redis connectivity, and the browser's API online badge on dedicated loopback ports.

## Step 2

Added local owner enrollment, Better Auth sign-in and sign-out, protected web routes, and signed sandbox sessions. MongoDB stores a separate world per visitor and applies expiry and limits. Index bootstrap and shared document and run-event schemas prepare later steps.

## Step 3

Seeded new sandbox sessions with Sam Rivera's mock world and added calendar and mail tool servers on MCP 2026-07-28. The local HTTP handlers use fresh protocol instances, while explicit revisions and draft data carry context across requests. Both package suites run in the shared push and CI gate.

## Step 4

Added a checkpointed LangGraph task runner, session-scoped SSE replay and cancellation, and an Assistant timeline in the demo and owner workspaces. The runner reads isolated mock calendar and mail data over MCP and streams its answer. The shared push and CI gate runs the graph and task API tests.

## Step 5

Added deterministic tool decisions, owner trust modes, immutable MongoDB policy versions, and expiring team-mail grants. Agent tool calls now record and stream a decision before execution. The owner Trust page can change settings, revoke grants, and preview decisions.

## Step 6

Added owner mock-action previews, checkpointed approval, editable drafts, and revision-checked decisions. The BullMQ worker applies mock actions after the undo window. Each approval outcome and effect is recorded in MongoDB.

## Step 7

Added tool-free extraction, bounded source normalization, a fixed-vocabulary planner input, quarantine risk decisions, and deterministic egress screening in both approval and worker paths. Added guard notices to the Assistant and scoped guard activity records.

## Step 8

Added a mock-only public mode with Redis request limits and a shared task budget. Security Lab runs fixed egress fixtures and records session-scoped results. Added a nonce-based public browser CSP and a Playwright smoke test to the shared verification gate.
