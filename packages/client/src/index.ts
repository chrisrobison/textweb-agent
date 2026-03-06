import { Payments } from '@nevermined-io/payments'

export type SummaryMode = 'brief' | 'standard' | 'deep'

export interface TextWebClientOptions {
  endpoint: string
  apiKey?: string
  paymentSignature?: string
  timeoutMs?: number
  nevermined?: {
    nvmApiKey: string
    planId: string
    agentId?: string
    environment?: string
  }
  retry?: {
    retries?: number
    baseDelayMs?: number
    maxDelayMs?: number
  }
}

export interface FollowLinksOptions {
  enabled: boolean
  max: number
}

export interface SummarizeInput {
  url: string
  goal?: string
  mode?: SummaryMode
  followLinks?: FollowLinksOptions
  schema?: Record<string, unknown>
  cache?: boolean
}

export interface RenderInput {
  url: string
  followLinks?: FollowLinksOptions
  cache?: boolean
}

export interface RenderResponse {
  url: string
  title: string
  view: string
  elements: Record<string, unknown>
  links: Array<{ ref: string; text: string; href: string }>
  interactiveElements: Array<{ ref: string; text: string; semantic: string; selector: string }>
  visibleTextBlocks: string[]
  meta: {
    renderMs: number
    source: 'live' | 'cache'
  }
  followedPages?: Array<{ url: string; title: string; view: string }>
}

export interface SummarizeResponse {
  url: string
  title: string
  summaryBullets: string[]
  keyFacts: string[]
  nextActions: string[]
  links: Array<{ text: string; href: string }>
  extracted: Record<string, unknown>
  cost: {
    units: number
    credits: number
  }
  meta: {
    renderMs: number
    summarizeMs: number
    cached: boolean
  }
}

export class TextWebApiError extends Error {
  readonly status: number
  readonly bodyText: string
  readonly requestId?: string
  readonly code?: string
  readonly details?: unknown
  readonly data?: { error?: string; message?: string; code?: string; details?: unknown }
  readonly retryAfterMs?: number

  constructor(params: {
    status: number
    bodyText: string
    requestId?: string
    data?: { error?: string; message?: string; code?: string; details?: unknown }
    retryAfterMs?: number
  }) {
    const message = params.data?.message || params.bodyText || 'Request failed'
    super(`TextWeb API error ${params.status}: ${message}`)
    this.status = params.status
    this.bodyText = params.bodyText
    this.requestId = params.requestId
    this.code = params.data?.code
    this.details = params.data?.details
    this.data = params.data
    this.retryAfterMs = params.retryAfterMs
  }
}

type RequestErrorPayload = {
  error?: string
  message?: string
  code?: string
  details?: unknown
}

export type TextWebAuthHeaders = {
  'payment-signature'?: string
  'x-api-key'?: string
}

export class TextWeb {
  private readonly endpoint: string
  private readonly apiKey?: string
  private readonly paymentSignature?: string
  private readonly payments?: Payments
  private readonly planId?: string
  private readonly agentId?: string
  private readonly retries: number
  private readonly baseDelayMs: number
  private readonly maxDelayMs: number
  private readonly timeoutMs: number

  constructor(options: TextWebClientOptions) {
    this.endpoint = options.endpoint.replace(/\/$/, '')
    this.apiKey = options.apiKey
    this.paymentSignature = options.paymentSignature
    this.retries = options.retry?.retries ?? 2
    this.baseDelayMs = options.retry?.baseDelayMs ?? 250
    this.maxDelayMs = options.retry?.maxDelayMs ?? 1500
    this.timeoutMs = options.timeoutMs ?? 30000

    if (options.nevermined) {
      this.payments = Payments.getInstance({
        nvmApiKey: options.nevermined.nvmApiKey,
        environment: (options.nevermined.environment || 'sandbox') as any,
      })
      this.planId = options.nevermined.planId
      this.agentId = options.nevermined.agentId
    }
  }

  async render(urlOrInput: string | RenderInput): Promise<RenderResponse> {
    const body = typeof urlOrInput === 'string' ? { url: urlOrInput } : urlOrInput
    return this.request<RenderResponse>('/v1/render', body)
  }

