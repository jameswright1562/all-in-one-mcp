# Contributing

## Prerequisites

- Node.js `>=22.5.0`
- `pnpm@10.32.1`

## Setup

```bash
pnpm install --frozen-lockfile
```

## Required Checks

```bash
pnpm release:check
pnpm test:e2e
```

For release work, also run:

```bash
pnpm clean
```

## Hooks

- pre-commit: `lint-staged`
- pre-push: `pnpm -r --if-present typecheck`
