const followLinksSchema = {
  type: 'object',
  additionalProperties: false,
  properties: {
    enabled: { type: 'boolean', default: false },
    max: { type: 'integer', minimum: 0, maximum: 3, default: 0 },
  },
} as const

export const openApiSpec = {
  openapi: '3.0.3',
  info: {
    title: 'TEXTWEB AGENT API',
    version: '1.0.0',
    description: 'Paid TextWeb rendering and summarization API with Nevermined-compatible metering.',
  },
  servers: [{ url: '/' }],
  tags: [
    { name: 'Health' },
    { name: 'Discovery' },
    { name: 'TextWeb' },
  ],
  paths: {
    '/healthz': {
      get: {
        tags: ['Health'],
        summary: 'Health check',
        responses: {
          '200': {
            description: 'Service health',
            content: { 'application/json': { schema: { $ref: '#/components/schemas/HealthResponse' } } },
          },
          '500': { $ref: '#/components/responses/InternalError' },
        },
      },
    },
    '/openapi.json': {
      get: {
        tags: ['Discovery'],
        summary: 'OpenAPI document',
        responses: {
          '200': {
            description: 'OpenAPI spec',
            content: { 'application/json': { schema: { type: 'object' } } },
          },
          '500': { $ref: '#/components/responses/InternalError' },
        },
      },
    },
    '/.well-known/agent.json': {
      get: {
        tags: ['Discovery'],
        summary: 'Agent descriptor',
        responses: {
          '200': {
            description: 'Agent descriptor for marketplace discovery',
            content: { 'application/json': { schema: { $ref: '#/components/schemas/AgentDefinition' } } },
          },
          '500': { $ref: '#/components/responses/InternalError' },
        },
      },
    },
    '/v1/render': {
      post: {
        tags: ['TextWeb'],
        summary: 'Render webpage with TextWeb',
        security: [{ PaymentSignature: [] }, { DummyApiKey: [] }],
        requestBody: {
          required: true,
          content: {
            'application/json': {
              schema: { $ref: '#/components/schemas/RenderRequest' },
            },
          },
        },
        responses: {
          '200': {
            description: 'Rendered output',
            content: { 'application/json': { schema: { $ref: '#/components/schemas/RenderResponse' } } },
          },
          '400': { $ref: '#/components/responses/BadRequest' },
          '402': { $ref: '#/components/responses/PaymentRequired' },
          '413': { $ref: '#/components/responses/PayloadTooLarge' },
          '429': { $ref: '#/components/responses/RateLimit' },
          '500': { $ref: '#/components/responses/InternalError' },
        },
      },
    },
    '/v1/summarize': {
      post: {
        tags: ['TextWeb'],
        summary: 'Summarize webpage content',
        security: [{ PaymentSignature: [] }, { DummyApiKey: [] }],
        requestBody: {
          required: true,
          content: {
            'application/json': {
              schema: { $ref: '#/components/schemas/SummarizeRequest' },
            },
          },
        },
        responses: {
          '200': {
            description: 'Summary output',
            content: { 'application/json': { schema: { $ref: '#/components/schemas/SummarizeResponse' } } },
          },
          '400': { $ref: '#/components/responses/BadRequest' },
          '402': { $ref: '#/components/responses/PaymentRequired' },
          '413': { $ref: '#/components/responses/PayloadTooLarge' },
          '429': { $ref: '#/components/responses/RateLimit' },
          '500': { $ref: '#/components/responses/InternalError' },
        },
      },
    },
  },
  components: {
    securitySchemes: {
      PaymentSignature: {
        type: 'apiKey',
        in: 'header',
        name: 'payment-signature',
      },
      DummyApiKey: {
        type: 'apiKey',
        in: 'header',
        name: 'x-api-key',
      },
    },
    responses: {
      BadRequest: {
        description: 'Bad request',
        content: { 'application/json': { schema: { $ref: '#/components/schemas/ErrorResponse' } } },
      },
      PaymentRequired: {
        description: 'Payment required',
        content: { 'application/json': { schema: { $ref: '#/components/schemas/ErrorResponse' } } },
      },
      RateLimit: {
        description: 'Rate limit exceeded',
        content: { 'application/json': { schema: { $ref: '#/components/schemas/ErrorResponse' } } },
      },
      PayloadTooLarge: {
        description: 'Request payload too large',
        content: { 'application/json': { schema: { $ref: '#/components/schemas/ErrorResponse' } } },
      },
      InternalError: {
        description: 'Internal server error',
        content: { 'application/json': { schema: { $ref: '#/components/schemas/ErrorResponse' } } },
      },
    },
    schemas: {
      FollowLinks: followLinksSchema,
      RenderRequest: {
        type: 'object',
        additionalProperties: false,
        required: ['url'],
        properties: {
          url: { type: 'string', format: 'uri', maxLength: 2048 },
          followLinks: followLinksSchema,
          cache: { type: 'boolean', default: true },
        },
      },
      SummarizeRequest: {
        type: 'object',
        additionalProperties: false,
        required: ['url'],
        properties: {
          url: { type: 'string', format: 'uri', maxLength: 2048 },
          goal: { type: 'string', maxLength: 4000 },
          mode: { type: 'string', enum: ['brief', 'standard', 'deep'], default: 'standard' },
          followLinks: followLinksSchema,
          schema: { type: 'object' },
          cache: { type: 'boolean', default: true },
        },
      },
      RenderResponse: {
        type: 'object',
        required: ['url', 'title', 'view', 'elements', 'links', 'interactiveElements', 'visibleTextBlocks', 'meta'],
        properties: {
          url: { type: 'string', format: 'uri' },
          title: { type: 'string' },
          view: { type: 'string' },
          elements: { type: 'object' },
          links: {
            type: 'array',
            items: {
              type: 'object',
              required: ['ref', 'text', 'href'],
              properties: {
                ref: { type: 'string' },
                text: { type: 'string' },
                href: { type: 'string' },
              },
            },
          },
          interactiveElements: {
            type: 'array',
            items: {
              type: 'object',
              required: ['ref', 'text', 'semantic', 'selector'],
              properties: {
                ref: { type: 'string' },
                text: { type: 'string' },
                semantic: { type: 'string' },
                selector: { type: 'string' },
              },
            },
          },
          visibleTextBlocks: { type: 'array', items: { type: 'string' } },
          meta: {
            type: 'object',
            required: ['renderMs', 'source'],
            properties: {
              renderMs: { type: 'number' },
              source: { type: 'string', enum: ['live', 'cache'] },
            },
          },
          followedPages: {
            type: 'array',
            items: {
              type: 'object',
              required: ['url', 'title', 'view'],
              properties: {
                url: { type: 'string' },
                title: { type: 'string' },
                view: { type: 'string' },
              },
            },
          },
        },
      },
      SummarizeResponse: {
        type: 'object',
        required: ['url', 'title', 'summaryBullets', 'keyFacts', 'nextActions', 'links', 'extracted', 'cost', 'meta'],
        properties: {
          url: { type: 'string', format: 'uri' },
          title: { type: 'string' },
          summaryBullets: { type: 'array', items: { type: 'string' } },
          keyFacts: { type: 'array', items: { type: 'string' } },
          nextActions: { type: 'array', items: { type: 'string' } },
          links: {
            type: 'array',
            items: {
              type: 'object',
              required: ['text', 'href'],
              properties: {
                text: { type: 'string' },
                href: { type: 'string' },
              },
            },
          },
          extracted: { type: 'object' },
          cost: {
            type: 'object',
            required: ['units', 'credits'],
            properties: {
              units: { type: 'number' },
              credits: { type: 'number' },
            },
          },
          meta: {
            type: 'object',
            required: ['renderMs', 'summarizeMs', 'cached'],
            properties: {
              renderMs: { type: 'number' },
              summarizeMs: { type: 'number' },
              cached: { type: 'boolean' },
            },
          },
        },
      },
      HealthResponse: {
        type: 'object',
        required: ['status', 'service', 'paymentProvider', 'now'],
        properties: {
          status: { type: 'string' },
          service: { type: 'string' },
          paymentProvider: { type: 'string', enum: ['nevermined', 'dummy'] },
          payment: { type: 'object', additionalProperties: true },
          now: { type: 'string' },
        },
      },
      AgentDefinition: {
        type: 'object',
        required: ['name', 'version', 'description', 'spec_url', 'endpoints', 'auth'],
        properties: {
          name: { type: 'string' },
          version: { type: 'string' },
          description: { type: 'string' },
          spec_url: { type: 'string', format: 'uri' },
          endpoints: { type: 'array', items: { type: 'string' } },
          auth: { type: 'object' },
          payment: { type: 'object', additionalProperties: true },
        },
      },
      ErrorResponse: {
        type: 'object',
        required: ['error', 'message', 'code'],
        properties: {
          error: { type: 'string' },
          message: { type: 'string' },
          code: { type: 'string' },
          requestId: { type: 'string' },
          provider: { type: 'string' },
          details: {},
        },
      },
    },
  },
} as const

export const agentDefinition = {
  name: 'TEXTWEB AGENT',
  version: '1.0.0',
  description: 'Seller agent that renders and summarizes webpages using TextWeb.',
  spec_url: '/openapi.json',
  endpoints: ['/v1/render', '/v1/summarize', '/healthz', '/openapi.json', '/.well-known/agent.json'],
  auth: {
    nevermined: {
      header: 'payment-signature',
    },
    dummy: {
      header: 'x-api-key',
    },
  },
}
