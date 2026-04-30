import { Readable } from 'node:stream'
import { createError, readBody, setHeader, setResponseStatus, type H3Event } from 'h3'

function getRuntimeServiceUrl(): string {
  const runtimeConfig = useRuntimeConfig()
  return runtimeConfig.runtimeServiceUrl || 'http://127.0.0.1:4100'
}

function buildTarget(pathname: string, search = ''): URL {
  return new URL(`${pathname}${search}`, getRuntimeServiceUrl())
}

async function fetchRuntime(target: URL, init?: RequestInit): Promise<Response> {
  try {
    return await fetch(target, init)
  } catch (error) {
    throw createError({
      statusCode: 502,
      statusMessage: `Could not connect to runtime service at ${target.origin}.`,
      data: {
        cause: error instanceof Error ? error.message : String(error)
      }
    })
  }
}

export async function proxyJson<TResponse>(event: H3Event, pathname: string): Promise<TResponse> {
  const body = ['POST', 'PATCH', 'PUT'].includes(event.method) ? await readBody(event) : undefined
  const response = await fetchRuntime(buildTarget(pathname, event.node.req.url ? new URL(event.node.req.url, 'http://localhost').search : ''), {
    method: event.method,
    headers: {
      'content-type': 'application/json'
    },
    body: body === undefined ? undefined : JSON.stringify(body)
  })

  if (!response.ok) {
    const payload = (await response.json().catch(() => undefined)) as { error?: string } | undefined
    throw createError({
      statusCode: response.status,
      statusMessage: payload?.error || response.statusText
    })
  }

  if (response.status === 204) {
    setResponseStatus(event, 204)
    return null as TResponse
  }

  return (await response.json()) as TResponse
}

export async function proxyEvents(event: H3Event, pathname: string): Promise<void> {
  const response = await fetchRuntime(buildTarget(pathname), {
    headers: {
      accept: 'text/event-stream'
    }
  })

  if (!response.ok || !response.body) {
    throw createError({
      statusCode: response.status || 502,
      statusMessage: 'Could not connect to runtime event stream.'
    })
  }

  setHeader(event, 'content-type', 'text/event-stream')
  setHeader(event, 'cache-control', 'no-cache, no-transform')
  setHeader(event, 'connection', 'keep-alive')

  const nodeStream = Readable.fromWeb(response.body as never)
  await new Promise<void>((resolve, reject) => {
    nodeStream.on('error', reject)
    event.node.req.on('close', resolve)
    nodeStream.pipe(event.node.res)
    nodeStream.on('end', resolve)
  })
}
