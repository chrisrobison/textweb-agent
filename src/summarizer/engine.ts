import OpenAI from 'openai'

import { env } from '../config/env.js'
import type { SummarizeRequest, SummarizeResponse } from '../types/api.js'
import type { RenderedPage } from '../textweb/adapter.js'

const summarySchema = {
  type: 'object',
  additionalProperties: false,
  properties: {
    title: { type: 'string' },
    summaryBullets: { type: 'array', items: { type: 'string' } },
    keyFacts: { type: 'array', items: { type: 'string' } },
    nextActions: { type: 'array', items: { type: 'string' } },
    links: {
      type: 'array',
      items: {
        type: 'object',
        additionalProperties: false,
        properties: {
          text: { type: 'string' },
          href: { type: 'string' },
        },
        required: ['text', 'href'],
      },
    },
    extracted: { type: 'object' },
  },
  required: ['title', 'summaryBullets', 'keyFacts', 'nextActions', 'links', 'extracted'],
} as const

export class SummarizationEngine {
  private readonly client: OpenAI | null

  constructor() {
    this.client = env.OPENAI_API_KEY ? new OpenAI({ apiKey: env.OPENAI_API_KEY }) : null
  }

  async summarize(request: SummarizeRequest, render: RenderedPage): Promise<Omit<SummarizeResponse, 'cost' | 'meta' | 'url'>> {
    const mode = request.mode ?? 'standard'

    if (!this.client) {
      return this.heuristicSummary(render, request)
    }

    const system = [
      'You summarize TextWeb outputs for autonomous agents.',
      'Return compact JSON only.',
      'Prioritize factual, actionable, token-efficient bullets.',
      modeInstruction(mode),
      request.schema
        ? 'Also produce extracted object that matches the provided JSON schema exactly where possible.'
        : 'Set extracted to an empty object when no schema is provided.',
    ].join(' ')

    const payload = {
      goal: request.goal ?? '',
      mode,
      page: {
        url: render.url,
        title: render.title,
        view: render.view,
        visibleTextBlocks: render.visibleTextBlocks,
        links: render.links.slice(0, 25),
      },
      followedPages: render.followedPages ?? [],
      extractionSchema: request.schema ?? null,
    }

    const completion = await this.client.chat.completions.create({
      model: env.OPENAI_MODEL,
      temperature: 0.1,
      messages: [
        { role: 'system', content: system },
        { role: 'user', content: JSON.stringify(payload) },
      ],
      response_format: {
        type: 'json_schema',
        json_schema: {
          name: 'textweb_summary',
          schema: summarySchema,
          strict: true,
        },
      },
    })

    const content = completion.choices[0]?.message?.content
    if (!content) throw new Error('LLM returned empty summary payload')

    const parsed = JSON.parse(content) as Omit<SummarizeResponse, 'cost' | 'meta' | 'url'>

    if (request.schema && (!parsed.extracted || Object.keys(parsed.extracted).length === 0)) {
      parsed.extracted = await this.extractWithSchema(request.schema, payload)
    }

    return {
      title: parsed.title || render.title,
      summaryBullets: (parsed.summaryBullets || []).slice(0, 8),
      keyFacts: (parsed.keyFacts || []).slice(0, 10),
      nextActions: (parsed.nextActions || []).slice(0, 8),
      links: (parsed.links || []).slice(0, 12),
      extracted: parsed.extracted || {},
    }
  }

  private async extractWithSchema(schema: Record<string, unknown>, payload: Record<string, unknown>): Promise<Record<string, unknown>> {
    if (!this.client) return {}

    const completion = await this.client.chat.completions.create({
      model: env.OPENAI_MODEL,
      temperature: 0,
      messages: [
        {
          role: 'system',
          content: 'Extract structured data from the page and return JSON that matches the provided schema exactly.',
        },
        {
          role: 'user',
          content: JSON.stringify({ schema, payload }),
        },
      ],
      response_format: {
        type: 'json_schema',
        json_schema: {
          name: 'structured_extraction',
          schema: schema as any,
          strict: false,
        },
      },
    })

    const text = completion.choices[0]?.message?.content
    if (!text) return {}
    try {
      return JSON.parse(text)
    } catch {
      return {}
    }
  }

  private heuristicSummary(render: RenderedPage, request: SummarizeRequest): Omit<SummarizeResponse, 'cost' | 'meta' | 'url'> {
    const lines = render.visibleTextBlocks.filter((line) => line.length > 20)

    return {
      title: render.title,
      summaryBullets: lines.slice(0, 5),
      keyFacts: lines.slice(0, 5),
      nextActions: request.goal
        ? [`Review the page against goal: ${request.goal}`]
        : ['Inspect links for deeper context', 'Run deep mode for richer synthesis'],
      links: render.links.slice(0, 8).map((link) => ({ text: link.text || link.href, href: link.href })),
      extracted: {},
    }
  }
}

function modeInstruction(mode: 'brief' | 'standard' | 'deep'): string {
  if (mode === 'brief') {
    return 'Brief mode: max 3 summary bullets, 3 key facts, 2 next actions.'
  }

  if (mode === 'deep') {
    return 'Deep mode: include higher-signal insights, tradeoffs, and recommended next steps.'
  }

  return 'Standard mode: balanced concise summary with key facts and practical next actions.'
}
