#!/usr/bin/env node
import { randomUUID } from 'node:crypto'
import { createServer } from 'node:http'
import { mkdirSync, writeFileSync } from 'node:fs'
import { dirname } from 'node:path'
import z from 'zod/v4'
import { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js'
import { StreamableHTTPServerTransport } from '@modelcontextprotocol/sdk/server/streamableHttp.js'
import { isInitializeRequest } from '@modelcontextprotocol/sdk/types.js'

const port = Number(process.argv[2])
const readyFile = process.argv[3]

function createFixtureServer() {
  const server = new McpServer({
    name: 'fixture-http-server',
    version: '1.0.0'
  })

  server.registerTool(
    'echo',
    {
      description: 'Echo a string for remote transport tests.',
      inputSchema: {
        text: z.string()
      }
    },
    async ({ text }) => ({
      content: [{ type: 'text', text: `remote:${text}` }]
    })
  )

  return server
}

const sessions = new Map()
const httpServer = createServer(async (req, res) => {
  if (!req.url || !req.url.startsWith('/mcp')) {
    res.statusCode = 404
    res.end('Not found')
    return
  }

  const body =
    req.method === 'POST'
      ? await new Promise((resolve, reject) => {
          let raw = ''
          req.setEncoding('utf8')
          req.on('data', (chunk) => {
            raw += chunk
          })
          req.on('end', () => {
            resolve(raw.length > 0 ? JSON.parse(raw) : undefined)
          })
          req.on('error', reject)
        })
      : undefined

  const header = req.headers['mcp-session-id']
  const sessionId = Array.isArray(header) ? header[0] : header

  if (!sessionId && req.method === 'POST' && isInitializeRequest(body)) {
    const sessionServer = createFixtureServer()
    const transport = new StreamableHTTPServerTransport({
      sessionIdGenerator: () => randomUUID(),
      onsessioninitialized: (nextSessionId) => {
        sessions.set(nextSessionId, { server: sessionServer, transport })
      }
    })

    transport.onclose = () => {
      if (transport.sessionId) {
        sessions.delete(transport.sessionId)
      }
    }

    await sessionServer.connect(transport)
    await transport.handleRequest(req, res, body)
    return
  }

  if (!sessionId || !sessions.has(sessionId)) {
    res.statusCode = 400
    res.end('Missing session')
    return
  }

  await sessions.get(sessionId).transport.handleRequest(req, res, body)
})

httpServer.listen(port, '127.0.0.1', () => {
  mkdirSync(dirname(readyFile), { recursive: true })
  writeFileSync(readyFile, String(port))
})

async function shutdown() {
  for (const { server, transport } of sessions.values()) {
    await transport.close().catch(() => {})
    await server.close().catch(() => {})
  }

  httpServer.close(() => {
    process.exit(0)
  })
}

process.on('SIGINT', shutdown)
process.on('SIGTERM', shutdown)
