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

## Release flow

GitHub Actions now includes:

- `CI`: lint, typecheck, test, and production dashboard build validation.
- `Publish Packages`: publishes the workspace packages to npm using the versions in `packages/*/package.json`.

Before triggering the publish workflow, bump the package versions you want to release and make sure the repository has an `NPM_TOKEN` secret configured.
