import type { Request, RequestHandler } from 'express'

export interface PaymentReservation {
  id: string
  credits: number
}

export interface PaymentProvider {
  readonly mode: 'nevermined' | 'dummy'
  describe(): Record<string, unknown>
  middleware(routeCredits: Record<string, (req: Request) => number>): RequestHandler
  validateRequest(req: Request): Promise<void>
  reserve(req: Request, credits: number): Promise<PaymentReservation>
  commit(req: Request, reservation: PaymentReservation): Promise<void>
  rollback(req: Request, reservation: PaymentReservation): Promise<void>
}
