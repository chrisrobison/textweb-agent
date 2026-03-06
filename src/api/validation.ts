import { z } from 'zod'

import { env } from '../config/env.js'
import type { RenderRequest, SummarizeRequest } from '../types/api.js'
import { ApiError } from './errors.js'
import { normalizeAndValidateUrl } from '../textweb/url-safety.js'

const followLinksSchema = z
  .object({
    enabled: z.boolean().default(false),
    max: z.coerce.number().int().min(0).max(env.MAX_FOLLOW_LINKS).default(0),
  })
  .default({ enabled: false, max: 0 })

const renderSchema = z
  .object({
    url: z.string().min(1).max(env.MAX_URL_LENGTH),
    followLinks: followLinksSchema.optional(),
    cache: z.boolean().optional(),
  })
  .passthrough()

const summarizeSchema = z
  .object({
    url: z.string().min(1).max(env.MAX_URL_LENGTH),
    goal: z.string().max(4000).optional(),
    mode: z.enum(['brief', 'standard', 'deep']).optional(),
    followLinks: followLinksSchema.optional(),
    schema: z.record(z.any()).optional(),
    cache: z.boolean().optional(),
  })
  .passthrough()

function makeValidationError(route: string, issues: unknown): ApiError {
  return new ApiError(400, 'INVALID_REQUEST', `Invalid request payload for ${route}`, issues)
}

export function normalizeRenderBody(body: unknown): RenderRequest {
  const parsed = renderSchema.safeParse(body)
  if (!parsed.success) throw makeValidationError('/v1/render', parsed.error.issues)

  const data = parsed.data
  let url: string
  try {
    url = normalizeAndValidateUrl(data.url)
  } catch (error: any) {
    throw makeValidationError('/v1/render', [{ message: error?.message || 'Invalid URL', path: ['url'] }])
  }

  return {
    url,
    followLinks: {
      enabled: data.followLinks?.enabled ?? false,
      max: Math.min(Math.max(data.followLinks?.max ?? 0, 0), env.MAX_FOLLOW_LINKS),
    },
    cache: data.cache !== false,
  }
}

export function normalizeSummarizeBody(body: unknown): SummarizeRequest {
  const parsed = summarizeSchema.safeParse(body)
  if (!parsed.success) throw makeValidationError('/v1/summarize', parsed.error.issues)

  const data = parsed.data
  let url: string
  try {
    url = normalizeAndValidateUrl(data.url)
  } catch (error: any) {
    throw makeValidationError('/v1/summarize', [{ message: error?.message || 'Invalid URL', path: ['url'] }])
  }

  return {
    url,
    goal: data.goal,
    mode: data.mode ?? 'standard',
    followLinks: {
      enabled: data.followLinks?.enabled ?? false,
      max: Math.min(Math.max(data.followLinks?.max ?? 0, 0), env.MAX_FOLLOW_LINKS),
    },
    schema: normalizeSchema(data.schema),
    cache: data.cache !== false,
  }
}

function normalizeSchema(schema: Record<string, unknown> | undefined): Record<string, unknown> | undefined {
  if (!schema) return undefined
  const bytes = Buffer.byteLength(JSON.stringify(schema), 'utf8')
  if (bytes > env.MAX_SCHEMA_BYTES) {
    throw makeValidationError('/v1/summarize', [
      {
        message: `schema exceeded MAX_SCHEMA_BYTES (${env.MAX_SCHEMA_BYTES})`,
        path: ['schema'],
      },
    ])
  }
  return schema
}
