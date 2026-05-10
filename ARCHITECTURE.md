# Architecture

## Package graph

- `packages/contracts`: Zod schemas, DTO source of truth, shared utilities
- `packages/shared`: runtime infrastructure, gateway, persistence, logging
- `packages/runtime`: CLI and HTTP runtime wrapper over shared
- `packages/api`: NestJS admin API wrapper over shared
- `packages/dashboard-shared`: shared Vue UI, composables, dashboard client types
- `apps/dashboard`: Nuxt web companion app
- `apps/tauri-vue`: Tauri desktop shell

## Where does X live?

- MCP schemas and domain types: `packages/contracts`
- runtime process supervision and gateway logic: `packages/shared`
- CLI and runtime hosting: `packages/runtime`
- admin HTTP API: `packages/api`
- Vue components and dashboard behavior: `packages/dashboard-shared`
- routing or platform-specific glue: `apps/*`

## DashboardClient

`DashboardRoot` depends on a `DashboardClient` adapter supplied by each app.

- Nuxt uses `$fetch` plus browser `EventSource`
- Tauri uses `requestJson` plus runtime-base `EventSource`

This keeps all dashboard behavior shared while leaving transport and platform integration in the apps.
