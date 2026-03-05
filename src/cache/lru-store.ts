import { LRUCache } from 'lru-cache'
import type { CacheStore } from './cache-store.js'

export class LruCacheStore implements CacheStore {
  private readonly cache: LRUCache<string, any>

  constructor(maxSize: number) {
    this.cache = new LRUCache<string, any>({ max: maxSize })
  }

  async get<T>(key: string): Promise<T | null> {
    const value = this.cache.get(key)
    return (value as T) ?? null
  }

  async set<T>(key: string, value: T, ttlSeconds: number): Promise<void> {
    this.cache.set(key, value, { ttl: ttlSeconds * 1000 })
  }
}
