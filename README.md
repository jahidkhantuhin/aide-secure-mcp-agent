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

Run `pnpm lint`, `pnpm typecheck`, and `pnpm test` from the root. The API tests use dependency probes, so the test suite can run without Docker.

## Workspace

- `apps/web` renders the Next.js app shell and API badge.
- `apps/api` serves the Express health endpoint.
- `packages/shared` owns the Zod health response contract.
- `packages/mock-world` reserves the workspace for mock data.

See [Progress](docs/PROGRESS.md), [Technology notes](docs/TECH-NOTES.md), and [Interview Q&A](docs/INTERVIEW-QA.md).

## Author

Jahid Khan Tuhin, Full Stack JavaScript Engineer.

Portfolio and contact links: to be added by the author.
