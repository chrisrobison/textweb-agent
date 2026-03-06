import test from 'node:test'
import assert from 'node:assert/strict'

import { renderCacheKey, summarizeCacheKey } from '../src/cache/index.js'

test('renderCacheKey is stable for the same inputs', () => {
  const a = renderCacheKey('https://example.com/', false, 0)
  const b = renderCacheKey('https://example.com/', false, 0)
  const c = renderCacheKey('https://example.com/', true, 1)

  assert.equal(a, b)
  assert.notEqual(a, c)
})

test('summarizeCacheKey is stable across schema key ordering', () => {
  const first = summarizeCacheKey({
    url: 'https://example.com/',
    mode: 'standard',
    schema: {
      type: 'object',
      properties: {
        b: { type: 'string' },
        a: { type: 'number' },
      },
    },
    followLinks: { enabled: false, max: 0 },
    cache: true,
  })

  const second = summarizeCacheKey({
    url: 'https://example.com/',
    mode: 'standard',
    schema: {
      properties: {
        a: { type: 'number' },
        b: { type: 'string' },
      },
      type: 'object',
    },
    followLinks: { max: 0, enabled: false },
    cache: true,
  })

  assert.equal(first, second)
})

