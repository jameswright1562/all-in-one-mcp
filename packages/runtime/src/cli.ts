#!/usr/bin/env node
import { createRequire } from 'node:module'
import { Client } from '@modelcontextprotocol/sdk/client/index.js'
import { StreamableHTTPClientTransport } from '@modelcontextprotocol/sdk/client/streamableHttp.js'
import { Server } from '@modelcontextprotocol/sdk/server/index.js'
import { StdioServerTransport } from '@modelcontextprotocol/sdk/server/stdio.js'
import { CallToolRequestSchema, ListToolsRequestSchema, ToolListChangedNotificationSchema } from '@modelcontextprotocol/sdk/types.js'
import { startManagedMcpHttpServer } from './server/httpServer.js'

const require = createRequire(import.meta.url)
const { version } = require('../package.json') as { version: string }

function hasFlag(...flags: string[]): boolean {
  return flags.some((flag) => process.argv.includes(flag))
}

function readArgument(flag: string): string | undefined {
  const index = process.argv.indexOf(flag)
  if (index < 0) {
    return undefined
  }

  return process.argv[index + 1]
}

function parsePort(value: string): number {
  const port = Number(value)
  if (!Number.isInteger(port) || port < 0 || port > 65_535) {
    throw new Error(`Invalid port "${value}". Expected an integer between 0 and 65535.`)
  }

  return port
}

function printUsage(): void {
  process.stdout.write(
    `all-in-one-mcp v${version}

Usage:
  all-in-one-mcp serve [--host 127.0.0.1] [--port 4100] [--database /path/to/runtime.sqlite]
  all-in-one-mcp stdio-proxy --url http://127.0.0.1:4100/mcp

Environment:
  ALL_IN_ONE_MCP_HOST
  ALL_IN_ONE_MCP_PORT
  ALL_IN_ONE_MCP_DATABASE
  ALL_IN_ONE_MCP_URL
  ALL_IN_ONE_MCP_HOME
`
  )
}

async function runStdioProxy(urlString: string): Promise<void> {
  const client = new Client(
    {
      name: 'all-in-one-mcp-stdio-proxy',
      version: '1.0.0'
    },
    {
      capabilities: {}
    }
  )
  const upstreamTransport = new StreamableHTTPClientTransport(new URL(urlString))
  const stdioServer = new Server(
    {
      name: 'all-in-one-mcp-stdio-proxy',
      version: '1.0.0'
    },
    {
      capabilities: {
        tools: {
          listChanged: true
        }
      }
    }
  )
  const stdioTransport = new StdioServerTransport()

  stdioServer.setRequestHandler(ListToolsRequestSchema, async () => {
    return client.listTools()
  })

  stdioServer.setRequestHandler(CallToolRequestSchema, async (request) => {
    return client.callTool({
      name: request.params.name,
      arguments: request.params.arguments as Record<string, unknown> | undefined
    })
  })

  client.setNotificationHandler(ToolListChangedNotificationSchema, async () => {
    await stdioServer.sendToolListChanged()
  })

  client.onerror = (error) => {
    process.stderr.write(`${error instanceof Error ? error.message : String(error)}\n`)
  }

  await client.connect(upstreamTransport)
  await stdioServer.connect(stdioTransport)
}

async function main(): Promise<void> {
  if (hasFlag('--help', '-h')) {
    printUsage()
    return
  }

  if (hasFlag('--version', '-v')) {
    process.stdout.write(`${version}\n`)
    return
  }

  const command = process.argv[2] && !process.argv[2].startsWith('--') ? process.argv[2] : 'serve'

  if (command === 'serve') {
    const host = readArgument('--host') ?? process.env.ALL_IN_ONE_MCP_HOST ?? '127.0.0.1'
    const port = parsePort(readArgument('--port') ?? process.env.ALL_IN_ONE_MCP_PORT ?? '4100')
    const databasePath = readArgument('--database') ?? process.env.ALL_IN_ONE_MCP_DATABASE

    const server = await startManagedMcpHttpServer({
      host,
      port,
      databasePath
    })

    process.stdout.write(`all-in-one-mcp listening on http://${server.host}:${server.port}\n`)
    process.stdout.write(`MCP endpoint: http://${server.host}:${server.port}/mcp\n`)
    process.stdout.write(`Admin API: http://${server.host}:${server.port}/api/mcps\n`)
    process.stdout.write(`Health: http://${server.host}:${server.port}/healthz\n`)

    const shutdown = async () => {
      await server.close()
      process.exit(0)
    }

    process.once('SIGINT', () => {
      void shutdown()
    })
    process.once('SIGTERM', () => {
      void shutdown()
    })
    return
  }

  if (command === 'stdio-proxy') {
    const url = readArgument('--url') ?? process.env.ALL_IN_ONE_MCP_URL
    if (!url) {
      process.stderr.write('Missing required --url argument.\n')
      process.exitCode = 1
      return
    }

    new URL(url)
    await runStdioProxy(url)
    return
  }

  printUsage()
  process.exitCode = 1
}

void main().catch((error) => {
  process.stderr.write(`${error instanceof Error ? error.message : String(error)}\n`)
  process.exitCode = 1
})
