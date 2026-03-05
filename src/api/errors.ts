import type { NextFunction, Request, Response } from 'express'

export function notFound(_req: Request, res: Response): void {
  res.status(404).json({ error: 'Not found' })
}

export function errorHandler(error: any, _req: Request, res: Response, _next: NextFunction): void {
  const status = Number(error?.statusCode || error?.status || 500)
  const message = error?.message || 'Internal server error'

  res.status(status).json({
    error: status >= 500 ? 'Internal server error' : 'Request failed',
    message,
  })
}
