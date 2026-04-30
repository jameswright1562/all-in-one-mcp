# all-in-one-mcp

`all-in-one-mcp` is a managed MCP runtime that exposes:

- an HTTP MCP gateway at `/mcp`
- an admin API at `/api/mcps`
- a health endpoint at `/healthz`
- an optional dashboard process
- a stdio proxy mode for legacy MCP clients

## Installation

```bash
npx all-in-one-mcp serve
npx all-in-one-mcp serve --dashboard
```

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

- `ALL_IN_ONE_MCP_HOST` - Runtime host (default: 127.0.0.1)
- `ALL_IN_ONE_MCP_PORT` - Runtime port (default: 4100)
- `ALL_IN_ONE_MCP_DATABASE` - SQLite database path
- `ALL_IN_ONE_MCP_DASHBOARD` - Enable dashboard (1, true, yes)
- `ALL_IN_ONE_MCP_DASHBOARD_PORT` - Dashboard port (default: runtime port + 1)
- `ALL_IN_ONE_MCP_URL` - Upstream URL for stdio-proxy mode
- `ALL_IN_ONE_MCP_HOME` - Custom data directory

## Dashboard Usage

When started with `--dashboard`, the dashboard is available at `http://127.0.0.1:4101` (or custom port).

From the dashboard, you can:
- Add new MCP servers (stdio or streamable HTTP)
- Configure environment variables for each server
- Monitor server status and logs
- Start/stop individual MCP servers
- View available tools from each server

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

## Troubleshooting

**Port conflicts**: Use `--port` and `--dashboard-port` to specify alternative ports.

**Dashboard bundle missing**: Run `pnpm --filter @all-in-one-mcp/dashboard build` then `pnpm --filter all-in-one-mcp build:dashboard-bundle`.

**Database permission errors**: Ensure the data directory is writable. Use `--database ./runtime.sqlite` for a local database.

**Invalid environment variables**: The runtime validates all `ALL_IN_ONE_MCP_*` variables on startup. Check that ports are valid integers and URLs are properly formatted.

If no database path is supplied, the runtime stores its SQLite database in the user profile data directory for `all-in-one-mcp`, so it persists across reinstalls and `npx` runs.

Default locations:

- Windows: `%LOCALAPPDATA%\all-in-one-mcp\all-in-one-mcp.sqlite`
- macOS: `~/Library/Application Support/all-in-one-mcp/all-in-one-mcp.sqlite`
- Linux: `$XDG_DATA_HOME/all-in-one-mcp/all-in-one-mcp.sqlite` or `~/.local/share/all-in-one-mcp/all-in-one-mcp.sqlite`
