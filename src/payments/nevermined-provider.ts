import type { Request, RequestHandler } from 'express'
import { Payments } from '@nevermined-io/payments'
import { paymentMiddleware } from '@nevermined-io/payments/express'

import type { PaymentProvider, PaymentReservation } from './payment-provider.js'

export class NeverminedPaymentProvider implements PaymentProvider {
  readonly mode = 'nevermined' as const
  private readonly payments: Payments

  constructor(private readonly options: {
    nvmApiKey: string
    environment: string
    planId: string
    agentId?: string
  }) {
    this.payments = Payments.getInstance({
      nvmApiKey: options.nvmApiKey,
      environment: options.environment as any,
    })
  }

  middleware(routeCredits: Record<string, (req: Request) => number>): RequestHandler {
    const config: Record<string, { planId: string; credits: number | ((req: Request) => number); agentId?: string }> = {}

    for (const [routeKey, resolver] of Object.entries(routeCredits)) {
      config[routeKey] = {
        planId: this.options.planId,
        credits: (req: Request) => resolver(req),
        ...(this.options.agentId ? { agentId: this.options.agentId } : {}),
      }
    }

    return paymentMiddleware(this.payments, config) as RequestHandler
  }

  async validateRequest(_req: Request): Promise<void> {
    return
  }

  async reserve(_req: Request, credits: number): Promise<PaymentReservation> {
    return { id: `nvm-${Date.now()}`, credits }
  }

  async commit(_req: Request, _reservation: PaymentReservation): Promise<void> {
    return
  }

  async rollback(_req: Request, _reservation: PaymentReservation): Promise<void> {
    return
  }
}
