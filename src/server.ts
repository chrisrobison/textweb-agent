import { env } from './config/env.js'
import { createCacheStore } from './cache/index.js'
import { createPaymentProvider } from './payments/index.js'
import { SummarizationEngine } from './summarizer/engine.js'
import { TextWebAdapter } from './textweb/adapter.js'
import { createApp } from './api/app.js'

async function main() {
  const cache = await createCacheStore()
  const payments = createPaymentProvider()
  const summarizer = new SummarizationEngine()
  const adapter = new TextWebAdapter()

  const app = createApp({
    cache,
    payments,
    summarizer,
    adapter,
  })

  const server = app.listen(env.PORT, () => {
    console.log(`TEXTWEB AGENT listening on http://localhost:${env.PORT}`)
    console.log(`Payment provider: ${payments.mode}`)
    console.log('Endpoints: POST /v1/render, POST /v1/summarize, GET /healthz')
  })

  const shutdown = async () => {
    server.close()
    await adapter.close()
    process.exit(0)
  }

  process.on('SIGINT', shutdown)
  process.on('SIGTERM', shutdown)
}

main().catch((error) => {
  console.error(error)
  process.exit(1)
})
