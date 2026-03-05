import { env } from '../config/env.js'
import { DummyPaymentProvider } from './dummy-provider.js'
import { NeverminedPaymentProvider } from './nevermined-provider.js'
import type { PaymentProvider } from './payment-provider.js'

export function createPaymentProvider(): PaymentProvider {
  if (env.PAYMENT_PROVIDER === 'nevermined') {
    return new NeverminedPaymentProvider({
      nvmApiKey: env.NVM_API_KEY!,
      environment: env.NVM_ENVIRONMENT,
      planId: env.NVM_PLAN_ID!,
      agentId: env.NVM_AGENT_ID,
    })
  }

  return new DummyPaymentProvider(env.DUMMY_API_KEY)
}
