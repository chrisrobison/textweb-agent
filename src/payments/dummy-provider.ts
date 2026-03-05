import type { Request, RequestHandler, Response, NextFunction } from 'express'

import type { PaymentProvider, PaymentReservation } from './payment-provider.js'

export class DummyPaymentProvider implements PaymentProvider {
  readonly mode = 'dummy' as const

  constructor(private readonly expectedApiKey: string) {}

  middleware(routeCredits: Record<string, (req: Request) => number>): RequestHandler {
    return async (req: Request, res: Response, next: NextFunction) => {
      const key = `${req.method.toUpperCase()} ${req.path}`
      const getCredits = routeCredits[key]
      if (!getCredits) {
        next()
        return
      }

      try {
        await this.validateRequest(req)
        const reservation = await this.reserve(req, getCredits(req))
        res.locals.paymentReservation = reservation
        next()
      } catch (error: any) {
        res.status(402).json({
          error: 'Payment Required',
          message: error.message,
          provider: 'dummy',
        })
      }
    }
  }

  async validateRequest(req: Request): Promise<void> {
    const apiKey = req.header('x-api-key')
    if (!apiKey || apiKey !== this.expectedApiKey) {
      throw new Error('Missing or invalid x-api-key for dummy payment provider')
    }
  }

  async reserve(_req: Request, credits: number): Promise<PaymentReservation> {
    return { id: `dummy-${Date.now()}`, credits }
  }

  async commit(_req: Request, _reservation: PaymentReservation): Promise<void> {
    return
  }

  async rollback(_req: Request, _reservation: PaymentReservation): Promise<void> {
    return
  }
}
