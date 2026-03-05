export type SummaryMode = 'brief' | 'standard' | 'deep'

export interface FollowLinksOptions {
  enabled: boolean
  max: number
}

export interface SummarizeRequest {
  url: string
  goal?: string
  mode?: SummaryMode
  followLinks?: FollowLinksOptions
  schema?: Record<string, unknown>
  cache?: boolean
}

export interface RenderRequest {
  url: string
  followLinks?: FollowLinksOptions
  cache?: boolean
}

export interface RenderResult {
  url: string
  title: string
  view: string
  elements: Record<string, any>
  links: Array<{ ref: string; text: string; href: string }>
  interactiveElements: Array<{ ref: string; text: string; semantic: string; selector: string }>
  visibleTextBlocks: string[]
  meta: {
    renderMs: number
    source: 'live' | 'cache'
  }
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
