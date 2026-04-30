# all-in-one-mcp

Workspace for the `all-in-one-mcp` runtime, shared contracts package, and dashboard app.

## Quick start

```bash
pnpm install
pnpm release:check
pnpm mcp:serve
```

The runtime CLI is published from `packages/runtime`, so the public install path is:

```bash
npx all-in-one-mcp serve
```

## Packages

- `packages/runtime`: publishable CLI/runtime package that powers `npx all-in-one-mcp`.
- `packages/contracts`: shared schemas and types used by the runtime and dashboard.
- `apps/dashboard`: Nuxt dashboard for administering managed MCPs.

## Getting Started with Dashboard

After starting the runtime with `--dashboard` flag, you can:

1. Open `http://127.0.0.1:4101` in your browser
2. Add MCP servers via the dashboard interface
3. Configure environment variables and tool prefixes
4. Monitor server status and logs

## Useful Commands

```bash
# Start runtime with dashboard
npx all-in-one-mcp serve --dashboard

# Custom ports
npx all-in-one-mcp serve --port 4100 --dashboard --dashboard-port 4101

# Stdio proxy mode for legacy clients
npx all-in-one-mcp stdio-proxy --url http://127.0.0.1:4100/mcp

# Development mode
pnpm dev
```

## Troubleshooting

**Port already in use**: Change the port with `--port` and `--dashboard-port` flags.

**Dashboard not loading**: Ensure you included `--dashboard` flag and the dashboard bundle was built. Run `pnpm --filter @all-in-one-mcp/dashboard build` to rebuild.

**Database errors**: Check permissions on the data directory. Use `--database /path/to/custom.sqlite` to specify a custom location, or set `ALL_IN_ONE_MCP_HOME` to change the data directory.

**Environment validation errors**: Check that `ALL_IN_ONE_MCP_*` environment variables are valid (ports must be integers 0-65535, URLs must be valid).

## Release flow

GitHub Actions now includes:

- `CI`: lint, typecheck, test, and production dashboard build validation.
- `Publish Packages`: publishes the workspace packages to npm using the versions in `packages/*/package.json`.

Before triggering the publish workflow, bump the package versions you want to release and make sure the repository has an `NPM_TOKEN` secret configured.
