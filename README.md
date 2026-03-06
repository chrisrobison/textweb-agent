# TEXTWEB AGENT

Seller agent service for the Nevermined Autonomous Business Hackathon.

It exposes a paid HTTP API that renders webpages with TextWeb and returns token-efficient summaries/extractions. Metering follows the Nevermined hackathon pattern (`Payments.getInstance` + `paymentMiddleware`) so each call is an agent-to-agent paid transaction.

## Research summary (required)

This implementation mirrors the official patterns from:

- Nevermined hackathon repo
  - `agents/seller-simple-agent/ts/src/server.ts`
  - `agents/buyer-simple-agent/ts/src/client.ts`
  - `workshops/getting-started/ts/server.ts`
  - `workshops/payment-plans/ts/dynamic-pricing.ts`
- TextWeb repo
  - `src/browser.js` (`AgentBrowser.navigate()` and text-grid snapshots)
  - `src/server.js` (`/navigate` flow)
  - `README.md` (library + CLI usage)

### Exact Nevermined SDK patterns used

- Seller payment init:
  - `Payments.getInstance({ nvmApiKey, environment })`
- Seller route metering:
  - `paymentMiddleware(payments, { "POST /route": { planId, credits, agentId? } })`
- Buyer token acquisition pattern (mirrored in SDK):
  - `payments.x402.getX402AccessToken(planId, agentId?)`

### Payment validation / credit burn pattern

Per hackathon TS examples, validation + settlement are handled by `paymentMiddleware` at HTTP layer. Handlers only run when payment is valid.

## Architecture

- `src/server.ts`: process bootstrap
- `src/api/app.ts`: HTTP routes and orchestration
- `src/textweb/adapter.ts`: TextWeb integration + URL safety + follow-links
- `src/summarizer/engine.ts`: strict JSON summarization / extraction
- `src/cache/*`: Redis cache with LRU fallback
- `src/payments/*`: `PaymentProvider` interface with:
  - `NeverminedPaymentProvider` (official middleware pattern)
  - `DummyPaymentProvider` (local testing)
- `packages/client`: lightweight SDK (`@textweb/client`)

## API

### `POST /v1/summarize`

Request:

```json
{
  "url": "https://example.com",
  "goal": "optional user intent",
  "mode": "brief",
  "followLinks": { "enabled": true, "max": 2 },
  "schema": {
    "type": "object",
    "properties": {
      "company": { "type": "string" }
    }
  },
  "cache": true
}
```

Response:

```json
{
  "url": "https://example.com/",
  "title": "Example Domain",
  "summaryBullets": ["..."],
  "keyFacts": ["..."],
  "nextActions": ["..."],
  "links": [{ "text": "More information...", "href": "https://www.iana.org/domains/example" }],
  "extracted": {},
  "cost": { "units": 2, "credits": 0.002 },
  "meta": { "renderMs": 1200, "summarizeMs": 350, "cached": false }
}
```

### `POST /v1/render`

Returns raw TextWeb representation + links/interactives/text blocks.

### `GET /healthz`

Health endpoint.

## Local development

```bash
npm install
npx playwright install chromium
cp .env.example .env
PORT=3101 npm run dev
```

If port 3000 is busy, keep using `PORT=3101` for demo reliability.

## Hackathon demo quickstart

Use the scripted smoke/demo flow:

```bash
./scripts/demo-smoke.sh
```

For deployed verification (Nevermined token or dummy key):

```bash
BASE_URL=https://your-domain \
PAYMENT_SIGNATURE=<x402-token> \
./scripts/deployed-smoke.sh
```

It demonstrates:

1. payment gating (`402` when unpaid)
2. paid summarize call (live)
3. repeat paid summarize call (cached, lower units)
4. render endpoint proof

For full presenter notes and talk track, see `DEMO_TODAY.md`.

## Built-in demo dashboard

With server running, open:

- `http://localhost:3101/dashboard`

Dashboard features:

- submit render/summarize requests from UI
- view TextWeb text-grid output directly
- inspect raw JSON response
- watch live service stats (`/stats`): requests, 402s, cache hits, pages served, units/credits billed

## Environment

See `.env.example`.

Important:

- Direct HTTPS on Node is optional. Set `HTTPS_KEY_PATH` and `HTTPS_CERT_PATH` to enable TLS (optionally `HTTPS_CA_PATH`).
  - Let's Encrypt example: `HTTPS_KEY_PATH=/etc/letsencrypt/live/textweb.net/privkey.pem`, `HTTPS_CERT_PATH=/etc/letsencrypt/live/textweb.net/fullchain.pem`

- `PAYMENT_PROVIDER=nevermined` requires `NVM_API_KEY` and `NVM_PLAN_ID`
- `PAYMENT_PROVIDER=dummy` requires `DUMMY_API_KEY` and uses `x-api-key` header
- `URL_ALLOWLIST` supports exact hosts and wildcards (for example `example.com,*.trusted.site`)
- `BLOCK_PRIVATE_NETWORKS=true` blocks private/loopback IP resolution (SSRF protection)
- `MAX_SCHEMA_BYTES` caps extraction schema payload size for `/v1/summarize`

## Tests

```bash
npm test
```

## curl examples

Health:

```bash
curl http://localhost:3000/healthz
```

Render (dummy payment mode):

```bash
curl -X POST http://localhost:3000/v1/render \
  -H 'content-type: application/json' \
  -H 'x-api-key: dev-textweb-key' \
  -d '{"url":"https://example.com","cache":true}'
```

Summarize:

```bash
curl -X POST http://localhost:3000/v1/summarize \
  -H 'content-type: application/json' \
  -H 'x-api-key: dev-textweb-key' \
  -d '{"url":"https://example.com","mode":"standard","cache":true}'
```

Nevermined paid call (buyer-side token):

```bash
# Token generation pattern follows hackathon buyer example:
# const { accessToken } = await payments.x402.getX402AccessToken(planId, agentId)

curl -X POST http://localhost:3000/v1/summarize \
  -H 'content-type: application/json' \
  -H "payment-signature: <x402-access-token>" \
  -d '{"url":"https://example.com","mode":"brief"}'
```

## SDK usage (`@textweb/client`)

```ts
import { TextWeb } from '@textweb/client'

const web = new TextWeb({
  endpoint: 'http://localhost:3000',
  apiKey: process.env.TEXTWEB_KEY // dummy mode
})

const summary = await web.summarize('https://example.com')
const render = await web.render('https://example.com')
const extracted = await web.extract('https://example.com', {
  type: 'object',
  properties: {
    headline: { type: 'string' }
  }
})
```

With Nevermined auto-token generation in SDK:

```ts
import { TextWeb } from '@textweb/client'

const web = new TextWeb({
  endpoint: 'https://api.textweb.ai',
  nevermined: {
    nvmApiKey: process.env.NVM_SUBSCRIBER_API_KEY!,
    planId: process.env.NVM_PLAN_ID!,
    agentId: process.env.NVM_AGENT_ID,
    environment: 'sandbox'
  }
})

const result = await web.summarize({
  url: 'https://example.com',
  mode: 'deep'
})

// Optional: inspect resolved auth headers before a custom fetch call
const headers = await web.getAuthHeaders()
```

## Notes on pricing and cache

- Requests are always metered.
- Summaries served from cache use lower credit units than live summaries.
- Cache key dimensions: `url + goal + mode + schema + followLinks`.

## Security controls

- URL validation (`http/https` only, `file://` blocked)
- Request timeout
- max follow-links
- max render chars / response safety cap
- per-IP rate limiting
