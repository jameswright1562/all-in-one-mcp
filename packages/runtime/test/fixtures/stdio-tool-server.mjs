#!/usr/bin/env node
import { createServer as createNetServer } from 'node:net'
import { existsSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs'
import { dirname } from 'node:path'
import z from 'zod/v4'
import { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js'
import { StdioServerTransport } from '@modelcontextprotocol/sdk/server/stdio.js'

const countFile = process.argv[2]
const fixedPort = process.argv[3] ? Number(process.argv[3]) : undefined

if (countFile) {
  mkdirSync(dirname(countFile), { recursive: true })
  const nextValue = existsSync(countFile) ? Number(readFileSync(countFile, 'utf8')) + 1 : 1
  writeFileSync(countFile, String(nextValue))
}

let lockServer
if (fixedPort) {
  lockServer = createNetServer()
  lockServer.listen(fixedPort, '127.0.0.1')
}

const server = new McpServer({
  name: 'fixture-stdio-server',
  version: '1.0.0'
})

server.registerTool(
  'echo',
  {
    description: 'Echo a string for runtime integration tests.',
    inputSchema: {
      text: z.string()
    }
  },
  async ({ text }) => ({
    content: [{ type: 'text', text: `echo:${text}` }]
  })
)

server.server.onclose = () => {
  lockServer?.close()
}

await server.connect(new StdioServerTransport())
