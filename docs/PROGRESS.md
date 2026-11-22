# Progress

## Step 1

Added the pnpm workspace, strict TypeScript configuration, the Next.js shell, the Express health endpoint, shared health schema, local Compose services, and CI checks.

Verified Compose startup, MongoDB replica-set readiness, Redis connectivity, and the browser's API online badge on dedicated loopback ports.

## Step 2

Added local owner enrollment, Better Auth sign-in and sign-out, protected web routes, and signed sandbox sessions. MongoDB stores a separate world per visitor and applies expiry and limits. Index bootstrap and shared document and run-event schemas prepare later steps.

## Step 3

Seeded new sandbox sessions with Sam Rivera's mock world and added calendar and mail tool servers on MCP 2026-07-28. The local HTTP handlers use fresh protocol instances, while explicit revisions and draft data carry context across requests. Both package suites run in the shared push and CI gate.
