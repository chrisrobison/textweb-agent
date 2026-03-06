import test from 'node:test'
import assert from 'node:assert/strict'

import { env } from '../src/config/env.js'
import { assertSafeResolvedAddress, normalizeAndValidateUrl } from '../src/textweb/url-safety.js'

test('normalizeAndValidateUrl allows valid https URL and strips hash', () => {
  const result = normalizeAndValidateUrl('https://example.com/path#frag')
  assert.equal(result, 'https://example.com/path')
})

test('normalizeAndValidateUrl blocks localhost and private IPs', () => {
  assert.throws(() => normalizeAndValidateUrl('http://localhost:8080'), /not allowed/i)
  assert.throws(() => normalizeAndValidateUrl('http://127.0.0.1:3000'), /blocked/i)
  assert.throws(() => normalizeAndValidateUrl('http://100.64.1.2:3000'), /blocked/i)
  assert.throws(() => normalizeAndValidateUrl('http://[::1]:3000'), /blocked/i)
})

test('normalizeAndValidateUrl enforces allowlist when configured', () => {
  const previous = env.URL_ALLOWLIST
  ;(env as any).URL_ALLOWLIST = '*.example.com,example.org'

  try {
    assert.equal(normalizeAndValidateUrl('https://foo.example.com/page'), 'https://foo.example.com/page')
    assert.equal(normalizeAndValidateUrl('https://example.org/'), 'https://example.org/')
    assert.throws(() => normalizeAndValidateUrl('https://example.net/'), /allowlist/i)
  } finally {
    ;(env as any).URL_ALLOWLIST = previous
  }
})

test('assertSafeResolvedAddress blocks private direct IP', async () => {
  await assert.rejects(assertSafeResolvedAddress('http://127.0.0.1/'), /private network/i)
})

test('assertSafeResolvedAddress allows public direct IP', async () => {
  await assert.doesNotReject(assertSafeResolvedAddress('https://8.8.8.8/'))
})
