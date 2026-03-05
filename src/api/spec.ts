export const openApiSpec = {
  openapi: '3.0.3',
  info: {
    title: 'TEXTWEB SUMMARIZE AGENT API',
    version: '1.0.0',
    description: 'Paid TextWeb rendering and summarization API with Nevermined-compatible metering.',
  },
  servers: [{ url: '/' }],
  paths: {
    '/healthz': {
      get: {
        summary: 'Health check',
        responses: {
          '200': {
            description: 'Service health',
          },
        },
      },
    },
    '/v1/render': {
      post: {
        summary: 'Render webpage with TextWeb',
        requestBody: {
          required: true,
          content: {
            'application/json': {
              schema: {
                type: 'object',
                required: ['url'],
                properties: {
                  url: { type: 'string', format: 'uri' },
                  followLinks: {
                    type: 'object',
                    properties: {
                      enabled: { type: 'boolean' },
                      max: { type: 'integer', minimum: 0, maximum: 3 },
                    },
                  },
                  cache: { type: 'boolean' },
                },
              },
            },
          },
        },
        responses: {
          '200': { description: 'Rendered output' },
          '402': { description: 'Payment required' },
        },
      },
    },
    '/v1/summarize': {
      post: {
        summary: 'Summarize webpage content',
        requestBody: {
          required: true,
          content: {
            'application/json': {
              schema: {
                type: 'object',
                required: ['url'],
                properties: {
                  url: { type: 'string', format: 'uri' },
                  goal: { type: 'string' },
                  mode: { type: 'string', enum: ['brief', 'standard', 'deep'] },
                  followLinks: {
                    type: 'object',
                    properties: {
                      enabled: { type: 'boolean' },
                      max: { type: 'integer', minimum: 0, maximum: 3 },
                    },
                  },
                  schema: { type: 'object' },
                  cache: { type: 'boolean' },
                },
              },
            },
          },
        },
        responses: {
          '200': { description: 'Summary output' },
          '402': { description: 'Payment required' },
        },
      },
    },
  },
} as const

export const agentDefinition = {
  name: 'TEXTWEB SUMMARIZE AGENT',
  version: '1.0.0',
  description: 'Seller agent that renders and summarizes webpages using TextWeb.',
  spec_url: '/openapi.json',
  endpoints: ['/v1/render', '/v1/summarize', '/healthz'],
  auth: {
    nevermined: {
      header: 'payment-signature',
    },
    dummy: {
      header: 'x-api-key',
    },
  },
}
