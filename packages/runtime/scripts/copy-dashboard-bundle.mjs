import { cp, mkdir, readFile, readdir, rm, writeFile } from "node:fs/promises";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";

const currentDir = dirname(fileURLToPath(import.meta.url));
const packageRoot = resolve(currentDir, "..");
const sourceDir = resolve(
  packageRoot,
  "..",
  "..",
  "apps",
  "dashboard",
  ".output",
);
const destinationDir = resolve(packageRoot, "dist", "dashboard");
const processImportPrefix = "import process from 'node:process';";

async function walkFiles(dir) {
  const entries = await readdir(dir, { withFileTypes: true });
  const files = [];

  for (const entry of entries) {
    const entryPath = resolve(dir, entry.name);
    if (entry.isDirectory()) {
      files.push(...(await walkFiles(entryPath)));
      continue;
    }

    files.push(entryPath);
  }

  return files;
}

function patchProcessImportCollision(source) {
  if (!source.includes(processImportPrefix)) {
    return source;
  }

  const hasLocalProcessDeclaration =
    /\bfunction process\(/.test(source) ||
    /\b(?:const|let|var|class)\s+process\b/.test(source);

  if (!hasLocalProcessDeclaration) {
    return source;
  }

  return source
    .replace(processImportPrefix, "import nodeProcess from 'node:process';")
    .replaceAll("process.env", "nodeProcess.env");
}

async function patchDashboardBundle(outputDir) {
  const serverDir = resolve(outputDir, "server");
  const files = await walkFiles(serverDir);

  for (const filePath of files) {
    if (!filePath.endsWith(".mjs")) {
      continue;
    }

    const source = await readFile(filePath, "utf8");
    const patched = patchProcessImportCollision(source);

    if (patched !== source) {
      await writeFile(filePath, patched);
    }
  }
}

await rm(destinationDir, { recursive: true, force: true });
await mkdir(dirname(destinationDir), { recursive: true });
await cp(sourceDir, destinationDir, { recursive: true });
await patchDashboardBundle(destinationDir);
