import { createError, defineEventHandler, getRouterParam } from 'h3'
import { proxyJson } from '../../utils/runtimeProxy.js'

export default defineEventHandler(async (event) => {
  const id = getRouterParam(event, 'id')

  if (!id) {
    throw createError({
      statusCode: 400,
      statusMessage: 'Missing MCP id.'
    })
  }

  if (event.method === 'GET') {
    return proxyJson(event, `/api/mcps/${id}`)
  }

  if (event.method === 'PATCH') {
    return proxyJson(event, `/api/mcps/${id}`)
  }

  if (event.method === 'DELETE') {
    return proxyJson(event, `/api/mcps/${id}`)
  }

  throw createError({
    statusCode: 405,
    statusMessage: 'Method Not Allowed'
  })
})
