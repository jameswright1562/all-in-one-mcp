import { expect, test } from '@playwright/test'
import {
  uniqueId,
  parseJson,
  createManagedMcp,
  buildStdioDefinition,
  buildStreamableDefinition,
  startRemoteFixture,
  stopChild
} from './helpers'

const dashboardBaseUrl = 'http://127.0.0.1:4511'
const runtimeBaseUrl = 'http://127.0.0.1:4100'

test.describe('dashboard api', () => {
  test('exercises the backend API through the dashboard proxy', async ({ request }) => {
    const missingId = uniqueId('missing')
    const stdioId = uniqueId('api-stdio')
    const duplicateId = uniqueId('api-duplicate')
    const remoteId = uniqueId('api-remote')
    const remotePort = 48_000 + Math.floor(Math.random() * 500)
    const remoteFixture = await startRemoteFixture(remoteId, remotePort)

    try {
      const healthResponse = await request.get(`${runtimeBaseUrl}/healthz`)
      expect(healthResponse.ok()).toBeTruthy()
      expect(await parseJson<{ status: string }>(healthResponse)).toEqual({ status: 'ok' })

      const missingResponse = await request.get(`${dashboardBaseUrl}/api/mcps/${missingId}`)
      expect(missingResponse.status()).toBe(404)

      const createStdioResponse = await request.post(`${dashboardBaseUrl}/api/mcps`, {
        data: buildStdioDefinition({
          id: stdioId,
          name: 'API Stdio',
          enabled: true,
          autoStart: false
        })
      })
      expect(createStdioResponse.ok()).toBeTruthy()
      expect((await parseJson<{ status: string }>(createStdioResponse)).status).toBe('stopped')

      const duplicateResponse = await request.post(`${dashboardBaseUrl}/api/mcps`, {
        data: buildStdioDefinition({
          id: duplicateId,
          name: 'Duplicate Prefix',
          enabled: true,
          autoStart: false,
          toolPrefix: stdioId
        })
      })
      expect(duplicateResponse.status()).toBe(409)
      expect(
        await parseJson<{ statusMessage?: string; message?: string }>(duplicateResponse)
      ).toMatchObject({
        statusMessage: `Tool prefix "${stdioId}" is already in use.`,
        message: `Tool prefix "${stdioId}" is already in use.`
      })

      const listResponse = await request.get(`${dashboardBaseUrl}/api/mcps`)
      expect(listResponse.ok()).toBeTruthy()
      const listPayload = await parseJson<{ items: Array<{ definition: { id: string } }; generatedAt: string }>(listResponse)
      expect(listPayload.items.some((item) => item.definition.id === stdioId)).toBe(true)

      const startResponse = await request.post(`${dashboardBaseUrl}/api/mcps/${stdioId}/start`)
      expect(startResponse.ok()).toBeTruthy()
      expect((await parseJson<{ status: string }>(startResponse)).status).toBe('ready')

      const logsResponse = await request.get(`${dashboardBaseUrl}/api/mcps/${stdioId}/logs?limit=2`)
      expect(logsResponse.ok()).toBeTruthy()
      const logsPayload = await parseJson<{ items: Array<{ message: string } }>(logsResponse)
      expect(logsPayload.items.length).toBeLessThanOrEqual(2)
      expect(logsPayload.items.some((entry) => entry.message.includes('Managed MCP is ready.'))).toBe(true)

      const restartResponse = await request.post(`${dashboardBaseUrl}/api/mcps/${stdioId}/restart`)
      expect(restartResponse.ok()).toBeTruthy()
      expect((await parseJson<{ status: string }>(restartResponse)).status).toBe('ready')

      const patchResponse = await request.patch(`${dashboardBaseUrl}/api/mcps/${stdioId}`, {
        data: buildStdioDefinition({
          id: stdioId,
          name: 'API Stdio Updated',
          enabled: true,
          autoStart: false,
          startupTimeoutMs: 11_000
        })
      })
      expect(patchResponse.ok()).toBeTruthy()
      expect(await parseJson<{ definition: { name: string; startupTimeoutMs: number } }>(patchResponse)).toMatchObject({
        definition: {
          name: 'API Stdio Updated',
          startupTimeoutMs: 11_000
        }
      })

      const stopResponse = await request.post(`${dashboardBaseUrl}/api/mcps/${stdioId}/stop`)
      expect(stopResponse.ok()).toBeTruthy()
      expect((await parseJson<{ status: string }>(stopResponse)).status).toBe('stopped')

      const createRemoteResponse = await request.post(`${dashboardBaseUrl}/api/mcps`, {
        data: buildStreamableDefinition({
          id: remoteId,
          name: 'API Remote',
          url: remoteFixture.url
        })
      })
      expect(createRemoteResponse.ok()).toBeTruthy()
      expect((await parseJson<{ status: string }>(createRemoteResponse)).status).toBe('ready')

      const remoteGetResponse = await request.get(`${dashboardBaseUrl}/api/mcps/${remoteId}`)
      expect(remoteGetResponse.ok()).toBeTruthy()
      expect(await parseJson<{ definition: { transport: string; id: string } }>(remoteGetResponse)).toMatchObject({
        definition: {
          id: remoteId,
          transport: 'streamable-http'
        }
      })

      const deleteStdioResponse = await request.delete(`${dashboardBaseUrl}/api/mcps/${stdioId}`)
      expect(deleteStdioResponse.status()).toBe(204)

      const deleteRemoteResponse = await request.delete(`${dashboardBaseUrl}/api/mcps/${remoteId}`)
      expect(deleteRemoteResponse.status()).toBe(204)

      const afterDeleteResponse = await request.get(`${dashboardBaseUrl}/api/mcps/${stdioId}`)
      expect(afterDeleteResponse.status()).toBe(404)
    } finally {
      await stopChild(remoteFixture.child)
    }
  })
})
