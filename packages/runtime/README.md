# all-in-one-mcp

`all-in-one-mcp` is a managed MCP runtime that exposes:

- an HTTP MCP gateway at `/mcp`
- an admin API at `/api/mcps`
- a health endpoint at `/healthz`
- a stdio proxy mode for legacy MCP clients

## Run with npx

```bash
npx all-in-one-mcp serve
```

Useful flags:

```bash
npx all-in-one-mcp serve --host 127.0.0.1 --port 4100 --database ./runtime.sqlite
npx all-in-one-mcp stdio-proxy --url http://127.0.0.1:4100/mcp
```

Environment variables:

- `ALL_IN_ONE_MCP_HOST`
- `ALL_IN_ONE_MCP_PORT`
- `ALL_IN_ONE_MCP_DATABASE`
- `ALL_IN_ONE_MCP_URL`
- `ALL_IN_ONE_MCP_HOME`

If no database path is supplied, the runtime stores its SQLite database in the platform data directory for `all-in-one-mcp`.
