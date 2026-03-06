import { createRequire } from 'node:module'

import { env } from '../config/env.js'
import { assertSafeResolvedAddress, normalizeAndValidateUrl } from './url-safety.js'

const require = createRequire(import.meta.url)
const { AgentBrowser } = require('textweb') as { AgentBrowser: new (opts: any) => any }

type RawResult = {
  view: string
  elements: Record<string, any>
  meta?: Record<string, any>
}

export interface RenderedPage {
  url: string
  title: string
  view: string
  elements: Record<string, any>
  links: Array<{ ref: string; text: string; href: string }>
  interactiveElements: Array<{ ref: string; text: string; semantic: string; selector: string }>
  visibleTextBlocks: string[]
  renderMs: number
  followedPages?: Array<{ url: string; title: string; view: string }>
}

export class TextWebAdapter {
  private readonly browser: any

  constructor() {
    this.browser = new AgentBrowser({ cols: 120, headless: true })
  }

  async close(): Promise<void> {
    await this.browser.close()
  }

  async render(urlInput: string, options?: { followLinks?: { enabled: boolean; max: number } }): Promise<RenderedPage> {
    const url = normalizeAndValidateUrl(urlInput)
    await assertSafeResolvedAddress(url)
    const startedAt = Date.now()

    const primary = await this.withTimeout<RawResult>(() => this.browser.navigate(url), env.REQUEST_TIMEOUT_MS)
    const primaryResult = this.toRenderedPage(url, primary, Date.now() - startedAt)

    if (!options?.followLinks?.enabled) return primaryResult

    const max = Math.min(Math.max(options.followLinks.max || 0, 0), env.MAX_FOLLOW_LINKS)
    if (max === 0) return primaryResult

    const followedPages: Array<{ url: string; title: string; view: string }> = []

    for (const candidate of primaryResult.links.slice(0, max)) {
      try {
        const target = normalizeAndValidateUrl(candidate.href)
        await assertSafeResolvedAddress(target)
        const result = await this.withTimeout<RawResult>(
          () => this.browser.navigate(target),
          Math.min(env.REQUEST_TIMEOUT_MS, 15000),
        )
        followedPages.push({
          url: target,
          title: result.meta?.title ?? '',
          view: this.truncate(result.view),
        })
      } catch {
        continue
      }
    }

    return {
      ...primaryResult,
      followedPages,
    }
  }

  private toRenderedPage(url: string, raw: RawResult, renderMs: number): RenderedPage {
    const elements = raw.elements || {}
    const links: Array<{ ref: string; text: string; href: string }> = []
    const interactiveElements: Array<{ ref: string; text: string; semantic: string; selector: string }> = []

    for (const [ref, element] of Object.entries(elements)) {
      const href = typeof element.href === 'string' ? element.href : ''
      const text = String(element.text || '').trim()
      const semantic = String(element.semantic || element.tag || 'unknown')
      const selector = String(element.selector || '')

      if (href && href.startsWith('http')) {
        links.push({ ref, text, href })
      }

      if (element.interactive) {
        interactiveElements.push({ ref, text, semantic, selector })
      }
    }

    const visibleTextBlocks = this.extractVisibleBlocks(raw.view)

    return {
      url,
      title: String(raw.meta?.title || ''),
      view: this.truncate(raw.view),
      elements,
      links,
      interactiveElements,
      visibleTextBlocks,
      renderMs,
    }
  }

  private extractVisibleBlocks(view: string): string[] {
    return view
      .split('\n')
      .map((line) => line.trim())
      .filter((line) => line.length > 0)
      .slice(0, 120)
  }

  private truncate(text: string): string {
    if (text.length <= env.MAX_RENDER_CHARS) return text
    return `${text.slice(0, env.MAX_RENDER_CHARS)}\n\n[truncated]`
  }

  private async withTimeout<T>(fn: () => Promise<T>, timeoutMs: number): Promise<T> {
    return new Promise((resolve, reject) => {
      const timeout = setTimeout(() => reject(new Error(`TextWeb render timeout after ${timeoutMs}ms`)), timeoutMs)

      fn()
        .then((result) => {
          clearTimeout(timeout)
          resolve(result)
        })
        .catch((error) => {
          clearTimeout(timeout)
          reject(error)
        })
    })
  }
}
