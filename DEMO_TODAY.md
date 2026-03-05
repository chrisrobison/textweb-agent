# TextWeb Demo Runbook (Today)

Use this when presenting under time pressure.

## 0) Pre-flight (2 min)

```bash
cd /Users/cdr/Projects/textweb-summarize
npm install
npx playwright install chromium
cp -n .env.example .env
```

Use dummy mode unless Nevermined credentials are ready:

```bash
# .env
PAYMENT_PROVIDER=dummy
DUMMY_API_KEY=dev-textweb-key
```

Run on a free port (3000 is often busy):

```bash
PORT=3101 npm run dev
```

Health check:

```bash
curl -sS http://localhost:3101/healthz
```

---

## 1) 90-second live demo flow

### A) Show payment gate (unpaid request fails)

```bash
curl -sS -X POST http://localhost:3101/v1/summarize \
  -H 'content-type: application/json' \
  -d '{"url":"https://example.com","mode":"brief","cache":true}'
```

Expected: `402 Payment Required`

### B) First paid call (live)

```bash
curl -sS -X POST http://localhost:3101/v1/summarize \
  -H 'content-type: application/json' \
  -H 'x-api-key: dev-textweb-key' \
  -d '{"url":"https://example.com","mode":"brief","cache":true}'
```

Expected: summary + `cost.units=2`, `meta.cached=false`

### C) Repeat paid call (cached, cheaper)

```bash
curl -sS -X POST http://localhost:3101/v1/summarize \
  -H 'content-type: application/json' \
  -H 'x-api-key: dev-textweb-key' \
  -d '{"url":"https://example.com","mode":"brief","cache":true}'
```

Expected: `cost.units=1`, `meta.cached=true`

### D) Show raw TextWeb render product

```bash
curl -sS -X POST http://localhost:3101/v1/render \
  -H 'content-type: application/json' \
  -H 'x-api-key: dev-textweb-key' \
  -d '{"url":"https://news.ycombinator.com","cache":true}'
```

Expected: text-grid output + links + interactives (no screenshots)

---

## 2) Talk track (what to say)

"Most agents browse via screenshot + vision, which is expensive and slow. We sell TextWeb browsing as paid infrastructure to other agents: text-grid render + extraction + summarize. Calls are metered. Repeated requests are cheaper via cache, so buyers have a direct ROI reason to keep buying."

---

## 3) Judge alignment checklist

- [ ] Paid agent-to-agent request shown
- [ ] At least 3 paid calls shown
- [ ] Repeat purchase shown (`cached=true` + lower units)
- [ ] Economic logic stated (lower cost/latency/token burn)
- [ ] Clear product boundary: seller API for other agents

---

## 4) Nevermined mode (if ready)

In `.env`:

```bash
PAYMENT_PROVIDER=nevermined
NVM_API_KEY=sandbox:...
NVM_ENVIRONMENT=sandbox
NVM_PLAN_ID=...
NVM_AGENT_ID=...   # optional
```

Buyer sends `payment-signature` header (x402 access token), matching official hackathon examples.

---

## 5) Fallback if internet/live target is flaky

Use stable URLs:
- `https://example.com`
- `https://www.iana.org/domains/example`

And keep demo in dummy mode. The core story (metered paid infra + repeat purchase economics) still lands.
