import express, { type Request, type Response, type NextFunction } from 'express'
import cors from 'cors'

import { env } from '../config/env.js'
import type { CacheStore } from '../cache/cache-store.js'
import { renderCacheKey, summarizeCacheKey } from '../cache/index.js'
import { createRateLimiter } from './rate-limit.js'
import { errorHandler, notFound } from './errors.js'
import { TextWebAdapter } from '../textweb/adapter.js'
import { normalizeAndValidateUrl } from '../textweb/url-safety.js'
import { SummarizationEngine } from '../summarizer/engine.js'
import type { RenderRequest, RenderResult, SummarizeRequest, SummarizeResponse } from '../types/api.js'
import type { PaymentProvider } from '../payments/payment-provider.js'

const CREDITS = {
  renderLive: 1,
  renderCached: 1,
  summarizeLive: 2,
  summarizeCached: 1,
}

type RecentRequest = {
  at: string
  route: string
  url: string
  status: number
  source: 'live' | 'cache' | 'unknown'
  units: number
  credits: number
  renderMs: number | null
}

type Stats = {
  startedAt: string
  requestsTotal: number
  requestsByRoute: Record<string, number>
  statusCounts: Record<string, number>
  paymentRequired: number
  successful: number
  renderRequests: number
  summarizeRequests: number
  cacheHits: number
  cacheMisses: number
  liveResponses: number
  pagesServed: number
  uniqueUrls: Set<string>
  unitsBilled: number
  creditsBilled: number
  avgRenderMs: number
  recentRequests: RecentRequest[]
}

