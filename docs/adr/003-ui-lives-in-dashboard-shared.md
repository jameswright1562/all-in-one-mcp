# ADR 003: Dashboard UI Lives in dashboard-shared

## Status

Accepted

## Decision

Vue components, composables, dashboard types, and styles live in `packages/dashboard-shared`.

## Consequences

- apps only own routing and platform glue
- Tauri and Nuxt consume the same UI layer
