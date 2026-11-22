# MCP calendar and mail

Aide uses MCP `2026-07-28` over Streamable HTTP with `@modelcontextprotocol/server` 2.4.0 and `@modelcontextprotocol/node` 2.1.2. The SDK creates a fresh protocol server for each HTTP request. The calendar and mail endpoints share one in-memory mock world in the local API process. It is separate from browser sandbox sessions. Restart the API to reset it.

| Endpoint        | Read                            | Preview          | Mock write     |
| --------------- | ------------------------------- | ---------------- | -------------- |
| `/mcp/calendar` | `list_events`, `find_free_time` | `propose_change` | `apply_change` |
| `/mcp/mail`     | `search`, `read`                | `create_draft`   | `send`         |

Calendar moves carry an event ID and expected revision. The mail preview returns a draft ID and its contents, both of which are passed to `send`. The sent item is recorded in the mock outbox. Tool annotations describe behavior for clients. Aide's approval gate is added in a later step.

## MCP Inspector

Run `pnpm install` and `pnpm dev` from the repository root. Open a second terminal and launch the Inspector against the default API port.

```sh
npx @modelcontextprotocol/inspector --server-url http://127.0.0.1:4000/mcp/calendar --transport http
```

Connect, select **Tools**, and list the tools. Try `list_events` with start `2026-11-24T14:00:00Z` and end `2026-11-24T18:00:00Z`. For mail, connect to `http://127.0.0.1:4000/mcp/mail` and call `search` with query `design`. [Official Inspector guide](https://modelcontextprotocol.io/docs/tools/inspector)

## Claude Desktop

After `pnpm install`, open **Settings → Developer → Edit Config** in Claude Desktop. Add these entries under `mcpServers` and replace `D:/GITHUB/aide-secure-mcp-agent` if your checkout is elsewhere. Use an absolute Node executable path for `command` if Desktop cannot resolve `node`.

```json
{
  "mcpServers": {
    "aide-calendar": {
      "command": "node",
      "args": [
        "D:/GITHUB/aide-secure-mcp-agent/packages/mcp-calendar/node_modules/tsx/dist/cli.mjs",
        "D:/GITHUB/aide-secure-mcp-agent/packages/mcp-calendar/src/stdio.ts"
      ]
    },
    "aide-mail": {
      "command": "node",
      "args": [
        "D:/GITHUB/aide-secure-mcp-agent/packages/mcp-mail/node_modules/tsx/dist/cli.mjs",
        "D:/GITHUB/aide-secure-mcp-agent/packages/mcp-mail/src/stdio.ts"
      ]
    }
  }
}
```

Restart Claude Desktop and look for **aide-calendar** and **aide-mail** in the local connectors. Each stdio child gets its own mock world. The SDK contract tests exercise both stdio entry points. [Official Claude Desktop configuration guide](https://modelcontextprotocol.io/docs/develop/connect-local-servers)