const dashboardHtml = `<!doctype html>
<html lang="en">
<head>
  <meta charset="utf-8" />
  <meta name="viewport" content="width=device-width, initial-scale=1" />
  <title>TextWeb Dashboard</title>
  <style>
    :root { color-scheme: dark; }
    body { font-family: ui-sans-serif, system-ui, -apple-system, Segoe UI, Roboto, Helvetica, Arial; margin: 0; padding: 18px; background: #0f1115; color: #e8ecf1; }
    .grid { display: grid; grid-template-columns: 1fr 1fr; gap: 16px; }
    .card { background: #171a21; border: 1px solid #2a2f3a; border-radius: 12px; padding: 14px; }
    h1 { margin: 0 0 14px; font-size: 20px; }
    h2 { margin: 0 0 10px; font-size: 15px; color: #b9c2d0; }
    label { display: block; font-size: 12px; margin: 8px 0 4px; color: #aab3c2; }
    input, select, button, textarea { width: 100%; box-sizing: border-box; padding: 10px; border-radius: 8px; border: 1px solid #374154; background: #11151d; color: #e8ecf1; }
    button { cursor: pointer; background: #1e56d8; border-color: #2f68eb; font-weight: 600; }
    button:hover { filter: brightness(1.07); }
    .stats { display: grid; grid-template-columns: repeat(3, minmax(0,1fr)); gap: 8px; }
    .pill { background: #11151d; border: 1px solid #2a2f3a; border-radius: 10px; padding: 8px; }
    .k { font-size: 12px; color: #9facbf; }
    .v { font-size: 18px; font-weight: 700; }
    .mono { font-family: ui-monospace, SFMono-Regular, Menlo, Consolas, monospace; white-space: pre-wrap; overflow-wrap: anywhere; background: #0b0f16; border: 1px solid #2a2f3a; border-radius: 10px; padding: 12px; max-height: 55vh; overflow: auto; }
    .meta { font-size: 12px; color: #9facbf; }
    .row { display: grid; grid-template-columns: 1fr 120px; gap: 8px; }
    .ok { color: #6ee7a8; }
    .warn { color: #ffbf69; }
    table { width: 100%; border-collapse: collapse; font-size: 12px; }
    th, td { border-bottom: 1px solid #2a2f3a; padding: 6px; text-align: left; vertical-align: top; }
    th { color: #aab3c2; }
    @media (max-width: 1000px) { .grid { grid-template-columns: 1fr; } .stats { grid-template-columns: repeat(2, minmax(0,1fr)); } }
  </style>
</head>
<body>
  <h1>TextWeb — Demo Dashboard</h1>
  <div class="grid">
    <div class="card">
      <h2>Render Request</h2>
      <label>API Key</label>
      <input id="apiKey" value="dev-textweb-key" />
      <label>URL</label>
      <input id="url" value="https://example.com" />
      <div class="row">
        <div>
          <label>Follow Links</label>
          <select id="followEnabled"><option value="false">false</option><option value="true">true</option></select>
        </div>
        <div>
          <label>Max</label>
          <input id="followMax" type="number" min="0" max="3" value="1" />
        </div>
      </div>
      <label>Use Cache</label>
      <select id="cache"><option value="true">true</option><option value="false">false</option></select>
      <div style="display:flex; gap:8px; margin-top:12px;">
        <button id="renderBtn">Render Page</button>
        <button id="summBtn">Summarize</button>
      </div>
      <p class="meta" id="statusLine">Ready.</p>
      <div class="meta" id="resultMeta"></div>
    </div>

    <div class="card">
      <h2>Service Stats</h2>
      <div class="stats" id="stats"></div>
      <p class="meta" id="statsMeta"></p>
    </div>
  </div>

  <div class="grid" style="margin-top:16px;">
    <div class="card">
      <h2>TextWeb Render Output</h2>
      <div class="mono" id="renderOutput">(run a request)</div>
    </div>
    <div class="card">
      <h2>Raw JSON</h2>
      <div class="mono" id="jsonOutput">{}</div>
    </div>
  </div>

  <div class="card" style="margin-top:16px;">
    <h2>Recent Requests (last 20)</h2>
    <div style="overflow:auto; max-height:260px;">
      <table>
        <thead>
          <tr><th>Time</th><th>Route</th><th>Status</th><th>Source</th><th>Units</th><th>Credits</th><th>Render ms</th><th>URL</th></tr>
        </thead>
        <tbody id="recentRows">
          <tr><td colspan="8" class="meta">No requests yet.</td></tr>
        </tbody>
      </table>
    </div>
  </div>

<script>
const $ = (id) => document.getElementById(id)

function fmt(n){ return (typeof n === 'number') ? n.toLocaleString() : String(n ?? '-') }

function renderStats(s){
  const cards = [
    ['Requests', s.requestsTotal],
    ['Success', s.successful],
    ['402 Payment', s.paymentRequired],
    ['Render Calls', s.renderRequests],
    ['Summarize Calls', s.summarizeRequests],
    ['Pages Served', s.pagesServed],
    ['Cache Hits', s.cacheHits],
    ['Cache Misses', s.cacheMisses],
    ['Live Responses', s.liveResponses],
    ['Unique URLs', s.uniqueUrls],
    ['Units Billed', s.unitsBilled],
    ['Credits Billed', Number(s.creditsBilled || 0).toFixed(3)],
    ['Avg Render ms', s.avgRenderMs],
  ]

  $('stats').innerHTML = cards.map(function(pair){
    var k = pair[0]
    var v = pair[1]
    return '<div class="pill"><div class="k">' + k + '</div><div class="v">' + fmt(v) + '</div></div>'
  }).join('')
  $('statsMeta').textContent = 'Started: ' + s.startedAt + ' | Route counts: ' + JSON.stringify(s.requestsByRoute) + ' | Status: ' + JSON.stringify(s.statusCounts)
}

function renderRecent(items){
  if (!items || items.length === 0) {
    $('recentRows').innerHTML = '<tr><td colspan="8" class="meta">No requests yet.</td></tr>'
    return
  }

  $('recentRows').innerHTML = items.map(function(x){
    return '<tr>' +
      '<td>' + (x.at || '') + '</td>' +
      '<td>' + (x.route || '') + '</td>' +
      '<td>' + (x.status || '') + '</td>' +
      '<td>' + (x.source || '') + '</td>' +
      '<td>' + (x.units || 0) + '</td>' +
      '<td>' + Number(x.credits || 0).toFixed(3) + '</td>' +
      '<td>' + (x.renderMs == null ? '-' : x.renderMs) + '</td>' +
      '<td>' + (x.url || '') + '</td>' +
      '</tr>'
  }).join('')
}

async function loadStats(){
  const r = await fetch('/stats')
  const data = await r.json()
  renderStats(data)
  renderRecent(data.recentRequests || [])
}

async function run(kind){
  const url = $('url').value.trim()
  const apiKey = $('apiKey').value.trim()
  const followEnabled = $('followEnabled').value === 'true'
  const followMax = Number($('followMax').value || 0)
  const cache = $('cache').value === 'true'

  $('statusLine').textContent = 'Calling /v1/' + kind + ' ...'
  $('statusLine').className = 'meta'

  const body = kind === 'render'
    ? { url, followLinks: { enabled: followEnabled, max: followMax }, cache }
    : { url, mode: 'brief', followLinks: { enabled: followEnabled, max: followMax }, cache }

  try {
    const res = await fetch('/v1/' + kind, {
      method: 'POST',
      headers: { 'content-type': 'application/json', 'x-api-key': apiKey },
      body: JSON.stringify(body)
    })

    const text = await res.text()
    let data = {}
    try { data = JSON.parse(text) } catch { data = { raw: text } }

    $('jsonOutput').textContent = JSON.stringify(data, null, 2)

    if (!res.ok) {
      $('statusLine').textContent = 'HTTP ' + res.status + ' ' + res.statusText
      $('statusLine').className = 'meta warn'
      $('resultMeta').textContent = data.message || ''
      $('renderOutput').textContent = ''
      await loadStats()
      return
    }

    if (kind === 'render') {
      $('renderOutput').textContent = data.view || '(no view)'
      $('resultMeta').textContent = 'title=' + (data.title || '') + ' | source=' + ((data.meta && data.meta.source) || '') + ' | renderMs=' + ((data.meta && data.meta.renderMs) || '') + ' | links=' + ((data.links || []).length)
    } else {
      const bullets = (data.summaryBullets || []).map(function(b){ return '• ' + b }).join('\n')
      $('renderOutput').textContent = bullets || '(no summary bullets)'
      $('resultMeta').textContent = 'cached=' + ((data.meta && data.meta.cached) || false) + ' | units=' + ((data.cost && data.cost.units) || '') + ' | credits=' + ((data.cost && data.cost.credits) || '') + ' | renderMs=' + ((data.meta && data.meta.renderMs) || '')
    }

    $('statusLine').textContent = 'HTTP ' + res.status + ' OK'
    $('statusLine').className = 'meta ok'
    await loadStats()
  } catch (err) {
    $('statusLine').textContent = 'Request failed: ' + String(err)
    $('statusLine').className = 'meta warn'
  }
}

$('renderBtn').addEventListener('click', () => run('render'))
$('summBtn').addEventListener('click', () => run('summarize'))
loadStats()
setInterval(loadStats, 5000)
</script>
</body>
</html>`

