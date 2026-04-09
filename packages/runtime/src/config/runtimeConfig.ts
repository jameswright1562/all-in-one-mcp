import { mkdirSync } from 'node:fs'
import { homedir } from 'node:os'
import { dirname, join, resolve } from 'node:path'

export type ManagedMcpRuntimeOptions = {
  databasePath?: string
}

export function resolveDefaultDataDirectory(): string {
  const override = process.env.ALL_IN_ONE_MCP_HOME?.trim()
  if (override) {
    const resolvedOverride = resolve(override)
    mkdirSync(resolvedOverride, { recursive: true })
    return resolvedOverride
  }

  let baseDirectory: string

  if (process.platform === 'win32' && process.env.LOCALAPPDATA?.trim()) {
    baseDirectory = resolve(process.env.LOCALAPPDATA.trim(), 'all-in-one-mcp')
  } else if (process.platform === 'darwin') {
    baseDirectory = resolve(homedir(), 'Library', 'Application Support', 'all-in-one-mcp')
  } else if (process.env.XDG_DATA_HOME?.trim()) {
    baseDirectory = resolve(process.env.XDG_DATA_HOME.trim(), 'all-in-one-mcp')
  } else {
    baseDirectory = resolve(homedir(), '.local', 'share', 'all-in-one-mcp')
  }

  mkdirSync(baseDirectory, { recursive: true })
  return baseDirectory
}

export function resolveDatabasePath(databasePath?: string): string {
  const resolvedPath =
    databasePath && databasePath.trim().length > 0
      ? resolve(databasePath)
      : join(resolveDefaultDataDirectory(), 'all-in-one-mcp.sqlite')

  mkdirSync(dirname(resolvedPath), { recursive: true })
  return resolvedPath
}
