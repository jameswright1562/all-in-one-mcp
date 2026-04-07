#!/usr/bin/env node
import { Client } from '@modelcontextprotocol/sdk/client/index.js'
import { StreamableHTTPClientTransport } from '@modelcontextprotocol/sdk/client/streamableHttp.js'
import { Server } from '@modelcontextprotocol/sdk/server/index.js'
import { StdioServerTransport } from '@modelcontextprotocol/sdk/server/stdio.js'
import { CallToolRequestSchema, ListToolsRequestSchema, ToolListChangedNotificationSchema } from '@modelcontextprotocol/sdk/types.js'

function readArgument(flag: string): string | undefined {
  const index = process.argv.indexOf(flag)
  if (index < 0) {
    return undefined
  }

  return process.argv[index + 1]
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
  const command = process.argv[2]

  if (command !== 'stdio-proxy') {
    process.stderr.write('Usage: all-in-one-mcp stdio-proxy --url http://127.0.0.1:3000/mcp\n')
    process.exitCode = 1
    return
  }

  const url = readArgument('--url')
  if (!url) {
    process.stderr.write('Missing required --url argument.\n')
    process.exitCode = 1
    return
  }

  await runStdioProxy(url)
}

void main()