export function createApp(deps: {
  cache: CacheStore
  adapter: TextWebAdapter
  summarizer: SummarizationEngine
  payments: PaymentProvider
}) {
  const app = express()

  const stats: Stats = {
    startedAt: new Date().toISOString(),
    requestsTotal: 0,
    requestsByRoute: {},
    statusCounts: {},
    paymentRequired: 0,
    successful: 0,
    renderRequests: 0,
    summarizeRequests: 0,
    cacheHits: 0,
    cacheMisses: 0,
    liveResponses: 0,
    pagesServed: 0,
    uniqueUrls: new Set<string>(),
    unitsBilled: 0,
    creditsBilled: 0,
    avgRenderMs: 0,
    recentRequests: [],
  }

  const addRecent = (entry: RecentRequest) => {
    stats.recentRequests.unshift(entry)
    if (stats.recentRequests.length > 20) stats.recentRequests.length = 20
  }

  app.use(cors())
  app.use(express.json({ limit: '1mb' }))
  app.use(createRateLimiter({ windowMs: env.RATE_LIMIT_WINDOW_MS, maxRequests: env.RATE_LIMIT_MAX_REQUESTS }))

  app.use((req: Request, res: Response, next: NextFunction) => {
    if (req.path === '/v1/render' || req.path === '/v1/summarize') {
      stats.requestsTotal += 1
      stats.requestsByRoute[req.path] = (stats.requestsByRoute[req.path] || 0) + 1
    }

    res.on('finish', () => {
      if (req.path !== '/v1/render' && req.path !== '/v1/summarize') return
      const code = String(res.statusCode)
      stats.statusCounts[code] = (stats.statusCounts[code] || 0) + 1
      if (res.statusCode === 402) stats.paymentRequired += 1
      if (res.statusCode >= 200 && res.statusCode < 300) stats.successful += 1

      if (res.statusCode >= 400) {
        const units = Number((req as any).pricingCredits || 0)
        const source = (req as any).cacheHit ? 'cache' : 'unknown'
        addRecent({
          at: new Date().toISOString(),
          route: req.path,
          url: String((req as any).normalizedUrl || ''),
          status: res.statusCode,
          source,
          units,
          credits: units * 0.001,
          renderMs: null,
        })
      }
    })

    next()
  })

  app.use(async (req: Request, _res: Response, next: NextFunction) => {
    if (req.method !== 'POST') return next()

    try {
      if (req.path === '/v1/render') {
        const body = (req.body || {}) as RenderRequest
        const url = normalizeAndValidateUrl(String(body.url || ''))
        const follow = body.followLinks ?? { enabled: false, max: 0 }
        const key = renderCacheKey(url, !!follow.enabled, Math.min(Math.max(follow.max || 0, 0), env.MAX_FOLLOW_LINKS))
        const hit = body.cache !== false ? await deps.cache.get(key) : null

        ;(req as any).cacheKey = key
        ;(req as any).cacheHit = Boolean(hit)
        ;(req as any).normalizedUrl = url
        ;(req as any).pricingCredits = hit ? CREDITS.renderCached : CREDITS.renderLive
      }

      if (req.path === '/v1/summarize') {
        const body = (req.body || {}) as SummarizeRequest
        const request: SummarizeRequest = {
          ...body,
          url: normalizeAndValidateUrl(String(body.url || '')),
          mode: body.mode ?? 'standard',
          followLinks: {
            enabled: body.followLinks?.enabled ?? false,
            max: Math.min(Math.max(body.followLinks?.max || 0, 0), env.MAX_FOLLOW_LINKS),
          },
          cache: body.cache !== false,
        }

        const key = summarizeCacheKey(request)
        const hit = request.cache ? await deps.cache.get(key) : null

        ;(req as any).normalizedRequest = request
        ;(req as any).cacheKey = key
        ;(req as any).cacheHit = Boolean(hit)
        ;(req as any).cachedResponse = hit ?? null
        ;(req as any).normalizedUrl = request.url
        ;(req as any).pricingCredits = hit ? CREDITS.summarizeCached : CREDITS.summarizeLive
      }

      next()
    } catch {
      next()
    }
  })

  app.use(
    deps.payments.middleware({
      'POST /v1/render': (req: Request) => Number((req as any).pricingCredits || CREDITS.renderLive),
      'POST /v1/summarize': (req: Request) => Number((req as any).pricingCredits || CREDITS.summarizeLive),
    }),
  )

  app.get('/healthz', (_req: Request, res: Response) => {
    res.json({
      status: 'ok',
      service: 'textweb-agent',
      paymentProvider: deps.payments.mode,
      now: new Date().toISOString(),
    })
  })

  app.get('/dashboard', (_req: Request, res: Response) => {
    res.type('html').send(dashboardHtml)
  })

  app.get('/stats', (_req: Request, res: Response) => {
    res.json({
      ...stats,
      uniqueUrls: stats.uniqueUrls.size,
      avgRenderMs: Math.round(stats.avgRenderMs),
    })
  })

  app.post('/v1/render', async (req: Request, res: Response, next: NextFunction) => {
    let reservation: any = null
    try {
      await deps.payments.validateRequest(req)
      reservation = await deps.payments.reserve(req, Number((req as any).pricingCredits || CREDITS.renderLive))

      const body = (req.body || {}) as RenderRequest
      const url = normalizeAndValidateUrl(String(body.url || ''))
      const followLinks = {
        enabled: body.followLinks?.enabled ?? false,
        max: Math.min(Math.max(body.followLinks?.max || 0, 0), env.MAX_FOLLOW_LINKS),
      }
      const cacheEnabled = body.cache !== false
      const cacheKey = (req as any).cacheKey as string | undefined

      let render = cacheEnabled && cacheKey ? await deps.cache.get<RenderResult>(cacheKey) : null

      if (!render) {
        const result = await deps.adapter.render(url, { followLinks })
        render = {
          url: result.url,
          title: result.title,
          view: result.view,
          elements: result.elements,
          links: result.links,
          interactiveElements: result.interactiveElements,
          visibleTextBlocks: result.visibleTextBlocks,
          meta: {
            renderMs: result.renderMs,
            source: 'live',
          },
        }

        if (cacheEnabled && cacheKey) {
          await deps.cache.set(cacheKey, render, env.CACHE_TTL_SECONDS)
        }
      } else {
        render.meta.source = 'cache'
      }

      if ((req as any).cacheHit) stats.cacheHits += 1
      else stats.cacheMisses += 1
      if (render.meta.source === 'live') stats.liveResponses += 1

      stats.renderRequests += 1
      stats.pagesServed += 1
      const thisUnits = Number((req as any).pricingCredits || CREDITS.renderLive)
      stats.unitsBilled += thisUnits
      stats.creditsBilled += thisUnits * 0.001
      const n = stats.renderRequests
      stats.avgRenderMs = n === 1 ? render.meta.renderMs : ((stats.avgRenderMs * (n - 1)) + render.meta.renderMs) / n

      const normalizedUrl = (req as any).normalizedUrl
      if (typeof normalizedUrl === 'string' && normalizedUrl.length > 0) stats.uniqueUrls.add(normalizedUrl)

      await deps.payments.commit(req, reservation)

      addRecent({
        at: new Date().toISOString(),
        route: req.path,
        url: String(render.url || url),
        status: 200,
        source: render.meta.source,
        units: thisUnits,
        credits: thisUnits * 0.001,
        renderMs: render.meta.renderMs,
      })

      res.json(render)
    } catch (error) {
      if (reservation) await deps.payments.rollback(req, reservation)
      next(error)
    }
  })

  app.post('/v1/summarize', async (req: Request, res: Response, next: NextFunction) => {
    let reservation: any = null
    try {
      await deps.payments.validateRequest(req)
      reservation = await deps.payments.reserve(req, Number((req as any).pricingCredits || CREDITS.summarizeLive))

      const body = (req.body || {}) as SummarizeRequest
      const request = ((req as any).normalizedRequest || body) as SummarizeRequest
      request.url = normalizeAndValidateUrl(request.url)
      request.mode = request.mode ?? 'standard'
      request.followLinks = request.followLinks ?? { enabled: false, max: 0 }
      request.cache = request.cache !== false

      const cached = (req as any).cachedResponse as SummarizeResponse | null
      const cacheKey = (req as any).cacheKey as string | undefined

      if (cached && request.cache) {
        if ((req as any).cacheHit) stats.cacheHits += 1
        else stats.cacheMisses += 1

        stats.summarizeRequests += 1
        stats.pagesServed += 1
        const thisUnits = CREDITS.summarizeCached
        stats.unitsBilled += thisUnits
        stats.creditsBilled += thisUnits * 0.001
        stats.uniqueUrls.add(request.url)

        await deps.payments.commit(req, reservation)

        addRecent({
          at: new Date().toISOString(),
          route: req.path,
          url: request.url,
          status: 200,
          source: 'cache',
          units: thisUnits,
          credits: thisUnits * 0.001,
          renderMs: cached.meta?.renderMs ?? null,
        })

        res.json({
          ...cached,
          cost: {
            units: CREDITS.summarizeCached,
            credits: CREDITS.summarizeCached * 0.001,
          },
          meta: {
            ...cached.meta,
            cached: true,
          },
        })
        return
      }

      const render = await deps.adapter.render(request.url, { followLinks: request.followLinks })
      const summarizeStartedAt = Date.now()
      const summarized = await deps.summarizer.summarize(request, render)

      const response: SummarizeResponse = {
        url: request.url,
        title: summarized.title || render.title,
        summaryBullets: summarized.summaryBullets,
        keyFacts: summarized.keyFacts,
        nextActions: summarized.nextActions,
        links: summarized.links,
        extracted: summarized.extracted,
        cost: {
          units: CREDITS.summarizeLive,
          credits: CREDITS.summarizeLive * 0.001,
        },
        meta: {
          renderMs: render.renderMs,
          summarizeMs: Date.now() - summarizeStartedAt,
          cached: false,
        },
      }

      if (request.cache && cacheKey) {
        await deps.cache.set(cacheKey, response, env.CACHE_TTL_SECONDS)
      }

      // ensure request can't be abused with huge payload responses
      if (JSON.stringify(response).length > env.MAX_RESPONSE_CHARS * 4) {
        throw new Error('Response exceeded MAX_RESPONSE_CHARS safety budget')
      }

      if ((req as any).cacheHit) stats.cacheHits += 1
      else stats.cacheMisses += 1
      stats.liveResponses += 1
      stats.summarizeRequests += 1
      stats.pagesServed += 1
      const thisUnits = CREDITS.summarizeLive
      stats.unitsBilled += thisUnits
      stats.creditsBilled += thisUnits * 0.001
      stats.uniqueUrls.add(request.url)

      await deps.payments.commit(req, reservation)

      addRecent({
        at: new Date().toISOString(),
        route: req.path,
        url: request.url,
        status: 200,
        source: 'live',
        units: thisUnits,
        credits: thisUnits * 0.001,
        renderMs: response.meta?.renderMs ?? null,
      })

      res.json(response)
    } catch (error) {
      if (reservation) await deps.payments.rollback(req, reservation)
      next(error)
    }
  })

  app.use(notFound)
  app.use(errorHandler)

  return app
}
