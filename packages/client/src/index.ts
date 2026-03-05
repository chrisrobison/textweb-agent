import { Payments } from '@nevermined-io/payments'

export type SummaryMode = 'brief' | 'standard' | 'deep'

export interface TextWebClientOptions {
  endpoint: string
  apiKey?: string
  paymentSignature?: string
  nevermined?: {
    nvmApiKey: string
    planId: string
    agentId?: string
    environment?: string
  }
}

export interface SummarizeInput {
  url: string
  goal?: string
  mode?: SummaryMode
  followLinks?: {
    enabled: boolean
    max: number
  }
  schema?: Record<string, unknown>
  cache?: boolean
}

export interface RenderInput {
  url: string
  followLinks?: {
    enabled: boolean
    max: number
  }
  cache?: boolean
}

export class TextWeb {
  private readonly endpoint: string
  private readonly apiKey?: string
  private readonly paymentSignature?: string
  private readonly payments?: Payments
  private readonly planId?: string
  private readonly agentId?: string

  constructor(options: TextWebClientOptions) {
    this.endpoint = options.endpoint.replace(/\/$/, '')
    this.apiKey = options.apiKey
    this.paymentSignature = options.paymentSignature

    if (options.nevermined) {
      this.payments = Payments.getInstance({
        nvmApiKey: options.nevermined.nvmApiKey,
        environment: (options.nevermined.environment || 'sandbox') as any,
      })
      this.planId = options.nevermined.planId
      this.agentId = options.nevermined.agentId
    }
  }

  async render(urlOrInput: string | RenderInput): Promise<any> {
    const body = typeof urlOrInput === 'string' ? { url: urlOrInput } : urlOrInput
    return this.request('/v1/render', body)
  }

  async summarize(urlOrInput: string | SummarizeInput): Promise<any> {
    const body = typeof urlOrInput === 'string' ? { url: urlOrInput } : urlOrInput
    return this.request('/v1/summarize', body)
  }

  async extract(url: string, schema: Record<string, unknown>, input?: Omit<SummarizeInput, 'url' | 'schema'>): Promise<any> {
    return this.summarize({
      url,
      ...input,
      schema,
    })
  }

  private async request(path: string, body: unknown): Promise<any> {
    const headers: Record<string, string> = {
      'Content-Type': 'application/json',
    }

    if (this.apiKey) {
      headers['x-api-key'] = this.apiKey
    }

    const paymentSignature = await this.resolvePaymentSignature()
    if (paymentSignature) {
      headers['payment-signature'] = paymentSignature
    }

    const response = await fetch(`${this.endpoint}${path}`, {
      method: 'POST',
      headers,
      body: JSON.stringify(body),
    })

    if (!response.ok) {
      const text = await response.text()
      throw new Error(`TextWeb API error ${response.status}: ${text}`)
    }

    return response.json()
  }

  private async resolvePaymentSignature(): Promise<string | undefined> {
    if (this.paymentSignature) return this.paymentSignature

    if (this.payments && this.planId) {
      const token = await this.payments.x402.getX402AccessToken(this.planId, this.agentId)
      return token.accessToken
    }

    return undefined
  }
}
