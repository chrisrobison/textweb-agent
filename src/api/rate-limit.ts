import type { Request, Response, NextFunction } from 'express'

export function createRateLimiter(options: { windowMs: number; maxRequests: number }) {
  const store = new Map<string, { count: number; resetAt: number }>()

  return (req: Request, res: Response, next: NextFunction): void => {
    const now = Date.now()
    const key = req.ip || 'unknown'

    const current = store.get(key)
    if (!current || now >= current.resetAt) {
      store.set(key, { count: 1, resetAt: now + options.windowMs })
      next()
      return
    }

    if (current.count >= options.maxRequests) {
      const retryAfterSeconds = Math.max(1, Math.ceil((current.resetAt - now) / 1000))
      res.setHeader('retry-after', String(retryAfterSeconds))
      res.status(429).json({
        error: 'Request failed',
        message: `Max ${options.maxRequests} requests per ${Math.ceil(options.windowMs / 1000)}s`,
        code: 'RATE_LIMIT_EXCEEDED',
        ...(typeof (req as any).requestId === 'string' ? { requestId: (req as any).requestId } : {}),
      })
      return
    }

    current.count += 1
    next()
  }
}
