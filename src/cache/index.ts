import crypto from 'node:crypto'
import { Redis } from 'ioredis'

import { env } from '../config/env.js'
import type { SummarizeRequest } from '../types/api.js'
import type { CacheStore } from './cache-store.js'
import { LruCacheStore } from './lru-store.js'
import { RedisCacheStore } from './redis-store.js'

export async function createCacheStore(): Promise<CacheStore> {
  if (!env.REDIS_URL) {
    return new LruCacheStore(env.IN_MEMORY_CACHE_SIZE)
  }

  try {
    const redis = new Redis(env.REDIS_URL)
    await redis.ping()
    return new RedisCacheStore(redis)
  } catch {
    return new LruCacheStore(env.IN_MEMORY_CACHE_SIZE)
  }
}

function stableStringify(value: unknown): string {
  if (value === null || typeof value !== 'object') return JSON.stringify(value)
  if (Array.isArray(value)) return `[${value.map(stableStringify).join(',')}]`
  const entries = Object.entries(value as Record<string, unknown>).sort(([a], [b]) => a.localeCompare(b))
  return `{${entries.map(([k, v]) => `${JSON.stringify(k)}:${stableStringify(v)}`).join(',')}}`
}

export function renderCacheKey(url: string, followLinksEnabled: boolean, followLinksMax: number): string {
  const payload = `${url}|${followLinksEnabled}|${followLinksMax}`
  return `render:${crypto.createHash('sha256').update(payload).digest('hex')}`
}

export function summarizeCacheKey(request: SummarizeRequest): string {
  const payload = stableStringify({
    url: request.url,
    goal: request.goal ?? '',
    mode: request.mode ?? 'standard',
    followLinks: request.followLinks ?? { enabled: false, max: 0 },
    schema: request.schema ?? null,
  })

  return `summary:${crypto.createHash('sha256').update(payload).digest('hex')}`
}
