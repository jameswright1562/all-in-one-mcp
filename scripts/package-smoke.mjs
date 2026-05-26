import { spawn, spawnSync } from "node:child_process";
import { copyFile, mkdir, readdir, rm, stat, writeFile } from "node:fs/promises";
import { existsSync } from "node:fs";
import { dirname, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";

const scriptDir = dirname(fileURLToPath(import.meta.url));
const repoRoot = resolve(scriptDir, "..");
const args = new Set(process.argv.slice(2));
const shouldBuild = args.has("--build");
const useWindowsSandbox = args.has("--sandbox");
const platform = process.platform;
const stageRoot = resolve(repoRoot, ".codex-temp", "package-smoke", platform);
const logsDir = join(stageRoot, "logs");
const resultPath = join(stageRoot, "result.json");
const fixtureSourcePath = resolve(repoRoot, "packages", "runtime", "test", "fixtures", "stdio-tool-server.mjs");
const fixtureStagePath = join(stageRoot, "fixtures", "stdio-tool-server.mjs");
let resultWritten = false;

function run(command, commandArgs, options = {}) {
  const result = spawnSync(command, commandArgs, {
    cwd: repoRoot,
    stdio: "inherit",
    shell: platform === "win32",
    ...options,
  });

  if (result.error) {
    throw result.error;
  }

  if (result.status !== 0) {
    throw new Error(`${command} ${commandArgs.join(" ")} exited with ${result.status ?? 1}.`);
  }
}

function runDirect(command, commandArgs, options = {}) {
  const result = spawnSync(command, commandArgs, {
    cwd: repoRoot,
    stdio: "inherit",
    shell: false,
    ...options,
  });

  if (result.error) {
    throw result.error;
  }

  if (result.status !== 0) {
    throw new Error(`${command} ${commandArgs.join(" ")} exited with ${result.status ?? 1}.`);
  }
}

async function walk(dir, predicate) {
  if (!existsSync(dir)) {
    return [];
  }

  const entries = await readdir(dir, { withFileTypes: true });
  const matches = [];

  for (const entry of entries) {
    const fullPath = join(dir, entry.name);
    if (entry.isDirectory()) {
      if (predicate(fullPath, entry)) {
        matches.push(fullPath);
      }
      matches.push(...await walk(fullPath, predicate));
    } else if (predicate(fullPath, entry)) {
      matches.push(fullPath);
    }
  }

  return matches;
}

async function newest(paths) {
  let latest = null;
  let latestTime = 0;

  for (const item of paths) {
    const info = await stat(item);
    if (info.mtimeMs > latestTime) {
      latest = item;
      latestTime = info.mtimeMs;
    }
  }

  return latest;
}

async function findPackagedApp() {
  const targetRoot = resolve(repoRoot, "apps", "tauri-vue", "src-tauri", "target", "release");
  const bundleRoot = join(targetRoot, "bundle");

  if (platform === "darwin") {
    const apps = await walk(bundleRoot, (path, entry) => entry.isDirectory() && path.endsWith(".app"));
    const app = await newest(apps);
    if (app) {
      const executableName = "all-in-one-mcp-tauri";
      return {
        kind: "macos-app",
        artifact: app,
        command: join(app, "Contents", "MacOS", executableName),
        args: [],
      };
    }
  }

  if (platform === "linux") {
    const appImages = await walk(bundleRoot, (path, entry) => entry.isFile() && path.endsWith(".AppImage"));
    const appImage = await newest(appImages);
    if (appImage) {
      return {
        kind: "linux-appimage",
        artifact: appImage,
        command: appImage,
        args: [],
      };
    }

    const releaseBinary = join(targetRoot, "all-in-one-mcp-tauri");
    if (existsSync(releaseBinary)) {
      return {
        kind: "linux-release-binary",
        artifact: releaseBinary,
        command: releaseBinary,
        args: [],
      };
    }
  }

  if (platform === "win32") {
    const installers = await walk(bundleRoot, (path, entry) => entry.isFile() && path.endsWith("setup.exe"));
    const installer = await newest(installers);
    if (installer) {
      return await installWindowsPackage(installer);
    }
  }

  throw new Error(`No packaged app artifact found for ${platform}. Run with --build first.`);
}

async function installWindowsPackage(installer) {
  const installDir = join(stageRoot, "installed-app");
  await rm(installDir, { recursive: true, force: true });
  await mkdir(installDir, { recursive: true });

  runDirect(installer, ["/S", `/D=${installDir}`], { cwd: dirname(installer) });

  const installedExes = await walk(
    installDir,
    (path, entry) => entry.isFile() && path.endsWith(".exe") && !/uninstall|node/i.test(path),
  );
  const appExe = await newest(installedExes);

  if (!appExe) {
    throw new Error(`Installed app exe was not found under ${installDir}.`);
  }

  return {
    kind: "windows-installed-nsis",
    artifact: installer,
    command: appExe,
    args: [],
  };
}

async function writeResult(status, message, extra = {}) {
  await writeFile(
    resultPath,
    `${JSON.stringify({
      status,
      message,
      timestamp: new Date().toISOString(),
      platform,
      ...extra,
    }, null, 2)}\n`,
    "utf8",
  );
  resultWritten = true;
}

async function waitForHealth(timeoutMs = 30000) {
  const deadline = Date.now() + timeoutMs;
  let lastError = "";

  while (Date.now() < deadline) {
    try {
      const response = await fetch("http://127.0.0.1:4100/healthz", { signal: AbortSignal.timeout(1000) });
      if (response.ok) {
        return await response.json().catch(() => ({ ok: true }));
      }
      lastError = `HTTP ${response.status}`;
    } catch (error) {
      lastError = error.message;
    }

    await new Promise((resolvePromise) => setTimeout(resolvePromise, 500));
  }

  throw new Error(`Runtime health check did not pass: ${lastError}`);
}

async function addFixtureMcp() {
  await mkdir(dirname(fixtureStagePath), { recursive: true });
  await copyFile(fixtureSourcePath, fixtureStagePath);

  const id = `package-smoke-${Date.now()}`;
  const createResponse = await fetch("http://127.0.0.1:4100/api/mcps", {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({
      id,
      name: "Package Smoke Fixture",
      enabled: true,
      autoStart: true,
      toolPrefix: id,
      startupTimeoutMs: 5000,
      transport: "stdio",
      command: process.execPath,
      args: [fixtureStagePath],
      env: [],
    }),
  });

  if (!createResponse.ok) {
    throw new Error(`Adding fixture MCP failed with HTTP ${createResponse.status}: ${await createResponse.text()}`);
  }

  const created = await createResponse.json();
  const listResponse = await fetch("http://127.0.0.1:4100/api/mcps");
  if (!listResponse.ok) {
    throw new Error(`Listing MCPs failed with HTTP ${listResponse.status}: ${await listResponse.text()}`);
  }

  const mcps = await listResponse.json();
  if (!Array.isArray(mcps) || !mcps.some((mcp) => mcp?.id === id)) {
    throw new Error(`Fixture MCP ${id} was not present in /api/mcps response.`);
  }

  return { id, created };
}

function isolatedEnv() {
  const home = join(stageRoot, "home");
  const env = {
    ...process.env,
    HOME: home,
    ALL_IN_ONE_MCP_HOME: join(stageRoot, "runtime-home"),
  };

  if (platform === "win32") {
    env.LOCALAPPDATA = join(stageRoot, "local-app-data");
    env.APPDATA = join(stageRoot, "app-data");
    env.USERPROFILE = home;
  } else {
    env.XDG_DATA_HOME = join(stageRoot, "xdg-data");
    env.XDG_CONFIG_HOME = join(stageRoot, "xdg-config");
    env.XDG_CACHE_HOME = join(stageRoot, "xdg-cache");
  }

  return env;
}

async function runLocalSmoke() {
  await rm(stageRoot, { recursive: true, force: true });
  await mkdir(logsDir, { recursive: true });
  await mkdir(join(stageRoot, "home"), { recursive: true });

  const app = await findPackagedApp();
  if (!existsSync(app.command)) {
    throw new Error(`Packaged app executable was not found: ${app.command}`);
  }

  const stdoutPath = join(logsDir, "app.stdout.log");
  const stderrPath = join(logsDir, "app.stderr.log");
  const child = spawn(app.command, app.args, {
    cwd: dirname(app.command),
    env: isolatedEnv(),
    stdio: ["ignore", "pipe", "pipe"],
  });

  const stdoutChunks = [];
  const stderrChunks = [];
  child.stdout.on("data", (chunk) => stdoutChunks.push(chunk));
  child.stderr.on("data", (chunk) => stderrChunks.push(chunk));

  try {
    const health = await waitForHealth();
    const mcp = await addFixtureMcp();
    await writeResult("passed", "Packaged app launched, runtime health responded, and fixture MCP was added.", {
      artifact: app.artifact,
      kind: app.kind,
      command: app.command,
      processId: child.pid,
      health,
      mcp,
    });
  } catch (error) {
    await writeResult("failed", error.message, {
      artifact: app.artifact,
      kind: app.kind,
      command: app.command,
      processId: child.pid,
    });
    throw error;
  } finally {
    child.kill("SIGTERM");
    setTimeout(() => child.kill("SIGKILL"), 2000).unref();
    await writeFile(stdoutPath, Buffer.concat(stdoutChunks), "utf8");
    await writeFile(stderrPath, Buffer.concat(stderrChunks), "utf8");
  }
}

function runWindowsSandbox() {
  run("powershell", [
    "-ExecutionPolicy",
    "Bypass",
    "-File",
    "./scripts/exe-smoke/start-windows-sandbox.ps1",
    ...(shouldBuild ? ["-Build"] : []),
  ]);
}

try {
  if (shouldBuild && !(platform === "win32" && useWindowsSandbox)) {
    run("pnpm", ["tauri:build"]);
  }

  if (platform === "win32" && useWindowsSandbox) {
    runWindowsSandbox();
  } else {
    await runLocalSmoke();
  }

  console.log(`Package smoke output: ${stageRoot}`);
} catch (error) {
  await mkdir(logsDir, { recursive: true });
  if (!resultWritten) {
    await writeResult("failed", error.message);
  }
  console.error(error.message);
  process.exit(1);
}
