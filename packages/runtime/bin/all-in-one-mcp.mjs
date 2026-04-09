#!/usr/bin/env node

import { existsSync } from 'node:fs'
import { dirname, resolve } from 'node:path'
import { fileURLToPath, pathToFileURL } from 'node:url'

const currentDir = dirname(fileURLToPath(import.meta.url))
const distEntry = resolve(currentDir, '../dist/cli.js')

if (!existsSync(distEntry)) {
  process.stderr.write(
    'The runtime CLI has not been built yet. Run "pnpm --filter all-in-one-mcp build" first.\n'
  )
  process.exit(1)
}

await import(pathToFileURL(distEntry).href)