  async summarize(urlOrInput: string | SummarizeInput): Promise<SummarizeResponse> {
    const body = typeof urlOrInput === 'string' ? { url: urlOrInput } : urlOrInput
    return this.request<SummarizeResponse>('/v1/summarize', body)
  }

  async extract(
    url: string,
    schema: Record<string, unknown>,
    input?: Omit<SummarizeInput, 'url' | 'schema'>,
  ): Promise<SummarizeResponse> {
    return this.summarize({
      url,
      ...input,
      schema,
    })
  }

  async getNeverminedAccessToken(planId?: string, agentId?: string): Promise<string | undefined> {
    if (!this.payments) return undefined
    const selectedPlanId = planId || this.planId
    if (!selectedPlanId) return undefined
    const token = await this.payments.x402.getX402AccessToken(selectedPlanId, agentId || this.agentId)
    return token.accessToken
  }

  async getAuthHeaders(planId?: string, agentId?: string): Promise<TextWebAuthHeaders> {
    const paymentSignature = this.paymentSignature || (await this.getNeverminedAccessToken(planId, agentId))
    return {
      ...(this.apiKey ? { 'x-api-key': this.apiKey } : {}),
      ...(paymentSignature ? { 'payment-signature': paymentSignature } : {}),
    }
  }

  private async request<T>(path: string, body: unknown): Promise<T> {
    const headers: Record<string, string> = {
      'Content-Type': 'application/json',
      ...(await this.getAuthHeaders()),
    }

    let lastError: unknown
    for (let attempt = 0; attempt <= this.retries; attempt += 1) {
      const controller = new AbortController()
      const timeout = setTimeout(() => controller.abort(), this.timeoutMs)
      try {
        const response = await fetch(`${this.endpoint}${path}`, {
          method: 'POST',
          headers,
          body: JSON.stringify(body),
          signal: controller.signal,
        })

        if (!response.ok) {
          const text = await response.text()
          let parsed: RequestErrorPayload | undefined
          try {
            parsed = text ? (JSON.parse(text) as RequestErrorPayload) : undefined
          } catch {
            parsed = undefined
          }
          const requestId = response.headers.get('x-request-id') || undefined
          const retryAfterMs = this.parseRetryAfter(response.headers.get('retry-after'))
          const error = new TextWebApiError({
            status: response.status,
            bodyText: text,
            requestId,
            data: parsed,
            retryAfterMs,
          })
          if (attempt < this.retries && this.shouldRetryStatus(response.status)) {
            await this.sleep(this.computeBackoff(attempt, retryAfterMs))
            lastError = error
            continue
          }
          throw error
        }

        return (await response.json()) as T
      } catch (error) {
        const retryable = this.isRetryableError(error)
        if (attempt < this.retries && retryable) {
          await this.sleep(this.computeBackoff(attempt))
          lastError = error
          continue
        }
        throw error
      } finally {
        clearTimeout(timeout)
      }
    }

    throw lastError instanceof Error ? lastError : new Error('Request failed')
  }

  private shouldRetryStatus(status: number): boolean {
    return status === 429 || status >= 500
  }

  private isRetryableError(error: unknown): boolean {
    if (error instanceof TextWebApiError) return this.shouldRetryStatus(error.status)
    if (error instanceof Error && error.name === 'AbortError') return true
    return true
  }

  private computeBackoff(attempt: number, retryAfterMs?: number): number {
    const exponential = Math.min(this.baseDelayMs * 2 ** attempt, this.maxDelayMs)
    const jitter = Math.floor(Math.random() * Math.max(20, Math.floor(exponential * 0.2)))
    const backoffWithJitter = Math.min(exponential + jitter, this.maxDelayMs)
    if (!retryAfterMs || retryAfterMs <= 0) return backoffWithJitter
    return Math.max(backoffWithJitter, Math.min(retryAfterMs, this.maxDelayMs * 5))
  }

  private parseRetryAfter(raw: string | null): number | undefined {
    if (!raw) return undefined
    const seconds = Number(raw)
    if (Number.isFinite(seconds) && seconds > 0) return Math.round(seconds * 1000)
    const date = new Date(raw)
    if (Number.isNaN(date.getTime())) return undefined
    const delta = date.getTime() - Date.now()
    return delta > 0 ? delta : undefined
  }

  private async sleep(ms: number): Promise<void> {
    await new Promise((resolve) => setTimeout(resolve, ms))
  }
}
