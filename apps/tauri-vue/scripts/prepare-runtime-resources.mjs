import { createHash } from "node:crypto";
import { spawnSync } from "node:child_process";
import {
  copyFile,
  cp,
  mkdir,
  readFile,
  rm,
  writeFile,
} from "node:fs/promises";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";

const scriptDir = dirname(fileURLToPath(import.meta.url));
const appDir = resolve(scriptDir, "..");
const workspaceRoot = resolve(appDir, "../..");
const resourcesDir = resolve(appDir, "src-tauri", "resources", "runtime-host");
const binariesDir = resolve(appDir, "src-tauri", "binaries");
const packsDir = resolve(resourcesDir, "_packs");
const cacheRoot = resolve(workspaceRoot, ".cache", "runtime-host");
const npmCommand = process.platform === "win32" ? "npm.cmd" : "npm";
const pnpmCommand = process.platform === "win32" ? "pnpm.cmd" : "pnpm";
const bundledNodeName = process.platform === "win32" ? "node.exe" : "node";
const pinnedNodeVersion = process.env.ALL_IN_ONE_MCP_NODE_VERSION || "22.14.0";

const runtimePackage = JSON.parse(
  await readFile(resolve(workspaceRoot, "packages", "runtime", "package.json")),
);
const sharedPackage = JSON.parse(
  await readFile(resolve(workspaceRoot, "packages", "shared", "package.json")),
);
const contractsPackage = JSON.parse(
  await readFile(resolve(workspaceRoot, "packages", "contracts", "package.json")),
);

function run(command, args, cwd, extraEnv = {}) {
  const result = spawnSync(command, args, {
    cwd,
    stdio: "inherit",
    shell: process.platform === "win32",
    env: {
      ...process.env,
      ...extraEnv,
    },
  });

  if (result.error) {
    throw result.error;
  }

  if (result.status !== 0) {
    throw new Error(`${command} ${args.join(" ")} failed with exit code ${result.status ?? 1}.`);
  }
}

async function packWorkspacePackage(packageDir) {
  run(
    npmCommand,
    ["pack", "--ignore-scripts", "--pack-destination", packsDir],
    packageDir,
  );
}

function bundleCacheKey() {
  return createHash("sha256")
    .update(
      [
        pinnedNodeVersion,
        runtimePackage.version,
        sharedPackage.version,
        contractsPackage.version,
        process.platform,
        process.arch,
      ].join("|"),
    )
    .digest("hex")
    .slice(0, 16);
}

async function stageRuntimeHost(targetDir) {
  await rm(targetDir, { recursive: true, force: true });
  await mkdir(packsDir, { recursive: true });

  await packWorkspacePackage(resolve(workspaceRoot, "packages", "contracts"));
  await packWorkspacePackage(resolve(workspaceRoot, "packages", "shared"));
  await packWorkspacePackage(resolve(workspaceRoot, "packages", "runtime"));

  const stageManifest = {
    name: "all-in-one-mcp-desktop-runtime",
    private: true,
    type: "module",
    dependencies: {
      "all-in-one-mcp": `file:./_packs/all-in-one-mcp-${runtimePackage.version}.tgz`,
    },
    pnpm: {
      overrides: {
        "@all-in-one-mcp/contracts": `file:./_packs/all-in-one-mcp-contracts-${contractsPackage.version}.tgz`,
        "@all-in-one-mcp/shared": `file:./_packs/all-in-one-mcp-shared-${sharedPackage.version}.tgz`,
      },
    },
  };

  await writeFile(
    resolve(targetDir, "package.json"),
    `${JSON.stringify(stageManifest, null, 2)}\n`,
    "utf8",
  );

  run(
    pnpmCommand,
    [
      "install",
      "--prod",
      "--config.node-linker=hoisted",
      "--ignore-workspace",
      "--ignore-scripts",
    ],
    targetDir,
    { CI: "true" },
  );

  await rm(resolve(targetDir, "_packs"), { recursive: true, force: true });
  await rm(resolve(targetDir, "pnpm-lock.yaml"), { force: true });
  await copyFile(process.execPath, resolve(targetDir, bundledNodeName));
  await writeFile(
    resolve(targetDir, ".node-version"),
    `${process.version} (pinned target ${pinnedNodeVersion})\n`,
    "utf8",
  );
}

async function copySidecarBinary(nodePath) {
  const targetTriple =
    process.env.TAURI_ENV_TARGET_TRIPLE ||
    process.env.CARGO_BUILD_TARGET ||
    defaultHostTriple();

  if (!targetTriple) {
    return;
  }

  await mkdir(binariesDir, { recursive: true });
  const sidecarName = `runtime-node-${targetTriple}${process.platform === "win32" ? ".exe" : ""}`;
  await copyFile(nodePath, resolve(binariesDir, sidecarName));
}

function defaultHostTriple() {
  if (process.platform === "win32" && process.arch === "x64") {
    return "x86_64-pc-windows-msvc";
  }

  if (process.platform === "darwin" && process.arch === "arm64") {
    return "aarch64-apple-darwin";
  }

  if (process.platform === "darwin") {
    return "x86_64-apple-darwin";
  }

  if (process.platform === "linux" && process.arch === "x64") {
    return "x86_64-unknown-linux-gnu";
  }

  return undefined;
}

const cacheKey = bundleCacheKey();
const cacheDir = resolve(cacheRoot, cacheKey);

if (process.env.ALL_IN_ONE_MCP_FORCE_RUNTIME_BUNDLE === "1") {
  await rm(cacheDir, { recursive: true, force: true });
}

let builtFromCache = false;

try {
  await cp(cacheDir, resourcesDir, { recursive: true, force: true });
  builtFromCache = true;
  console.log(`Reused cached runtime bundle at ${cacheDir}`);
} catch {
  await stageRuntimeHost(resourcesDir);
  await rm(cacheDir, { recursive: true, force: true });
  await cp(resourcesDir, cacheDir, { recursive: true });
  console.log(`Cached runtime bundle at ${cacheDir}`);
}

await copySidecarBinary(resolve(resourcesDir, bundledNodeName));

if (!builtFromCache) {
  console.log("Prepared fresh runtime-host resources.");
}
