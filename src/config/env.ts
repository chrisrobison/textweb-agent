import { config } from 'dotenv'
import { z } from 'zod'

config()

const envSchema = z.object({
  PORT: z.coerce.number().default(3000),
  NODE_ENV: z.string().default('development'),
  OPENAI_API_KEY: z.string().optional(),
  OPENAI_MODEL: z.string().default('gpt-4o-mini'),

  PAYMENT_PROVIDER: z.enum(['nevermined', 'dummy']).default('dummy'),
  NVM_API_KEY: z.string().optional(),
  NVM_ENVIRONMENT: z.string().default('sandbox'),
  NVM_PLAN_ID: z.string().optional(),
  NVM_AGENT_ID: z.string().optional(),
  DUMMY_API_KEY: z.string().default('dev-textweb-key'),

  REDIS_URL: z.string().optional(),
  IN_MEMORY_CACHE_SIZE: z.coerce.number().default(500),
  CACHE_TTL_SECONDS: z.coerce.number().default(1800),

  REQUEST_TIMEOUT_MS: z.coerce.number().default(30000),
  MAX_RENDER_CHARS: z.coerce.number().default(30000),
  MAX_FOLLOW_LINKS: z.coerce.number().default(3),
  MAX_RESPONSE_CHARS: z.coerce.number().default(12000),
  RATE_LIMIT_WINDOW_MS: z.coerce.number().default(60000),
  RATE_LIMIT_MAX_REQUESTS: z.coerce.number().default(60),
})

const parsed = envSchema.safeParse(process.env)
if (!parsed.success) {
  throw new Error(`Invalid environment: ${parsed.error.message}`)
}

export const env = parsed.data

if (env.PAYMENT_PROVIDER === 'nevermined') {
  if (!env.NVM_API_KEY || !env.NVM_PLAN_ID) {
    throw new Error('NVM_API_KEY and NVM_PLAN_ID are required when PAYMENT_PROVIDER=nevermined')
  }
}
