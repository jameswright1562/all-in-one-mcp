import { cp, mkdir, rm } from 'node:fs/promises'
import { dirname, resolve } from 'node:path'
import { fileURLToPath } from 'node:url'

const currentDir = dirname(fileURLToPath(import.meta.url))
const packageRoot = resolve(currentDir, '..')
const sourceDir = resolve(packageRoot, '..', '..', 'apps', 'dashboard', '.output')
const destinationDir = resolve(packageRoot, 'dist', 'dashboard')

await rm(destinationDir, { recursive: true, force: true })
await mkdir(dirname(destinationDir), { recursive: true })
await cp(sourceDir, destinationDir, { recursive: true })
