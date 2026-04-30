import { mkdirSync } from 'node:fs'
import { homedir } from 'node:os'
import { dirname, join, resolve } from 'node:path'
import { z } from 'zod'

export type ManagedMcpRuntimeOptions = {
  databasePath?: string
}

const envSchema = z.object({
  ALL_IN_ONE_MCP_HOST: z.string().trim().min(1).optional(),
  ALL_IN_ONE_MCP_PORT: z.coerce.number().int().min(0).max(65535).optional(),
  ALL_IN_ONE_MCP_DATABASE: z.string().trim().optional(),
  ALL_IN_ONE_MCP_DASHBOARD: z.string().trim().optional(),
  ALL_IN_ONE_MCP_DASHBOARD_PORT: z.coerce.number().int().min(0).max(65535).optional(),
  ALL_IN_ONE_MCP_URL: z.string().url().optional(),
  ALL_IN_ONE_MCP_HOME: z.string().trim().optional(),
})

export function validateEnv() {
  const result = envSchema.safeParse(process.env)
  if (!result.success) {
    const errors = result.error.flatten().fieldErrors
    throw new Error(`Invalid environment variables: ${JSON.stringify(errors)}`)
  }
  return result.data
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
