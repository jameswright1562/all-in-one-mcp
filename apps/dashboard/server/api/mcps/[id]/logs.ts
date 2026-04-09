import { createError, defineEventHandler, getQuery, getRouterParam } from 'h3'
import { proxyJson } from '../../../utils/runtimeProxy.js'

export default defineEventHandler(async (event) => {
  const id = getRouterParam(event, 'id')

  if (!id) {
    throw createError({
      statusCode: 400,
      statusMessage: 'Missing MCP id.'
    })
  }

  const query = getQuery(event)
  const limit = query.limit ? Number(query.limit) : 200

  if (query.limit && !Number.isFinite(limit)) {
    throw createError({
      statusCode: 400,
      statusMessage: 'Invalid log limit.'
    })
  }

  return proxyJson(event, `/api/mcps/${id}/logs`)
})
