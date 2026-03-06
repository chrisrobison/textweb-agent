import type { NextFunction, Request, Response } from 'express'

export class ApiError extends Error {
  readonly statusCode: number
  readonly code: string
  readonly details?: unknown

  constructor(statusCode: number, code: string, message: string, details?: unknown) {
    super(message)
    this.statusCode = statusCode
    this.code = code
    this.details = details
  }
}

function requestIdOf(req: Request): string | undefined {
  return typeof (req as any).requestId === 'string' ? (req as any).requestId : undefined
}

export function sendError(
  req: Request,
  res: Response,
  status: number,
  code: string,
  message: string,
  details?: unknown,
): void {
  const requestId = requestIdOf(req)
  const safeDetails = details === undefined ? undefined : details

  res.status(status).json({
    error: status >= 500 ? 'Internal server error' : 'Request failed',
    message,
    code,
    ...(requestId ? { requestId } : {}),
    ...(safeDetails !== undefined ? { details: safeDetails } : {}),
  })
}

export function notFound(_req: Request, res: Response): void {
  res.status(404).json({
    error: 'Request failed',
    message: 'Route not found',
    code: 'NOT_FOUND',
    ...(typeof (_req as any).requestId === 'string' ? { requestId: (_req as any).requestId } : {}),
  })
}

export function errorHandler(error: any, req: Request, res: Response, _next: NextFunction): void {
  if (error?.type === 'entity.too.large') {
    sendError(req, res, 413, 'PAYLOAD_TOO_LARGE', 'Request body too large')
    return
  }

  if (error instanceof ApiError) {
    sendError(req, res, error.statusCode, error.code, error.message, error.details)
    return
  }

  const status = Number(error?.statusCode || error?.status || 500)
  const message = error?.message || 'Internal server error'
  const code = status >= 500 ? 'INTERNAL_ERROR' : 'REQUEST_FAILED'

  if (status >= 500) {
    console.error(
      JSON.stringify({
        event: 'request_error',
        status,
        code,
        message,
        requestId: (req as any).requestId,
        path: req.path,
        method: req.method,
      }),
    )
  }

  sendError(req, res, status, code, message)
}
