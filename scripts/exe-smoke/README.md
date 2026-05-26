# Packaged app smoke test

This harness tests the Tauri package with a fresh app profile and no repo-local app state.

- Windows: use Windows Sandbox for the strongest isolation.
- macOS/Linux: use the cross-platform runner, which launches the packaged app with isolated `HOME`, XDG, and runtime data paths.

## Run

Build first, then run the platform smoke test:

```powershell
pnpm tauri:build
pnpm test:package
```

Build and test in one command:

```powershell
pnpm test:package:build
```

On Windows, run the packaged installer inside Windows Sandbox:

```powershell
pnpm test:package:sandbox:build
```

The host-side output folders are:

```text
.codex-temp\package-smoke
.codex-temp\exe-sandbox
```

After a run, check:

- `.codex-temp\package-smoke\<platform>\result.json`
- `.codex-temp\package-smoke\<platform>\logs\app.stderr.log`
- `.codex-temp\package-smoke\<platform>\logs\app.stdout.log`
- `.codex-temp\exe-sandbox\result.json`
- `.codex-temp\exe-sandbox\logs\sandbox-transcript.log`
- `.codex-temp\exe-sandbox\logs\runtime-*\runtime.stderr.log`
- `.codex-temp\exe-sandbox\logs\runtime-*\runtime.stdout.log`

## What It Proves

The test launches the release package, polls `http://127.0.0.1:4100/healthz`, adds a stdio fixture MCP through `POST /api/mcps`, and verifies it appears in `GET /api/mcps`. That covers the release-only path where Tauri starts the bundled runtime under `runtime-host` and proves the packaged runtime can create managed MCPs.

## Windows Sandbox Requirement

Windows Sandbox must be enabled in Windows Features. If `WindowsSandbox.exe` is not on `PATH`, enable it and reboot.
