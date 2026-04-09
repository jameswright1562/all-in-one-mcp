# all-in-one-mcp

`all-in-one-mcp` is a managed MCP runtime that exposes:

- an HTTP MCP gateway at `/mcp`
- an admin API at `/api/mcps`
- a health endpoint at `/healthz`
- an optional dashboard process
- a stdio proxy mode for legacy MCP clients

## Run with npx

```bash
npx all-in-one-mcp serve
npx all-in-one-mcp serve --dashboard
```

Useful flags:

```bash
npx all-in-one-mcp serve --host 127.0.0.1 --port 4100 --database ./runtime.sqlite
npx all-in-one-mcp serve --dashboard --dashboard-port 4101
npx all-in-one-mcp stdio-proxy --url http://127.0.0.1:4100/mcp
```

Environment variables:

- `ALL_IN_ONE_MCP_HOST`
- `ALL_IN_ONE_MCP_PORT`
- `ALL_IN_ONE_MCP_DATABASE`
- `ALL_IN_ONE_MCP_DASHBOARD`
- `ALL_IN_ONE_MCP_DASHBOARD_PORT`
- `ALL_IN_ONE_MCP_URL`
- `ALL_IN_ONE_MCP_HOME`

If no database path is supplied, the runtime stores its SQLite database in the user profile data directory for `all-in-one-mcp`, so it persists across reinstalls and `npx` runs.

Default locations:

- Windows: `%LOCALAPPDATA%\\all-in-one-mcp\\all-in-one-mcp.sqlite`
- macOS: `~/Library/Application Support/all-in-one-mcp/all-in-one-mcp.sqlite`
- Linux: `$XDG_DATA_HOME/all-in-one-mcp/all-in-one-mcp.sqlite` or `~/.local/share/all-in-one-mcp/all-in-one-mcp.sqlite`

## Run locally

From the repo root:

```bash
pnpm install
pnpm --filter all-in-one-mcp build
pnpm --filter all-in-one-mcp build:dashboard-bundle
node packages/runtime/dist/cli.js serve --dashboard
```

That starts:

- runtime: `http://127.0.0.1:4100`
- dashboard: `http://127.0.0.1:4101`
