import { Express, Request, Response } from 'express';
import swaggerUi from 'swagger-ui-express';

const spec = {
  openapi: '3.0.0',
  info: {
    title: 'Ally Backend API',
    version: '1.0.0',
    description: 'Ally app backend — auth, chat, contacts, admin',
  },
  servers: [{ url: 'https://ally-backend-production.up.railway.app' }],
  components: {
    securitySchemes: {
      bearerAuth: {
        type: 'http',
        scheme: 'bearer',
        bearerFormat: 'JWT',
      },
    },
    schemas: {
      Success: {
        type: 'object',
        properties: {
          success: { type: 'boolean', example: true },
        },
      },
      Error: {
        type: 'object',
        properties: {
          success: { type: 'boolean', example: false },
          error: { type: 'string' },
        },
      },
      InsightField: {
        type: 'object',
        properties: {
          id: { type: 'string', format: 'uuid' },
          field_key: { type: 'string' },
          field_label: { type: 'string' },
          field_description: { type: 'string' },
          is_active: { type: 'boolean' },
        },
      },
      EnabledTool: {
        type: 'object',
        properties: {
          tool_key: { type: 'string', example: 'web_search' },
          tool_label: { type: 'string', example: 'ვებ ძიება (Tavily)' },
          is_enabled: { type: 'boolean', example: false },
        },
      },
    },
  },
  tags: [
    { name: 'Auth', description: 'Registration & login' },
    { name: 'Chat', description: 'AI chat & contact insights' },
    { name: 'Contacts', description: 'Contact import' },
    { name: 'Admin', description: 'Admin-only operations (requires admin role)' },
    { name: 'Diagnostics', description: 'Debug endpoints' },
  ],
  paths: {
    '/auth/request-otp': {
      post: {
        tags: ['Auth'],
        summary: 'Request OTP via WhatsApp',
        requestBody: {
          required: true,
          content: {
            'application/json': {
              schema: {
                type: 'object',
                required: ['phone', 'actionType'],
                properties: {
                  phone: { type: 'string', example: '+995599123456' },
                  actionType: {
                    type: 'string',
                    enum: ['REGISTER', 'AUTH', 'RECOVER'],
                  },
                },
              },
            },
          },
        },
        responses: {
          '200': {
            description: 'OTP sent',
            content: {
              'application/json': {
                schema: {
                  type: 'object',
                  properties: {
                    success: { type: 'boolean' },
                    data: {
                      type: 'object',
                      properties: { sent: { type: 'boolean' } },
                    },
                  },
                },
              },
            },
          },
          '400': {
            description: 'Validation error',
            content: { 'application/json': { schema: { $ref: '#/components/schemas/Error' } } },
          },
        },
      },
    },
    '/auth/verify-otp': {
      post: {
        tags: ['Auth'],
        summary: 'Verify OTP code',
        requestBody: {
          required: true,
          content: {
            'application/json': {
              schema: {
                type: 'object',
                required: ['phone', 'code', 'actionType'],
                properties: {
                  phone: { type: 'string', example: '+995599123456' },
                  code: { type: 'string', example: '123456' },
                  actionType: { type: 'string', enum: ['REGISTER', 'AUTH', 'RECOVER'] },
                },
              },
            },
          },
        },
        responses: {
          '200': { description: 'OTP verified' },
          '400': {
            description: 'Invalid OTP',
            content: { 'application/json': { schema: { $ref: '#/components/schemas/Error' } } },
          },
        },
      },
    },
    '/auth/complete-login': {
      post: {
        tags: ['Auth'],
        summary: 'Complete login — get JWT token',
        requestBody: {
          required: true,
          content: {
            'application/json': {
              schema: {
                type: 'object',
                required: ['phone'],
                properties: {
                  phone: { type: 'string', example: '+995599123456' },
                },
              },
            },
          },
        },
        responses: {
          '200': {
            description: 'JWT token returned',
            content: {
              'application/json': {
                schema: {
                  type: 'object',
                  properties: {
                    success: { type: 'boolean' },
                    data: {
                      type: 'object',
                      properties: {
                        token: { type: 'string' },
                        isNewUser: { type: 'boolean' },
                      },
                    },
                  },
                },
              },
            },
          },
          '400': {
            description: 'Error',
            content: { 'application/json': { schema: { $ref: '#/components/schemas/Error' } } },
          },
        },
      },
    },
    '/auth/register': {
      post: {
        tags: ['Auth'],
        summary: 'Register new user',
        requestBody: {
          required: true,
          content: {
            'application/json': {
              schema: {
                type: 'object',
                required: ['phone', 'name'],
                properties: {
                  phone: { type: 'string', example: '+995599123456' },
                  name: { type: 'string', example: 'მიშო' },
                },
              },
            },
          },
        },
        responses: {
          '201': { description: 'Registered, JWT returned' },
          '400': {
            description: 'Error',
            content: { 'application/json': { schema: { $ref: '#/components/schemas/Error' } } },
          },
        },
      },
    },
    '/auth/admin/login': {
      post: {
        tags: ['Auth'],
        summary: 'Admin login with email & password',
        requestBody: {
          required: true,
          content: {
            'application/json': {
              schema: {
                type: 'object',
                required: ['email', 'password'],
                properties: {
                  email: { type: 'string', format: 'email', example: 'admin@allyapp.one' },
                  password: { type: 'string', format: 'password' },
                },
              },
            },
          },
        },
        responses: {
          '200': { description: 'Admin JWT returned' },
          '401': {
            description: 'Invalid credentials',
            content: { 'application/json': { schema: { $ref: '#/components/schemas/Error' } } },
          },
        },
      },
    },
    '/chat/message': {
      post: {
        tags: ['Chat'],
        summary: 'Send a message to the AI assistant',
        security: [{ bearerAuth: [] }],
        requestBody: {
          required: true,
          content: {
            'application/json': {
              schema: {
                type: 'object',
                required: ['message'],
                properties: {
                  message: { type: 'string', maxLength: 2000, example: 'მომძებნე პროგრამისტი' },
                },
              },
            },
          },
        },
        responses: {
          '200': {
            description: 'AI reply',
            content: {
              'application/json': {
                schema: {
                  type: 'object',
                  properties: {
                    success: { type: 'boolean' },
                    reply: { type: 'string' },
                  },
                },
              },
            },
          },
          '400': { description: 'Validation error' },
          '401': { description: 'Unauthorized' },
        },
      },
    },
    '/chat/insights/{neo4jContactId}': {
      get: {
        tags: ['Chat'],
        summary: 'Get saved insight for a contact',
        security: [{ bearerAuth: [] }],
        parameters: [
          { name: 'neo4jContactId', in: 'path', required: true, schema: { type: 'string' } },
        ],
        responses: {
          '200': { description: 'System prompt + insight data' },
          '401': { description: 'Unauthorized' },
        },
      },
      post: {
        tags: ['Chat'],
        summary: 'Save insight for a contact',
        security: [{ bearerAuth: [] }],
        parameters: [
          { name: 'neo4jContactId', in: 'path', required: true, schema: { type: 'string' } },
        ],
        requestBody: {
          required: true,
          content: {
            'application/json': {
              schema: {
                type: 'object',
                required: ['contact_name', 'collected_data'],
                properties: {
                  contact_name: { type: 'string' },
                  collected_data: { type: 'object', additionalProperties: true },
                },
              },
            },
          },
        },
        responses: {
          '200': { description: 'Insight saved' },
          '401': { description: 'Unauthorized' },
        },
      },
    },
    '/contacts/import': {
      post: {
        tags: ['Contacts'],
        summary: 'Import contacts (JSON)',
        security: [{ bearerAuth: [] }],
        requestBody: {
          required: true,
          content: {
            'application/json': {
              schema: {
                type: 'object',
                required: ['contacts'],
                properties: {
                  contacts: {
                    type: 'array',
                    maxItems: 500,
                    items: {
                      type: 'object',
                      required: ['name', 'phones'],
                      properties: {
                        name: { type: 'string', example: 'გიორგი მამულაძე' },
                        phones: {
                          type: 'array',
                          items: { type: 'string' },
                          example: ['+995599000001'],
                        },
                        email: { type: 'string' },
                        employer: { type: 'string' },
                        jobPosition: { type: 'string' },
                        city: { type: 'string' },
                      },
                    },
                  },
                },
              },
            },
          },
        },
        responses: {
          '200': {
            description: 'Import result',
            content: {
              'application/json': {
                schema: {
                  type: 'object',
                  properties: {
                    success: { type: 'boolean' },
                    data: {
                      type: 'object',
                      properties: {
                        imported: { type: 'integer' },
                        skipped: { type: 'integer' },
                      },
                    },
                  },
                },
              },
            },
          },
          '400': { description: 'Validation error' },
          '401': { description: 'Unauthorized' },
        },
      },
    },
    '/contacts/import-vcf': {
      post: {
        tags: ['Contacts'],
        summary: 'Import contacts from vCard (.vcf) content',
        security: [{ bearerAuth: [] }],
        requestBody: {
          required: true,
          content: {
            'application/json': {
              schema: {
                type: 'object',
                required: ['vcfContent'],
                properties: {
                  vcfContent: { type: 'string', description: 'Full .vcf file content (max 5 MB)' },
                },
              },
            },
          },
        },
        responses: {
          '200': { description: 'Import result' },
          '400': { description: 'Invalid vCard or empty' },
          '401': { description: 'Unauthorized' },
        },
      },
    },
    '/contacts/diag/second-degree': {
      get: {
        tags: ['Diagnostics'],
        summary: 'Debug second-degree contact search — shows timings & registered friend count',
        security: [{ bearerAuth: [] }],
        parameters: [
          {
            name: 'q',
            in: 'query',
            required: false,
            schema: { type: 'string', default: 'test' },
            description: 'Search keyword (e.g. tornike, programisti)',
          },
        ],
        responses: {
          '200': {
            description: 'Diagnostic result',
            content: {
              'application/json': {
                schema: {
                  type: 'object',
                  properties: {
                    success: { type: 'boolean' },
                    query: { type: 'string' },
                    userPhone: { type: 'string' },
                    timings_ms: {
                      type: 'object',
                      properties: {
                        neo4j_fetch: { type: 'integer' },
                        pg_registered_check: { type: 'integer' },
                        pg_search: { type: 'integer' },
                        total: { type: 'integer' },
                      },
                    },
                    friend_phones_from_neo4j: { type: 'integer' },
                    registered_ally_friends: { type: 'integer' },
                    registered_friend_phones: { type: 'array', items: { type: 'string' } },
                    pg_results: { type: 'array', items: { type: 'object' } },
                    pg_error: { type: 'string', nullable: true },
                  },
                },
              },
            },
          },
          '401': { description: 'Unauthorized' },
        },
      },
    },
    '/admin/fields/active': {
      get: {
        tags: ['Admin'],
        summary: 'Get active insight fields',
        security: [{ bearerAuth: [] }],
        responses: {
          '200': {
            description: 'List of active fields',
            content: {
              'application/json': {
                schema: {
                  type: 'object',
                  properties: {
                    success: { type: 'boolean' },
                    data: { type: 'array', items: { $ref: '#/components/schemas/InsightField' } },
                  },
                },
              },
            },
          },
          '401': { description: 'Unauthorized' },
          '403': { description: 'Forbidden — admin only' },
        },
      },
    },
    '/admin/fields': {
      get: {
        tags: ['Admin'],
        summary: 'Get all insight fields (active + inactive)',
        security: [{ bearerAuth: [] }],
        responses: {
          '200': { description: 'All fields' },
          '401': { description: 'Unauthorized' },
          '403': { description: 'Forbidden' },
        },
      },
      post: {
        tags: ['Admin'],
        summary: 'Create a new insight field',
        security: [{ bearerAuth: [] }],
        requestBody: {
          required: true,
          content: {
            'application/json': {
              schema: {
                type: 'object',
                required: ['field_key', 'field_label', 'field_description'],
                properties: {
                  field_key: { type: 'string', example: 'reliability' },
                  field_label: { type: 'string', example: 'სანდოობა' },
                  field_description: { type: 'string', example: 'რამდენად სანდოა ეს კონტაქტი?' },
                },
              },
            },
          },
        },
        responses: {
          '201': { description: 'Field created' },
          '400': { description: 'Validation error' },
          '403': { description: 'Forbidden' },
        },
      },
    },
    '/admin/fields/{id}': {
      put: {
        tags: ['Admin'],
        summary: 'Update an insight field',
        security: [{ bearerAuth: [] }],
        parameters: [
          { name: 'id', in: 'path', required: true, schema: { type: 'string', format: 'uuid' } },
        ],
        requestBody: {
          required: true,
          content: {
            'application/json': {
              schema: {
                type: 'object',
                required: ['field_label', 'field_description'],
                properties: {
                  field_label: { type: 'string' },
                  field_description: { type: 'string' },
                },
              },
            },
          },
        },
        responses: {
          '200': { description: 'Field updated' },
          '400': { description: 'Validation error' },
          '403': { description: 'Forbidden' },
        },
      },
    },
    '/admin/fields/{id}/toggle': {
      patch: {
        tags: ['Admin'],
        summary: 'Toggle insight field active/inactive',
        security: [{ bearerAuth: [] }],
        parameters: [
          { name: 'id', in: 'path', required: true, schema: { type: 'string', format: 'uuid' } },
        ],
        responses: {
          '200': { description: 'Field toggled' },
          '403': { description: 'Forbidden' },
        },
      },
    },
    '/admin/chat': {
      post: {
        tags: ['Admin'],
        summary: 'Admin AI chat (has access to extra tools)',
        security: [{ bearerAuth: [] }],
        requestBody: {
          required: true,
          content: {
            'application/json': {
              schema: {
                type: 'object',
                required: ['message'],
                properties: {
                  message: { type: 'string', maxLength: 4000 },
                },
              },
            },
          },
        },
        responses: {
          '200': { description: 'AI reply' },
          '403': { description: 'Forbidden' },
        },
      },
    },
    '/admin/tools': {
      get: {
        tags: ['Admin'],
        summary: 'List all AI tools with enabled/disabled status',
        security: [{ bearerAuth: [] }],
        responses: {
          '200': {
            description: 'Tool list',
            content: {
              'application/json': {
                schema: {
                  type: 'object',
                  properties: {
                    success: { type: 'boolean' },
                    data: {
                      type: 'array',
                      items: { $ref: '#/components/schemas/EnabledTool' },
                    },
                  },
                },
              },
            },
          },
          '401': { description: 'Unauthorized' },
          '403': { description: 'Forbidden — admin only' },
        },
      },
    },
    '/admin/tools/{key}/toggle': {
      patch: {
        tags: ['Admin'],
        summary: 'Toggle an AI tool on or off',
        security: [{ bearerAuth: [] }],
        parameters: [
          {
            name: 'key',
            in: 'path',
            required: true,
            schema: { type: 'string', example: 'web_search' },
            description: 'Tool key (e.g. web_search, search_second_degree)',
          },
        ],
        responses: {
          '200': {
            description: 'Updated tool state',
            content: {
              'application/json': {
                schema: {
                  type: 'object',
                  properties: {
                    success: { type: 'boolean' },
                    data: { $ref: '#/components/schemas/EnabledTool' },
                  },
                },
              },
            },
          },
          '400': { description: 'Validation error' },
          '401': { description: 'Unauthorized' },
          '403': { description: 'Forbidden — admin only' },
          '500': { description: 'Tool key not found' },
        },
      },
    },
    '/admin/diag/neo4j-second-degree': {
      get: {
        tags: ['Diagnostics'],
        summary: 'Neo4j stats — total friends & second-degree contact count',
        security: [{ bearerAuth: [] }],
        responses: {
          '200': {
            description: 'Neo4j graph stats',
            content: {
              'application/json': {
                schema: {
                  type: 'object',
                  properties: {
                    success: { type: 'boolean' },
                    userPhone: { type: 'string' },
                    total_friends_in_neo4j: { type: 'integer' },
                    friends_with_contacts: { type: 'integer' },
                    total_second_degree: { type: 'integer' },
                  },
                },
              },
            },
          },
          '403': { description: 'Forbidden — admin only' },
        },
      },
    },
    '/admin/diag/pg-second-degree': {
      get: {
        tags: ['Diagnostics'],
        summary: 'PostgreSQL second-degree search diagnostic (admin)',
        security: [{ bearerAuth: [] }],
        parameters: [
          {
            name: 'q',
            in: 'query',
            required: false,
            schema: { type: 'string', default: 'test' },
          },
        ],
        responses: {
          '200': { description: 'Diagnostic result with timings' },
          '403': { description: 'Forbidden — admin only' },
        },
      },
    },
  },
};

export function setupSwagger(app: Express): void {
  app.get('/swagger.json', (_req: Request, res: Response) => {
    res.json(spec);
  });
  app.use('/docs', swaggerUi.serve, swaggerUi.setup(spec));
}
