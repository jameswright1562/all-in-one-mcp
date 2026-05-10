import { readFile, readdir, writeFile } from "node:fs/promises";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";

const currentDir = dirname(fileURLToPath(import.meta.url));
const appRoot = resolve(currentDir, "..");
const serverDir = resolve(appRoot, ".output", "server");
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

for (const filePath of await walkFiles(serverDir)) {
  if (!filePath.endsWith(".mjs")) {
    continue;
  }

  const source = await readFile(filePath, "utf8");
  const patched = patchProcessImportCollision(source);

  if (patched !== source) {
    await writeFile(filePath, patched);
  }
}
