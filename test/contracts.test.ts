import test, { afterEach } from 'node:test'
import assert from 'node:assert/strict'
import type { AddressInfo } from 'node:net'

import { createApp } from '../src/api/app.js'
import { LruCacheStore } from '../src/cache/lru-store.js'
import { DummyPaymentProvider } from '../src/payments/dummy-provider.js'

const servers: Array<{ close: () => void }> = []

afterEach(() => {
  while (servers.length) {
    const server = servers.pop()
    server?.close()
  }
})

async function startServer() {
  const app = createApp({
    cache: new LruCacheStore(50),
    adapter: {
      async render(url: string) {
        return {
          url,
          title: 'Fake',
          view: 'v',
          elements: {},
          links: [],
          interactiveElements: [],
          visibleTextBlocks: [],
          renderMs: 1,
        }
      },
    } as any,
    summarizer: {
      async summarize() {
        return { title: '', summaryBullets: [], keyFacts: [], nextActions: [], links: [], extracted: {} }
      },
    } as any,
    payments: new DummyPaymentProvider('test-key'),
  })

  const server = app.listen(0)
  servers.push(server)
  await new Promise<void>((resolve) => server.once('listening', () => resolve()))
  const port = (server.address() as AddressInfo).port
  return `http://127.0.0.1:${port}`
}

test('agent descriptor exposes absolute spec_url', async () => {
  const baseUrl = await startServer()
  const res = await fetch(`${baseUrl}/.well-known/agent.json`)
  assert.equal(res.status, 200)
  const json = (await res.json()) as any

  assert.match(json.spec_url, /^https?:\/\//)
  assert.ok(Array.isArray(json.endpoints))
  assert.ok(json.endpoints.includes('/v1/render'))
  assert.equal(json.payment?.mode, 'dummy')
  assert.equal(json.payment?.authHeader, 'x-api-key')
})

test('openapi includes required paths', async () => {
  const baseUrl = await startServer()
  const res = await fetch(`${baseUrl}/openapi.json`)
  assert.equal(res.status, 200)
  const json = (await res.json()) as any

  assert.equal(json.openapi, '3.0.3')
  assert.ok(json.paths['/v1/render'])
  assert.ok(json.paths['/v1/summarize'])
  assert.ok(json.paths['/.well-known/agent.json'])
  assert.ok(json.paths['/openapi.json'])
  assert.ok(json.components?.responses?.PayloadTooLarge)
  assert.ok(json.paths['/v1/render']?.post?.responses?.['413'])
  assert.ok(json.paths['/v1/summarize']?.post?.responses?.['413'])
})

test('health includes provider metadata', async () => {
  const baseUrl = await startServer()
  const res = await fetch(`${baseUrl}/healthz`)
  assert.equal(res.status, 200)
  const json = (await res.json()) as any
  assert.equal(json.status, 'ok')
  assert.equal(json.paymentProvider, 'dummy')
  assert.equal(json.payment?.mode, 'dummy')
})
