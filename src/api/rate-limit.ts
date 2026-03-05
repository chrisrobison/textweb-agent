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
      res.status(429).json({
        error: 'Rate limit exceeded',
        message: `Max ${options.maxRequests} requests per ${Math.ceil(options.windowMs / 1000)}s`,
      })
      return
    }

    current.count += 1
    next()
  }
}
