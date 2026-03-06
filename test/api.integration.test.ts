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

class FakeAdapter {
  calls = 0

  async render(url: string, _options?: { followLinks?: { enabled: boolean; max: number } }) {
    this.calls += 1
    return {
      url,
      title: 'Fake Title',
      view: 'line one\nline two\nline three',
      elements: {},
      links: [{ ref: '1', text: 'docs', href: 'https://example.com/docs' }],
      interactiveElements: [],
      visibleTextBlocks: ['line one', 'line two', 'line three'],
      renderMs: 12,
    }
  }
}

class FakeSummarizer {
  async summarize(_request: any, render: any) {
    return {
      title: render.title,
      summaryBullets: ['b1', 'b2'],
      keyFacts: ['k1'],
      nextActions: ['n1'],
      links: [{ text: 'docs', href: 'https://example.com/docs' }],
      extracted: {},
    }
  }
}

async function startServer() {
  const app = createApp({
    cache: new LruCacheStore(200),
    adapter: new FakeAdapter() as any,
    summarizer: new FakeSummarizer() as any,
    payments: new DummyPaymentProvider('test-key'),
  })

  const server = app.listen(0)
  servers.push(server)
  await new Promise<void>((resolve) => server.once('listening', () => resolve()))
  const port = (server.address() as AddressInfo).port
  return { baseUrl: `http://127.0.0.1:${port}` }
}

async function post(baseUrl: string, path: string, body: unknown, paid = true) {
  return fetch(`${baseUrl}${path}`, {
    method: 'POST',
    headers: {
      'content-type': 'application/json',
      ...(paid ? { 'x-api-key': 'test-key' } : {}),
    },
    body: JSON.stringify(body),
  })
}

test('invalid payload is rejected before payment with 400', async () => {
  const { baseUrl } = await startServer()
  const res = await fetch(`${baseUrl}/v1/render`, {
    method: 'POST',
    headers: {
      'content-type': 'application/json',
      'x-request-id': 'test-rid-1',
    },
    body: JSON.stringify({ url: 'file:///etc/passwd' }),
  })
  assert.equal(res.status, 400)
  const json = (await res.json()) as any
  assert.equal(json.code, 'INVALID_REQUEST')
  assert.equal(json.requestId, 'test-rid-1')
})

test('unpaid request returns 402 with a consistent error model', async () => {
  const { baseUrl } = await startServer()
  const res = await post(baseUrl, '/v1/summarize', { url: 'https://example.com', mode: 'brief' }, false)
  assert.equal(res.status, 402)
  const json = (await res.json()) as any
  assert.equal(json.code, 'PAYMENT_REQUIRED')
  assert.equal(typeof json.message, 'string')
  assert.equal(typeof json.requestId, 'string')
})

test('/v1/render works in dummy mode and returns cached result on second call', async () => {
  const { baseUrl } = await startServer()
  const body = { url: 'https://example.com', cache: true }

  const first = await post(baseUrl, '/v1/render', body, true)
  assert.equal(first.status, 200)
  const firstJson = (await first.json()) as any
  assert.equal(firstJson.meta.source, 'live')

  const second = await post(baseUrl, '/v1/render', body, true)
  assert.equal(second.status, 200)
  const secondJson = (await second.json()) as any
  assert.equal(secondJson.meta.source, 'cache')
})

test('/v1/summarize uses live then cached pricing units', async () => {
  const { baseUrl } = await startServer()
  const body = { url: 'https://example.com', mode: 'brief', cache: true }

  const first = await post(baseUrl, '/v1/summarize', body, true)
  assert.equal(first.status, 200)
  const firstJson = (await first.json()) as any
  assert.equal(firstJson.cost.units, 2)
  assert.equal(firstJson.meta.cached, false)

  const second = await post(baseUrl, '/v1/summarize', body, true)
  assert.equal(second.status, 200)
  const secondJson = (await second.json()) as any
  assert.equal(secondJson.cost.units, 1)
  assert.equal(secondJson.meta.cached, true)
})

test('/v1/summarize rejects oversized schema payload', async () => {
  const { baseUrl } = await startServer()
  const giant = 'x'.repeat(40000)
  const body = {
    url: 'https://example.com',
    mode: 'brief',
    schema: {
      type: 'object',
      properties: {
        giant: {
          type: 'string',
          description: giant,
        },
      },
    },
  }

  const res = await post(baseUrl, '/v1/summarize', body, true)
  assert.equal(res.status, 400)
  const json = (await res.json()) as any
  assert.equal(json.code, 'INVALID_REQUEST')
})
