import { mkdirSync } from 'node:fs'
import { dirname, resolve } from 'node:path'

export type ManagedMcpRuntimeOptions = {
  databasePath?: string
}

export function resolveDatabasePath(databasePath?: string): string {
  const resolvedPath =
    databasePath && databasePath.trim().length > 0
      ? resolve(databasePath)
      : resolve(process.cwd(), 'data', 'all-in-one-mcp.sqlite')

  mkdirSync(dirname(resolvedPath), { recursive: true })
  return resolvedPath
}
